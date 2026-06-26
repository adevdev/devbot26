/**
 * HD Command - Enhance image quality
 * Uses apied26 image-enhance API
 */

const fs = require('fs/promises');
const path = require('path');
const axios = require('axios');
const { Jimp } = require('jimp');

// Generate 5% thumbnail to prevent baileys auto-generation (sharp crash on Render)
async function generateThumbnail(imageBuffer) {
    try {
        console.log('[HD] Generating thumbnail with jimp...');
        const image = await Jimp.read(imageBuffer);
        const width = Math.max(1, Math.floor(image.bitmap.width * 0.05));
        const height = Math.max(1, Math.floor(image.bitmap.height * 0.05));
        console.log(`[HD] Thumbnail: ${width}x${height}`);
        const resized = await image.resize({ w: width, h: height });
        const thumb = await resized.getBuffer('image/jpeg');
        return thumb;
    } catch (error) {
        console.error('[HD] Thumbnail generation failed:', error.message);
        return null;
    }
}

module.exports = {
    response: async (context, next) => {
        const { message, command } = context;
        const bot = require('wachan');

        // Check for image in message or quoted message
        let targetMessage = null;

        // Check quoted message first
        const quoted = await message.getQuoted();
        if (quoted && quoted.isMedia && quoted.type === 'image') {
            targetMessage = quoted;
        }

        // Fallback to current message
        if (!targetMessage && message.isMedia && message.type === 'image') {
            targetMessage = message;
        }

        // No image found
        if (!targetMessage) {
            return `*HD Image Enhancer*\n\n` +
                   `Send this command as caption on an image, or reply to an image with this command.\n\n` +
                   `*Example:*\n` +
                   `Send image with caption: ${command.prefix}${command.usedName}\n` +
                   `Or reply to image: ${command.prefix}${command.usedName}`;
        }

        let filepath = null; // Track filepath for cleanup in catch block

        try {
            await message.react("⏳");

            // Download image
            console.log('[HD] Downloading image...');
            const imageBuffer = await targetMessage.downloadMedia();

            // Save to /tmp directory
            const tmpDir = path.join(process.cwd(), 'tmp');
            await fs.mkdir(tmpDir, { recursive: true });

            const filename = `hd_${Date.now()}.jpg`;
            filepath = path.join(tmpDir, filename);
            await fs.writeFile(filepath, imageBuffer);
            console.log(`[HD] Image saved: ${filepath}`);

            // Construct public URL
            const BOT_DOMAIN = process.env.BOT_DOMAIN;
            if (!BOT_DOMAIN) {
                await message.react("❌");
                // Cleanup on error
                try {
                    await fs.unlink(filepath);
                } catch {}
                return '*Error:* BOT_DOMAIN not configured in .env';
            }

            const imageUrl = `${BOT_DOMAIN}/tmp/${filename}`;
            console.log(`[HD] Image URL: ${imageUrl}`);

            // Call apied26 API
            await message.react("♻️");
            console.log('[HD] Calling image-enhance API...');
            const apiUrl = `https://apied26.adevdev.com/image-enhance?image=${encodeURIComponent(imageUrl)}`;
            const response = await axios.get(apiUrl, { timeout: 60000 }); // 60s timeout

            const data = response.data;

            if (!data.status || !data.result) {
                await message.react("❌");
                // Cleanup on error
                try {
                    await fs.unlink(filepath);
                } catch {}
                return '*Error:* Failed to enhance image. API returned error.';
            }

            // Download enhanced image
            console.log('[HD] Downloading enhanced image...');
            const enhancedResponse = await axios.get(data.result, {
                responseType: 'arraybuffer',
                timeout: 30000
            });
            const enhancedBuffer = Buffer.from(enhancedResponse.data);

            // Generate thumbnail to prevent baileys sharp crash on Render
            const thumbnail = await generateThumbnail(enhancedBuffer);

            // Send enhanced image
            const sock = bot.getSocket();
            const imageOptions = {
                image: enhancedBuffer
            };

            // Add thumbnail if generated successfully
            if (thumbnail) {
                imageOptions.jpegThumbnail = thumbnail;
            }

            await sock.sendMessage(message.room, imageOptions, {
                quoted: message.toBaileys()
            });

            await message.react("✅");

            // Cleanup temp file
            try {
                await fs.unlink(filepath);
                console.log('[HD] Temp file cleaned');
            } catch (cleanupError) {
                console.warn('[HD] Failed to cleanup temp file:', cleanupError.message);
            }

            return null; // Prevent duplicate send

        } catch (error) {
            console.error('[HD] Error:', error.message);
            await message.react("❌");

            // Cleanup temp file if it was created
            if (filepath) {
                try {
                    await fs.unlink(filepath);
                    console.log('[HD] Temp file cleaned after error');
                } catch (cleanupError) {
                    console.warn('[HD] Failed to cleanup temp file:', cleanupError.message);
                }
            }

            if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
                return '*Error:* Request timeout. The image might be too large or server is slow.';
            }

            if (error.code === 'ECONNRESET') {
                return '*Error:* Connection reset. Make sure the API server is running.';
            }

            return `*Error:* ${error.message}`;
        }
    },
    options: {
        aliases: ['enhance', 'upscale', 'remini'],
        description: 'Enhance image quality and resolution',
        sectionName: 'Tools'
    }
};
