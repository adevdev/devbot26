/**
 * Upload History Manager
 *
 * Tracks recent CDN uploads so AI can reference them later
 * Useful for faceswap workflows, image reuse, and "send that image I uploaded" requests
 */

// In-memory history: { chatId: [{ url, purpose, filename, timestamp }] }
const uploadHistory = new Map();

// History duration: 30 minutes (match media cache)
const HISTORY_DURATION_MS = 30 * 60 * 1000;

// Max items per chat
const MAX_HISTORY_PER_CHAT = 10;

/**
 * Add upload to history
 * @param {string} chatId - Chat/group ID
 * @param {object} uploadInfo - Upload information
 */
function trackUpload(chatId, uploadInfo) {
    try {
        const { url, purpose, filename, size, caption } = uploadInfo;

        if (!url) {
            console.warn('[UploadHistory] No URL provided, skipping tracking');
            return;
        }

        const entry = {
            url: url,
            purpose: purpose || 'general',
            filename: filename || url.split('/').pop(),
            size: size || 0,
            caption: caption || null,
            timestamp: Date.now()
        };

        console.log(`[UploadHistory] Tracking upload: ${purpose || 'general'}${caption ? ` - "${caption}"` : ''} - ${url}`);

        // Get or create history for this chat
        if (!uploadHistory.has(chatId)) {
            uploadHistory.set(chatId, []);
        }

        const chatHistory = uploadHistory.get(chatId);

        // Add to front (most recent first)
        chatHistory.unshift(entry);

        // Limit history size per chat
        if (chatHistory.length > MAX_HISTORY_PER_CHAT) {
            chatHistory.pop();
        }

        console.log(`[UploadHistory] Tracked for ${chatId}: ${chatHistory.length} items`);

    } catch (error) {
        console.error('[UploadHistory] Failed to track upload:', error.message);
    }
}

/**
 * Get recent uploads for a chat
 * @param {string} chatId - Chat/group ID
 * @returns {Array} Recent upload entries
 */
function getRecentUploads(chatId) {
    const chatHistory = uploadHistory.get(chatId) || [];

    // Filter out expired entries
    const now = Date.now();
    return chatHistory.filter(entry => {
        const age = now - entry.timestamp;
        return age < HISTORY_DURATION_MS;
    });
}

/**
 * Get upload by purpose
 * @param {string} chatId - Chat/group ID
 * @param {string} purpose - Upload purpose (e.g., 'faceswap_target')
 * @returns {object|null} Most recent upload with matching purpose
 */
function getUploadByPurpose(chatId, purpose) {
    const chatHistory = uploadHistory.get(chatId) || [];
    const now = Date.now();

    // Find most recent non-expired upload with matching purpose
    return chatHistory.find(entry => {
        const age = now - entry.timestamp;
        return entry.purpose === purpose && age < HISTORY_DURATION_MS;
    }) || null;
}

/**
 * Clear history for a chat
 * @param {string} chatId - Chat/group ID
 */
function clearHistory(chatId) {
    uploadHistory.delete(chatId);
    console.log(`[UploadHistory] Cleared history for ${chatId}`);
}

/**
 * Clear all expired entries (run periodically)
 */
function cleanupExpired() {
    const now = Date.now();
    let totalRemoved = 0;

    for (const [chatId, entries] of uploadHistory.entries()) {
        const before = entries.length;
        const filtered = entries.filter(entry => {
            const age = now - entry.timestamp;
            return age < HISTORY_DURATION_MS;
        });

        if (filtered.length !== before) {
            uploadHistory.set(chatId, filtered);
            totalRemoved += (before - filtered.length);
        }

        // Remove empty histories
        if (filtered.length === 0) {
            uploadHistory.delete(chatId);
        }
    }

    if (totalRemoved > 0) {
        console.log(`[UploadHistory] Cleaned up ${totalRemoved} expired entries`);
    }
}

/**
 * Get history statistics
 * @returns {Object} History stats
 */
function getHistoryStats() {
    const now = Date.now();

    const stats = {
        totalChats: uploadHistory.size,
        totalItems: 0,
        config: {
            ttl: HISTORY_DURATION_MS,
            ttlMinutes: Math.floor(HISTORY_DURATION_MS / 60000),
            maxPerChat: MAX_HISTORY_PER_CHAT
        },
        chats: []
    };

    for (const [chatId, entries] of uploadHistory.entries()) {
        // Filter out expired entries
        const validEntries = entries.filter(entry => {
            const age = now - entry.timestamp;
            return age < HISTORY_DURATION_MS;
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
                url: entry.url,
                purpose: entry.purpose,
                filename: entry.filename,
                size: entry.size,
                caption: entry.caption,
                timestamp: entry.timestamp
            }))
        });
    }

    // Sort by newest first
    stats.chats.sort((a, b) => b.newestTimestamp - a.newestTimestamp);

    return stats;
}

/**
 * Clear all history (for dashboard)
 */
function clearAllHistory() {
    const totalCleared = uploadHistory.size;
    uploadHistory.clear();
    console.log(`[UploadHistory] Cleared all history: ${totalCleared} chats`);
    return totalCleared;
}

// Auto-cleanup every 5 minutes
setInterval(cleanupExpired, 5 * 60 * 1000);

module.exports = {
    trackUpload,
    getRecentUploads,
    getUploadByPurpose,
    clearHistory,
    getHistoryStats,
    clearAllHistory
};
