const whitelistManager = require('../whitelistManager');
const settingsManager = require('../settingsManager');
const { startContinuousTyping } = require('../utils/typing');
const https = require('https');
const { Jimp } = require('jimp');
const memoryManager = require('../memoryManager');
const tools = require('../tools');


// ============================================
// AI API Configuration
// ============================================

// All AI configuration (models, providers, paths) is now managed via Dashboard → AI Settings
// This makes the system fully modular and configurable without code changes

// Configuration is stored in file/MongoDB based on AI_SETTINGS_STORAGE env var
// API Endpoint fallback default: 'ai2.adevdev.com'
// ============================================


// Generate 5% thumbnail to prevent baileys auto-generation (sharp crash on Render)
async function generateThumbnail(imageBuffer) {
    try {
        console.log('[Thumbnail] Generating 5% thumbnail with jimp...');
        const image = await Jimp.read(imageBuffer);
        const width = Math.max(1, Math.floor(image.bitmap.width * 0.05));
        const height = Math.max(1, Math.floor(image.bitmap.height * 0.05));
        console.log(`[Thumbnail] Original: ${image.bitmap.width}x${image.bitmap.height}, Thumbnail: ${width}x${height}`);
        const resized = await image.resize({ w: width, h: height });
        const thumb = await resized.getBuffer('image/jpeg');
        console.log(`[Thumbnail] Generated ${thumb.length} bytes`);
        return thumb;
    } catch (error) {
        console.error('[Thumbnail] Generation failed:', error.message);
        return null;
    }
}

