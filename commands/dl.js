/**
 * All-in-One Video Downloader
 * Supports: TikTok, Instagram, YouTube, Facebook
 * Downloads videos in best available quality
 */

const axios = require('axios');
const { Jimp } = require('jimp');

// ============================================
// Helper: Generate optimized thumbnail
// ============================================
async function generateThumbnail(imageBuffer) {
    try {
        const image = await Jimp.read(imageBuffer);
        const width = Math.max(1, Math.floor(image.bitmap.width * 0.05));
        const height = Math.max(1, Math.floor(image.bitmap.height * 0.05));

        const resized = await image.resize({ w: width, h: height });
        const thumb = await resized.getBuffer('image/jpeg');

        console.log(`[Downloader] Thumbnail generated: ${width}x${height} (${thumb.length} bytes)`);
        return thumb;
    } catch (error) {
        console.warn('[Downloader] Thumbnail generation failed:', error.message);
        return null;
    }
}

// ============================================
// Helper: Detect platform from URL
// ============================================
function detectPlatform(url) {
    if (url.includes('tiktok.com')) return 'TikTok';
    if (url.includes('instagram.com')) return 'Instagram';
    if (url.includes('youtube.com') || url.includes('youtu.be')) return 'YouTube';
    if (url.includes('facebook.com') || url.includes('fb.watch') || url.includes('fb.com')) return 'Facebook';
    return 'Unknown';
}

// ============================================
// Main Command Handler
// ============================================
module.exports = {
    response: async (context, next) => {
        const { message, command } = context;
        const bot = require('wachan');

        // Parse URL from parameters
        const url = command.parameters.join(' ').trim();

        if (!url) {
            return '*All-in-One Video Downloader*\n\n' +
                   '*Supported Platforms:*\n' +
                   '• TikTok\n' +
                   '• Instagram\n' +
                   '• YouTube\n' +
                   '• Facebook\n\n' +
                   '*Usage:* `.dl <URL>`\n\n' +
                   '*Example:*\n' +
                   '`.dl https://www.tiktok.com/@user/video/123`\n' +
                   '`.dl https://www.instagram.com/reel/abc`\n' +
                   '`.dl https://youtu.be/xyz`\n' +
                   '`.dl https://www.facebook.com/watch/?v=123`';
        }

        // Validate URL format
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            return '*Error:* Invalid URL format. Please provide a valid link.';
        }

        const platform = detectPlatform(url);
        console.log(`[Downloader] Platform detected: ${platform}`);

        try {
            // Indicate processing
            await message.react('⏳');

            // Fetch video info from API
            console.log('[Downloader] Fetching video data...');
            const apiUrl = `https://apied26.adevdev.com/downloader?url=${encodeURIComponent(url)}`;
            const response = await axios.get(apiUrl, { timeout: 30000 });
            const data = response.data;

            // Validate API response
            if (!data.status || !data.result?.result) {
                await message.react('❌');
                return '*Error:* Unable to fetch video. The content might be private, unavailable, or unsupported.';
            }

            const result = data.result.result;

            // Find best quality video without watermark
            const video = result.medias?.find(m => m.quality === 'no_watermark' && m.type === 'video') ||
                          result.medias?.find(m => m.quality === 'hd_no_watermark' && m.type === 'video') ||
                          result.medias?.find(m => m.type === 'video');

            if (!video) {
                await message.react('❌');
                return '*Error:* No video found in the provided link.';
            }

            // Download video file
            console.log(`[Downloader] Downloading video (quality: ${video.quality})...`);
            const videoResponse = await axios.get(video.url, {
                responseType: 'arraybuffer',
                timeout: 120000 // 2 minutes for large videos
            });
            const videoBuffer = Buffer.from(videoResponse.data);
            console.log(`[Downloader] Video downloaded: ${(videoBuffer.length / 1024 / 1024).toFixed(2)} MB`);

            // Download and process thumbnail if available
            let thumbnailBuffer = null;
            if (result.thumbnail) {
                try {
                    console.log('[Downloader] Fetching thumbnail...');
                    const thumbResponse = await axios.get(result.thumbnail, {
                        responseType: 'arraybuffer',
                        timeout: 10000
                    });
                    const originalThumb = Buffer.from(thumbResponse.data);
                    thumbnailBuffer = await generateThumbnail(originalThumb);
                } catch (error) {
                    console.warn('[Downloader] Thumbnail fetch failed:', error.message);
                }
            }

            // Prepare video message
            const sock = bot.getSocket();
            const videoOptions = { video: videoBuffer };

            // Attach thumbnail if available
            if (thumbnailBuffer) {
                videoOptions.jpegThumbnail = thumbnailBuffer;
            }

            // Quote original message
            const quotedOptions = { quoted: message.toBaileys() };

            // Send video
            await sock.sendMessage(message.room, videoOptions, quotedOptions);

            // Success indicator
            await message.react('✅');

            // Prevent wachan from sending duplicate
            return null;

        } catch (error) {
            console.error('[Downloader] Operation failed:', error.message);
            await message.react('❌');

            // Handle specific error cases
            if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
                return '*Error:* Download timeout. The video file is too large or server is slow.';
            }

            if (error.response?.status === 404) {
                return '*Error:* Video not found. Please check the URL.';
            }

            return `*Error:* ${error.message}`;
        }
    },

    // Command metadata
    options: {
        aliases: ['download', 'vid', 'video', 'tt', 'tiktok', 'ig', 'insta', 'instagram', 'yt', 'youtube', 'fb', 'facebook', 'unduh', 'get'],
        description: 'Download video from TikTok, Instagram, YouTube, Facebook',
        sectionName: 'Downloader'
    }
};
