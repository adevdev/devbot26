/**
 * Download Media Tool
 * Download media (images, videos, audio, documents) from quoted/replied messages
 */

const fs = require('fs');
const path = require('path');

module.exports = {
    // Tool definition (sent to AI)
    definition: {
        name: 'download_media',
        description: 'Download media or document from a quoted/replied WhatsApp message. Supports images, videos, audio, documents, and stickers. The media is downloaded and saved to the server, returning the file path for further processing. Use this when the user wants to save, process, or forward media from a previous message. NOTE: This tool requires a quoted message context - it cannot download arbitrary media.',
        input_schema: {
            type: 'object',
            properties: {
                customFilename: {
                    type: 'string',
                    description: 'Optional custom filename (without extension). If not provided, will generate based on timestamp and media type.'
                }
            },
            required: []
        }
    },

    // Metadata for UI/UX
    metadata: {
        icon: '⬇️',
        progressMessage: () => `Downloading media...`,
        resultType: 'text'
    },

    // Execution logic
    execute: async function(input, context) {
        const { customFilename } = input;

        try {
            console.log('[DownloadMedia] Starting media download from quoted message');

            // Get quoted message from context
            const message = context?.message;
            if (!message) {
                return JSON.stringify({
                    success: false,
                    error: 'No message context available. This tool requires a message context.'
                });
            }

            // Get quoted message
            const quoted = await message.getQuoted();
            if (!quoted) {
                return JSON.stringify({
                    success: false,
                    error: 'No quoted message found. Please reply to a message containing media or document to download it.'
                });
            }

            console.log(`[DownloadMedia] Quoted message type: ${quoted.type}, isMedia: ${quoted.isMedia}`);

            // Check if quoted message has media or is a document
            const supportedTypes = ['image', 'video', 'audio', 'sticker', 'document'];
            if (!quoted.isMedia && quoted.type !== 'document') {
                return JSON.stringify({
                    success: false,
                    error: `Quoted message does not contain downloadable media. Message type: ${quoted.type}. Supported types: ${supportedTypes.join(', ')}`
                });
            }

            // Validate media type
            if (!supportedTypes.includes(quoted.type)) {
                return JSON.stringify({
                    success: false,
                    error: `Unsupported media type: ${quoted.type}. Supported types: ${supportedTypes.join(', ')}`
                });
            }

            console.log('[DownloadMedia] Downloading media buffer...');

            // Download media
            const mediaBuffer = await quoted.downloadMedia();

            if (!mediaBuffer || mediaBuffer.length === 0) {
                return JSON.stringify({
                    success: false,
                    error: 'Failed to download media. The media might be expired or unavailable.'
                });
            }

            console.log(`[DownloadMedia] Downloaded ${mediaBuffer.length} bytes`);

            // Determine file extension based on type and mimetype
            let extension = '';
            const mimetype = quoted.mimetype || '';

            // Map common mimetypes to extensions
            const mimetypeMap = {
                'image/jpeg': 'jpg',
                'image/jpg': 'jpg',
                'image/png': 'png',
                'image/gif': 'gif',
                'image/webp': 'webp',
                'video/mp4': 'mp4',
                'video/3gpp': '3gp',
                'video/quicktime': 'mov',
                'audio/mpeg': 'mp3',
                'audio/ogg': 'ogg',
                'audio/mp4': 'm4a',
                'audio/aac': 'aac',
                'application/pdf': 'pdf',
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
                'application/msword': 'doc',
                'application/vnd.ms-excel': 'xls',
                'application/zip': 'zip',
                'text/plain': 'txt'
            };

            if (mimetype && mimetypeMap[mimetype]) {
                extension = mimetypeMap[mimetype];
            } else {
                // Fallback to type-based extension
                const typeExtensions = {
                    'image': 'jpg',
                    'video': 'mp4',
                    'audio': 'mp3',
                    'sticker': 'webp',
                    'document': 'pdf'
                };
                extension = typeExtensions[quoted.type] || 'bin';
            }

            // Generate filename
            const baseFilename = customFilename || `downloaded_${Date.now()}`;
            const filename = `${baseFilename}.${extension}`;

            // Create output directory
            const outputDir = path.join(__dirname, '../temp');
            if (!fs.existsSync(outputDir)) {
                fs.mkdirSync(outputDir, { recursive: true });
            }

            const outputPath = path.join(outputDir, filename);

            // Save to file
            fs.writeFileSync(outputPath, mediaBuffer);

            console.log(`[DownloadMedia] Saved to: ${outputPath}`);

            return JSON.stringify({
                success: true,
                message: 'Media downloaded successfully',
                filePath: outputPath,
                filename: filename,
                size: mediaBuffer.length,
                type: quoted.type,
                mimetype: mimetype || 'unknown',
                extension: extension,
                status: 'ready',
                hint: 'You can now use this file with other tools like send_document, edit_pdf, or process it further.'
            });

        } catch (error) {
            console.error('[DownloadMedia] Error:', error.message);
            return JSON.stringify({
                success: false,
                error: error.message
            });
        }
    }
};
