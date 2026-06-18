const { Sticker, StickerTypes } = require('wa-sticker-formatter');
const { withTyping } = require('../utils/typing');

module.exports = {
    response: async function(context, next) {
        const { message, command } = context;
        const bot = require('wachan');

        let targetMessage = null;

        // Check quoted message (use getQuoted like s2i.js)
        const quoted = await message.getQuoted();
        if (quoted && quoted.isMedia && ['image', 'video', 'gif', 'sticker'].includes(quoted.type)) {
            targetMessage = quoted;
        }

        // Fallback to message itself
        if (!targetMessage && message.isMedia && ['image', 'video', 'gif', 'sticker'].includes(message.type)) {
            targetMessage = message;
        }

        // No media found
        if (!targetMessage) {
            return `Gunakan perintah sebagai caption dari gambar/GIF.\nAtau reply/tag pesan yang berisi gambar/GIF\n\n` +
                `Cara mengatur nama/pembuat stiker:\n` +
                `Bisa menggunakan "" | . atau newline\n\n` +
                `Contoh: ${command.prefix}${command.usedName} "Meow" "Dev"\n\n` +
                `Cara lain: ${command.prefix}${command.usedName} Meow . Dev\n\n` +
                `Atau: ${command.prefix}${command.usedName} Meow | Dev\n\n` +
                `Atau menggunakan newline/baris bawah:\n` +
                `${command.prefix}${command.usedName}\nMeow\nDev`;
        }

        try {
            // React process indicator
            await message.react("♻️");

            // Download media
            const mediaBuffer = await targetMessage.downloadMedia();

            // Parse pack and author from params
            let pack = 'Hai';  // Default pack
            let author = 'Dev';  // Default author

            if (command.parameters.length >= 1) {
                const fullText = command.parameters.join(' ');

                // Format with quotes
                const matches = fullText.match(/(?<=").+?(?=")/g);

                if (matches && matches.length >= 2) {
                    pack = matches[0].trim();
                    author = matches[1].trim();
                } else if (matches && matches.length === 1) {
                    // Only 1 parameter with quotes = author only
                    pack = '';
                    author = matches[0].trim();
                } else {
                    // Split with newline
                    let divider = fullText.split('\n');
                    if (divider.length >= 2) {
                        pack = divider[0].trim();
                        author = divider[1].trim();
                    } else {
                        // Split with |
                        divider = fullText.split('|');
                        if (divider.length >= 2) {
                            pack = divider[0].trim();
                            author = divider[1].trim();
                        } else {
                            // Split with .
                            divider = fullText.split('.');
                            if (divider.length >= 2) {
                                pack = divider[0].trim();
                                author = divider[1].trim();
                            } else {
                                // Only 1 parameter without separator = author only
                                pack = '';
                                author = fullText.trim();
                            }
                        }
                    }
                }
            }

            // Quality based on media type
            let quality = 50;
            if (['gif', 'video'].includes(targetMessage.type)) {
                quality = 20;
            }

            // Create/rebrand sticker
            const sticker = new Sticker(mediaBuffer, {
                pack: pack,
                author: author,
                type: StickerTypes.FULL,
                id: Date.now().toString(),
                quality: quality
            });

            // Sticker type: send buffer directly
            // Non-sticker: use toMessage() for typing indicator
            if (targetMessage.type === 'sticker') {
                const sock = bot.getSocket();
                const stickerBuffer = await sticker.toBuffer();
                await sock.sendMessage(message.room, { sticker: stickerBuffer });
                await message.react("✅");
                return;
            }

            // Use typing indicator for non-sticker
            const stickerMessage = await withTyping(bot, message.room, async () => {
                return await sticker.toMessage();
            });

            // React success
            await message.react("✅");

            return stickerMessage;

        } catch (error) {
            console.error('Error membuat sticker:', error);
            await message.react("❌");
            return "❌ Gagal membuat sticker. Pastikan file yang dikirim adalah gambar atau video yang valid!";
        }
    },
    options: {
        aliases: ["sticker", "s", "wm", "stikerwm"],
        description: "Buat stiker",
        sectionName: "Stiker"
    }
};
