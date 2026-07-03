/**
 * Media Cache Manager
 *
 * Caches WhatsApp message IDs containing media (images, videos, documents)
 * so AI can reference and download them later even after new messages arrive.
 *
 * Solves the problem: message.downloadMedia() only works on current message context
 */

const bot = require('wachan');

// In-memory cache: { chatId: [{ messageId, type, caption, timestamp }] }
const mediaCache = new Map();

// Cache duration: 30 minutes (adjust as needed)
const CACHE_DURATION_MS = 30 * 60 * 1000;

// Max items per chat
const MAX_CACHE_PER_CHAT = 10;

/**
 * Add media message to cache
 * @param {string} chatId - Chat/group ID
 * @param {object} message - WhatsApp message object
 */
function cacheMediaMessage(chatId, message) {
    try {
        // Only cache messages with media
        if (!message.hasMedia && !message.isMedia) {
            console.log('[MediaCache] Message has no media, skipping');
            return;
        }

        const mediaTypes = ['image', 'video', 'document', 'sticker'];
        if (!mediaTypes.includes(message.type)) {
            console.log(`[MediaCache] Type ${message.type} not in allowed types, skipping`);
            return;
        }

        // Debug: Log message structure
        console.log('[MediaCache] Message object keys:', Object.keys(message));
        console.log('[MediaCache] Message.id:', message.id);
        console.log('[MediaCache] Message.key:', message.key);

        const messageId = message.id?._serialized || message.id || message.key?.id || 'unknown';
        console.log('[MediaCache] Extracted messageId:', messageId);

        const entry = {
            messageId: messageId,
            type: message.type,
            mimetype: message.mimetype || 'unknown',
            caption: message.body || '',
            timestamp: message.timestamp || Date.now(),
            fromMe: message.fromMe || false,
            sender: message.sender?.id || message.from
        };

        console.log('[MediaCache] Cache entry to be stored:', JSON.stringify(entry, null, 2));

        // Get or create cache for this chat
        if (!mediaCache.has(chatId)) {
            mediaCache.set(chatId, []);
            console.log('[MediaCache] Created new cache array for chatId:', chatId);
        }

        const chatCache = mediaCache.get(chatId);
        console.log('[MediaCache] Current cache size for this chat:', chatCache.length);

        // Add to front (most recent first)
        chatCache.unshift(entry);

        // Limit cache size per chat
        if (chatCache.length > MAX_CACHE_PER_CHAT) {
            chatCache.pop(); // Remove oldest
        }

        console.log('[MediaCache] Cached ${message.type} from ${chatId}: ${messageId}');
        console.log('[MediaCache] Total chats in cache:', mediaCache.size);
        console.log('[MediaCache] Total items in this chat:', chatCache.length);

    } catch (error) {
        console.error('[MediaCache] Failed to cache media:', error.message);
        console.error('[MediaCache] Error stack:', error.stack);
    }
}

/**
 * Get recent media messages for a chat
 * @param {string} chatId - Chat/group ID
 * @param {string} mediaType - Optional filter: 'image', 'video', 'document'
 * @returns {Array} Recent media entries
 */
function getRecentMedia(chatId, mediaType = null) {
    const chatCache = mediaCache.get(chatId) || [];

    // Filter by type if specified
    if (mediaType) {
        return chatCache.filter(entry => entry.type === mediaType);
    }

    // Filter out expired entries
    const now = Date.now();
    return chatCache.filter(entry => {
        const age = now - entry.timestamp;
        return age < CACHE_DURATION_MS;
    });
}

/**
 * Get media message by ID
 * @param {string} chatId - Chat/group ID
 * @param {string} messageId - Message ID
 * @returns {object|null} Media entry or null
 */
function getMediaById(chatId, messageId) {
    const chatCache = mediaCache.get(chatId) || [];
    return chatCache.find(entry => entry.messageId === messageId) || null;
}

/**
 * Download media from cached message
 * @param {string} chatId - Chat/group ID
 * @param {string} messageId - Message ID
 * @returns {Promise<Buffer|null>} Media buffer or null
 */
