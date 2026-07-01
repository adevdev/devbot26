// ============================================
// connectAilab Tool
// ============================================
// 🔒 CLOSED SOURCE - Proprietary Tool by DevBot26 Developer
// This tool connects to AiLab API for AI-powered generation
// © 2026 DevBot26. All rights reserved.
// ============================================

const axios = require('axios');

/**
 * AiLab API Integration Tool
 * Connects to AiLab for text-to-image, text-to-video, image-to-video, and faceswap generation
 */
module.exports = {
    // Tool definition for AI API
    definition: {
        name: "connectAilab",
        description: "CREATE/GENERATE NEW images and videos using AI. Use this tool when user wants to CREATE/GENERATE/MAKE something NEW. Supports text-to-image (t2i), text-to-video (t2v), image-to-video (i2v), and faceswap. For t2i: settings are auto-optimized (1:1, SD quality, moon level). For t2v/i2v: settings are auto-optimized (SD quality, Channel B, no prompt enhancement) - only duration can be customized (max 10 seconds). After calling 'generate', the system will automatically poll for completion in the background and call you back with the result. You don't need to manually check status. When job completes, you will receive the result and should use send_image to send it. Do NOT use this if user wants to SEARCH for existing images - use image_search instead. User must have connected their WhatsApp number via AiLab web interface first.",

        input_schema: {
            type: "object",
            properties: {
                action: {
                    type: "string",
                    enum: ["get_user_info", "generate", "check_status", "list_jobs"],
                    description: "Action to perform: get_user_info (check fuel balance), generate (create generation job), check_status (check job status), list_jobs (list recent jobs)"
                },
                mode: {
                    type: "string",
                    enum: ["t2i", "t2v", "i2v", "faceswap"],
                    description: "Generation mode (required for 'generate' action): t2i (text-to-image), t2v (text-to-video), i2v (image-to-video), faceswap (face swap)"
                },
                prompt: {
                    type: "string",
                    description: "Text prompt for generation (required for t2i/t2v/i2v, max 1000 characters)"
                },
                aspectRatio: {
                    type: "string",
                    enum: ["1:1", "16:9", "9:16", "4:3", "3:4"],
                    description: "Aspect ratio for generation (optional, default: 1:1)"
                },
                quality: {
                    type: "string",
                    enum: ["sd", "hd", "fhd"],
                    description: "Quality level (optional, default: hd). sd=standard, hd=high definition, fhd=full HD. Note: For t2v/i2v, quality is automatically set to 'sd' and cannot be changed."
                },
                level: {
                    type: "string",
                    enum: ["moon"],
                    description: "Generation level (optional, default: moon). Only 'moon' is available for t2i."
                },
                channel: {
                    type: "string",
                    enum: ["B", "S"],
                    description: "Channel for video generation. B=better quality, S=faster. Note: For t2v/i2v, channel is automatically set to 'B' and cannot be changed."
                },
                duration: {
                    type: "number",
                    enum: [2, 5, 7, 10],
                    description: "Video duration in seconds (optional, default: 2, max: 10). Only for t2v/i2v. Other video settings (quality, channel, enhancePrompt) are automatically optimized."
                },
                enhancePrompt: {
                    type: "boolean",
                    description: "Enhance prompt automatically. Note: For t2v/i2v, this is automatically set to false and cannot be changed."
                },
                uploadImage: {
                    type: "string",
                    description: "Public URL to input image (required for i2v). Must be accessible without auth."
                },
                sourceImage: {
                    type: "string",
                    description: "Public URL to source face image (required for faceswap). Must be accessible without auth."
                },
                targetImage: {
                    type: "string",
                    description: "Public URL to target body image (required for faceswap). Must be accessible without auth."
                },
                jobId: {
                    type: "string",
                    description: "Job ID to check status (required for 'check_status' action)"
                },
                limit: {
                    type: "number",
                    description: "Number of jobs to return for 'list_jobs' (optional, 1-50, default: 10)"
                },
                status: {
                    type: "string",
                    enum: ["pending", "processing", "completed", "failed"],
                    description: "Filter jobs by status for 'list_jobs' (optional)"
                }
            },
            required: ["action"]
        }
    },

    // Metadata for UI/UX
    metadata: {
        icon: '🎨',
        progressMessage: (input) => `Connecting to AiLab: _${input.action}_`,
        resultType: 'media' // Tool returns images and videos
    },

    /**
     * Execute AiLab API call
     * @param {Object} input - Tool input parameters
     * @param {Object} context - Execution context with message, room, group
     * @returns {Promise<string>} Result message
     */
    execute: async (input, context) => {
        const { action, mode, prompt, aspectRatio, quality, level, channel, duration, enhancePrompt,
                uploadImage, sourceImage, targetImage, jobId, limit, status } = input;
        const { message } = context;

        // Get user's phone number for authentication
        const userPhone = message.sender.id.split('@')[0];
        const phoneWithPlus = `+${userPhone}`;

        // Get base URL from environment (required)
        const baseUrl = process.env.AILAB_API_URL;
        if (!baseUrl) {
            return `❌ Configuration Error: AILAB_API_URL is not configured in .env file`;
        }

        // Get API key from environment (required)
        const apiKey = process.env.AILAB_API_KEY;
        if (!apiKey) {
            return `❌ Configuration Error: AILAB_API_KEY is not configured in .env file`;
        }

        // Common headers for all requests
        const headers = {
            'Authorization': `Bearer ${phoneWithPlus}`,
            'X-API-Key': apiKey
        };

        try {
            // ===== ACTION: Get User Info =====
            if (action === 'get_user_info') {
                const response = await axios.get(`${baseUrl}/api/whatsapp/user`, {
                    headers
                });

                if (response.data.success) {
                    const user = response.data.data;
                    return `✅ *AiLab User Info*\n\n` +
                           `👤 Name: ${user.name}\n` +
                           `📧 Email: ${user.email}\n` +
                           `⛽ Fuel: ${user.fuel}\n` +
                           `🔗 Referral Code: ${user.referralCode}\n` +
                           `📱 Phone: ${user.whatsappPhone}\n` +
                           `⏰ Connected: ${new Date(user.whatsappConnectedAt).toLocaleString()}`;
                } else {
                    return `❌ Failed to get user info: ${response.data.error}`;
                }
            }

            // ===== ACTION: Generate =====
            if (action === 'generate') {
                if (!mode) {
                    return `❌ Error: 'mode' is required for generate action. Choose: t2i, t2v, i2v, or faceswap`;
                }

                // Build request body based on mode
                const requestBody = { mode };

                // Add common parameters
                if (prompt) requestBody.prompt = prompt;

                // Force optimal settings for t2i mode (512x512, SD quality, moon level)
                if (mode === 't2i') {
                    requestBody.aspectRatio = '1:1'; // 512x512 for SD
                    requestBody.quality = 'sd';       // Standard Definition
                    requestBody.level = 'moon';       // Fast - Low cost
                }
                // Force optimal settings for video modes (t2v/i2v)
                else if (mode === 't2v' || mode === 'i2v') {
                    requestBody.quality = 'sd';        // Standard Definition
                    requestBody.channel = 'B';         // Channel B - safe and controlled
                    requestBody.enhancePrompt = false; // Disabled

                    // Only allow duration customization (max 10 seconds)
                    if (duration) {
                        if (duration > 10) {
                            return `❌ Error: Maximum duration is 10 seconds`;
                        }
                        requestBody.duration = duration;
                    } else {
                        requestBody.duration = 2; // Default 2 seconds
                    }
                }
                else {
                    // For other modes (faceswap), allow custom settings
                    if (aspectRatio) requestBody.aspectRatio = aspectRatio;
                    if (quality) requestBody.quality = quality;
                    if (level) requestBody.level = level;
                }

                // Add mode-specific required parameters
                if (mode === 'i2v') {
                    if (!uploadImage) {
                        return `❌ Error: 'uploadImage' is required for i2v mode`;
                    }
                    requestBody.uploadImage = uploadImage;
                }

                if (mode === 'faceswap') {
                    if (!sourceImage || !targetImage) {
                        return `❌ Error: 'sourceImage' and 'targetImage' are required for faceswap mode`;
                    }
                    requestBody.sourceImage = sourceImage;
                    requestBody.targetImage = targetImage;
                }

                // Validate prompt for t2i/t2v/i2v
                if ((mode === 't2i' || mode === 't2v' || mode === 'i2v') && !prompt) {
                    return `❌ Error: 'prompt' is required for ${mode} mode`;
                }

                const response = await axios.post(`${baseUrl}/api/whatsapp/generate`, requestBody, {
                    headers: {
                        ...headers,
                        'Content-Type': 'application/json'
                    }
                });

                if (!response.data.success) {
                    return JSON.stringify({
                        success: false,
                        error: response.data.error
                    });
                }

                const job = response.data.data;
                const jobId = job.jobId;

                console.log(`[AiLab] Job created: ${jobId}, starting background polling...`);

                // Start background polling (non-blocking)
                const progressMsg = context.progressMsg;
                const roomJid = context.room;
                const userMessage = context.message;
                const userPrompt = requestBody.prompt; // Store original prompt for smart caption

                (async () => {
                    const maxWaitTime = 10 * 60 * 1000; // 10 minutes max
                    const pollInterval = 5000; // 5 seconds
                    const startTime = Date.now();
                    let pollCount = 0;
                    let lastUpdateTime = 0;
                    const UPDATE_THROTTLE = 3000;

                    while (Date.now() - startTime < maxWaitTime) {
                        try {
                            await new Promise(r => setTimeout(r, pollInterval));
                            pollCount++;

                            const statusResponse = await axios.get(`${baseUrl}/api/whatsapp/job/${jobId}`, {
                                headers
                            });

                            if (!statusResponse.data.success) {
                                console.error('[AiLab] Failed to get status:', statusResponse.data.error);
                                continue;
                            }

                            const currentJob = statusResponse.data.data;
                            console.log(`[AiLab] Background poll #${pollCount} - Status: ${currentJob.status}`);

                            // Update progress message
                            if (progressMsg) {
                                const now = Date.now();
                                if (now - lastUpdateTime > UPDATE_THROTTLE) {
                                    try {
                                        let statusText = 'queue';
                                        if (currentJob.status === 'processing') statusText = 'generating';
                                        else if (currentJob.status === 'completed') statusText = 'complete';

                                        await progressMsg.edit(`Generating. . . . ${statusText}`);
                                        lastUpdateTime = now;
                                    } catch (e) {
                                        console.error('[AiLab] Failed to update progress:', e.message);
                                    }
                                }
                            }

                            // Check if completed or failed
                            if (currentJob.status === 'completed') {
                                console.log('[AiLab] Generation completed, sending result...');

                                // Send image directly
                                if (currentJob.output.images && currentJob.output.images.length > 0) {
                                    try {
                                        const axios = require('axios');
                                        const imageResponse = await axios.get(currentJob.output.images[0], {
                                            responseType: 'arraybuffer'
                                        });
                                        const imageBuffer = Buffer.from(imageResponse.data);

                                        // Generate thumbnail with proper Jimp usage
                                        const { Jimp } = require('jimp');
                                        const image = await Jimp.read(imageBuffer);
                                        const thumbnailWidth = Math.max(1, Math.floor(image.bitmap.width * 0.05));
                                        const thumbnailHeight = Math.max(1, Math.floor(image.bitmap.height * 0.05));
                                        const resized = await image.resize({ w: thumbnailWidth, h: thumbnailHeight });
                                        const thumbnail = await resized.getBuffer('image/jpeg');

                                        console.log(`[AiLab] Thumbnail generated: ${thumbnailWidth}x${thumbnailHeight}`);

                                        // Generate smart caption (just describe what was generated)
                                        const caption = userPrompt || 'Generated image';

                                        // Send via baileys
                                        const wachan = require('wachan');
                                        const sock = wachan.getSocket();

                                        const imageOptions = {
                                            image: imageBuffer,
                                            jpegThumbnail: thumbnail,
                                            caption: caption
                                        };

                                        const quotedOptions = userMessage ? { quoted: userMessage.toBaileys() } : {};

                                        await sock.sendMessage(roomJid, imageOptions, quotedOptions);

                                        // Update progress message
                                        if (progressMsg) {
                                            try {
                                                await progressMsg.edit(`🔧 Used tools: connectAilab`);
                                            } catch (e) {
                                                console.error('[AiLab] Failed to update final progress:', e.message);
                                            }
                                        }

                                        console.log('[AiLab] Image sent successfully');
                                    } catch (error) {
                                        console.error('[AiLab] Failed to send image:', error.message);

                                        // Fallback: send error text
                                        const wachan = require('wachan');
                                        const sock = wachan.getSocket();
                                        await sock.sendMessage(roomJid, {
                                            text: `Failed to send image: ${error.message}`
                                        });
                                    }
                                }
                                // Send video directly
                                else if (currentJob.output.videos && currentJob.output.videos.length > 0) {
                                    try {
                                        const axios = require('axios');
                                        console.log('[AiLab] Downloading video...');
                                        const videoResponse = await axios.get(currentJob.output.videos[0], {
                                            responseType: 'arraybuffer',
                                            timeout: 120000 // 2 minutes for large videos
                                        });
                                        const videoBuffer = Buffer.from(videoResponse.data);
                                        console.log(`[AiLab] Video downloaded: ${(videoBuffer.length / 1024 / 1024).toFixed(2)} MB`);

                                        // Generate caption
                                        const caption = userPrompt || 'Generated video';

                                        // Send via baileys
                                        const wachan = require('wachan');
                                        const sock = wachan.getSocket();

                                        const videoOptions = {
                                            video: videoBuffer,
                                            caption: caption
                                        };

                                        const quotedOptions = userMessage ? { quoted: userMessage.toBaileys() } : {};

                                        await sock.sendMessage(roomJid, videoOptions, quotedOptions);

                                        // Update progress message
                                        if (progressMsg) {
                                            try {
                                                await progressMsg.edit(`🔧 Used tools: connectAilab`);
                                            } catch (e) {
                                                console.error('[AiLab] Failed to update final progress:', e.message);
                                            }
                                        }

                                        console.log('[AiLab] Video sent successfully');
                                    } catch (error) {
                                        console.error('[AiLab] Failed to send video:', error.message);

                                        // Fallback: send error text
                                        const wachan = require('wachan');
                                        const sock = wachan.getSocket();
                                        await sock.sendMessage(roomJid, {
                                            text: `Failed to send video: ${error.message}`
                                        });
                                    }
                                }

                                break; // Exit loop
                            } else if (currentJob.status === 'failed') {
                                console.log('[AiLab] Generation failed');

                                // Send failure notification
                                const wachan = require('wachan');
                                const sock = wachan.getSocket();
                                await sock.sendMessage(roomJid, {
                                    text: `❌ Generation failed: ${currentJob.error || 'Unknown error'}`
                                });

                                // Update progress message
                                if (progressMsg) {
                                    try {
                                        await progressMsg.edit(`🔧 Used tools: connectAilab`);
                                    } catch (e) {
                                        console.error('[AiLab] Failed to update progress:', e.message);
                                    }
                                }

                                break; // Exit loop
                            }

                        } catch (error) {
                            console.error('[AiLab] Background polling error:', error.message);
                        }
                    }

                    // Timeout handling
                    if (Date.now() - startTime >= maxWaitTime) {
                        console.log('[AiLab] Background polling timeout');
                        const wachan = require('wachan');
                        const sock = wachan.getSocket();
                        await sock.sendMessage(roomJid, {
                            text: `⏱️ *Generation Timeout*\n\nJob ${jobId} exceeded 10 minutes.\nUse check_status to manually check.`
                        });
                    }
                })();

                // Return immediately to AI (don't wait for polling)
                // silent: true = don't generate text response, just keep progress message
                return JSON.stringify({
                    success: true,
                    jobId: job.jobId,
                    status: 'pending',
                    silent: true,
                    message: 'Generation started. Background polling will send result automatically.'
                });
            }

            // ===== ACTION: Check Status =====
            if (action === 'check_status') {
                if (!jobId) {
                    return JSON.stringify({
                        success: false,
                        error: 'jobId is required for check_status action'
                    });
                }

                console.log(`[AiLab] Checking job status: ${jobId}`);

                const response = await axios.get(`${baseUrl}/api/whatsapp/job/${jobId}`, {
                    headers
                });

                if (!response.data.success) {
                    return JSON.stringify({
                        success: false,
                        error: response.data.error
                    });
                }

                const job = response.data.data;
                console.log(`[AiLab] Job status: ${job.status}`);

                // Return current status
                const result = {
                    success: true,
                    jobId: job.jobId,
                    status: job.status
                };

                // If completed, include output
                if (job.status === 'completed') {
                    if (job.output.images && job.output.images.length > 0) {
                        result.images = job.output.images;
                    }
                    if (job.output.videos && job.output.videos.length > 0) {
                        result.videos = job.output.videos;
                    }
                    result.caption = `✅ Generation Completed!\n🆔 Job ID: ${job.jobId}`;
                }

                // If failed, include error
                if (job.status === 'failed') {
                    result.error = job.error;
                }

                return JSON.stringify(result);
            }

            // ===== ACTION: List Jobs =====
            if (action === 'list_jobs') {
                const params = {};
                if (limit) params.limit = limit;
                if (status) params.status = status;
                if (mode) params.mode = mode;

                const response = await axios.get(`${baseUrl}/api/whatsapp/jobs`, {
                    headers,
                    params
                });

                if (response.data.success) {
                    const { jobs, total } = response.data.data;

                    if (jobs.length === 0) {
                        return `📋 No jobs found.`;
                    }

                    let result = `📋 *Recent Jobs* (${jobs.length}/${total})\n\n`;

                    jobs.forEach((job, i) => {
                        result += `${i + 1}. *${job.jobId}*\n`;
                        result += `   Status: ${job.status}\n`;
                        result += `   Mode: ${job.mode} | Quality: ${job.quality}\n`;
                        result += `   Cost: ${job.cost} fuel\n`;
                        result += `   Created: ${new Date(job.createdAt).toLocaleString()}\n`;

                        if (job.status === 'completed') {
                            if (job.output.images && job.output.images.length > 0) {
                                result += `   ✅ Image: ${job.output.images[0]}\n`;
                            } else if (job.output.videos && job.output.videos.length > 0) {
                                result += `   ✅ Video: ${job.output.videos[0]}\n`;
                            }
                        }

                        result += `\n`;
                    });

                    return result;
                } else {
                    return `❌ Failed to list jobs: ${response.data.error}`;
                }
            }

            return `❌ Unknown action: ${action}`;

        } catch (error) {
            // Handle specific HTTP errors
            if (error.response) {
                const status = error.response.status;
                const data = error.response.data;

                if (status === 401) {
                    return `🔒 *Authentication Error*\n\nYour WhatsApp number (${phoneWithPlus}) is not connected to AiLab.\n\n` +
                           `Please visit https://ailab.adevdev.com and connect your WhatsApp number first.`;
                }

                if (status === 404) {
                    return `❌ *Not Found*\n\nYour WhatsApp number is not connected to any AiLab account.\n\n` +
                           `Please visit https://ailab.adevdev.com to connect.`;
                }

                if (status === 402 && data.error === 'Insufficient fuel') {
                    return `⛽ *Insufficient Fuel*\n\n` +
                           `Required: ${data.data.required} fuel\n` +
                           `Current: ${data.data.current} fuel\n` +
                           `Deficit: ${data.data.deficit} fuel\n\n` +
                           `Please top up your fuel at https://ailab.adevdev.com`;
                }

                return `❌ API Error (${status}): ${data.error || error.message}`;
            }

            // Network or other errors
            return `❌ Error: ${error.message}`;
        }
    }
};