module.exports = {
    response: async (context, next) => {
        const { message, command, group } = context;
        const bot = require('wachan');

        // Check if models are configured
        const supportedModels = await settingsManager.getSupportedModels();
        if (!supportedModels || supportedModels.length === 0) {
            console.log('[AI] No models configured');
            return '*Error:* No AI models configured. Please add models in dashboard: Settings → AI Settings → Models.';
        }

        const enabledModels = supportedModels.filter(m => m.enabled);
        if (enabledModels.length === 0) {
            console.log('[AI] No models enabled');
            return '*Error:* No AI models enabled. Please enable at least one model in dashboard: Settings → AI Settings → Models.';
        }

        // Log to console (auto-piped to dashboard)
        const userText = command.parameters.join(' ') || '(no text)';
        const hasImage = message.isMedia && message.type === 'image';
        // Get user push name for logging
        const wachan = require('wachan');
        let pushName = message.sender.name || 'Unknown';
        try {
            const userData = await wachan.getUserData(message.sender.id);
            if (userData && userData.pushName) {
                pushName = userData.pushName;
            }
        } catch (e) {
            // Use fallback name
        }

        // Log AI command to console (detailed) and dashboard (censored for non-auth users)
        console.log(`[AI] Command from ${message.sender.id}: ${hasImage ? '[IMAGE] ' : ''}${userText}`);
        console.log(`[${pushName}] [AI]: ${userText.substring(0, 100)}${userText.length > 100 ? '...' : ''}`); // Dashboard will censor if not authenticated

        // Check whitelist (skip if already checked by fallback handler)
        // ponytail: check both id and lid since @mentions use lid
        if (!command.skipWhitelistCheck) {
            const isWhitelistedById = await whitelistManager.isWhitelisted(message.sender.id);
            const isWhitelistedByLid = message.sender.lid ? await whitelistManager.isWhitelisted(message.sender.lid) : false;

            if (!isWhitelistedById && !isWhitelistedByLid) {
                // Check whitelist mode
                const whitelistMode = await settingsManager.getWhitelistMode();

                if (whitelistMode === 'strict') {
                    // Strict mode: deny access
                    console.log(`[AI] Access denied for ${message.sender.id} (strict mode)`);
                    return '*Access denied.* AI command is only available for whitelisted users.';
                } else if (whitelistMode === 'auto') {
                    // Auto mode: add user with defaults
                    console.log(`[AI] Auto-adding ${message.sender.id} to whitelist (auto mode)`);
                    const defaultModel = await settingsManager.getDefaultModel();

                    if (!defaultModel) {
                        console.log('[AI] Cannot auto-add: no default model set');
                        return '*Error:* Auto-add failed. No default model configured. Please set default model in dashboard: Settings → AI Settings → Defaults.';
                    }

                    const defaultQuota = await settingsManager.getDefaultQuota();
                    const defaultResetPeriod = await settingsManager.getDefaultResetPeriod();

                    // Get accurate user data from WhatsApp
                    let pushName = message.sender.name || null;
                    let jidToStore = message.sender.id;

                    try {
                        const wachan = require('wachan');
                        const userData = await wachan.getUserData(message.sender.id);
                        if (userData) {
                            // Use WhatsApp's pushName (more reliable)
                            if (userData.pushName) {
                                pushName = userData.pushName;
                            }
                            // Prefer JID over LID if both available
                            if (userData.id) {
                                jidToStore = userData.id;
                            }
                            console.log(`[AI] Got user data: ${userData.pushName} (JID: ${userData.id}, LID: ${userData.lid || 'none'})`);
                        }
                    } catch (userDataError) {
                        console.warn(`[AI] Could not get user data, using message sender info:`, userDataError.message);
                    }

                    await whitelistManager.addNumber(
                        jidToStore,
                        defaultModel,
                        pushName,
                        defaultQuota,
                        defaultResetPeriod
                    );
                    console.log(`[AI] Auto-added ${jidToStore}: ${defaultModel}, ${defaultQuota}/${defaultResetPeriod}${pushName ? ` (${pushName})` : ''}`);

                    // Important: Mark as no longer needing whitelist check since we just added them
                    // This allows the quota check to proceed with the newly added user
                }
            }
        }

        // Check quota (try both lid and jid, like whitelist check)
        let quotaCheck = null;
        let workingIdentifier = null; // Track which identifier worked for later increment

        // Try lid first if available
        if (message.sender.lid) {
            quotaCheck = await whitelistManager.checkQuota(message.sender.lid);
            if (quotaCheck.allowed) {
                workingIdentifier = message.sender.lid;
            }
        }

        // If lid failed or not found, try jid
        if (!quotaCheck || !quotaCheck.allowed) {
            const jidCheck = await whitelistManager.checkQuota(message.sender.id);
            // Use jid result if lid was not whitelisted or jid has better result
            if (!quotaCheck || quotaCheck.reason === 'Not whitelisted') {
                quotaCheck = jidCheck;
                if (jidCheck.allowed) {
                    workingIdentifier = message.sender.id;
                }
            }
        }

        if (!quotaCheck.allowed) {
            // Handle data corruption error
            if (quotaCheck.reason === 'Data corrupted') {
                console.error(`[AI] Data corrupted for user`);
                return `*Error: Data Corrupted*\n\n` +
                       `${quotaCheck.error}\n\n` +
                       `Please contact the bot administrator.`;
            }

            // Handle quota exceeded
            console.log(`[AI] Quota exceeded: ${quotaCheck.usageCount}/${quotaCheck.quota}`);
            const resetPeriodLabel = quotaCheck.resetPeriod === 'per5Hours' ? '5 hours' :
                                     quotaCheck.resetPeriod === 'perDay' ? 'day' : 'month';
            return `*Quota Exceeded*\n\n` +
                   `You've used ${quotaCheck.usageCount}/${quotaCheck.quota} requests.\n` +
                   `Quota resets every ${resetPeriodLabel}.\n\n` +
                   `Please wait for the next reset period.`;
        }

        console.log(`[AI] Quota check passed: ${quotaCheck.remaining}/${quotaCheck.quota} remaining`);

        // Get user's assigned model (try lid first since @mentions use lid, fallback to id)
        let userModel = message.sender.lid ? await whitelistManager.getModel(message.sender.lid) : null;
        if (!userModel) {
            userModel = await whitelistManager.getModel(message.sender.id);
        }

        // Ensure user has a valid model assigned
        if (!userModel) {
            return '*Error:* No AI model assigned. Please configure your model in dashboard or contact admin.';
        }

        console.log(`[AI] User model: ${userModel}`);

        // Build prompt from quoted message + user's message
        const quotedMsg = await message.getQuoted();
        let prompt = '';
        let imageBuffer = null;
        let imageType = null;

        // Check for image in quoted message
        if (quotedMsg && quotedMsg.isMedia && quotedMsg.type === 'image') {
            imageBuffer = await quotedMsg.downloadMedia();
            imageType = quotedMsg.mimetype || 'image/jpeg';
        }
        // Fallback to message itself (check even if quotedMsg exists but not image)
        if (!imageBuffer && message.isMedia && message.type === 'image') {
            imageBuffer = await message.downloadMedia();
            imageType = message.mimetype || 'image/jpeg';
        }

        // Auto-switch to vision-capable model if user's model doesn't support it
        if (imageBuffer) {
            // Check if user's model supports vision dynamically
            const supportedModels = await settingsManager.getSupportedModels();
            const userModelInfo = supportedModels.find(m => m.id === userModel);

            if (!userModelInfo || !userModelInfo.supportsVision) {
                const visionModel = await settingsManager.getDefaultVisionModel();

                if (!visionModel) {
                    return '*Error:* Image detected but no vision-capable models are configured. Please add a vision-capable model in dashboard Settings → AI Settings → Models.';
                }

                console.log(`[AI] Image detected, auto-switching from ${userModel} to ${visionModel} for vision`);
                userModel = visionModel;
            }
        }

        if (quotedMsg && quotedMsg.text) {
            // If replying to a message, include quoted text first
            const userText = command.parameters.join(' ') || '';

            if (userText) {
                // Format: [quoted message]\n[user's reply]
                prompt = `${quotedMsg.text}\n\n${userText}`;
            } else {
                // Just the quoted message
                prompt = quotedMsg.text;
            }
        } else {
            // No quoted message, just use parameters
            prompt = command.parameters.join(' ') || '';
        }

        // If image but no prompt, use default
        if (imageBuffer && !prompt) {
            prompt = 'What is in this image?';
        }

        if (!prompt && !imageBuffer) {
            return '*Usage:*\n' +
                   '`.ai <your question>`\n' +
                   'or reply to a message with `.ai`\n' +
                   'or reply to a message with `.ai <your comment>`\n' +
                   'or send/reply to an image with `.ai`';
        }

        // Get API configuration from settings (with env fallback)
        const API_KEY = await settingsManager.getApiKey();
        const API_ENDPOINT = await settingsManager.getApiEndpoint();

        if (!API_KEY) {
            return '*Error:* AI API Key not configured. Please set AI_API_KEY in .env or configure via Dashboard → AI Settings.';
        }

        // Start typing indicator
        const stopTyping = startContinuousTyping(bot, message.room);

        try {
            // Call AI API with tool support
            console.log(`[AI] Starting API call (model: ${userModel}, endpoint: ${API_ENDPOINT})`);
            const response = await callAIAPIWithTools(prompt, userModel, API_KEY, API_ENDPOINT, message.room, imageBuffer, imageType, message, group, workingIdentifier);

            stopTyping();

            // Increment usage count after successful response
            await whitelistManager.incrementUsage(workingIdentifier);
            const updatedQuota = await whitelistManager.checkQuota(workingIdentifier);
            console.log(`[AI] Usage incremented: ${updatedQuota.usageCount}/${updatedQuota.quota} used`);

            // null means already sent via baileys (tools were used)
            if (response === null) {
                console.log('[AI] Response already sent via baileys');
                return null;
            }

            // Empty string/undefined is actual error
            if (!response) {
                console.log('[AI] Empty response from API');
                return '*AI Error:* Empty response received';
            }

            console.log(`[AI] Response sent (${response.length} chars)`);
            return response;

        } catch (error) {
            stopTyping();
            console.error('[AI] Error:', error.message);
            return `*AI Error:*\n${error.message}`;
        }
    },
    options: {
        aliases: ['ask', 'chat'],
        description: 'Ask AI assistan',
        sectionName: 'AI',
        fallback: true // Mark this as fallback command
    }
};

