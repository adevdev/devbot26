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
 * @param {object} message - WhatsApp message object (wachan)
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

        const messageId = message.id?._serialized || message.id || message.key?.id || 'unknown';

        const entry = {
            messageId: messageId,
            type: message.type,
            mimetype: message.mimetype || 'unknown',
            caption: message.body || '',
            // FIX: wachan message.timestamp is in SECONDS, convert to MILLISECONDS
            timestamp: message.timestamp ? message.timestamp * 1000 : Date.now(),
            fromMe: message.fromMe || false,
            sender: message.sender?.id || message.from,
            // PURE MESSAGE OBJECT APPROACH: Store only the message, no buffer
            messageObject: message
        };

        console.log(`[MediaCache] Caching message object (no buffer) for ${messageId}`);

        // Get or create cache for this chat
        if (!mediaCache.has(chatId)) {
            mediaCache.set(chatId, []);
        }

        const chatCache = mediaCache.get(chatId);

        // Add to front (most recent first)
        chatCache.unshift(entry);

        // Limit cache size per chat
        if (chatCache.length > MAX_CACHE_PER_CHAT) {
            chatCache.pop();
        }

        console.log(`[MediaCache] Cached ${message.type} from ${chatId}: ${messageId} (${chatCache.length} items)`);

    } catch (error) {
        console.error('[MediaCache] Failed to cache media:', error.message);
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

        console.log(`[MediaCache] Found cached entry for ${messageId}`);

        // PURE MESSAGE OBJECT APPROACH: Re-download from cached message
        if (!entry.messageObject) {
            console.error('[MediaCache] No message object in cache entry - this should not happen!');
            return null;
        }

        console.log('[MediaCache] Re-downloading media from cached message object...');

        const buffer = await entry.messageObject.downloadMedia();

        if (!buffer) {
            console.error('[MediaCache] Re-download failed: downloadMedia() returned null');
            console.error('[MediaCache] This may happen if:');
            console.error('[MediaCache] - Message was deleted from WhatsApp');
            console.error('[MediaCache] - WhatsApp session disconnected');
            console.error('[MediaCache] - Message object lost its context');
            return null;
        }

        console.log(`[MediaCache] ✅ Successfully re-downloaded: ${buffer.length} bytes`);
        return buffer;

    } catch (error) {
        console.error('[MediaCache] Re-download failed with error:', error.message);
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
        // Filter out expired entries
        const validEntries = entries.filter(entry => {
            if (!entry.timestamp) {
                console.warn(`[MediaCache] Entry ${entry.messageId} has no timestamp`);
                return false;
            }
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

    console.log(`[MediaCache] Stats: ${stats.totalChats} chats, ${stats.totalItems} items`);

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
