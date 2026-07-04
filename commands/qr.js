/**
 * QR Command - Read QR code from image
 * Uses jimp + qrcode-reader
 */

const { Jimp } = require('jimp');

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
            return `*QR Code Reader*\n\n` +
                   `Send this command as caption on an image containing QR code, or reply to an image with this command.\n\n` +
                   `*Example:*\n` +
                   `Send image with caption: ${command.prefix}${command.usedName}\n` +
                   `Or reply to image: ${command.prefix}${command.usedName}`;
        }

        try {
            await message.react("⏳");

            // Download image
            const imageBuffer = await targetMessage.downloadMedia();

            // Load image with jimp
            await message.react("♻️");
            const image = await Jimp.read(imageBuffer);

            // Decode QR code
            const QrCode = require('qrcode-reader');
            const qr = new QrCode();

            const result = await new Promise((resolve, reject) => {
                qr.callback = (err, value) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(value);
                    }
                };
                qr.decode(image.bitmap);
            });

            await message.react("✅");

            if (!result || !result.result) {
                return '*QR Code Reader*\n\nNo QR code found in the image.';
            }

            // Return decoded text
            return `*QR Code Decoded:*\n\n${result.result}`;

        } catch (error) {
            console.error('[QR] Error:', error.message);
            await message.react("❌");

            if (error.message.includes('Not found')) {
                return '*QR Code Reader*\n\nNo QR code detected in the image. Make sure the image contains a valid QR code.';
            }

            return `*Error:* ${error.message}`;
        }
    },
    options: {
        aliases: ['readqr', 'scanqr', 'qrcode'],
        description: 'Read and decode QR code from image',
        sectionName: 'Tools'
    }
};