// Call AI API with tool support (multi-turn)
async function callAIAPIWithTools(prompt, model, apiKey, apiEndpoint, roomJid, imageBuffer = null, imageType = null, userMessage = null, group = null, workingIdentifier = null) {
    // Load recent conversation memory for context
    let memoryContext = null;
    try {
        memoryContext = await memoryManager.getRecentContext(roomJid, 10);
    } catch (error) {
        console.error('[Memory] Failed to load context:', error.message);
        // Continue without memory context
    }

    // Get current date/time for context
    const now = new Date();
    const currentDate = now.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
    const currentTime = now.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        timeZoneName: 'short'
    });

    // Get user pushname for context
    let userName = 'User';
    if (userMessage && userMessage.sender) {
        try {
            const wachan = require('wachan');
            const userData = await wachan.getUserData(userMessage.sender.id);
            if (userData && userData.pushName) {
                userName = userData.pushName;
            } else if (userMessage.sender.name) {
                userName = userMessage.sender.name;
            }
        } catch (e) {
            // Fallback to sender name
            if (userMessage.sender.name) {
                userName = userMessage.sender.name;
            }
        }
    }

    // System prompt for WhatsApp formatting
    const aiIdentity = await settingsManager.getAiIdentity();
    let systemPrompt = `${aiIdentity}

IMPORTANT CONTEXT:
Current user: ${userName}
Current date: ${currentDate}
Current time: ${currentTime}`;

    // Inject memory context if available
    if (memoryContext) {
        systemPrompt += `\n\n${memoryContext}\n\n---\n\n**IMPORTANT:** Review the conversation history above FIRST before using any tools. If the user's question can be answered from recent context or follows up on a previous topic, use that information instead of searching the web again. Only use web_search for NEW queries about current events or information not in the conversation history.`;
    }

    systemPrompt += `

CRITICAL INSTRUCTIONS:

1. **ALWAYS respond in the SAME LANGUAGE as the user's current message.**
   - If user writes in Indonesian, respond in Indonesian
   - If user writes in English, respond in English
   - Ignore language from memory/previous messages - only match the LATEST user input language
   - Example: User says "apa itu bitcoin?" → respond in Indonesian, NOT English

2. Your training data has a knowledge cutoff date. The current date (${currentDate}) may be AFTER your training cutoff.
- For ANY query about current events, prices, holidays, schedules, news, weather, or time-sensitive information, you MUST use the web_search tool.
- For queries about "today", "this month", "this year", or specific future dates, ALWAYS use web_search first.
- Use the get_time tool if you need detailed timestamp information (unix time, ISO format, timezone, etc).
- When user asks for images/pictures/photos, ONLY use image_search tool. DO NOT use web_search for image requests.
- The image_search tool returns Pinterest image URLs - use it for any visual content request.
- Do NOT rely on your training data for time-sensitive information - always search the web first.

WhatsApp Formatting Rules (CRITICAL):

**What NOT to use (will break on WhatsApp):**
❌ NEVER use double asterisks **text** for bold - WhatsApp only supports single *text*
❌ NEVER use markdown tables (| column | column |) - they render as plain text
❌ NEVER use headers with ## or ### - not supported
❌ NEVER use horizontal rules (---) - use emojis or line breaks instead
❌ NEVER use code blocks with triple backticks (\`\`\`) - use single backtick for inline code only
❌ NEVER create structured documentation-style responses with multiple sections

**What TO use:**
✅ Bold: *text* - SINGLE asterisk only, no spaces after opening or before closing
   Example: *Bitcoin Price* or *Price:* $50k
   WRONG: **Bitcoin Price** or ** Price: ** $50k
✅ Italic: _text_ - single underscores with NO spaces
   Example: _Source: CoinDesk_
   WRONG: __Source: CoinDesk__
✅ Monospace: \`text\` - single backticks for short code/commands only
   Example: \`/capture <url>\`
✅ Bullet points with • or - for lists
✅ Numbered lists: 1. 2. 3.
✅ Emojis for visual breaks: 💰 📊 📈 ⚡ 🔍 ✅ ❌
✅ Short paragraphs with empty lines between them
✅ Conversational, mobile-friendly tone

**Formatting examples:**

WRONG (double asterisks):
• **Spot Rate:** Rp17.813 per USD
• **Perubahan:** -9 poin

RIGHT (single asterisks):
• *Spot Rate:* Rp17.813 per USD
• *Perubahan:* -9 poin

WRONG (nested formatting in bullets):
• *BCA:* Beli **Rp17.615** – Jual **Rp17.890**

RIGHT (clean simple format):
• *BCA:* Beli Rp17.615 – Jual Rp17.890

**Comparison data formatting:**
WRONG (markdown table):
| Name | Value |
|------|-------|
| Bitcoin | $60k |

RIGHT (simple list):
*Bitcoin:* $60k
*Ethereum:* $3.2k
*Solana:* $120

Or with bullets:
• Bitcoin: $60k
• Ethereum: $3.2k
• Solana: $120

**Multiple items with details:**
WRONG (structured with headers):
## Project A
Description here
## Project B
Description here

RIGHT (conversational):
*Project A*
Description here

*Project B*
Description here

Or:
1. *Project A* - Description here
2. *Project B* - Description here

Example GOOD response:
*Bitcoin Price Today* 💰

Current price: $63,850 USD

📈 *24h Change:* +1.35%
💵 *Market Cap:* $1.28 trillion

_Last updated: ${currentTime}_

Example BAD response (avoid):
## Bitcoin Analysis
| Metric | Value |
|--------|-------|
| Price | $63,850 |

Instead write conversationally for mobile.`;

    // Build first user message with optional image
    let firstMessageContent;
    if (imageBuffer) {
        // Convert image to base64
        const base64Image = imageBuffer.toString('base64');
        firstMessageContent = [
            {
                type: 'image',
                source: {
                    type: 'base64',
                    media_type: imageType,
                    data: base64Image
                }
            },
            {
                type: 'text',
                text: prompt
            }
        ];
    } else {
        firstMessageContent = prompt;
    }

    const messages = [
        {
            role: 'user',
            content: firstMessageContent
        }
    ];

    // Define tools (static + temporary merged)
    let toolDefinitions = tools.getAllDefinitions();

    // Filter tools based on user's enabled tools
    const userEnabledTools = await whitelistManager.getEnabledTools(workingIdentifier || message.sender.id);
    if (userEnabledTools && userEnabledTools.length > 0) {
        // User has specific tools enabled - filter to only those
        toolDefinitions = toolDefinitions.filter(tool => userEnabledTools.includes(tool.name));
        console.log(`[AI] User ${workingIdentifier || message.sender.id} has ${userEnabledTools.length} enabled tools: ${userEnabledTools.join(', ')}`);
    } else {
        // Empty array = no tools enabled
        toolDefinitions = [];
        console.log(`[AI] User ${workingIdentifier || message.sender.id} has no tools enabled`);
    }

    // Tool calling loop (max iterations to prevent infinite loops)
    let response;
    try {
        response = await callAIAPI(messages, toolDefinitions, systemPrompt, model, apiKey, apiEndpoint);
        console.log(`[AI] Initial API response: stop_reason=${response.stop_reason}, content_blocks=${response.content?.length || 0}`);
    } catch (error) {
        console.error('[AI] API call failed:', error.message);
        throw error;
    }

    let iterations = 0;
    const MAX_ITERATIONS = 10;
    let progressMsg = null;

    while (response.stop_reason === 'tool_use' && iterations < MAX_ITERATIONS) {
        iterations++;

        // Find ALL tool_use blocks in content
        const toolUses = response.content.filter(block => block.type === 'tool_use');

        if (toolUses.length === 0) break;

        // Validate tools FIRST before sending progress
        const allowedToolNames = toolDefinitions.map(t => t.name);
        const allowedToolUses = [];
        const blockedToolUses = [];

        for (const toolUse of toolUses) {
            if (allowedToolNames.includes(toolUse.name)) {
                allowedToolUses.push(toolUse);
            } else {
                blockedToolUses.push(toolUse);
                console.log(`[AI] Tool execution blocked: ${toolUse.name} not in user's enabled tools`);
            }
        }

        // Send progress message only for first ALLOWED tool
        if (allowedToolUses.length > 0) {
            const firstTool = allowedToolUses[0];
            let progressText = '';
            if (firstTool.name === 'web_search') {
                progressText = `🔍 Using web search: _${firstTool.input.query}_`;
            } else if (firstTool.name === 'fetch_url') {
                progressText = `📄 Fetching URL: _${firstTool.input.url}_`;
            } else if (firstTool.name === 'get_time') {
                progressText = `🕐 Getting current time...`;
            } else if (firstTool.name === 'image_search') {
                progressText = `🖼️ Searching images: _${firstTool.input.query}_`;
            }

            if (progressText) {
                const bot = require('wachan');

                if (!progressMsg) {
                    // First progress - send new message (quote user message)
                    const options = { text: progressText };
                    if (userMessage) {
                        // Pass wachan Message object directly, wachan will call .toBaileys() internally
                        options.quoted = userMessage;
                    }
                    progressMsg = await bot.sendMessage(roomJid, options);
                } else {
                    // Subsequent progress - edit the existing message
                    await progressMsg.edit(progressText);
                }
            }
        }

        // Execute all tools
        const toolResults = [];
        let imageSearchResult = null; // Track if image_search was used

        // First, handle blocked tools - send error results
        for (const toolUse of blockedToolUses) {
            let errorMessage;
            if (allowedToolNames.length === 0) {
                errorMessage = `Tool '${toolUse.name}' is not available. You do not have access to any tools. Please answer the user's question directly without using any tools.`;
            } else {
                errorMessage = `Tool '${toolUse.name}' is not available. You only have access to: ${allowedToolNames.join(', ')}. Please use only these tools or answer directly without tools.`;
            }

            toolResults.push({
                type: 'tool_result',
                tool_use_id: toolUse.id,
                content: errorMessage,
                is_error: true
            });
        }

        // Then execute allowed tools
        for (const toolUse of allowedToolUses) {
            let toolResult;
            if (toolUse.name === 'image_search') {
                console.log('[AI] Searching images:', toolUse.input.query);
                try {
                    // Call image search tool
                    toolResult = await tools.executeTool(toolUse.name, toolUse.input);
                    const apiData = JSON.parse(toolResult);

                    if (apiData.success && apiData.images && apiData.images.length > 0) {
                        // Download first image
                        console.log('[AI] Downloading image:', apiData.images[0]);
                        const axios = require('axios');
                        const imageResponse = await axios.get(apiData.images[0], { responseType: 'arraybuffer' });
                        const imageBuffer = Buffer.from(imageResponse.data);

                        // Generate 5% thumbnail to prevent baileys sharp crash
                        const thumbnail = await generateThumbnail(imageBuffer);

                        // Send directly via baileys to include jpegThumbnail (wachan doesn't support it)
                        const bot = require('wachan');
                        const sock = bot.getSocket();

                        // Send with quoted progress message
                        const imageOptions = {
                            image: imageBuffer,
                            jpegThumbnail: thumbnail
                        };
                        if (progressMsg) {
                            imageOptions.quoted = progressMsg.toBaileys();
                        }

                        await sock.sendMessage(roomJid, imageOptions);

                        // Return null to prevent wachan from sending again
                        imageSearchResult = { handled: true };

                        // Don't continue with other tools
                        break;
                    } else {
                        toolResult = JSON.stringify({
                            error: apiData.error || 'No images found',
                            query: toolUse.input.query
                        });
                    }
                } catch (error) {
                    console.error('[AI] Image search failed:', error.message);
                    toolResult = JSON.stringify({
                        error: error.message,
                        query: toolUse.input.query
                    });
                }
            } else {
                // Execute tool using centralized function
                try {
                    console.log(`[AI] Executing tool: ${toolUse.name}`);
                    toolResult = await tools.executeTool(toolUse.name, toolUse.input);
                } catch (error) {
                    console.error(`[AI] Tool execution failed (${toolUse.name}):`, error.message);
                    toolResult = JSON.stringify({
                        error: error.message,
                        tool: toolUse.name
                    });
                }
            }

            if (toolResult) {
                toolResults.push({
                    type: 'tool_result',
                    tool_use_id: toolUse.id,
                    content: toolResult
                });
            }
        }

        // If image was found and sent, return null (already sent via baileys)
        if (imageSearchResult) {
            return null;
        }

        if (toolResults.length === 0) break;

        // Add assistant message with tool use
        messages.push({
            role: 'assistant',
            content: response.content
        });

        // Add ALL tool results
        messages.push({
            role: 'user',
            content: toolResults
        });

        // Next API call with tool results
        response = await callAIAPI(messages, toolDefinitions, systemPrompt, model, apiKey, apiEndpoint);
    }

    // If we hit max iterations while AI still wants to use tools, force final response
    if (iterations >= MAX_ITERATIONS && response.stop_reason === 'tool_use') {
        console.log('[AI] Max iterations reached, forcing final response');

        // Add assistant message with last tool use
        messages.push({
            role: 'assistant',
            content: response.content
        });

        // Add a user message asking for final answer based on gathered info
        messages.push({
            role: 'user',
            content: [{
                type: 'text',
                text: 'You have reached the maximum number of tool uses. Please provide your final answer based on the information you have gathered so far.'
            }]
        });

        // Get final response without tools
        response = await callAIAPI(messages, [], systemPrompt, model, apiKey, apiEndpoint);
    }

    // Extract final text response
    const textContent = response.content.find(block => block.type === 'text');
    let finalText = textContent ? textContent.text.trim() : '';

    // If no text block but there's thinking block, model didn't finish properly
    if (!finalText && response.content.some(block => block.type === 'thinking')) {
        console.log('[AI] Model generated thinking but no text response, retrying...');

        // Add assistant's thinking to messages
        messages.push({
            role: 'assistant',
            content: response.content
        });

        // Explicitly ask for the actual response
        messages.push({
            role: 'user',
            content: [{
                type: 'text',
                text: 'Please provide your actual response to my question.'
            }]
        });

        // Retry without tools to force text response
        const retryResponse = await callAIAPI(messages, [], systemPrompt, model, apiKey, apiEndpoint);
        const retryTextContent = retryResponse.content.find(block => block.type === 'text');
        finalText = retryTextContent ? retryTextContent.text.trim() : 'No response generated.';
    } else if (!finalText) {
        finalText = 'No response generated.';
    }

    // Remove qwen-specific artifacts (internal tokens that leak into response)
    finalText = finalText.replace(/^<RSPC>\s*/i, ''); // Remove <RSPC> prefix
    finalText = finalText.replace(/^<\/RSPC>\s*/i, ''); // Remove </RSPC> if present
    finalText = finalText.replace(/\*\*/g, ''); // Remove double asterisks (markdown bold)

    // Remove tool tags that might leak through (especially when tool is blocked)
    finalText = finalText.replace(/<web_search>\s*/gi, '');
    finalText = finalText.replace(/<\/web_search>\s*/gi, '');
    finalText = finalText.replace(/<fetch_url>\s*/gi, '');
    finalText = finalText.replace(/<\/fetch_url>\s*/gi, '');
    finalText = finalText.replace(/<get_time>\s*/gi, '');
    finalText = finalText.replace(/<\/get_time>\s*/gi, '');
    finalText = finalText.replace(/<image_search>\s*/gi, '');
    finalText = finalText.replace(/<\/image_search>\s*/gi, '');

    // If response is empty after cleanup, provide explanation
    if (!finalText || finalText.trim().length === 0) {
        finalText = 'Maaf, saya tidak dapat membantu dengan permintaan ini karena tool yang dibutuhkan tidak tersedia untuk akun Anda.';
    }

    console.log(`[AI] Final text extracted: ${finalText.substring(0, 100)}...`);
    console.log('[AI] Response content blocks:', JSON.stringify(response.content, null, 2));

    // Check if image_search was used in this conversation
    let imageUrls = [];
    for (const msg of messages) {
        if (msg.role === 'user' && Array.isArray(msg.content)) {
            for (const item of msg.content) {
                if (item.type === 'tool_result' && item.content) {
                    try {
                        const parsed = JSON.parse(item.content);
                        if (parsed.images && Array.isArray(parsed.images)) {
                            imageUrls.push(...parsed.images);
                        }
                    } catch (e) {
                        // Not JSON or no images, skip
                    }
                }
            }
        }
    }

    // If images found, download first image and send with caption
    if (imageUrls.length > 0) {
        try {
            console.log('[AI] Downloading image:', imageUrls[0]);
            const axios = require('axios');
            const imageResponse = await axios.get(imageUrls[0], { responseType: 'arraybuffer' });
            const imageBuffer = Buffer.from(imageResponse.data);

            // Generate 5% thumbnail to prevent baileys sharp crash
            const thumbnail = await generateThumbnail(imageBuffer);

            // Send directly via baileys to include jpegThumbnail (wachan doesn't support it)
            const bot = require('wachan');
            const sock = bot.getSocket();

            const imageOptions = {
                image: imageBuffer,
                jpegThumbnail: thumbnail,
                caption: finalText + `\n\n_Image from Pinterest_`
            };

            // Quote original user message (baileys format: third parameter)
            const quotedOptions = userMessage ? { quoted: userMessage.toBaileys() } : {};

            await sock.sendMessage(roomJid, imageOptions, quotedOptions);

            // Delete progress message if exists
            if (progressMsg) {
                try {
                    await progressMsg.delete();
                } catch (e) {
                    console.error('[AI] Failed to delete progress message:', e.message);
                }
            }

            // Return null to prevent wachan from sending again
            return null;
        } catch (error) {
            console.error('[AI] Failed to download image:', error.message);

            // Fallback to text - send new message quoted to user, delete progress
            const bot = require('wachan');
            const sock = bot.getSocket();

            const textOptions = {
                text: finalText + `\n\n_Image unavailable: ${error.message}_`
            };

            const quotedOptions = userMessage ? { quoted: userMessage.toBaileys() } : {};

            await sock.sendMessage(roomJid, textOptions, quotedOptions);

            // Delete progress message if exists
            if (progressMsg) {
                try {
                    await progressMsg.delete();
                } catch (e) {
                    console.error('[AI] Failed to delete progress message:', e.message);
                }
            }

            return null;
        }
    }

    // Send final text
    if (progressMsg) {
        // Send NEW message with final result (quoted to user)
        console.log(`[AI] Sending final response (${finalText.length} chars), deleting progress msg`);

        const bot = require('wachan');
        const sock = bot.getSocket();

        const textOptions = {
            text: finalText
        };

        const quotedOptions = userMessage ? { quoted: userMessage.toBaileys() } : {};

        await sock.sendMessage(roomJid, textOptions, quotedOptions);

        // Delete progress message
        try {
            await progressMsg.delete();
        } catch (error) {
            console.error('[AI] Failed to delete progress message:', error.message);
        }

        // Save to memory after successful response
        await saveToMemory(roomJid, prompt, finalText, model, userMessage, imageBuffer, group);

        return null; // Already sent
    }

    // No tools were used - save to memory before returning
    console.log(`[AI] Returning direct response (${finalText.length} chars)`);
    await saveToMemory(roomJid, prompt, finalText, model, userMessage, imageBuffer, group);

    return finalText;
}

