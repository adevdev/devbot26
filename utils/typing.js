// Utility untuk menampilkan typing indicator saat bot memproses command

/**
 * Mengirim typing indicator ke chat
 * @param {Object} bot - Bot instance dari wachan
 * @param {string} roomId - ID chat room (message.room)
 * @param {boolean} isTyping - true untuk start typing, false untuk stop
 */
async function sendTyping(bot, roomId, isTyping = true) {
    try {
        const sock = bot.getSocket()
        if (!sock) {
            console.warn('⚠️ Socket tidak tersedia untuk typing indicator')
            return
        }
        
        // Kirim presence update
        // 'composing' = sedang mengetik
        // 'paused' = berhenti mengetik
        const presence = isTyping ? 'composing' : 'paused'
        await sock.sendPresenceUpdate(presence, roomId)
    } catch (error) {
        console.error('❌ Error sending typing indicator:', error.message)
    }
}

/**
 * Helper function untuk menjalankan fungsi dengan typing indicator
 * Otomatis start typing sebelum fungsi dijalankan dan stop setelah selesai
 * @param {Object} bot - Bot instance dari wachan
 * @param {string} roomId - ID chat room (message.room)
 * @param {Function} asyncFn - Async function yang akan dijalankan
 */
async function withTyping(bot, roomId, asyncFn) {
    try {
        // Start typing
        await sendTyping(bot, roomId, true)
        
        // Jalankan function
        const result = await asyncFn()
        
        // Stop typing
        await sendTyping(bot, roomId, false)
        
        return result
    } catch (error) {
        // Stop typing jika error
        await sendTyping(bot, roomId, false)
        throw error
    }
}

/**
 * Membuat interval typing indicator yang berjalan terus sampai dihentikan
 * Berguna untuk operasi yang memakan waktu lama
 * @param {Object} bot - Bot instance
 * @param {string} roomId - ID chat room
 * @param {number} interval - Interval dalam ms untuk refresh typing (default 8000ms = 8 detik)
 * @returns {Function} stop function untuk menghentikan typing
 */
function startContinuousTyping(bot, roomId, interval = 8000) {
    // Kirim typing pertama kali
    sendTyping(bot, roomId, true)
    
    // Set interval untuk refresh typing indicator
    // WhatsApp presence expire setelah ~10 detik
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
