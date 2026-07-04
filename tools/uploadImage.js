/**
 * Upload Image Tool
 * Upload WhatsApp image to AiLab CDN to get public URL
 * General purpose tool for getting public URLs from WhatsApp images
 */

const axios = require('axios');

module.exports = {
    // Tool definition for AI API
    definition: {
        name: 'upload_image',
        description: 'Upload WhatsApp images to CDN and get public URLs. Use this tool when you need a publicly accessible URL for an image (required for faceswap, i2v, or sharing images outside WhatsApp). Supports four input methods: (1) current message, (2) quoted/replied message, (3) filePath from download_cached_media tool (recommended), (4) base64Data from download_cached_media tool. For faceswap workflow: download both images from cache, upload each with appropriate purpose, then use URLs with connectAilab.',
        input_schema: {
            type: 'object',
            properties: {
                purpose: {
                    type: 'string',
                    enum: ['faceswap_source', 'faceswap_target', 'i2v_input', 'general'],
                    description: 'Purpose of upload: faceswap_source (face image), faceswap_target (body image), i2v_input (image-to-video input), general (any other use case)'
                },
                fromQuoted: {
                    type: 'boolean',
                    description: 'Set to true to upload from quoted/replied message. Default: false (current message)'
                },
                filePath: {
                    type: 'string',
                    description: 'Local file path from download_cached_media tool (recommended method)'
                },
                base64Data: {
                    type: 'string',
                    description: 'Base64 encoded image data from download_cached_media tool'
                }
            },
            required: ['purpose']
        }
    },

    // Metadata for UI/UX
    metadata: {
        icon: '📤',
        progressMessage: (input) => `Uploading to CDN (${input.purpose})...`,
        resultType: 'data'
    },

    /**
     * Execute image upload
     * @param {Object} input - Tool input parameters
     * @param {Object} context - Execution context with message, room, group
     * @returns {Promise<string>} Result with uploaded URL
     */
    execute: async (input, context) => {
        const { purpose, fromQuoted = false, filePath = null, base64Data = null } = input;
        const { message } = context;

        try {
            console.log(`[UploadImage] Starting upload: ${purpose}`);

            let imageBuffer;

            // Method 1: Upload from filePath (from download_cached_media tool)
            if (filePath) {
                console.log('[UploadImage] Reading from filePath:', filePath);
                const fs = require('fs');

                if (!fs.existsSync(filePath)) {
                    return JSON.stringify({
                        success: false,
                        error: `File not found: ${filePath}`
                    });
                }

                imageBuffer = fs.readFileSync(filePath);
                console.log(`[UploadImage] File read: ${imageBuffer.length} bytes`);
            }
            // Method 2: Upload from base64Data (from download_cached_media tool)
            else if (base64Data) {
                console.log('[UploadImage] Using base64Data...');
                imageBuffer = Buffer.from(base64Data, 'base64');
                console.log(`[UploadImage] Decoded: ${imageBuffer.length} bytes`);
            }
            // Method 3: Upload from quoted message
            else if (fromQuoted) {
                console.log('[UploadImage] Getting image from quoted message...');
                const quotedMsg = await message.getQuoted();

                if (!quotedMsg) {
                    return JSON.stringify({
                        success: false,
                        error: 'No quoted message found. Please reply/quote a message containing an image.'
                    });
                }

                // Check if message has image
                if (!quotedMsg.hasMedia || !quotedMsg.type.includes('image')) {
                    return JSON.stringify({
                        success: false,
                        error: 'No image found in quoted message. Please quote a message with an image.'
                    });
                }

                // Download image from WhatsApp
                console.log('[UploadImage] Downloading image from quoted WhatsApp message...');
                imageBuffer = await quotedMsg.download();
            }
            // Method 4: Upload from current message
            else {
                // Check if message has image
                if (!message.hasMedia || !message.type.includes('image')) {
                    return JSON.stringify({
                        success: false,
                        error: 'No image found in current message. Please send an image, quote an image, provide filePath, or provide base64Data.'
                    });
                }

                // Download image from WhatsApp
                console.log('[UploadImage] Downloading image from current WhatsApp message...');
                imageBuffer = await message.download();
            }

            if (!imageBuffer) {
                return JSON.stringify({
                    success: false,
                    error: 'Failed to get image data'
                });
            }

            console.log(`[UploadImage] Image ready: ${imageBuffer.length} bytes`);

            // Get user's phone number for authentication
            const userPhone = message.sender.id.split('@')[0];
            const phoneWithPlus = `+${userPhone}`;

            // Get API config
            const baseUrl = process.env.AILAB_API_URL;
            const apiKey = process.env.AILAB_API_KEY;

            if (!baseUrl || !apiKey) {
                return JSON.stringify({
                    success: false,
                    error: 'AiLab API not configured. Missing AILAB_API_URL or AILAB_API_KEY in .env'
                });
            }

            // Upload to AiLab CDN
            console.log('[UploadImage] Uploading to CDN...');

            // Verify buffer integrity before upload
            if (imageBuffer.length < 100) {
                console.error(`[UploadImage] Buffer too small: ${imageBuffer.length} bytes`);
                return JSON.stringify({
                    success: false,
                    error: `Image data too small (${imageBuffer.length} bytes). Try resending the image.`
                });
            }

            const FormData = require('form-data');
            const formData = new FormData();
            formData.append('file', imageBuffer, {
                filename: `${purpose}_${Date.now()}.jpg`,
                contentType: 'image/jpeg'
            });

            const uploadResponse = await axios.post(`${baseUrl}/api/whatsapp/upload`, formData, {
                headers: {
                    'Authorization': `Bearer ${phoneWithPlus}`,
                    'X-API-Key': apiKey,
                    ...formData.getHeaders()
                },
                maxContentLength: Infinity,
                maxBodyLength: Infinity,
                maxRedirects: 0
            });

            if (!uploadResponse.data.success) {
                return JSON.stringify({
                    success: false,
                    error: uploadResponse.data.error || 'Upload failed'
                });
            }

            const uploadedUrl = uploadResponse.data.url;
            console.log('[UploadImage] Upload successful:', uploadedUrl);

            return JSON.stringify({
                success: true,
                url: uploadedUrl,
                purpose: purpose,
                message: `Image uploaded successfully`
            });

        } catch (error) {
            console.error('[UploadImage] Upload failed:', error.message);

            // Handle specific errors
            if (error.response) {
                const status = error.response.status;
                const data = error.response.data;

                if (status === 401 || status === 404) {
                    return JSON.stringify({
                        success: false,
                        error: 'Authentication failed. WhatsApp number not connected to AiLab.'
                    });
                }

                return JSON.stringify({
                    success: false,
                    error: `Upload failed (${status}): ${data.error || error.message}`
                });
            }

            return JSON.stringify({
                success: false,
                error: `Upload failed: ${error.message}`
            });
        }
    }
};
