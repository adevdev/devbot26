/**
 * Download Media Tool (Unified)
 * Download media from WhatsApp messages - supports quoted/replied messages and cached message IDs
 */

const fs = require('fs');
const path = require('path');
const mediaCacheManager = require('../mediaCacheManager');

module.exports = {
    // Tool definition
    definition: {
        name: 'download_media',
        description: 'Download media from WhatsApp messages. Two sources: (1) "quoted" - from current replied/quoted message, (2) "cached" - from message ID in Recent Media Cache (30min history). Use cached source for faceswap workflows when user sent multiple images. Returns file path for tools (upload_image, send_image) and optionally includes image in next AI vision call for re-analysis.',
        input_schema: {
            type: 'object',
            properties: {
                source: {
                    type: 'string',
                    enum: ['quoted', 'cached'],
                    description: 'Source: "quoted" = download from replied/quoted message, "cached" = download by message ID from cache. Default: "quoted"',
                    default: 'quoted'
                },
                messageId: {
                    type: 'string',
                    description: 'Required if source="cached". Message ID from Recent Media Cache section in system prompt.'
                },
                includeForAnalysis: {
                    type: 'boolean',
                    description: 'Set true to include downloaded image in next AI call for visual analysis (e.g., user asks "what color is that image?", "check that photo"). Set false if only need file path for tools. Default: false',
                    default: false
                },
                customFilename: {
                    type: 'string',
                    description: 'Optional custom filename (without extension). Auto-generated if not provided.'
                }
            },
            required: ['source']
        }
    },

    // Metadata for UI/UX
    metadata: {
        icon: '📥',
        progressMessage: (input) => input.source === 'cached' ? 'Downloading from cache...' : 'Downloading from quoted message...',
        resultType: 'data'
    },

    // Execution logic
    execute: async function(input, context) {
        const { source = 'quoted', messageId, includeForAnalysis = false, customFilename } = input;
        const { message } = context;

        try {
            console.log(`[DownloadMedia] Source: ${source}, includeForAnalysis: ${includeForAnalysis}`);

            let mediaBuffer;
            let mediaType;
            let mimetype;
            let sourceInfo;

            // Branch: Download from quoted message
            if (source === 'quoted') {
                console.log('[DownloadMedia] Downloading from quoted message...');

                const quoted = await message.getQuoted();
                if (!quoted) {
                    return JSON.stringify({
                        success: false,
                        error: 'No quoted message found. Please reply to a message containing media.'
                    });
                }

                // Validate media type
                const supportedTypes = ['image', 'video', 'audio', 'sticker', 'document'];
                if (!quoted.isMedia && quoted.type !== 'document') {
                    return JSON.stringify({
                        success: false,
                        error: `Quoted message has no media. Type: ${quoted.type}. Supported: ${supportedTypes.join(', ')}`
                    });
                }

                if (!supportedTypes.includes(quoted.type)) {
                    return JSON.stringify({
                        success: false,
                        error: `Unsupported type: ${quoted.type}. Supported: ${supportedTypes.join(', ')}`
                    });
                }

                // Download
                mediaBuffer = await quoted.downloadMedia();
                if (!mediaBuffer || mediaBuffer.length === 0) {
                    return JSON.stringify({
                        success: false,
                        error: 'Download failed. Media might be expired or unavailable.'
                    });
                }

                mediaType = quoted.type;
                mimetype = quoted.mimetype || 'unknown';
                sourceInfo = 'quoted message';

                console.log(`[DownloadMedia] Downloaded from quoted: ${mediaBuffer.length} bytes`);
            }
            // Branch: Download from cached message ID
            else if (source === 'cached') {
                console.log(`[DownloadMedia] Downloading from cache: ${messageId}`);

                if (!messageId) {
                    return JSON.stringify({
                        success: false,
                        error: 'messageId is required when source="cached"'
                    });
                }

                // Get cache entry
                const chatId = message.room;
                const cacheEntry = mediaCacheManager.getMediaById(chatId, messageId);
                if (!cacheEntry) {
                    return JSON.stringify({
                        success: false,
                        error: `Message ${messageId} not found in cache. It may have expired (30min TTL) or was not a media message.`
                    });
                }

                console.log(`[DownloadMedia] Found in cache: ${cacheEntry.type}`);

                // Download from cache
                mediaBuffer = await mediaCacheManager.downloadCachedMedia(chatId, messageId);
                if (!mediaBuffer) {
                    return JSON.stringify({
                        success: false,
                        error: 'Failed to download from cache. Message may no longer be available on WhatsApp.'
                    });
                }

                mediaType = cacheEntry.type;
                mimetype = cacheEntry.mimetype || 'unknown';
                sourceInfo = `cached message ${messageId}`;

                console.log(`[DownloadMedia] Downloaded from cache: ${mediaBuffer.length} bytes`);
            }
            else {
                return JSON.stringify({
                    success: false,
                    error: `Invalid source: ${source}. Use "quoted" or "cached"`
                });
            }

            // Determine file extension
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

            let ext = mimetypeMap[mimetype] || (
                mediaType === 'image' ? 'jpg' :
                mediaType === 'video' ? 'mp4' :
                mediaType === 'audio' ? 'mp3' :
                mediaType === 'sticker' ? 'webp' :
                mediaType === 'document' ? 'pdf' : 'bin'
            );

            // Generate filename
            const baseFilename = customFilename || `media_${source}_${Date.now()}`;
            const filename = `${baseFilename}.${ext}`;

            // Save to temp directory
            const outputDir = path.join(__dirname, '../temp');
            if (!fs.existsSync(outputDir)) {
                fs.mkdirSync(outputDir, { recursive: true });
            }

            const outputPath = path.join(outputDir, filename);
            fs.writeFileSync(outputPath, mediaBuffer);

            console.log(`[DownloadMedia] Saved to: ${outputPath}`);

            return JSON.stringify({
                success: true,
                message: `Media downloaded successfully from ${sourceInfo}`,
                filePath: outputPath,
                filename: filename,
                size: mediaBuffer.length,
                type: mediaType,
                mimetype: mimetype,
                base64Data: mediaBuffer.toString('base64'), // For upload_image or AI vision
                includeForAnalysis: includeForAnalysis,
                hint: includeForAnalysis
                    ? 'Image will be included in next AI call for visual analysis'
                    : 'You can use filePath with upload_image (recommended), base64Data with upload_image, or filePath with send_image/other tools.'
            });

        } catch (error) {
            console.error('[DownloadMedia] Error:', error.message);
            return JSON.stringify({
                success: false,
                error: `Download failed: ${error.message}`
            });
        }
    }
};
