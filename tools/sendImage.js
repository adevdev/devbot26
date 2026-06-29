/**
 * Send Image Tool
 * Sends an image from a URL or local file path to the chat
 */

const wachan = require('wachan');
const fs = require('fs');
const path = require('path');

module.exports = {
    // Tool definition (sent to AI)
    definition: {
        name: 'send_image',
        description: 'Send an image from a URL or local file path to the chat. Use this when you have a specific image and want to share it with the user. The image will be sent with a thumbnail.',
        input_schema: {
            type: 'object',
            properties: {
                url: {
                    type: 'string',
                    description: 'Direct URL to the image (e.g., https://example.com/photo.jpg). Use this for remote images.'
                },
                filePath: {
                    type: 'string',
                    description: 'Local file path to the image (e.g., "./images/photo.jpg", "C:/Pictures/image.png"). Use this for files on the server. Supported formats: jpg, jpeg, png, gif, webp, bmp'
                },
                targetJid: {
                    type: 'string',
                    description: 'Optional. WhatsApp JID of the recipient (e.g., "6281234567890@s.whatsapp.net" for users or "120363012345678901@g.us" for groups). If not provided, sends to the current chat.'
                },
                caption: {
                    type: 'string',
                    description: 'Optional caption text to send with the image'
                }
            },
            required: []
        }
    },

    // Metadata for UI/UX
    metadata: {
        icon: '📤',
        progressMessage: (input) => `Sending image...`,
        resultType: 'image' // Special type for URL-based images (handled by ai.js with thumbnail)
    },

    // Execution logic
    execute: async function(input, context) {
        const { url, filePath, targetJid, caption } = input;

        try {
            // Owner check for targetJid override
            const senderId = context?.message?.sender?.id || context?.message?.from;
            const OWNER_ID = process.env.OWNER_ID;

            // Determine current room
            const currentRoom = context?.room || context?.message?.room || context?.message?.from;

            // Determine target JID
            let finalTargetJid = targetJid;

            // If not owner and trying to send to different target, deny
            if (!OWNER_ID || senderId !== OWNER_ID) {
                // Check if targetJid was explicitly provided and is different from current room
                if (targetJid && targetJid !== currentRoom) {
                    console.log(`[SendImage] Non-owner ${senderId} attempted to send to ${targetJid} (current: ${currentRoom}) - DENIED`);
                    return JSON.stringify({
                        success: false,
                        error: 'Permission denied: You can only send images to the current chat. Sending to other chats is restricted to owner only.',
                        denied: true
                    });
                }
                // Force current room
                finalTargetJid = currentRoom;
            } else if (!finalTargetJid) {
                // Owner but no targetJid provided - auto-detect
                finalTargetJid = currentRoom;
            }

            if (!finalTargetJid) {
                return JSON.stringify({
                    error: 'Cannot determine target chat. Please provide targetJid parameter.'
                });
            }

            // Handle local file path
            if (filePath) {
                console.log('[SendImage] Sending from local file:', filePath);

                // Check if file exists
                if (!fs.existsSync(filePath)) {
                    return JSON.stringify({
                        error: `File not found: ${filePath}`
                    });
                }

                // Validate file extension
                const ext = path.extname(filePath).toLowerCase();
                const validExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'];
                if (!validExtensions.includes(ext)) {
                    return JSON.stringify({
                        error: `Invalid image format. Supported: ${validExtensions.join(', ')}`,
                        filePath: filePath
                    });
                }

                // Read file
                const buffer = fs.readFileSync(filePath);
                console.log(`[SendImage] File loaded: ${path.basename(filePath)}, Size: ${buffer.length} bytes`);

                // Send via wachan directly
                const message = {
                    image: buffer
                };

                if (caption) message.caption = caption;

                await wachan.sendMessage(finalTargetJid, message);

                return JSON.stringify({
                    success: true,
                    source: 'local',
                    filename: path.basename(filePath),
                    size: buffer.length,
                    targetJid: finalTargetJid,
                    caption: caption || null
                });
            }

            // Handle URL (existing behavior - let ai.js handle with thumbnail)
            if (url) {
                console.log('[SendImage] Preparing to send from URL:', url);

                // Basic URL validation
                if (typeof url !== 'string') {
                    return JSON.stringify({
                        error: 'Invalid URL provided',
                        url: url
                    });
                }

                // Check if URL looks like an image
                const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'];
                const urlLower = url.toLowerCase();
                const hasImageExtension = imageExtensions.some(ext => urlLower.includes(ext));

                if (!hasImageExtension && !urlLower.includes('image') && !urlLower.includes('img')) {
                    console.warn('[SendImage] URL might not be an image:', url);
                }

                // Return image URL in the expected format
                // ai.js will handle downloading and sending with thumbnail
                return JSON.stringify({
                    success: true,
                    images: [url],
                    targetJid: finalTargetJid,
                    caption: caption || null
                });
            }

            // Neither url nor filePath provided
            return JSON.stringify({
                error: 'Either url or filePath must be provided'
            });

        } catch (error) {
            console.error('[SendImage] Error:', error.message);
            return JSON.stringify({
                error: error.message,
                url: url || null,
                filePath: filePath || null
            });
        }
    }
};