async function downloadCachedMedia(chatId, messageId) {
    try {
        const entry = getMediaById(chatId, messageId);
        if (!entry) {
            console.log(`[MediaCache] Message ${messageId} not found in cache`);
            return null;
        }

        console.log(`[MediaCache] Attempting to download media from ${messageId}...`);

        // Get WhatsApp client using wachan's API
        const wachan = require('wachan');
        const client = wachan.getSocket();

        if (!client) {
            console.error('[MediaCache] WhatsApp client (socket) not available');
            return null;
        }

        console.log('[MediaCache] WhatsApp client available, fetching message...');

        // Retrieve message from WhatsApp using baileys method
        const message = await client.getMessageById(messageId);

        if (!message) {
            console.error(`[MediaCache] Message ${messageId} not found on WhatsApp`);
            return null;
        }

        console.log('[MediaCache] Message retrieved, downloading media...');

        // Download media using the message's downloadMedia method
        if (message.hasMedia || message.downloadMedia) {
            const media = await message.downloadMedia();

            if (!media) {
                console.error('[MediaCache] downloadMedia() returned null');
                return null;
            }

            // Convert base64 to buffer if needed
            const mediaBuffer = Buffer.isBuffer(media)
                ? media
                : Buffer.from(media.data || media, 'base64');

            console.log(`[MediaCache] Downloaded ${mediaBuffer.length} bytes from ${messageId}`);
            return mediaBuffer;
        }

        console.log(`[MediaCache] Message ${messageId} has no media or downloadMedia method`);
        return null;

    } catch (error) {
        console.error('[MediaCache] Download failed:', error.message);
        console.error('[MediaCache] Error stack:', error.stack);
        return null;
    }
}

/**
 * Clear cache for a chat
 * @param {string} chatId - Chat/group ID
 */
function clearCache(chatId) {
    mediaCache.delete(chatId);
    console.log(`[MediaCache] Cleared cache for ${chatId}`);
}

/**
 * Clear all expired entries (run periodically)
 */
function cleanupExpired() {
    const now = Date.now();
    let totalRemoved = 0;

    for (const [chatId, entries] of mediaCache.entries()) {
        const before = entries.length;
        const filtered = entries.filter(entry => {
            const age = now - entry.timestamp;
            return age < CACHE_DURATION_MS;
        });

        if (filtered.length !== before) {
            mediaCache.set(chatId, filtered);
            totalRemoved += (before - filtered.length);
        }

        // Remove empty caches
        if (filtered.length === 0) {
            mediaCache.delete(chatId);
        }
    }

    if (totalRemoved > 0) {
        console.log(`[MediaCache] Cleaned up ${totalRemoved} expired entries`);
    }
}

/**
 * Get cache statistics for dashboard
 * @returns {Object} Cache stats
 */
function getCacheStats() {
    const now = Date.now();
    const stats = {
        totalChats: mediaCache.size,
        totalItems: 0,
        config: {
            ttl: CACHE_DURATION_MS,
            ttlMinutes: Math.floor(CACHE_DURATION_MS / 60000),
            maxPerChat: MAX_CACHE_PER_CHAT
        },
        chats: []
    };

    for (const [chatId, entries] of mediaCache.entries()) {
        // Filter out expired (for accurate count)
        const validEntries = entries.filter(entry => {
            const age = now - entry.timestamp;
            return age < CACHE_DURATION_MS;
        });

        if (validEntries.length === 0) continue;

        stats.totalItems += validEntries.length;

        const timestamps = validEntries.map(e => e.timestamp);
        const oldest = Math.min(...timestamps);
        const newest = Math.max(...timestamps);

        stats.chats.push({
            chatId,
            count: validEntries.length,
            oldestTimestamp: oldest,
            newestTimestamp: newest,
            items: validEntries.map(entry => ({
                messageId: entry.messageId,
                type: entry.type,
                mimetype: entry.mimetype,
                timestamp: entry.timestamp,
                caption: entry.caption || null,
                fromMe: entry.fromMe || false
            }))
        });
    }

    // Sort by newest first
    stats.chats.sort((a, b) => b.newestTimestamp - a.newestTimestamp);

    return stats;
}

/**
 * Clear all cache (for dashboard)
 */
function clearAllCache() {
    const totalCleared = mediaCache.size;
    mediaCache.clear();
    console.log(`[MediaCache] Cleared all cache: ${totalCleared} chats`);
    return totalCleared;
}

// Auto-cleanup every 5 minutes
setInterval(cleanupExpired, 5 * 60 * 1000);

module.exports = {
    cacheMediaMessage,
    getRecentMedia,
    getMediaById,
    downloadCachedMedia,
    clearCache,
    getCacheStats,
    clearAllCache
};
