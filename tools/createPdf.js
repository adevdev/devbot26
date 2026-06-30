/**
 * Create PDF Tool
 * Generate PDF documents from text content
 */

const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

/**
 * Remove emoji characters from text
 * PDFKit's standard fonts don't support emoji
 * Conservative regex to avoid corrupting normal text
 */
function stripEmojis(text) {
    // Remove actual emoji ranges only
    // DO NOT use character ranges for variation selectors - too dangerous!
    return text.replace(/[\u{1F300}-\u{1F5FF}]|[\u{1F600}-\u{1F64F}]|[\u{1F680}-\u{1F6FF}]|[\u{1F700}-\u{1F77F}]|[\u{1F780}-\u{1F7FF}]|[\u{1F800}-\u{1F8FF}]|[\u{1F900}-\u{1F9FF}]|[\u{1FA00}-\u{1FA6F}]|[\u{1FA70}-\u{1FAFF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu, '');
}

/**
 * Parse and render text with Markdown formatting
 * Supports **bold** and *italic*
 * Supports per-paragraph indent with [indent:X] marker
 * ROBUST: Handles markers even if they appear mid-text (splits into paragraphs)
 * @param {Object} doc - PDFDocument instance
 * @param {string} text - Text content to render
 * @param {string} align - Text alignment (left, center, right, justify)
 * @param {number} defaultIndent - Default left indentation in points
 */
function renderFormattedText(doc, text, align = 'left', defaultIndent = 0) {
    // First, split by [indent:X] markers to create implicit paragraphs
    // This handles cases where AI didn't insert proper \n\n breaks
    const markerSplitPattern = /(\[indent:\d+\])/g;
    const segments = text.split(markerSplitPattern);

    // Reassemble into paragraphs with proper structure
    const reconstructedParagraphs = [];
    let currentParagraph = '';
    let currentIndent = null;

    for (const segment of segments) {
        const markerMatch = segment.match(/^\[indent:(\d+)\]$/);

        if (markerMatch) {
            // This is a marker
            // Save current paragraph if exists
            if (currentParagraph.trim()) {
                reconstructedParagraphs.push({
                    text: currentParagraph.trim(),
                    indent: currentIndent !== null ? currentIndent : defaultIndent
                });
            }
            // Set new indent for next paragraph
            currentIndent = parseInt(markerMatch[1], 10);
            currentParagraph = '';
        } else {
            // This is text content
            currentParagraph += segment;
        }
    }

    // Don't forget the last paragraph
    if (currentParagraph.trim()) {
        reconstructedParagraphs.push({
            text: currentParagraph.trim(),
            indent: currentIndent !== null ? currentIndent : defaultIndent
        });
    }

    // Now split each reconstructed paragraph by \n\n to handle explicit breaks
    const finalParagraphs = [];
    for (const para of reconstructedParagraphs) {
        const subParagraphs = para.text.split(/\n\n+/);
        for (const subPara of subParagraphs) {
            if (subPara.trim()) {
                finalParagraphs.push({
                    text: subPara.trim(),
                    indent: para.indent
                });
            }
        }
    }

    // Get page margins
    const pageMargins = doc.page.margins;

    // Render each paragraph
    for (let i = 0; i < finalParagraphs.length; i++) {
        const { text: paragraph, indent: paragraphIndent } = finalParagraphs[i];

        // Save current x position and calculate new x with indent
        const originalX = doc.x;
        const indentedX = pageMargins.left + paragraphIndent;

        // Set x position for this paragraph
        doc.x = indentedX;

        // Calculate max width for text with indent
        const maxWidth = doc.page.width - pageMargins.left - pageMargins.right - paragraphIndent;

        // Parse inline formatting (bold and italic)
        const tokens = parseInlineFormatting(paragraph);

        // Render tokens with appropriate fonts
        for (let j = 0; j < tokens.length; j++) {
            const token = tokens[j];
            const isLast = j === tokens.length - 1;

            // Set font based on format
            if (token.bold && token.italic) {
                doc.font('Helvetica-BoldOblique');
            } else if (token.bold) {
                doc.font('Helvetica-Bold');
            } else if (token.italic) {
                doc.font('Helvetica-Oblique');
            } else {
                doc.font('Helvetica');
            }

            // Add text with alignment and proper width
            doc.text(token.text, {
                continued: !isLast,
                align: align,
                width: maxWidth,
                lineGap: 3
            });
        }

        // Restore original x position
        doc.x = originalX;

        // Add space between paragraphs
        if (i < finalParagraphs.length - 1) {
            doc.moveDown(0.8);
        }
    }
}

/**
 * Parse inline formatting (bold, italic)
 * Returns array of tokens with formatting flags
 * *text* = bold (intuitive for most users)
 * **text** = bold (standard Markdown)
 * _text_ = italic
 */
function parseInlineFormatting(text) {
    const tokens = [];
    let currentPos = 0;

    // Regex to match **bold**, *bold*, or _italic_
    // Changed: *text* now produces BOLD (not italic)
    const formatRegex = /(\*\*(.+?)\*\*|\*(.+?)\*|_(.+?)_)/g;
    let match;

    while ((match = formatRegex.exec(text)) !== null) {
        // Add plain text before the match
        if (match.index > currentPos) {
            const plainText = text.substring(currentPos, match.index);
            tokens.push({ text: plainText, bold: false, italic: false });
        }

        // Add formatted text
        if (match[2]) {
            // **bold** (double asterisk)
            tokens.push({ text: match[2], bold: true, italic: false });
        } else if (match[3]) {
            // *bold* (single asterisk - CHANGED to bold instead of italic)
            tokens.push({ text: match[3], bold: true, italic: false });
        } else if (match[4]) {
            // _italic_ (underscore)
            tokens.push({ text: match[4], bold: false, italic: true });
        }

        currentPos = match.index + match[0].length;
    }

    // Add remaining plain text
    if (currentPos < text.length) {
        const plainText = text.substring(currentPos);
        tokens.push({ text: plainText, bold: false, italic: false });
    }

    return tokens;
}

module.exports = {
    // Tool definition (sent to AI)
    definition: {
        name: 'create_pdf',
        description: 'Create a complete, ready-to-send PDF document from text content with proper formatting. This is a complete PDF generation solution - no additional processing needed. Generates a professional PDF file with title, paragraphs, page numbers, and metadata. The PDF is immediately ready to be sent using send_document tool. Do NOT use bash, Python, or other tools to create PDFs - this tool handles everything.',
        input_schema: {
            type: 'object',
            properties: {
                title: {
                    type: 'string',
                    description: 'Title of the PDF document. Will be displayed at the top in large font.'
                },
                content: {
                    type: 'string',
                    description: 'Main content of the PDF. Supports basic Markdown formatting: **bold text**, *italic text*. Use \\n\\n for paragraph breaks. Per-paragraph indent: use [indent:X] at the start of a paragraph to set custom indent (X = points), e.g., "[indent:20]First paragraph with 20pt indent\\n\\n[indent:10]Second paragraph with 10pt indent". Paragraphs without [indent:X] marker use the default indent parameter.'
                },
                filename: {
                    type: 'string',
                    description: 'Filename for the PDF (without path). Example: "report.pdf", "summary.pdf". If not provided, a timestamp-based name will be generated.'
                },
                fontSize: {
                    type: 'number',
                    description: 'Font size for body text (default: 12). Title will be larger automatically.'
                },
                align: {
                    type: 'string',
                    enum: ['left', 'center', 'right', 'justify'],
                    description: 'Text alignment for body content (default: left). Options: left, center, right, justify.'
                },
                indent: {
                    type: 'number',
                    description: 'Indentation from left margin in points (default: 0). Use for additional spacing from the left edge. Example: 20 for moderate indent, 50 for large indent.'
                },
                author: {
                    type: 'string',
                    description: 'Optional author name for PDF metadata'
                },
                includeFooter: {
                    type: 'boolean',
                    description: 'Include "Generated by DevBot26" footer at bottom (default: true). Set to false when editing existing PDFs to avoid duplicate footers.'
                }
            },
            required: ['content']
        }
    },

    // Metadata for UI/UX
    metadata: {
        icon: '📄',
        progressMessage: (input) => `Creating PDF: ${input.filename || 'document.pdf'}`,
        resultType: 'text'
    },

    // Execution logic
    execute: async function(input, context) {
        let { title, content, filename, fontSize = 12, align = 'left', indent = 0, author, includeFooter = true } = input;

        try {
            // Strip emojis from title and content (PDFKit's standard fonts don't support emoji)
            if (title) {
                title = stripEmojis(title);
            }
            if (content) {
                content = stripEmojis(content);
            }

            console.log('[CreatePDF] Starting PDF generation');
            console.log('[CreatePDF] Raw content received (after emoji stripping):');
            console.log('---START CONTENT---');
            console.log(content);
            console.log('---END CONTENT---');
            console.log('[CreatePDF] Content length:', content.length);
            console.log('[CreatePDF] Align:', align, 'Default indent:', indent);
            console.log();

            // Generate filename if not provided
            const finalFilename = filename || `document_${Date.now()}.pdf`;

            // Ensure filename ends with .pdf
            const pdfFilename = finalFilename.endsWith('.pdf') ? finalFilename : `${finalFilename}.pdf`;

            // Create output directory if not exists
            const outputDir = path.join(__dirname, '../temp');
            if (!fs.existsSync(outputDir)) {
                fs.mkdirSync(outputDir, { recursive: true });
            }

            const outputPath = path.join(outputDir, pdfFilename);

            console.log(`[CreatePDF] Output path: ${outputPath}`);

            // Create PDF document
            const doc = new PDFDocument({
                size: 'A4',
                margins: {
                    top: 50,
                    bottom: 50,
                    left: 50,
                    right: 50
                }
            });

            // Pipe to file
            const stream = fs.createWriteStream(outputPath);
            doc.pipe(stream);

            // Set PDF metadata
            doc.info = {
                Title: title || 'Generated Document',
                Author: author || 'DevBot26',
                Creator: 'DevBot26 PDF Tool',
                CreationDate: new Date()
            };

            // Add title if provided
            if (title) {
                doc.fontSize(20)
                   .font('Helvetica-Bold')
                   .text(title, {
                       align: 'center'
                   });

                doc.moveDown(1.5);
            }

            // Add content with Markdown formatting support
            doc.fontSize(fontSize);

            // Parse and render content with formatting, alignment, and indent
            renderFormattedText(doc, content, align, indent);

            // Add footer if enabled (optional to avoid duplicate footers when editing PDFs)
            if (includeFooter) {
                doc.moveDown(2);
                doc.fontSize(10)
                   .font('Helvetica')
                   .text(
                       `Generated by DevBot26 - ${new Date().toLocaleString()}`,
                       50,
                       doc.page.height - 50,
                       {
                           align: 'center'
                       }
                   );
            }

            // Finalize PDF
            doc.end();

            // Wait for stream to finish
            await new Promise((resolve, reject) => {
                stream.on('finish', resolve);
                stream.on('error', reject);
            });

            const fileSize = fs.statSync(outputPath).size;

            // Get page count after PDF is finalized
            const pageCount = doc.bufferedPageRange().count || 1;

            console.log(`[CreatePDF] PDF created successfully: ${outputPath} (${fileSize} bytes, ${pageCount} page(s))`);

            return JSON.stringify({
                success: true,
                message: 'PDF document created successfully and is ready to send. The PDF is complete with formatting and metadata.',
                filePath: outputPath,
                filename: pdfFilename,
                size: fileSize,
                pages: pageCount,
                title: title || 'Generated Document',
                status: 'ready_to_send',
                next_action: 'Use send_document tool with the filePath above to deliver this PDF to the user. No additional processing needed.'
            });

        } catch (error) {
            console.error('[CreatePDF] Error:', error.message);
            return JSON.stringify({
                success: false,
                error: error.message
            });
        }
    }
};