// Helper function to save conversation to memory
async function saveToMemory(roomJid, userPrompt, aiResponse, model, userMessage, imageBuffer, group = null) {
    try {
        // Determine room info
        const roomInfo = {};

        // Check if it's a group or private chat
        if (roomJid.includes('@g.us')) {
            // Group chat - use group.subject from context
            if (group && group.subject) {
                roomInfo.groupTitle = group.subject;
            }
        } else {
            // Private chat - get push name
            try {
                const wachan = require('wachan');
                const userData = await wachan.getUserData(userMessage.sender.id);
                if (userData && userData.pushName) {
                    roomInfo.pushName = userData.pushName;
                }
            } catch (error) {
                // Fallback to message sender name
                if (userMessage.sender.name) {
                    roomInfo.pushName = userMessage.sender.name;
                }
            }
        }

        // Save user message
        const userMetadata = {
            sender: userMessage?.sender?.id || 'unknown',
            hasImage: !!imageBuffer
        };
        await memoryManager.saveMessage(roomJid, 'user', userPrompt, userMetadata, roomInfo);

        // Save assistant response
        const assistantMetadata = {
            model: model
        };
        await memoryManager.saveMessage(roomJid, 'assistant', aiResponse, assistantMetadata, roomInfo);
    } catch (error) {
        console.error('[AI] Failed to save to memory:', error.message);
        // Don't throw - memory failure shouldn't break the response
    }
}

