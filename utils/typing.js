// Utility to display typing indicator while bot processes commands

/**
 * Send typing indicator to chat
 * @param {Object} bot - Bot instance from wachan
 * @param {string} roomId - Chat room ID (message.room)
 * @param {boolean} isTyping - true to start typing, false to stop
 */
async function sendTyping(bot, roomId, isTyping = true) {
    try {
        const sock = bot.getSocket()
        if (!sock) {
            console.warn('⚠️ Socket not available for typing indicator')
            return
        }

        // Send presence update
        // 'composing' = typing
        // 'paused' = stopped typing
        const presence = isTyping ? 'composing' : 'paused'
        await sock.sendPresenceUpdate(presence, roomId)
    } catch (error) {
        console.error('❌ Error sending typing indicator:', error.message)
    }
}

/**
 * Helper function to run a function with typing indicator
 * Automatically starts typing before function runs and stops after completion
 * @param {Object} bot - Bot instance from wachan
 * @param {string} roomId - Chat room ID (message.room)
 * @param {Function} asyncFn - Async function to execute
 */
async function withTyping(bot, roomId, asyncFn) {
    try {
        // Start typing
        await sendTyping(bot, roomId, true)

        // Execute function
        const result = await asyncFn()

        // Stop typing
        await sendTyping(bot, roomId, false)

        return result
    } catch (error) {
        // Stop typing on error
        await sendTyping(bot, roomId, false)
        throw error
    }
}

/**
 * Create continuous typing indicator interval that runs until stopped
 * Useful for long-running operations
 * @param {Object} bot - Bot instance
 * @param {string} roomId - Chat room ID
 * @param {number} interval - Interval in ms to refresh typing (default 8000ms = 8 seconds)
 * @returns {Function} stop function to stop typing
 */
function startContinuousTyping(bot, roomId, interval = 8000) {
    // Send typing first time
    sendTyping(bot, roomId, true)

    // Set interval to refresh typing indicator
    // WhatsApp presence expires after ~10 seconds
    const typingInterval = setInterval(() => {
        sendTyping(bot, roomId, true)
    }, interval)

    // Return stop function
    return async () => {
        clearInterval(typingInterval)
        await sendTyping(bot, roomId, false)
    }
}

module.exports = {
    sendTyping,
    withTyping,
    startContinuousTyping
}
