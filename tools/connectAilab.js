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
        description: "CREATE/GENERATE NEW images and videos using AI. Use this tool when user wants to CREATE/GENERATE/MAKE something NEW (keywords: 'bikin', 'buat', 'generate', 'create', 'make'). Supports text-to-image (t2i), text-to-video (t2v), image-to-video (i2v), and faceswap. Do NOT use this if user wants to SEARCH for existing images - use image_search instead. User must have connected their WhatsApp number via AiLab web interface first.",

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
                    description: "Quality level (optional, default: hd). sd=standard, hd=high definition, fhd=full HD"
                },
                level: {
                    type: "string",
                    enum: ["moon"],
                    description: "Generation level (optional, default: moon). Only 'moon' is available for t2i."
                },
                channel: {
                    type: "string",
                    enum: ["B", "S"],
                    description: "Channel for video generation (optional, default: B). Only for t2v/i2v. B=better quality, S=faster"
                },
                duration: {
                    type: "number",
                    enum: [2, 5, 7, 10, 15, 20],
                    description: "Video duration in seconds (optional, default: 2). Only for t2v/i2v."
                },
                enhancePrompt: {
                    type: "boolean",
                    description: "Enhance prompt automatically (optional, default: false). Only for t2v channel B and i2v."
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
        resultType: 'text'
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
                if (aspectRatio) requestBody.aspectRatio = aspectRatio;
                if (quality) requestBody.quality = quality;
                if (level) requestBody.level = level;

                // Add video-specific parameters
                if (mode === 't2v' || mode === 'i2v') {
                    if (channel) requestBody.channel = channel;
                    if (duration) requestBody.duration = duration;
                    if (enhancePrompt !== undefined) requestBody.enhancePrompt = enhancePrompt;
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

                if (response.data.success) {
                    const job = response.data.data;
                    return `✅ *Generation Job Created*\n\n` +
                           `🆔 Job ID: ${job.jobId}\n` +
                           `📊 Status: ${job.status}\n` +
                           `💰 Cost: ${job.cost} fuel\n` +
                           `⛽ Remaining Fuel: ${job.remainingFuel}\n` +
                           `💬 ${job.message}\n\n` +
                           `Use check_status with jobId to monitor progress.`;
                } else {
                    return `❌ Failed to create job: ${response.data.error}`;
                }
            }

            // ===== ACTION: Check Status =====
            if (action === 'check_status') {
                if (!jobId) {
                    return `❌ Error: 'jobId' is required for check_status action`;
                }

                // Subscribe to SSE for real-time updates
                console.log(`[AiLab] Subscribing to SSE for job: ${jobId}`);

                return new Promise(async (resolve, reject) => {
                    let completed = false;
                    let lastProgress = null;
                    const maxWaitTime = 10 * 60 * 1000; // 10 minutes max
                    const startTime = Date.now();

                    // Try SSE first
                    try {
                        const EventSource = require('eventsource');
                        const sseUrl = `${baseUrl}/api/sse?jobId=${jobId}`;
                        const eventSource = new EventSource(sseUrl);

                        console.log(`[AiLab] SSE connected: ${sseUrl}`);

                        // Connection established
                        eventSource.addEventListener('connected', (event) => {
                            console.log('[AiLab] SSE connection established');
                        });

                        // Job queued
                        eventSource.addEventListener('status', (event) => {
                            try {
                                const data = JSON.parse(event.data);
                                console.log(`[AiLab] Status: ${data.status} - ${data.message || ''}`);
                            } catch (e) {
                                console.error('[AiLab] SSE status parse error:', e);
                            }
                        });

                        // Execution progress
                        eventSource.addEventListener('executing', (event) => {
                            try {
                                const data = JSON.parse(event.data);
                                console.log(`[AiLab] Executing: Node ${data.node} - ${data.nodeTitle}`);
                            } catch (e) {
                                console.error('[AiLab] SSE executing parse error:', e);
                            }
                        });

                        // Sampling progress
                        eventSource.addEventListener('progress', (event) => {
                            try {
                                const data = JSON.parse(event.data);
                                lastProgress = data;
                                console.log(`[AiLab] Progress: ${data.step}/${data.total} (${data.percentage}%)`);
                            } catch (e) {
                                console.error('[AiLab] SSE progress parse error:', e);
                            }
                        });

                        // Job completed
                        eventSource.addEventListener('done', (event) => {
                            try {
                                const data = JSON.parse(event.data);
                                console.log('[AiLab] Job completed!');

                                eventSource.close();
                                completed = true;

                                let result = `✅ *Generation Completed*\n\n` +
                                            `🆔 Job ID: ${jobId}\n` +
                                            `📊 Status: ${data.status}\n\n`;

                                if (data.output.images && data.output.images.length > 0) {
                                    result += `🖼️ *Images:*\n`;
                                    data.output.images.forEach((img, i) => {
                                        result += `${i + 1}. ${img}\n`;
                                    });
                                }

                                if (data.output.videos && data.output.videos.length > 0) {
                                    result += `🎥 *Videos:*\n`;
                                    data.output.videos.forEach((vid, i) => {
                                        result += `${i + 1}. ${vid}\n`;
                                    });
                                }

                                resolve(result);
                            } catch (e) {
                                console.error('[AiLab] SSE done parse error:', e);
                                eventSource.close();
                                reject(new Error('Failed to parse completion data'));
                            }
                        });

                        // Job failed
                        eventSource.addEventListener('error', (event) => {
                            try {
                                const data = JSON.parse(event.data);
                                console.log(`[AiLab] Job failed: ${data.error}`);

                                eventSource.close();
                                completed = true;

                                resolve(`❌ *Generation Failed*\n\n` +
                                       `🆔 Job ID: ${jobId}\n` +
                                       `📊 Status: ${data.status}\n` +
                                       `⚠️ Error: ${data.error}`);
                            } catch (e) {
                                // SSE connection error (not job error)
                                console.error('[AiLab] SSE connection error, falling back to polling');
                                eventSource.close();

                                // Fall back to polling
                                pollJobStatus();
                            }
                        });

                        // Timeout handler
                        const timeout = setTimeout(() => {
                            if (!completed) {
                                console.log('[AiLab] SSE timeout, closing connection');
                                eventSource.close();
                                resolve(`⏱️ *Timeout*\n\nJob ${jobId} exceeded maximum wait time (10 minutes).\n\nPlease check status again later.`);
                            }
                        }, maxWaitTime);

                    } catch (sseError) {
                        console.error('[AiLab] SSE failed, falling back to polling:', sseError.message);
                        // Fall back to polling
                        pollJobStatus();
                    }

                    // Polling fallback function
                    async function pollJobStatus() {
                        const pollInterval = 10000; // 10 seconds

                        while (!completed && Date.now() - startTime < maxWaitTime) {
                            try {
                                const response = await axios.get(`${baseUrl}/api/whatsapp/job/${jobId}`, {
                                    headers
                                });

                                if (response.data.success) {
                                    const job = response.data.data;
                                    console.log(`[AiLab] Polling status: ${job.status}`);

                                    if (job.status === 'completed') {
                                        completed = true;

                                        let result = `✅ *Generation Completed*\n\n` +
                                                    `🆔 Job ID: ${job.jobId}\n` +
                                                    `🎨 Mode: ${job.mode}\n` +
                                                    `💎 Quality: ${job.quality}\n` +
                                                    `💰 Cost: ${job.cost} fuel\n` +
                                                    `⏰ Created: ${new Date(job.createdAt).toLocaleString()}\n` +
                                                    `✅ Completed: ${new Date(job.completedAt).toLocaleString()}\n\n`;

                                        if (job.output.images && job.output.images.length > 0) {
                                            result += `🖼️ *Images:*\n`;
                                            job.output.images.forEach((img, i) => {
                                                result += `${i + 1}. ${img}\n`;
                                            });
                                        }

                                        if (job.output.videos && job.output.videos.length > 0) {
                                            result += `🎥 *Videos:*\n`;
                                            job.output.videos.forEach((vid, i) => {
                                                result += `${i + 1}. ${vid}\n`;
                                            });
                                        }

                                        resolve(result);
                                        return;
                                    } else if (job.status === 'failed') {
                                        completed = true;
                                        resolve(`❌ *Generation Failed*\n\n` +
                                               `🆔 Job ID: ${job.jobId}\n` +
                                               `📊 Status: ${job.status}\n` +
                                               `⚠️ Error: ${job.error}`);
                                        return;
                                    } else if (job.status === 'cancelled') {
                                        completed = true;
                                        resolve(`🚫 *Generation Cancelled*\n\n` +
                                               `🆔 Job ID: ${job.jobId}\n` +
                                               `📊 Status: ${job.status}`);
                                        return;
                                    }

                                    // Still processing, continue polling
                                    await new Promise(r => setTimeout(r, pollInterval));
                                } else {
                                    reject(new Error(response.data.error));
                                    return;
                                }
                            } catch (error) {
                                reject(error);
                                return;
                            }
                        }

                        // Timeout
                        if (!completed) {
                            resolve(`⏱️ *Timeout*\n\nJob ${jobId} exceeded maximum wait time (10 minutes).\n\nPlease check status again later.`);
                        }
                    }
                });
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

                        if (job.status === 'completed' && job.output.images.length > 0) {
                            result += `   ✅ Result: ${job.output.images[0]}\n`;
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
