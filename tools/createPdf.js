/**
 * Create PDF Tool
 * Generate PDF documents from text content
 */

const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

/**
 * Parse and render text with Markdown formatting
 * Supports **bold** and *italic*
 */
function renderFormattedText(doc, text) {
    // Split by paragraphs (double newline)
    const paragraphs = text.split(/\n\n+/);

    for (let i = 0; i < paragraphs.length; i++) {
        const paragraph = paragraphs[i].trim();
        if (!paragraph) continue;

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

            // Add text (continue if not last token in paragraph)
            doc.text(token.text, {
                continued: !isLast,
                lineGap: 3
            });
        }

        // Add space between paragraphs
        if (i < paragraphs.length - 1) {
            doc.moveDown(0.8);
        }
    }
}

/**
 * Parse inline formatting (bold, italic)
 * Returns array of tokens with formatting flags
 */
function parseInlineFormatting(text) {
    const tokens = [];
    let currentPos = 0;

    // Regex to match **bold** or *italic*
    // **text** = bold, *text* = italic
    const formatRegex = /(\*\*(.+?)\*\*|\*(.+?)\*)/g;
    let match;

    while ((match = formatRegex.exec(text)) !== null) {
        // Add plain text before the match
        if (match.index > currentPos) {
            const plainText = text.substring(currentPos, match.index);
            tokens.push({ text: plainText, bold: false, italic: false });
        }

        // Add formatted text
        if (match[2]) {
            // **bold**
            tokens.push({ text: match[2], bold: true, italic: false });
        } else if (match[3]) {
            // *italic*
            tokens.push({ text: match[3], bold: false, italic: true });
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
                    description: 'Main content of the PDF. Supports basic Markdown formatting: **bold text**, *italic text*. Use \\n\\n for paragraph breaks.'
                },
                filename: {
                    type: 'string',
                    description: 'Filename for the PDF (without path). Example: "report.pdf", "summary.pdf". If not provided, a timestamp-based name will be generated.'
                },
                fontSize: {
                    type: 'number',
                    description: 'Font size for body text (default: 12). Title will be larger automatically.'
                },
                author: {
                    type: 'string',
                    description: 'Optional author name for PDF metadata'
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
        const { title, content, filename, fontSize = 12, author } = input;

        try {
            console.log('[CreatePDF] Starting PDF generation');

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

            // Parse and render content with formatting
            renderFormattedText(doc, content);

            // Add simple footer (without page switching which can cause corruption)
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
