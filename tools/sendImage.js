/**
 * Send Image Tool
 * Sends an image from a given URL to the chat
 */

module.exports = {
    // Tool definition (sent to AI)
    definition: {
        name: 'send_image',
        description: 'Send an image from a URL to the chat. Use this when you have a specific image URL and want to share it with the user. The image will be downloaded and sent with a thumbnail.',
        input_schema: {
            type: 'object',
            properties: {
                url: {
                    type: 'string',
                    description: 'Direct URL to the image (must be a valid image URL: jpg, jpeg, png, gif, webp)'
                },
                caption: {
                    type: 'string',
                    description: 'Optional caption text to send with the image'
                }
            },
            required: ['url']
        }
    },

    // Metadata for UI/UX
    metadata: {
        icon: '📤',
        progressMessage: (input) => `Sending image...`,
        resultType: 'image' // Special type for image handling with thumbnail
    },

    // Execution logic
    execute: async function(input) {
        const { url, caption } = input;

        try {
            console.log('[SendImage] Preparing to send:', url);

            // Basic URL validation
            if (!url || typeof url !== 'string') {
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
                caption: caption || null
            });

        } catch (error) {
            console.error('[SendImage] Error:', error.message);
            return JSON.stringify({
                error: error.message,
                url: url
            });
        }
    }
};