// Call AI API (supports OpenAI and Anthropic)
function callAIAPI(messages, tools, systemPrompt, model, apiKey, apiEndpoint) {
    return new Promise(async (resolve, reject) => {
        try {
            // Get model info and provider config dynamically
            const settingsManager = require('../settingsManager');

            // Get API timeout from settings
            const apiTimeout = await settingsManager.getApiTimeout();

            // Get the model to determine its provider
            const modelInfo = await settingsManager.getModelById(model);
            if (!modelInfo) {
                return reject(new Error(`Model ${model} not found in supported models`));
            }

            const provider = modelInfo.provider;
            if (!provider) {
                return reject(new Error(`Model ${model} has no provider configured`));
            }

            // Get provider configuration
            const providerConfig = await settingsManager.getProviderConfig(provider);
            if (!providerConfig) {
                return reject(new Error(`Provider ${provider} configuration not found`));
            }

            const path = providerConfig.path;
            const version = providerConfig.version;

            let endpoint, payload, headers;

            if (provider === 'openai') {
                // OpenAI API format - system prompt as first message
                endpoint = apiEndpoint; // Use dynamic endpoint

            // Add system message at the beginning
            const messagesWithSystem = [
                { role: 'system', content: systemPrompt },
                ...messages
            ];

            const payloadObj = {
                model: model,
                messages: messagesWithSystem
            };

            // Add tools if provided
            if (tools && tools.length > 0) {
                payloadObj.tools = tools.map(tool => ({
                    type: 'function',
                    function: {
                        name: tool.name,
                        description: tool.description,
                        parameters: tool.input_schema
                    }
                }));
            }

            payload = JSON.stringify(payloadObj);
            headers = {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
                'Content-Length': Buffer.byteLength(payload)
            };
        } else if (provider === 'anthropic') {
            // Anthropic API format - system as separate field
            endpoint = apiEndpoint; // Use dynamic endpoint
            // path already set from providerConfig

            const payloadObj = {
                model: model,
                max_tokens: 2048,
                system: systemPrompt, // System prompt as separate field
                messages: messages
            };

            // Add tools if provided
            if (tools && tools.length > 0) {
                payloadObj.tools = tools;
            }

            payload = JSON.stringify(payloadObj);
            headers = {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': version || '2023-06-01', // Use dynamic version
                'Content-Length': Buffer.byteLength(payload)
            };
        } else {
            reject(new Error(`Unsupported provider: ${provider}`));
            return;
        }

        const options = {
            hostname: endpoint,
            path: path,
            method: 'POST',
            headers: headers
        };

        const req = https.request(options, (res) => {
            let data = '';

            res.on('data', chunk => {
                data += chunk;
            });

            res.on('end', () => {
                try {
                    if (res.statusCode !== 200) {
                        reject(new Error(`API returned status ${res.statusCode}: ${data}`));
                        return;
                    }

                    if (!data || data.trim().length === 0) {
                        reject(new Error('API returned empty response'));
                        return;
                    }

                    const parsed = JSON.parse(data);

                    // Return full response object for tool calling support
                    if (provider === 'openai') {
                        if (parsed.choices && parsed.choices[0]) {
                            resolve({
                                content: [{ type: 'text', text: parsed.choices[0].message.content }],
                                stop_reason: parsed.choices[0].finish_reason
                            });
                        } else {
                            reject(new Error('Unexpected OpenAI API response format'));
                        }
                    } else if (provider === 'anthropic') {
                        // Anthropic already returns in the right format
                        resolve(parsed);
                    }

                } catch (error) {
                    reject(new Error(`Failed to parse API response: ${error.message}`));
                }
            });
        });

        req.on('error', (error) => {
            reject(new Error(`API request failed: ${error.message}`));
        });

        // Set timeout
        req.setTimeout(apiTimeout, () => {
            req.destroy();
            reject(new Error(`API request timeout (${apiTimeout / 1000}s)`));
        });

        req.write(payload);
        req.end();
        } catch (error) {
            reject(new Error(`Failed to initialize API request: ${error.message}`));
        }
    });
}
