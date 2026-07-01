// ============================================
// connectAilab Tool
// ============================================
// 🔒 CLOSED SOURCE - Proprietary Tool by DevBot26 Developer
// This tool connects to AiLab API for AI-powered generation
// © 2026 DevBot26. All rights reserved.
// ============================================

const axios = require('axios');
const { EventSource } = require('eventsource');

/**
 * AiLab API Integration Tool
 * Connects to AiLab for text-to-image, text-to-video, image-to-video, and faceswap generation
 */
module.exports = {
    // Tool definition for AI API
    definition: {
        name: "connectAilab",
        description: "CREATE/GENERATE NEW images and videos using AI. Use this tool when user wants to CREATE/GENERATE/MAKE something NEW. Supports text-to-image (t2i), text-to-video (t2v), image-to-video (i2v), and faceswap. For t2i: settings are auto-optimized (1:1, SD quality, moon level). For t2v/i2v: settings are auto-optimized (SD quality, Channel B, no prompt enhancement) - only duration can be customized (max 10 seconds). Authentication and fuel balance are automatically verified before generation - no need to call get_user_info first. After calling 'generate', the system will automatically poll for completion in the background and call you back with the result. You don't need to manually check status. When job completes, you will receive the result and should use send_image to send it. Do NOT use this if user wants to SEARCH for existing images - use image_search instead.",

        input_schema: {
            type: "object",
            properties: {
                action: {
                    type: "string",
                    enum: ["get_user_info", "generate", "check_status", "list_jobs"],
                    description: "Action to perform: get_user_info (only use when user explicitly asks for their fuel balance or account info - NOT required before generate), generate (create generation job - automatically verifies auth), check_status (check job status), list_jobs (list recent jobs)"
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

        console.log('[AiLab] Authentication - User phone:', phoneWithPlus);

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

        console.log('[AiLab] API Config - Base URL:', baseUrl, '| API Key exists:', !!apiKey);

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

                // Pre-flight check: Verify authentication and fuel balance
                try {
                    console.log('[AiLab] Pre-flight check: Getting user info...');
                    const userInfoResponse = await axios.get(`${baseUrl}/api/whatsapp/user`, {
                        headers
                    });

                    if (userInfoResponse.data.success) {
                        const user = userInfoResponse.data.data;
                        console.log('[AiLab] Authentication verified:', {
                            name: user.name,
                            email: user.email,
                            fuel: user.fuel,
                            phone: user.whatsappPhone
                        });
                        // Note: Don't block generation based on arbitrary fuel threshold
                        // Let the API validate actual fuel requirements
                    } else {
                        console.error('[AiLab] Pre-flight check failed:', userInfoResponse.data.error);
                        return `❌ Authentication failed: ${userInfoResponse.data.error}`;
                    }
                } catch (preflightError) {
                    console.error('[AiLab] Pre-flight check exception:', preflightError.response?.data || preflightError.message);
                    if (preflightError.response?.status === 401 || preflightError.response?.status === 404) {
                        return `🔒 *Authentication Error*\n\nYour WhatsApp number (${phoneWithPlus}) is not connected to AiLab.\n\n` +
                               `Please visit https://ailab.adevdev.com and connect your WhatsApp number first.\n\n` +
                               `Debug: Status ${preflightError.response?.status}, Error: ${preflightError.response?.data?.error}`;
                    }
                    // Continue anyway if it's another type of error
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

                console.log('[AiLab] Generate API response:', JSON.stringify(response.data, null, 2));

                if (!response.data.success) {
                    console.error('[AiLab] Generate failed:', response.data.error);
                    return JSON.stringify({
                        success: false,
                        error: response.data.error || 'Generation request failed'
                    });
                }

                const job = response.data.data;
                const jobId = job.jobId;
                const runpodJobId = job.runpodJobId; // For SSE connection

                console.log(`[AiLab] Job created successfully:`, {
                    jobId,
                    runpodJobId,
                    status: job.status,
                    cost: job.cost,
                    remainingFuel: job.remainingFuel
                });

                // Validate runpodJobId exists
                if (!runpodJobId) {
                    console.error('[AiLab] ERROR: runpodJobId missing from API response!');
                    return JSON.stringify({
                        success: false,
                        error: 'API response missing runpodJobId. Cannot establish SSE connection.'
                    });
                }

                console.log(`[AiLab] Connecting to SSE...`);

                // Start SSE connection for real-time updates (non-blocking)
                const progressMsg = context.progressMsg;
                const roomJid = context.room;
                const userMessage = context.message;
                const userPrompt = requestBody.prompt; // Store original prompt for caption
                const generationMode = requestBody.mode;

                // Import wachan for sending messages
                const wachan = require('wachan');

                (async () => {
                    const sock = wachan.getSocket();

                    // Build SSE URL
                    let sseUrl = `${baseUrl}/api/stream/${runpodJobId}?mode=${generationMode}`;
                    if (generationMode === 't2i' && requestBody.level) {
                        sseUrl += `&level=${requestBody.level}`;
                    }

                    console.log(`[AiLab] Connecting to SSE: ${sseUrl}`);

                    const es = new EventSource(sseUrl);
                    let lastUpdateTime = 0;
                    const UPDATE_THROTTLE = 3000; // 3 seconds throttle for progress updates

                    // Helper to update progress message
                    const updateProgress = async (text) => {
                        if (!progressMsg) return;
                        const now = Date.now();
                        if (now - lastUpdateTime > UPDATE_THROTTLE) {
                            try {
                                await progressMsg.edit(text);
                                lastUpdateTime = now;
                            } catch (e) {
                                console.error('[AiLab] Failed to update progress:', e.message);
                            }
                        }
                    };

                    // Helper to send final result
                    const sendResult = async (images, videos) => {
                        try {
                            const axios = require('axios');

                            // Send image
                            if (images && images.length > 0) {
                                console.log('[AiLab] Downloading image...');
                                const imageResponse = await axios.get(images[0], {
                                    responseType: 'arraybuffer'
                                });
                                const imageBuffer = Buffer.from(imageResponse.data);

                                // Generate thumbnail
                                const { Jimp } = require('jimp');
                                const image = await Jimp.read(imageBuffer);
                                const thumbnailWidth = Math.max(1, Math.floor(image.bitmap.width * 0.05));
                                const thumbnailHeight = Math.max(1, Math.floor(image.bitmap.height * 0.05));
                                const resized = await image.resize({ w: thumbnailWidth, h: thumbnailHeight });
                                const thumbnail = await resized.getBuffer('image/jpeg');

                                console.log(`[AiLab] Thumbnail generated: ${thumbnailWidth}x${thumbnailHeight}`);

                                const caption = userPrompt || 'Generated image';
                                const imageOptions = {
                                    image: imageBuffer,
                                    jpegThumbnail: thumbnail,
                                    caption: caption
                                };

                                const quotedOptions = userMessage ? { quoted: userMessage.toBaileys() } : {};
                                await sock.sendMessage(roomJid, imageOptions, quotedOptions);

                                console.log('[AiLab] Image sent successfully');
                            }
                            // Send video
                            else if (videos && videos.length > 0) {
                                console.log('[AiLab] Downloading video...');
                                const videoResponse = await axios.get(videos[0], {
                                    responseType: 'arraybuffer',
                                    timeout: 120000 // 2 minutes
                                });
                                const videoBuffer = Buffer.from(videoResponse.data);
                                console.log(`[AiLab] Video downloaded: ${(videoBuffer.length / 1024 / 1024).toFixed(2)} MB`);

                                const caption = userPrompt || 'Generated video';
                                const videoOptions = {
                                    video: videoBuffer,
                                    caption: caption
                                };

                                const quotedOptions = userMessage ? { quoted: userMessage.toBaileys() } : {};
                                await sock.sendMessage(roomJid, videoOptions, quotedOptions);

                                console.log('[AiLab] Video sent successfully');
                            }

                            // Update progress message to final state
                            if (progressMsg) {
                                try {
                                    await progressMsg.edit(`🔧 Used tools: connectAilab`);
                                } catch (e) {
                                    console.error('[AiLab] Failed to update final progress:', e.message);
                                }
                            }

                        } catch (error) {
                            console.error('[AiLab] Failed to send result:', error.message);
                            await sock.sendMessage(roomJid, {
                                text: `Failed to send result: ${error.message}`
                            });
                        }
                    };

                    // SSE event handler
                    es.onmessage = async (event) => {
                        try {
                            const data = JSON.parse(event.data);
                            console.log('[AiLab] SSE event:', data.type, data);

                            switch (data.type) {
                                case 'queued':
                                    await updateProgress('Generating. . . . queued');
                                    break;

                                case 'start':
                                    await updateProgress('Generating. . . . starting');
                                    break;

                                case 'executing':
                                    // Map node IDs to friendly messages
                                    const nodeMessages = {
                                        '1': 'loading model',
                                        '2': 'encoding prompt',
                                        '3': 'preparing',
                                        '4': 'preparing',
                                        '5': 'generating',
                                        '6': 'decoding',
                                        '7': 'saving'
                                    };
                                    const nodeMsg = nodeMessages[data.node] || 'processing';
                                    await updateProgress(`Generating. . . . ${nodeMsg}`);
                                    break;

                                case 'progress':
                                    const percent = Math.round((data.step / data.total) * 100);
                                    await updateProgress(`Generating. . . . ${percent}%`);
                                    break;

                                case 'done':
                                    console.log('[AiLab] Generation completed via SSE');
                                    es.close();
                                    await sendResult(data.images, data.videos);
                                    break;

                                case 'error':
                                    console.error('[AiLab] Generation failed:', data.message);
                                    es.close();
                                    await sock.sendMessage(roomJid, {
                                        text: `❌ Generation failed: ${data.message || 'Unknown error'}`
                                    });
                                    if (progressMsg) {
                                        try {
                                            await progressMsg.edit(`🔧 Used tools: connectAilab`);
                                        } catch (e) {
                                            console.error('[AiLab] Failed to update progress:', e.message);
                                        }
                                    }
                                    break;
                            }
                        } catch (error) {
                            console.error('[AiLab] SSE message parse error:', error.message);
                        }
                    };

                    // SSE error handler - fallback to polling
                    es.onerror = async (error) => {
                        console.error('[AiLab] SSE connection error:', error.message || 'Connection failed');
                        es.close();

                        console.log('[AiLab] Falling back to polling...');

                        // Fallback: poll job status
                        const maxWaitTime = 10 * 60 * 1000; // 10 minutes
                        const pollInterval = 10000; // 10 seconds
                        const startTime = Date.now();

                        while (Date.now() - startTime < maxWaitTime) {
                            try {
                                await new Promise(r => setTimeout(r, pollInterval));

                                const statusResponse = await axios.get(`${baseUrl}/api/whatsapp/job/${jobId}`, {
                                    headers
                                });

                                if (!statusResponse.data.success) {
                                    console.error('[AiLab] Failed to get status:', statusResponse.data.error);
                                    continue;
                                }

                                const currentJob = statusResponse.data.data;
                                console.log('[AiLab] Polling status:', currentJob.status);

                                if (currentJob.status === 'completed') {
                                    await sendResult(currentJob.output.images, currentJob.output.videos);
                                    break;
                                } else if (currentJob.status === 'failed') {
                                    await sock.sendMessage(roomJid, {
                                        text: `❌ Generation failed: ${currentJob.error || 'Unknown error'}`
                                    });
                                    if (progressMsg) {
                                        try {
                                            await progressMsg.edit(`🔧 Used tools: connectAilab`);
                                        } catch (e) {
                                            console.error('[AiLab] Failed to update progress:', e.message);
                                        }
                                    }
                                    break;
                                }
                            } catch (error) {
                                console.error('[AiLab] Polling error:', error.message);
                            }
                        }

                        // Timeout handling
                        if (Date.now() - startTime >= maxWaitTime) {
                            console.log('[AiLab] Polling timeout');
                            await sock.sendMessage(roomJid, {
                                text: `⏱️ *Generation Timeout*\n\nJob ${jobId} exceeded 10 minutes.\nUse check_status to manually check.`
                            });
                        }
                    };
                })();

                // Return immediately to AI (don't wait for SSE)
                // silent: true = don't generate text response, just keep progress message
                return JSON.stringify({
                    success: true,
                    jobId: job.jobId,
                    status: 'pending',
                    silent: true,
                    message: 'Generation started. SSE connection established for real-time updates.'
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

                console.error('[AiLab] API Error:', {
                    status,
                    statusText: error.response.statusText,
                    data,
                    headers: {
                        authorization: headers.Authorization,
                        apiKey: apiKey ? '***EXISTS***' : 'MISSING'
                    }
                });

                if (status === 401) {
                    return `🔒 *Authentication Error*\n\nYour WhatsApp number (${phoneWithPlus}) is not connected to AiLab.\n\n` +
                           `Please visit https://ailab.adevdev.com and connect your WhatsApp number first.\n\n` +
                           `Debug: ${data.error || 'No error message'}`;
                }

                if (status === 404) {
                    return `❌ *Not Found*\n\nYour WhatsApp number is not connected to any AiLab account.\n\n` +
                           `Please visit https://ailab.adevdev.com to connect.\n\n` +
                           `Debug: ${data.error || 'No error message'}`;
                }

                if (status === 402 && data.error === 'Insufficient fuel') {
                    return `⛽ *Insufficient Fuel*\n\n` +
                           `You don't have enough fuel for this generation.\n\n` +
                           `Required: *${data.data.required}* fuel\n` +
                           `Current: *${data.data.current}* fuel\n` +
                           `Deficit: *${data.data.deficit}* fuel\n\n` +
                           `💳 Top up your fuel at:\nhttps://ailab.adevdev.com`;
                }

                return `❌ API Error (${status}): ${data.error || error.message}`;
            }

            // Network or other errors
            console.error('[AiLab] Network/Other Error:', error.message);
            return `❌ Error: ${error.message}`;
        }
    }
};
