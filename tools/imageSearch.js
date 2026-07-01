/**
 * Image Search Tool - Searches Pinterest and returns image URLs
 * Self-contained modular tool
 */

module.exports = {
    // Tool definition for AI API
    definition: {
        name: 'image_search',
        description: 'Search for EXISTING images on Pinterest. Use this tool when user wants to FIND/SEARCH for images. The system will automatically send the first image found. Do NOT use this if user wants to CREATE/GENERATE images - use connectAilab instead for generation.',
        input_schema: {
            type: 'object',
            properties: {
                query: {
                    type: 'string',
                    description: 'The image search query (e.g., "cute cat", "sunset beach", "modern architecture")'
                }
            },
            required: ['query']
        }
    },

    // Metadata for UI/UX
    metadata: {
        icon: '🖼️',
        progressMessage: (input) => `Searching images: _${input.query}_`,
        resultType: 'data' // Returns data for AI to process, not auto-send
    },

    // Execution logic
    execute: async function(input, context) {
        const query = input.query;

        try {
            console.log('[ImageSearch] Searching Pinterest:', query);

            const apiUrl = `https://apied26.adevdev.com/pinterest?q=${encodeURIComponent(query)}`;
            const response = await fetch(apiUrl);
            const data = await response.json();

            if (data.success && data.images && data.images.length > 0) {
                console.log(`[ImageSearch] Found ${data.images.length} images`);

                // Silent mode: auto-send first image
                if (context && context.room) {
                    try {
                        const axios = require('axios');
                        const imageUrl = data.images[0];

                        console.log('[ImageSearch] Downloading image:', imageUrl);
                        const imageResponse = await axios.get(imageUrl, {
                            responseType: 'arraybuffer',
                            timeout: 30000
                        });
                        const imageBuffer = Buffer.from(imageResponse.data);

                        // Generate thumbnail
                        const { Jimp } = require('jimp');
                        const image = await Jimp.read(imageBuffer);
                        const thumbnailWidth = Math.max(1, Math.floor(image.bitmap.width * 0.05));
                        const thumbnailHeight = Math.max(1, Math.floor(image.bitmap.height * 0.05));
                        const resized = await image.resize({ w: thumbnailWidth, h: thumbnailHeight });
                        const thumbnail = await resized.getBuffer('image/jpeg');

                        console.log(`[ImageSearch] Thumbnail generated: ${thumbnailWidth}x${thumbnailHeight}`);

                        // Send via baileys
                        const wachan = require('wachan');
                        const sock = wachan.getSocket();

                        const imageOptions = {
                            image: imageBuffer,
                            jpegThumbnail: thumbnail,
                            caption: query // Just the search query as caption
                        };

                        const quotedOptions = context.message ? { quoted: context.message.toBaileys() } : {};

                        await sock.sendMessage(context.room, imageOptions, quotedOptions);

                        // Update progress message
                        if (context.progressMsg) {
                            try {
                                await context.progressMsg.edit(`🔧 Used tools: image_search`);
                            } catch (e) {
                                console.error('[ImageSearch] Failed to update progress:', e.message);
                            }
                        }

                        console.log('[ImageSearch] Image sent successfully');

                        // Return silent mode flag
                        return JSON.stringify({
                            success: true,
                            silent: true,
                            message: 'Image sent automatically'
                        });

                    } catch (error) {
                        console.error('[ImageSearch] Failed to send image:', error.message);

                        // Return error (will fallback to text)
                        return JSON.stringify({
                            error: `Failed to send image: ${error.message}`,
                            query: query
                        });
                    }
                }

                // Fallback: return URLs for AI to handle
                return JSON.stringify({
                    success: true,
                    images: data.images,
                    query: query
                });
            } else {
                return JSON.stringify({
                    error: data.error || 'No images found',
                    query: query
                });
            }

        } catch (error) {
            console.error('[ImageSearch] Error:', error.message);
            return JSON.stringify({
                error: error.message,
                query: query
            });
        }
    }
};
