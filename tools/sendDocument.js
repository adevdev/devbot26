/**
 * Send Document Tool
 * Sends a document file from a given URL to the chat
 */

module.exports = {
    // Tool definition (sent to AI)
    definition: {
        name: 'send_document',
        description: 'Send a document file from a URL to the chat. Use this for PDFs, Word docs, Excel files, text files, or any other document type. The file will be sent as a WhatsApp document attachment.',
        input_schema: {
            type: 'object',
            properties: {
                url: {
                    type: 'string',
                    description: 'Direct URL to the document file (e.g., https://example.com/file.pdf)'
                },
                filename: {
                    type: 'string',
                    description: 'Optional filename for the document. If not provided, will be extracted from URL. Include file extension (e.g., "report.pdf", "data.xlsx")'
                },
                mimetype: {
                    type: 'string',
                    description: 'Optional MIME type. If not provided, will be auto-detected from filename extension. Common types: application/pdf, application/vnd.openxmlformats-officedocument.wordprocessingml.document (DOCX), application/vnd.openxmlformats-officedocument.spreadsheetml.sheet (XLSX), text/plain'
                },
                caption: {
                    type: 'string',
                    description: 'Optional caption text to send with the document'
                }
            },
            required: ['url']
        }
    },

    // Metadata for UI/UX
    metadata: {
        icon: '📄',
        progressMessage: (input) => `Sending document...`,
        resultType: 'document' // Special type for document handling
    },

    // Execution logic
    execute: async function(input) {
        const { url, filename, mimetype, caption } = input;

        try {
            console.log('[SendDocument] Preparing to send:', url);

            // Basic URL validation
            if (!url || typeof url !== 'string') {
                return JSON.stringify({
                    error: 'Invalid URL provided',
                    url: url
                });
            }

            // Extract filename from URL if not provided
            let finalFilename = filename;
            if (!finalFilename) {
                const urlParts = url.split('/');
                finalFilename = urlParts[urlParts.length - 1].split('?')[0]; // Remove query params

                // If no extension, add generic one
                if (!finalFilename.includes('.')) {
                    finalFilename = 'document.bin';
                }
            }

            // Auto-detect mimetype from filename extension if not provided
            let finalMimetype = mimetype;
            if (!finalMimetype && finalFilename) {
                const ext = finalFilename.toLowerCase().split('.').pop();

                // Common document mimetypes
                const mimetypeMap = {
                    'pdf': 'application/pdf',
                    'doc': 'application/msword',
                    'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                    'xls': 'application/vnd.ms-excel',
                    'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                    'ppt': 'application/vnd.ms-powerpoint',
                    'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
                    'txt': 'text/plain',
                    'csv': 'text/csv',
                    'zip': 'application/zip',
                    'rar': 'application/x-rar-compressed',
                    '7z': 'application/x-7z-compressed',
                    'json': 'application/json',
                    'xml': 'application/xml',
                    'html': 'text/html',
                    'css': 'text/css',
                    'js': 'application/javascript',
                    'apk': 'application/vnd.android.package-archive',
                    'exe': 'application/x-msdownload'
                };

                finalMimetype = mimetypeMap[ext] || 'application/octet-stream';
            } else if (!finalMimetype) {
                finalMimetype = 'application/octet-stream';
            }

            console.log(`[SendDocument] File: ${finalFilename}, MIME: ${finalMimetype}`);

            // Return document info in expected format
            // ai.js will handle sending via baileys
            return JSON.stringify({
                success: true,
                document: url,
                fileName: finalFilename,
                mimetype: finalMimetype,
                caption: caption || null
            });

        } catch (error) {
            console.error('[SendDocument] Error:', error.message);
            return JSON.stringify({
                error: error.message,
                url: url
            });
        }
    }
};
