/**
 * Upload Image Tool
 * Upload WhatsApp image to AiLab CDN to get public URL
 * Required for faceswap (needs 2 URLs) and image-to-video modes
 */

const axios = require('axios');

module.exports = {
    // Tool definition for AI API
    definition: {
        name: 'upload_image',
        description: 'MANDATORY TOOL for faceswap and i2v workflows. This tool MUST be called to upload WhatsApp images to AiLab CDN before using connectAilab with faceswap or i2v modes. You CANNOT skip calling this tool - connectAilab requires public URLs, not WhatsApp message references. When user sends image for faceswap/i2v, you MUST: (1) CALL this tool immediately with the image, (2) Wait for the returned URL, (3) Store the URL, (4) Use the URL with connectAilab. Do NOT say "image uploaded" unless you actually called this tool and received a success response with URL. Supports three input methods: (1) current message, (2) quoted/replied message, (3) base64Data from download_cached_media tool. CRITICAL: Upload images IMMEDIATELY when received - WhatsApp message context is lost after new messages arrive.',
        input_schema: {
            type: 'object',
            properties: {
                purpose: {
                    type: 'string',
                    enum: ['faceswap_source', 'faceswap_target', 'i2v_input'],
                    description: 'Purpose of this upload: faceswap_source (the face to use), faceswap_target (the body/image to modify), i2v_input (input for image-to-video)'
                },
                fromQuoted: {
                    type: 'boolean',
                    description: 'Set to true to upload image from quoted/replied message instead of current message. Default: false (current message)'
                },
                base64Data: {
                    type: 'string',
                    description: 'Optional: Base64 encoded image data from download_cached_media tool. If provided, image will be uploaded from this data instead of WhatsApp message.'
                }
            },
            required: ['purpose']
        }
    },

    // Metadata for UI/UX
    metadata: {
        icon: '📤',
        progressMessage: (input) => `Uploading image (${input.purpose})...`,
        resultType: 'data'
    },

    /**
     * Execute image upload
     * @param {Object} input - Tool input parameters
     * @param {Object} context - Execution context with message, room, group
     * @returns {Promise<string>} Result with uploaded URL
     */
    execute: async (input, context) => {
        const { purpose, fromQuoted = false, base64Data = null } = input;
        const { message } = context;

        try {
            console.log(`[UploadImage] Starting upload for purpose: ${purpose}, fromQuoted: ${fromQuoted}, hasBase64: ${!!base64Data}`);

            let imageBuffer;

            // Method 1: Upload from base64Data (from download_cached_media tool)
            if (base64Data) {
                console.log('[UploadImage] Using base64Data from download_cached_media...');
                imageBuffer = Buffer.from(base64Data, 'base64');
                console.log(`[UploadImage] Base64 decoded: ${imageBuffer.length} bytes`);
            }
            // Method 2: Upload from quoted message
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
            // Method 3: Upload from current message
            else {
                // Check if message has image
                if (!message.hasMedia || !message.type.includes('image')) {
                    return JSON.stringify({
                        success: false,
                        error: 'No image found in current message. Please send an image, quote an image, or provide base64Data.'
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
            console.log('[UploadImage] Uploading to AiLab CDN...');

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
                maxBodyLength: Infinity
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
                message: `Image uploaded successfully for ${purpose}`
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
