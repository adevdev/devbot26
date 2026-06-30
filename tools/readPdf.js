/**
 * Read PDF Tool
 * Extract text content with formatting from PDF documents
 * Output format compatible with create_pdf tool for editing
 */

const fs = require('fs');

/**
 * Analyze font usage patterns to map font IDs to styles
 * Heuristic: Most common font = normal, others = bold/italic
 */
function buildFontStyleMap(textItems) {
    const fontUsage = {};

    // Count usage of each font
    for (const item of textItems) {
        if (item.fontName && item.str.trim()) {
            if (!fontUsage[item.fontName]) {
                fontUsage[item.fontName] = {
                    count: 0,
                    chars: 0,
                    items: []
                };
            }
            fontUsage[item.fontName].count++;
            fontUsage[item.fontName].chars += item.str.length;
            fontUsage[item.fontName].items.push(item.str);
        }
    }

    // Sort fonts by character count (most used = likely normal font)
    const fontsByUsage = Object.entries(fontUsage)
        .sort((a, b) => b[1].chars - a[1].chars);

    const styleMap = {};

    if (fontsByUsage.length === 1) {
        // Only one font - treat as normal
        styleMap[fontsByUsage[0][0]] = 'normal';
    } else if (fontsByUsage.length === 2) {
        // Two fonts - most common = normal, other = bold
        styleMap[fontsByUsage[0][0]] = 'normal';
        styleMap[fontsByUsage[1][0]] = 'bold';
    } else if (fontsByUsage.length >= 3) {
        // Three or more fonts
        styleMap[fontsByUsage[0][0]] = 'normal';  // Most common
        styleMap[fontsByUsage[1][0]] = 'bold';    // Second most
        styleMap[fontsByUsage[2][0]] = 'italic';  // Third

        // Any additional fonts treated as normal
        for (let i = 3; i < fontsByUsage.length; i++) {
            styleMap[fontsByUsage[i][0]] = 'normal';
        }
    }

    return styleMap;
}

/**
 * Parse PDF content and convert to create_pdf compatible format
 */
function parsePdfContent(pages) {
    if (!pages || pages.length === 0) {
        return {
            content: '',
            fontSize: 12,
            align: 'left',
            metadata: {}
        };
    }

    const allTextItems = [];
    let fontSizes = [];

    // Collect all text items from all pages
    for (const page of pages) {
        for (const item of page.textItems) {
            allTextItems.push(item);
            if (item.height > 0) {
                fontSizes.push(Math.round(item.height));
            }
        }
    }

    // Build font style map
    const fontStyleMap = buildFontStyleMap(allTextItems);

    console.log('[ReadPDF] Font style map:', fontStyleMap);

    let allText = [];
    let leftMargins = [];

    // Process each page
    for (const pageData of pages) {
        const textItems = pageData.textItems;

        if (!textItems || textItems.length === 0) continue;

        // Group into lines based on Y position
        const lines = [];
        let currentLine = [];
        let lastY = null;

        for (const item of textItems) {
            const y = item.transform[5];
            const yDiff = lastY !== null ? Math.abs(y - lastY) : 0;

            if (lastY !== null && yDiff > 5) {
                // New line
                if (currentLine.length > 0) {
                    lines.push(currentLine);
                }
                currentLine = [item];
            } else {
                currentLine.push(item);
            }

            lastY = y;
        }

        if (currentLine.length > 0) {
            lines.push(currentLine);
        }

        // Convert lines to formatted text
        let lastLineY = null;

        for (const line of lines) {
            if (line.length === 0) continue;

            // Detect paragraph break (large Y gap)
            const currentY = line[0].transform[5];
            if (lastLineY !== null && Math.abs(currentY - lastLineY) > 20) {
                allText.push('\n\n'); // Paragraph break
            }

            // Get line indentation (X position of first item)
            const lineIndent = Math.round(line[0].transform[4]);
            leftMargins.push(lineIndent);

            // Check if this line needs indent marker
            const baseMargin = 50; // Typical left margin
            const indentThreshold = 10; // Minimum indent to consider
            const extraIndent = lineIndent - baseMargin;

            let lineText = '';

            // Add indent marker if needed
            if (extraIndent > indentThreshold) {
                lineText += `[indent:${Math.round(extraIndent)}]`;
            }

            // Process text items in the line
            for (let i = 0; i < line.length; i++) {
                const item = line[i];
                const text = item.str.trim();
                if (!text) continue;

                const fontStyle = fontStyleMap[item.fontName] || 'normal';

                // Format text based on detected style
                let formattedText = text;
                if (fontStyle === 'bold') {
                    formattedText = `*${text}*`;
                } else if (fontStyle === 'italic') {
                    formattedText = `_${text}_`;
                }

                // Add space between items if needed
                if (i > 0 && !text.match(/^[.,;:!?)\]}]/)) {
                    lineText += ' ';
                }

                lineText += formattedText;
            }

            allText.push(lineText);
            lastLineY = currentY;
        }

        // Add page break between pages (except last page)
        if (pages.indexOf(pageData) < pages.length - 1) {
            allText.push('\n\n--- PAGE BREAK ---\n\n');
        }
    }

    // Calculate most common font size
    const avgFontSize = fontSizes.length > 0
        ? Math.round(fontSizes.reduce((a, b) => a + b, 0) / fontSizes.length)
        : 12;

    return {
        content: allText.join('\n'),
        fontSize: avgFontSize,
        align: 'left',
        metadata: {
            pageCount: pages.length,
            extractedAt: new Date().toISOString(),
            fontsDetected: Object.keys(fontStyleMap).length
        }
    };
}

