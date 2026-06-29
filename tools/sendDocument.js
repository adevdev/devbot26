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
                targetJid: {
                    type: 'string',
                    description: 'Optional. WhatsApp JID of the recipient (e.g., "6281234567890@s.whatsapp.net" for users or "120363012345678901@g.us" for groups). If not provided, sends to the current chat.'
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
        const { filePath, url, targetJid, filename, mimetype, caption } = input;

        try {
            console.log('[SendDocument] Preparing to send:', filePath || url);

            // Owner check for targetJid override
            const senderId = context?.message?.sender?.id || context?.message?.from;
            const OWNER_ID = process.env.OWNER_ID;

            // Determine current room
            const currentRoom = context?.room || context?.message?.room || context?.message?.from;

            // Determine target JID
            let finalTargetJid = targetJid;

            // If not owner and trying to send to different target, deny
            if (!OWNER_ID || senderId !== OWNER_ID) {
                // Check if targetJid was explicitly provided and is different from current room
                if (targetJid && targetJid !== currentRoom) {
                    console.log(`[SendDocument] Non-owner ${senderId} attempted to send to ${targetJid} (current: ${currentRoom}) - DENIED`);
                    return JSON.stringify({
                        success: false,
                        error: 'Permission denied: You can only send documents to the current chat. Sending to other chats is restricted to owner only.',
                        denied: true
                    });
                }
                // Force current room
                finalTargetJid = currentRoom;
            } else if (!finalTargetJid) {
                // Owner but no targetJid provided - auto-detect
                finalTargetJid = currentRoom;
            }

            if (!finalTargetJid) {
                return JSON.stringify({
                    error: 'Cannot determine target chat. Please provide targetJid parameter.'
                });
            }

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

            // Send via wachan
            const message = {
                document: buffer,
                mimetype: finalMimetype,
                fileName: finalFilename
            };

            if (caption) message.caption = caption;

            await wachan.sendMessage(finalTargetJid, message);

            return JSON.stringify({
                success: true,
                filename: finalFilename,
                size: buffer.length,
                mimetype: finalMimetype,
                targetJid: finalTargetJid,
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
