const { Jimp } = require('jimp');

// Generate 5% thumbnail to prevent baileys auto-generation (sharp crash on Render)
async function generateThumbnail(imageBuffer) {
    try {
        const image = await Jimp.read(imageBuffer);
        const width = Math.max(1, Math.floor(image.bitmap.width * 0.05));
        const height = Math.max(1, Math.floor(image.bitmap.height * 0.05));
        const resized = await image.resize({ w: width, h: height });
        return await resized.getBuffer('image/jpeg');
    } catch (error) {
        console.error('[fetch] Thumbnail generation failed:', error.message);
        return null;
    }
}

module.exports = {
    response: async (context, next) => {
        const { message, command } = context;
        const bot = require('wachan');

        const url = command.parameters[0];
        if (!url) {
            return `Include a URL.\nExample: ${command.prefix}${command.usedName} https://example.com`;
        }

        // Validate URL
        try {
            new URL(url);
        } catch {
            return 'Invalid URL format';
        }

        try {
            await message.react("♻️");

            const response = await fetch(url, {
                headers: {
                    "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
                    "accept-language": "en-US,en;q=0.9",
                    "cache-control": "max-age=0",
                    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36"
                },
                method: "GET"
            });

            const headers = response.headers;
            const status = response.status;
            const contentType = headers.get('content-type') || '';

            // JSON Check
            if (contentType.includes('application/json')) {
                const json = await response.json();
                return walkJSON(json);
            }

            // Image Check
            if (contentType.includes('image/png') || contentType.includes('image/jpeg')) {
                await message.react("✅");

                // Download image buffer for thumbnail generation
                const imageBuffer = Buffer.from(await response.arrayBuffer());
                const thumbnail = await generateThumbnail(imageBuffer);

                const sock = bot.getSocket();
                const imageOptions = { image: imageBuffer };
                if (thumbnail) {
                    imageOptions.jpegThumbnail = thumbnail;
                }

                await sock.sendMessage(message.room, imageOptions, {
                    quoted: message.toBaileys()
                });
                return null;
            }

            // GIF Check
            if (contentType.includes('image/gif')) {
                await message.react("✅");

                // Download GIF buffer
                const gifBuffer = Buffer.from(await response.arrayBuffer());

                const sock = bot.getSocket();
                await sock.sendMessage(message.room, {
                    video: gifBuffer,
                    gifPlayback: true
                }, {
                    quoted: message.toBaileys()
                });
                return null;
            }

            // Video Check
            if (contentType.includes('video/mp4')) {
                await message.react("✅");

                // Download video buffer
                const videoBuffer = Buffer.from(await response.arrayBuffer());

                const sock = bot.getSocket();
                await sock.sendMessage(message.room, {
                    video: videoBuffer
                }, {
                    quoted: message.toBaileys()
                });
                return null;
            }

            // PDF Check
            if (contentType.includes('application/pdf') || url.endsWith('.pdf')) {
                const filename = url.split('/').pop();
                await message.react("✅");
                const sock = bot.getSocket();
                await sock.sendMessage(message.room, {
                    document: { url },
                    fileName: filename.endsWith('.pdf') ? filename : filename + '.pdf',
                    mimetype: 'application/pdf'
                }, {
                    quoted: message.toBaileys()
                });
                return null;
            }

            // File/Document
            if (contentType.includes('application/octet-stream')) {
                const disposition = headers.get('content-disposition');
                let filename = 'download';
                if (disposition) {
                    const match = disposition.match(/filename="?([^"]+)"?/);
                    if (match) filename = match[1];
                }
                await message.react("✅");
                const sock = bot.getSocket();
                await sock.sendMessage(message.room, {
                    document: { url },
                    fileName: filename,
                    mimetype: 'application/octet-stream'
                }, {
                    quoted: message.toBaileys()
                });
                return null;
            }

            // Text fallback
            const data = await response.text();
            await message.react("✅");

            // Truncate if too long
            const maxLength = 3000;
            const truncated = data.length > maxLength ? data.slice(0, maxLength) + '\n\n... (truncated)' : data;

            return `*Status:* ${status}\n*Content-Type:* ${contentType}\n\n*Response:*\n${truncated}`;

        } catch (error) {
            await message.react("❌");
            return `*Error:* ${error.message}`;
        }
    },
    options: {
        description: 'Fetch and display content from URL',
        sectionName: 'Tools'
    }
};

function walkJSON(json, depth = 0, array = []) {
    for (const key in json) {
        array.push('┊'.repeat(depth) + (depth > 0 ? ' ' : '') + `*${key}:*`);
        if (typeof json[key] === 'object' && json[key] !== null) {
            walkJSON(json[key], depth + 1, array);
        } else {
            array[array.length - 1] += ' ' + json[key];
        }
    }
    return array.join('\n');
}
