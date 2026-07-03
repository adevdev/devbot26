/**
 * Download Cached Media Tool
 *
 * Downloads media from a cached WhatsApp message ID.
 * Used in faceswap/i2v workflows when user sends images before giving commands.
 */

const mediaCacheManager = require('../mediaCacheManager');
const fs = require('fs');
const path = require('path');

module.exports = {
    definition: {
        name: 'download_cached_media',
        description: 'Download media from a previously sent message using its cached message ID. Use this when user sent images before giving faceswap/i2v command. Returns file path that can be used with send_image or other tools. Check the Recent Media Cache section in your system prompt to see available cached message IDs.',
        input_schema: {
            type: 'object',
            properties: {
                messageId: {
                    type: 'string',
                    description: 'WhatsApp message ID from the media cache (found in system prompt Recent Media Cache section)'
                }
            },
            required: ['messageId']
        }
    },

    // Metadata for UI/UX
    metadata: {
        icon: '📥',
        progressMessage: () => `Downloading cached media...`,
        resultType: 'data'
    },

    execute: async (input, context) => {
        const { messageId } = input;
        const { message } = context;

        try {
            console.log(`[DownloadCachedMedia] Attempting to download from message ID: ${messageId}`);

            // Use message.room (consistent with caching)
            const chatId = message.room;
            console.log(`[DownloadCachedMedia] Using chatId: ${chatId}`);

            // Check if message exists in cache
            const cacheEntry = mediaCacheManager.getMediaById(chatId, messageId);
            if (!cacheEntry) {
                return JSON.stringify({
                    success: false,
                    error: `Message ${messageId} not found in cache. It may have expired (30min cache) or was not a media message.`
                });
            }

            console.log(`[DownloadCachedMedia] Found in cache: ${cacheEntry.type}, sent ${new Date(cacheEntry.timestamp).toISOString()}`);

            // Download media from cache
            const mediaBuffer = await mediaCacheManager.downloadCachedMedia(chatId, messageId);

            if (!mediaBuffer) {
                return JSON.stringify({
                    success: false,
                    error: 'Failed to download media. The message may no longer be available on WhatsApp.'
                });
            }

            console.log(`[DownloadCachedMedia] Downloaded ${mediaBuffer.length} bytes`);

            // Determine file extension
            const mimetypeMap = {
                'image/jpeg': 'jpg',
                'image/jpg': 'jpg',
                'image/png': 'png',
                'image/gif': 'gif',
                'image/webp': 'webp',
                'video/mp4': 'mp4',
                'audio/mpeg': 'mp3',
                'application/pdf': 'pdf'
            };

            const ext = mimetypeMap[cacheEntry.mimetype] ||
                        (cacheEntry.type === 'image' ? 'jpg' :
                         cacheEntry.type === 'video' ? 'mp4' : 'bin');

            // Save to temp file (consistent with downloadMedia tool)
            const filename = `cached_media_${messageId}.${ext}`;
            const outputDir = path.join(__dirname, '../temp');

            // Create temp directory if not exists
            if (!fs.existsSync(outputDir)) {
                fs.mkdirSync(outputDir, { recursive: true });
            }

            const outputPath = path.join(outputDir, filename);

            // Save buffer to file
            fs.writeFileSync(outputPath, mediaBuffer);

            console.log(`[DownloadCachedMedia] Saved to: ${outputPath}`);

            return JSON.stringify({
                success: true,
                message: 'Media downloaded successfully from cache',
                filePath: outputPath,
                filename: filename,
                size: mediaBuffer.length,
                type: cacheEntry.type,
                mimetype: cacheEntry.mimetype || 'unknown',
                messageId: messageId,
                hint: 'You can now use this filePath with send_image, send_document, or other tools.'
            });

        } catch (error) {
            console.error('[DownloadCachedMedia] Error:', error.message);
            return JSON.stringify({
                success: false,
                error: `Download failed: ${error.message}`
            });
        }
    }
};
