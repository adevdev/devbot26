/**
 * Send Document Tool
 * Sends a document file from a local path or URL to the chat
 */

const wachan = require('wachan');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

async function downloadFile(url) {
    return new Promise((resolve, reject) => {
        const client = url.startsWith('https') ? https : http;
        client.get(url, (res) => {
            const chunks = [];
            res.on('data', chunk => chunks.push(chunk));
            res.on('end', () => resolve(Buffer.concat(chunks)));
            res.on('error', reject);
        }).on('error', reject);
    });
}

function getMimeType(filename) {
    const ext = path.extname(filename).toLowerCase();
    const mimes = {
        '.pdf': 'application/pdf',
        '.doc': 'application/msword',
        '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        '.xls': 'application/vnd.ms-excel',
        '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        '.ppt': 'application/vnd.ms-powerpoint',
        '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        '.txt': 'text/plain',
        '.csv': 'text/csv',
        '.zip': 'application/zip',
        '.rar': 'application/x-rar-compressed',
        '.7z': 'application/x-7z-compressed',
        '.json': 'application/json',
        '.xml': 'application/xml',
        '.html': 'text/html',
        '.css': 'text/css',
        '.js': 'application/javascript',
        '.apk': 'application/vnd.android.package-archive',
        '.exe': 'application/x-msdownload'
    };
    return mimes[ext] || 'application/octet-stream';
}

module.exports = {
    // Tool definition (sent to AI)
    definition: {
        name: 'send_document',
        description: 'Send a document file from a local file path or URL to the chat. Use this for PDFs, Word docs, Excel files, text files, or any other document type. The file will be sent as a WhatsApp document attachment.',
        input_schema: {
            type: 'object',
            properties: {
                filePath: {
                    type: 'string',
                    description: 'Local file path to the document (e.g., "./files/report.pdf", "C:/Documents/data.xlsx"). Use this for files on the server.'
                },
                url: {
                    type: 'string',
                    description: 'Direct URL to the document file (e.g., https://example.com/file.pdf). Use this for remote files.'
                },
                filename: {
                    type: 'string',
                    description: 'Optional filename for the document. If not provided, will be extracted from filePath or URL. Include file extension (e.g., "report.pdf", "data.xlsx")'
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
            required: []
        }
    },

    // Metadata for UI/UX
    metadata: {
        icon: '📄',
        progressMessage: (input) => `Sending document...`,
        resultType: 'document'
    },

    // Execution logic
    execute: async function(input, context) {
        const { filePath, url, filename, mimetype, caption } = input;

        try {
            console.log('[SendDocument] Preparing to send:', filePath || url);

            let buffer;
            let finalFilename;

            // Get buffer from local file or URL
            if (filePath) {
                if (!fs.existsSync(filePath)) {
                    return JSON.stringify({
                        error: `File not found: ${filePath}`
                    });
                }
                buffer = fs.readFileSync(filePath);
                finalFilename = filename || path.basename(filePath);
            } else if (url) {
                buffer = await downloadFile(url);
                finalFilename = filename || path.basename(new URL(url).pathname) || 'document.pdf';
            } else {
                return JSON.stringify({
                    error: 'Either filePath or url must be provided'
                });
            }

            // Detect mimetype
            const finalMimetype = mimetype || getMimeType(finalFilename);

            console.log(`[SendDocument] File: ${finalFilename}, MIME: ${finalMimetype}, Size: ${buffer.length} bytes`);

            // Get target JID from context
            const targetJid = context?.message?.room || context?.message?.from;
            if (!targetJid) {
                return JSON.stringify({
                    error: 'Cannot determine target chat'
                });
            }

            // Send via wachan
            const message = {
                document: buffer,
                mimetype: finalMimetype,
                fileName: finalFilename
            };

            if (caption) message.caption = caption;

            await wachan.sendMessage(targetJid, message);

            return JSON.stringify({
                success: true,
                filename: finalFilename,
                size: buffer.length,
                mimetype: finalMimetype,
                caption: caption || null
            });

        } catch (error) {
            console.error('[SendDocument] Error:', error.message);
            return JSON.stringify({
                error: error.message,
                filePath: filePath || null,
                url: url || null
            });
        }
    }
};
