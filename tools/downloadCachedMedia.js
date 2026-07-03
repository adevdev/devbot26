/**
 * Download Cached Media Tool
 *
 * Downloads media from a cached WhatsApp message ID.
 * Used in faceswap/i2v workflows when user sends images before giving commands.
 */

const mediaCacheManager = require('../mediaCacheManager');

module.exports = {
    definition: {
        name: 'download_cached_media',
        description: 'Download media from a previously sent message using its cached message ID. Use this when user sent images before giving faceswap/i2v command. Returns base64 encoded media data that can be passed to upload_image tool. Check the Recent Media Cache section in your system prompt to see available cached message IDs.',
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

            // FIX: Use message.room, not message.from (consistent with caching)
            const chatId = message.room;
            console.log(`[DownloadCachedMedia] Using chatId: ${chatId}`);

            // Check if message exists in cache
            const cacheEntry = mediaCacheManager.getMediaById(chatId, messageId);
            if (!cacheEntry) {
                console.log(`[DownloadCachedMedia] Message ${messageId} not found in cache for chatId ${chatId}`);
                return JSON.stringify({
                    success: false,
                    error: `Message ${messageId} not found in cache. It may have expired (30min cache) or was not a media message.`
                });
            }

            console.log(`[DownloadCachedMedia] Found in cache: ${cacheEntry.type}, sent ${new Date(cacheEntry.timestamp).toISOString()}`);

            // Download media
            const mediaBuffer = await mediaCacheManager.downloadCachedMedia(chatId, messageId);

            if (!mediaBuffer) {
                return JSON.stringify({
                    success: false,
                    error: 'Failed to download media. The message may no longer be available on WhatsApp.'
                });
            }

            console.log(`[DownloadCachedMedia] Downloaded ${mediaBuffer.length} bytes`);

            // Convert to base64 for JSON transport
            const base64Data = mediaBuffer.toString('base64');

            return JSON.stringify({
                success: true,
                messageId,
                type: cacheEntry.type,
                mimetype: cacheEntry.mimetype,
                size: mediaBuffer.length,
                base64Data,
                caption: cacheEntry.caption || null,
                message: 'Media downloaded successfully. You can now pass this base64Data to upload_image tool.'
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
