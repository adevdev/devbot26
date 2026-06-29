/**
 * Edit PDF Tool
 * Edit existing PDF documents - add text, pages, remove pages, merge PDFs
 */

const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const fs = require('fs');
const path = require('path');

module.exports = {
    // Tool definition (sent to AI)
    definition: {
        name: 'edit_pdf',
        description: 'Edit existing PDF documents with various operations: add text overlay to pages, add new pages with content, remove specific pages, or merge multiple PDFs. This is a complete PDF editing solution. The edited PDF is saved and ready to send.',
        input_schema: {
            type: 'object',
            properties: {
                operation: {
                    type: 'string',
                    enum: ['add_text', 'add_page', 'remove_pages', 'merge'],
                    description: 'Operation to perform: "add_text" to overlay text on existing pages, "add_page" to insert new page with content, "remove_pages" to delete specific pages, "merge" to combine multiple PDFs'
                },
                inputFile: {
                    type: 'string',
                    description: 'Path to the input PDF file to edit. Required for add_text, add_page, and remove_pages operations.'
                },
                outputFilename: {
                    type: 'string',
                    description: 'Filename for the edited PDF (without path). If not provided, will generate based on operation.'
                },
                // For add_text operation
                text: {
                    type: 'string',
                    description: 'Text to add to the PDF (for add_text operation). Will be overlaid on specified pages.'
                },
                pageNumbers: {
                    type: 'array',
                    items: { type: 'number' },
                    description: 'Page numbers to apply operation to (1-indexed). For add_text: pages to add text on. For remove_pages: pages to remove. If not provided, applies to all pages.'
                },
                x: {
                    type: 'number',
                    description: 'X coordinate for text position (for add_text, default: 50)'
                },
                y: {
                    type: 'number',
                    description: 'Y coordinate for text position (for add_text, default: 50)'
                },
                fontSize: {
                    type: 'number',
                    description: 'Font size for text (for add_text, default: 12)'
                },
                // For add_page operation
                pageContent: {
                    type: 'string',
                    description: 'Content for new page (for add_page operation). Text content to add to the new page.'
                },
                insertAt: {
                    type: 'number',
                    description: 'Position to insert new page (for add_page, default: end of document). 0 = beginning, 1 = after first page, etc.'
                },
                // For merge operation
                pdfFiles: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Array of PDF file paths to merge (for merge operation). PDFs will be combined in the order provided.'
                }
            },
            required: ['operation']
        }
    },

    // Metadata for UI/UX
    metadata: {
        icon: '✏️',
        progressMessage: (input) => `Editing PDF: ${input.operation}`,
        resultType: 'text'
    },

    // Execution logic
    execute: async function(input, context) {
        const {
            operation,
            inputFile,
            outputFilename,
            text,
            pageNumbers,
            x = 50,
            y = 50,
            fontSize = 12,
            pageContent,
            insertAt,
            pdfFiles
        } = input;

        try {
            console.log(`[EditPDF] Starting operation: ${operation}`);

            // Create output directory
            const outputDir = path.join(__dirname, '../temp');
            if (!fs.existsSync(outputDir)) {
                fs.mkdirSync(outputDir, { recursive: true });
            }

            let pdfDoc;
            let outputPath;
            let finalFilename;

            switch (operation) {
                case 'add_text':
                    if (!inputFile || !text) {
                        return JSON.stringify({
                            success: false,
                            error: 'add_text operation requires inputFile and text parameters'
                        });
                    }

                    // Load existing PDF
                    const pdfBytes = fs.readFileSync(inputFile);
                    pdfDoc = await PDFDocument.load(pdfBytes);

                    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
                    const pages = pdfDoc.getPages();

                    // Determine which pages to add text to
                    const targetPages = pageNumbers && pageNumbers.length > 0
                        ? pageNumbers.map(n => n - 1) // Convert to 0-indexed
                        : pages.map((_, i) => i); // All pages

                    // Add text to specified pages
                    for (const pageIndex of targetPages) {
                        if (pageIndex >= 0 && pageIndex < pages.length) {
                            const page = pages[pageIndex];
                            const { height } = page.getSize();

                            page.drawText(text, {
                                x: x,
                                y: height - y, // Flip Y coordinate (PDF origin is bottom-left)
                                size: fontSize,
                                font: font,
                                color: rgb(0, 0, 0)
                            });
                        }
                    }

                    finalFilename = outputFilename || `edited_${Date.now()}.pdf`;
                    outputPath = path.join(outputDir, finalFilename);

                    const modifiedBytes = await pdfDoc.save();
                    fs.writeFileSync(outputPath, modifiedBytes);

                    console.log(`[EditPDF] Text added to ${targetPages.length} page(s)`);
                    break;

                case 'add_page':
                    if (!inputFile || !pageContent) {
                        return JSON.stringify({
                            success: false,
                            error: 'add_page operation requires inputFile and pageContent parameters'
                        });
                    }

                    // Load existing PDF
                    const existingPdf = fs.readFileSync(inputFile);
                    pdfDoc = await PDFDocument.load(existingPdf);

                    const totalPages = pdfDoc.getPageCount();

                    // Create new page - clamp insertPosition to valid range [0, totalPages]
                    let insertPosition = insertAt !== undefined ? insertAt : totalPages;

                    // Validate and clamp insertPosition
                    if (insertPosition < 0) {
                        insertPosition = 0;
                    } else if (insertPosition > totalPages) {
                        insertPosition = totalPages; // Insert at end
                        console.log(`[EditPDF] insertAt ${insertAt} exceeds page count ${totalPages}, inserting at end`);
                    }

                    const newPage = pdfDoc.insertPage(insertPosition);

                    const pageFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
                    const { width, height } = newPage.getSize();

                    // Add content to new page
                    newPage.drawText(pageContent, {
                        x: 50,
                        y: height - 50,
                        size: 12,
                        font: pageFont,
                        color: rgb(0, 0, 0),
                        maxWidth: width - 100
                    });

                    finalFilename = outputFilename || `with_page_${Date.now()}.pdf`;
                    outputPath = path.join(outputDir, finalFilename);

                    const pdfWithPage = await pdfDoc.save();
                    fs.writeFileSync(outputPath, pdfWithPage);

                    console.log(`[EditPDF] New page added at position ${insertPosition} (total pages now: ${pdfDoc.getPageCount()})`);
                    break;

                case 'remove_pages':
                    if (!inputFile || !pageNumbers || pageNumbers.length === 0) {
                        return JSON.stringify({
                            success: false,
                            error: 'remove_pages operation requires inputFile and pageNumbers parameters'
                        });
                    }

                    // Load existing PDF
                    const pdfToEdit = fs.readFileSync(inputFile);
                    pdfDoc = await PDFDocument.load(pdfToEdit);

                    const pageCount = pdfDoc.getPageCount();

                    // Remove pages (in reverse order to avoid index shifting)
                    const pagesToRemove = [...pageNumbers]
                        .map(n => n - 1) // Convert to 0-indexed
                        .filter(n => n >= 0 && n < pageCount)
                        .sort((a, b) => b - a); // Reverse order

                    for (const pageIndex of pagesToRemove) {
                        pdfDoc.removePage(pageIndex);
                    }

                    finalFilename = outputFilename || `removed_pages_${Date.now()}.pdf`;
                    outputPath = path.join(outputDir, finalFilename);

                    const pdfWithRemovedPages = await pdfDoc.save();
                    fs.writeFileSync(outputPath, pdfWithRemovedPages);

                    console.log(`[EditPDF] Removed ${pagesToRemove.length} page(s)`);
                    break;

                case 'merge':
                    if (!pdfFiles || pdfFiles.length < 2) {
                        return JSON.stringify({
                            success: false,
                            error: 'merge operation requires pdfFiles array with at least 2 PDF files'
                        });
                    }

                    // Create new merged PDF
                    pdfDoc = await PDFDocument.create();

                    // Load and merge each PDF
                    for (const pdfFile of pdfFiles) {
                        if (!fs.existsSync(pdfFile)) {
                            console.warn(`[EditPDF] File not found, skipping: ${pdfFile}`);
                            continue;
                        }

                        const pdfToMerge = fs.readFileSync(pdfFile);
                        const sourcePdf = await PDFDocument.load(pdfToMerge);
                        const copiedPages = await pdfDoc.copyPages(sourcePdf, sourcePdf.getPageIndices());

                        copiedPages.forEach(page => pdfDoc.addPage(page));
                    }

                    finalFilename = outputFilename || `merged_${Date.now()}.pdf`;
                    outputPath = path.join(outputDir, finalFilename);

                    const mergedPdf = await pdfDoc.save();
                    fs.writeFileSync(outputPath, mergedPdf);

                    console.log(`[EditPDF] Merged ${pdfFiles.length} PDF files`);
                    break;

                default:
                    return JSON.stringify({
                        success: false,
                        error: `Unknown operation: ${operation}`
                    });
            }

            const fileSize = fs.statSync(outputPath).size;
            const pageCount = pdfDoc.getPageCount();

            console.log(`[EditPDF] Operation completed: ${outputPath} (${fileSize} bytes, ${pageCount} pages)`);

            return JSON.stringify({
                success: true,
                message: `PDF ${operation} completed successfully. The edited PDF is ready to send.`,
                operation: operation,
                filePath: outputPath,
                filename: finalFilename,
                size: fileSize,
                pages: pageCount,
                status: 'ready_to_send',
                next_action: 'Use send_document tool with the filePath above to deliver this PDF to the user.'
            });

        } catch (error) {
            console.error('[EditPDF] Error:', error.message);
            return JSON.stringify({
                success: false,
                error: error.message,
                operation: operation
            });
        }
    }
};