module.exports = {
    // Tool definition (sent to AI)
    definition: {
        name: 'read_pdf',
        description: 'Extract text content with formatting from PDF documents. Detects bold, italic, indentation, and paragraph structure. Output is compatible with create_pdf tool, allowing you to read a PDF, modify its content, and recreate it with changes.',
        input_schema: {
            type: 'object',
            properties: {
                filePath: {
                    type: 'string',
                    description: 'Path to the PDF file to read'
                },
                includeMetadata: {
                    type: 'boolean',
                    description: 'Include extraction metadata in response (default: false)'
                }
            },
            required: ['filePath']
        }
    },

    // Metadata for UI/UX
    metadata: {
        icon: '📖',
        progressMessage: (input) => `Reading PDF: ${input.filePath}`,
        resultType: 'text'
    },

    // Execution logic
    execute: async function(input, context) {
        const { filePath, includeMetadata = false } = input;

        try {
            console.log(`[ReadPDF] Reading file: ${filePath}`);

            // Check if file exists
            if (!fs.existsSync(filePath)) {
                return JSON.stringify({
                    success: false,
                    error: `File not found: ${filePath}`
                });
            }

            // Dynamic import for pdfjs-dist (ES module)
            const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');

            // Read PDF file as buffer
            const data = new Uint8Array(fs.readFileSync(filePath));

            // Load PDF document
            const loadingTask = pdfjsLib.getDocument({ data });
            const pdfDocument = await loadingTask.promise;

            console.log(`[ReadPDF] PDF loaded, ${pdfDocument.numPages} page(s)`);

            // Extract text content from all pages
            const pages = [];

            for (let pageNum = 1; pageNum <= pdfDocument.numPages; pageNum++) {
                const page = await pdfDocument.getPage(pageNum);
                const textContent = await page.getTextContent();

                pages.push({
                    pageNumber: pageNum,
                    textItems: textContent.items
                });
            }

            // Parse content into create_pdf compatible format
            const parsed = parsePdfContent(pages);

            console.log(`[ReadPDF] Parsed content (${parsed.content.length} chars, fontSize: ${parsed.fontSize})`);
            console.log('[ReadPDF] Content preview:');
            console.log('---START CONTENT---');
            console.log(parsed.content.substring(0, 500) + (parsed.content.length > 500 ? '...' : ''));
            console.log('---END CONTENT---');

            const result = {
                success: true,
                message: 'PDF content extracted successfully with formatting detection. You can now modify the content and use create_pdf to generate a new PDF.',
                content: parsed.content,
                fontSize: parsed.fontSize,
                align: parsed.align,
                format_guide: {
                    bold: 'Text wrapped with *asterisks* is bold',
                    italic: 'Text wrapped with _underscores_ is italic',
                    indent: '[indent:X] markers indicate paragraph indentation (X = points from left)',
                    paragraph_break: 'Double newline (\\n\\n) indicates paragraph break'
                }
            };

            if (includeMetadata) {
                result.metadata = parsed.metadata;
            }

            return JSON.stringify(result, null, 2);

        } catch (error) {
            console.error('[ReadPDF] Error:', error.message);
            return JSON.stringify({
                success: false,
                error: error.message
            });
        }
    }
};
