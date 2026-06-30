const whitelistManager = require('../whitelistManager');
const settingsManager = require('../settingsManager');
const { startContinuousTyping } = require('../utils/typing');
const https = require('https');
const { Jimp } = require('jimp');
const memoryManager = require('../memoryManager');
const tools = require('../tools');
const systemPromptLoader = require('../systemPromptLoader');


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

        // Declare workingIdentifier early so it can be set in auto-add and used in quota check
        let workingIdentifier = null;

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

                    // IMPORTANT: Always use message.sender.id (without device suffix) for consistency
                    // Don't use userData.id which may include device-specific suffix like :77
                    let jidToStore = message.sender.id;

                    try {
                        const wachan = require('wachan');
                        const userData = await wachan.getUserData(message.sender.id);
                        if (userData) {
                            // Use WhatsApp's pushName (more reliable)
                            if (userData.pushName) {
                                pushName = userData.pushName;
                            }
                            // DO NOT use userData.id - it has device suffix which causes mismatch
                            console.log(`[AI] Got user data: ${userData.pushName} (storing as: ${jidToStore})`);
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

                    // Important: Set workingIdentifier immediately after auto-add
                    // This ensures quota check uses the same identifier we just added
                    workingIdentifier = jidToStore;
                }
            }
        }

        // Check quota (try both lid and jid, like whitelist check)
        let quotaCheck = null;

        // If workingIdentifier already set (e.g. from auto-add), use it directly
        if (workingIdentifier) {
            quotaCheck = await whitelistManager.checkQuota(workingIdentifier);
        } else {
            // Try lid first if available
            if (message.sender.lid) {
                quotaCheck = await whitelistManager.checkQuota(message.sender.lid);
                if (quotaCheck.allowed) {
                    workingIdentifier = message.sender.lid;
                }
            }

            // If lid failed or not found, try jid
            if (!workingIdentifier && (!quotaCheck || !quotaCheck.allowed)) {
                const jidCheck = await whitelistManager.checkQuota(message.sender.id);
                // Use jid result if lid was not whitelisted or jid has better result
                if (!quotaCheck || quotaCheck.reason === 'Not whitelisted') {
                    quotaCheck = jidCheck;
                    if (jidCheck.allowed) {
                        workingIdentifier = message.sender.id;
                    }
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
        let pdfContent = null; // Store extracted PDF content

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

        // Check for PDF document in quoted message or message itself
        let pdfFilePath = null; // Store path to saved PDF for tool calling

        // Debug logging for media detection
        console.log('[AI] Message media check:', {
            isMedia: message.isMedia,
            type: message.type,
            mimetype: message.mimetype
        });
        if (quotedMsg) {
            console.log('[AI] Quoted message media check:', {
                isMedia: quotedMsg.isMedia,
                type: quotedMsg.type,
                mimetype: quotedMsg.mimetype
            });
        }

        let pdfMessage = null;
        if (quotedMsg && quotedMsg.isMedia &&
            (quotedMsg.mimetype === 'application/pdf' || quotedMsg.type === 'document')) {
            pdfMessage = quotedMsg;
            console.log('[AI] PDF detected in quoted message');
        } else if (message.isMedia &&
                   (message.mimetype === 'application/pdf' || message.type === 'document')) {
            pdfMessage = message;
            console.log('[AI] PDF detected in current message');
        }

        // Save PDF to temp file if found (AI will use read_pdf tool to extract)
        if (pdfMessage) {
            try {
                console.log('[AI] PDF document detected, saving to temp...');
                const fs = require('fs');
                const path = require('path');

                // Download PDF
                const pdfBuffer = await pdfMessage.downloadMedia();

                // Save to temp file
                const tempDir = path.join(__dirname, '../temp');
                if (!fs.existsSync(tempDir)) {
                    fs.mkdirSync(tempDir, { recursive: true });
                }
                pdfFilePath = path.join(tempDir, `pdf_${Date.now()}.pdf`);
                fs.writeFileSync(pdfFilePath, pdfBuffer);

                console.log(`[AI] PDF saved to: ${pdfFilePath}`);

            } catch (error) {
                console.error('[AI] Failed to save PDF:', error.message);
                pdfFilePath = null;
            }
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

        // Build prompt with PDF file reference, quoted message, and user's message
        if (pdfFilePath) {
            // PDF found - explicitly instruct AI to use read_pdf tool first
            const userText = command.parameters.join(' ') || '';

            let pdfInstruction = `A PDF document has been uploaded and saved to: ${pdfFilePath}\n\n` +
                               `IMPORTANT: You must first use the read_pdf tool to read this document before responding. ` +
                               `The file path is: ${pdfFilePath}\n\n`;

            if (quotedMsg && quotedMsg.text) {
                // PDF + quoted message + user text
                if (userText) {
                    prompt = pdfInstruction + `Quoted Message: ${quotedMsg.text}\n\nUser Request: ${userText}`;
                } else {
                    prompt = pdfInstruction + `Quoted Message: ${quotedMsg.text}`;
                }
            } else {
                // PDF + user text (most common: PDF with caption)
                if (userText) {
                    prompt = pdfInstruction + `User Request: ${userText}`;
                } else {
                    // Just PDF, no instructions
                    prompt = pdfInstruction + `Please read this PDF document using the read_pdf tool and provide a summary of its contents.`;
                }
            }
        } else if (quotedMsg && quotedMsg.text) {
            // No PDF - original logic for quoted messages
            const userText = command.parameters.join(' ') || '';

            if (userText) {
                // Format: [quoted message]\n[user's reply]
                prompt = `${quotedMsg.text}\n\n${userText}`;
            } else {
                // Just the quoted message
                prompt = quotedMsg.text;
            }
        } else {
            // No PDF, no quoted message - just use parameters
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
                   'or send/reply to an image with `.ai`\n' +
                   'or send a PDF document with caption (private chat only, no prefix needed)';
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
            const response = await callAIAPIWithTools(prompt, userModel, API_KEY, API_ENDPOINT, message.room, imageBuffer, imageType, message, group, workingIdentifier, pdfFilePath);

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
        } finally {
            // Cleanup temp PDF file if exists
            if (pdfFilePath) {
                try {
                    const fs = require('fs');
                    if (fs.existsSync(pdfFilePath)) {
                        fs.unlinkSync(pdfFilePath);
                        console.log(`[AI] Cleaned up temp PDF: ${pdfFilePath}`);
                    }
                } catch (cleanupError) {
                    console.warn('[AI] Failed to cleanup temp PDF:', cleanupError.message);
                }
            }
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
async function callAIAPIWithTools(prompt, model, apiKey, apiEndpoint, roomJid, imageBuffer = null, imageType = null, userMessage = null, group = null, workingIdentifier = null, pdfFilePath = null) {
    // Validate roomJid
    if (!roomJid || typeof roomJid !== 'string') {
        console.error('[AI] Invalid roomJid:', roomJid);
        throw new Error('Invalid room identifier. Cannot process AI request.');
    }

    // Get bot instance for context
    const bot = require('wachan');

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

    // Build context for system prompt modules (rich context for true modularity)
    const promptContext = {
        // Core objects (modules can access anything they need)
        settingsManager,
        memoryManager,
        whitelistManager,
        bot,

        // Message context
        message: userMessage,
        group,
        roomJid,

        // Pre-computed values (commonly used)
        userName,
        currentDate,
        currentTime,
        memoryContext,

        // User info
        workingIdentifier,
        sender: userMessage?.sender
    };

    // Generate system prompt from modular components
    const systemPrompt = await systemPromptLoader.generate(promptContext);

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
        toolDefinitions = toolDefinitions.filter(tool => tool && tool.name && userEnabledTools.includes(tool.name));
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
    // Get user-specific maxToolIterations, or use global default
    let maxIterations = await whitelistManager.getMaxToolIterations(workingIdentifier);
    if (maxIterations === null) {
        maxIterations = await settingsManager.getMaxToolIterations();
    }
    const MAX_ITERATIONS = maxIterations;
    let progressMsg = null;

    while (response.stop_reason === 'tool_use' && iterations < MAX_ITERATIONS) {
        iterations++;

        // Find ALL tool_use blocks in content
        const toolUses = response.content.filter(block => block.type === 'tool_use');

        if (toolUses.length === 0) break;

        // Validate tools FIRST before sending progress
        const allowedToolNames = toolDefinitions.map(t => t.name).filter(name => name !== undefined);
        const allowedToolUses = [];
        const blockedToolUses = [];

        for (const toolUse of toolUses) {
            if (toolUse && toolUse.name && allowedToolNames.includes(toolUse.name)) {
                allowedToolUses.push(toolUse);
            } else {
                blockedToolUses.push(toolUse);
                console.log(`[AI] Tool execution blocked: ${toolUse?.name || 'unknown'} not in user's enabled tools`);
            }
        }

        // Send progress message only for first ALLOWED tool
        if (allowedToolUses.length > 0) {
            const firstTool = allowedToolUses[0];

            // Get progress message from tool metadata (dynamic)
            const toolMetadata = tools.getMetadata(firstTool.name);
            let progressText = '';

            if (toolMetadata && toolMetadata.progressMessage) {
                // Generate progress message from tool metadata
                try {
                    progressText = toolMetadata.progressMessage(firstTool.input);
                } catch (error) {
                    console.warn(`[AI] Failed to generate progress message for ${firstTool.name}:`, error.message);
                    // Fallback to generic message
                    progressText = `${toolMetadata.icon || '⚙️'} Using ${firstTool.name}...`;
                }
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

            try {
                console.log(`[AI] Executing tool: ${toolUse.name}`);

                // Build context object for tools that need conversation context
                const toolContext = {
                    message: userMessage,
                    room: roomJid,
                    group: group || null,
                    workingIdentifier: workingIdentifier,
                    progressMsg: progressMsg // Pass progress message for real-time updates
                };

                // Execute tool with context
                toolResult = await tools.executeTool(toolUse.name, toolUse.input, toolContext);

                // No immediate handling - let AI process all tool results
                // Images will be handled in Path 2 (post-processing) after AI generates response

            } catch (error) {
                console.error(`[AI] Tool execution failed (${toolUse.name}):`, error.message);
                toolResult = JSON.stringify({
                    error: error.message,
                    tool: toolUse.name
                });
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

        // Check if any tool returned silent mode (background processing)
        let silentMode = false;
        for (const result of toolResults) {
            try {
                const parsed = JSON.parse(result.content);
                if (parsed.silent === true) {
                    silentMode = true;
                    console.log('[AI] Silent mode detected - skipping text generation');
                    break;
                }
            } catch (e) {
                // Not JSON, skip
            }
        }

        // If silent mode, keep progress message and return null
        if (silentMode) {
            // Progress message will be updated by background polling
            // Just return null to skip text response
            console.log('[AI] Silent mode active - background polling will handle response');
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
    // Dynamic cleanup based on all registered tools
    const allToolNames = tools.getToolNames();
    for (const toolName of allToolNames) {
        // Escape special regex characters in tool name
        const escapedName = toolName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        finalText = finalText.replace(new RegExp(`<${escapedName}>\\s*`, 'gi'), '');
        finalText = finalText.replace(new RegExp(`</${escapedName}>\\s*`, 'gi'), '');
    }

    // If response is empty after cleanup, provide explanation
    if (!finalText || finalText.trim().length === 0) {
        finalText = 'Maaf, saya tidak dapat membantu dengan permintaan ini karena tool yang dibutuhkan tidak tersedia untuk akun Anda.';
    }

    console.log(`[AI] Final text extracted: ${finalText.substring(0, 100)}...`);
    console.log('[AI] Response content blocks:', JSON.stringify(response.content, null, 2));

    // Check if any tool returned images in this conversation
    let imageUrls = [];
    let imageToolName = null;
    let imageCaption = null;
    let preparedImageBuffer = null; // From send_image tool (already downloaded)

    // First pass: collect tool names from assistant's tool_use blocks
    const toolsUsed = [];
    for (const msg of messages) {
        if (msg.role === 'assistant' && Array.isArray(msg.content)) {
            for (const block of msg.content) {
                if (block.type === 'tool_use') {
                    toolsUsed.push(block.name);
                }
            }
        }
    }

    // Second pass: collect images/imageBuffer from tool results
    for (const msg of messages) {
        if (msg.role === 'user' && Array.isArray(msg.content)) {
            for (const item of msg.content) {
                if (item.type === 'tool_result' && item.content) {
                    try {
                        const parsed = JSON.parse(item.content);

                        // Check for prepared imageBuffer (from send_image tool)
                        if (parsed.imageBuffer && typeof parsed.imageBuffer === 'string') {
                            preparedImageBuffer = Buffer.from(parsed.imageBuffer, 'base64');
                            console.log('[AI] Found prepared imageBuffer from send_image tool');
                        }

                        // Check for image URLs (from generation tools)
                        if (parsed.images && Array.isArray(parsed.images)) {
                            imageUrls.push(...parsed.images);
                            // Track custom caption if provided by tool
                            if (parsed.caption) {
                                imageCaption = parsed.caption;
                            }
                        }
                    } catch (e) {
                        // Not JSON or no images, skip
                    }
                }
            }
        }
    }

    // Identify which tool generated the images by checking resultType in metadata
    if (imageUrls.length > 0 && toolsUsed.length > 0) {
        for (const toolName of toolsUsed) {
            const toolMetadata = tools.getMetadata(toolName);
            if (toolMetadata && toolMetadata.resultType === 'image') {
                imageToolName = toolName;
                break; // Use first image tool found
            }
        }
    }

    // Priority 1: If send_image prepared imageBuffer, use it
    if (preparedImageBuffer) {
        try {
            console.log('[AI] Using prepared imageBuffer from send_image tool');

            // Generate 5% thumbnail to prevent baileys sharp crash
            const thumbnail = await generateThumbnail(preparedImageBuffer);

            // Send directly via baileys to include jpegThumbnail
            const bot = require('wachan');
            const sock = bot.getSocket();

            // Use AI's finalText as caption
            const imageOptions = {
                image: preparedImageBuffer,
                jpegThumbnail: thumbnail,
                caption: finalText
            };

            // Quote original user message
            const quotedOptions = userMessage ? { quoted: userMessage.toBaileys() } : {};

            await sock.sendMessage(roomJid, imageOptions, quotedOptions);

            // Edit progress message to show tools used
            if (progressMsg) {
                try {
                    const uniqueTools = Array.from(new Set(toolsUsed));
                    const toolsList = uniqueTools.join(', ');
                    await progressMsg.edit(`🔧 Used tools: ${toolsList}`);
                    console.log('[AI] Progress message edited to show tools used');
                } catch (e) {
                    console.error('[AI] Failed to edit progress message:', e.message);
                }
            }

            // Save to memory
            await saveToMemory(roomJid, prompt, finalText, model, userMessage, preparedImageBuffer, group);

            // Return null to prevent wachan from sending again
            return null;
        } catch (error) {
            console.error('[AI] Failed to send prepared image:', error.message);

            // Fallback to text
            const bot = require('wachan');
            const sock = bot.getSocket();

            const textOptions = {
                text: finalText + `\n\n_Image unavailable: ${error.message}_`
            };

            const quotedOptions = userMessage ? { quoted: userMessage.toBaileys() } : {};

            await sock.sendMessage(roomJid, textOptions, quotedOptions);

            // Edit progress message
            if (progressMsg) {
                try {
                    const uniqueTools = Array.from(new Set(toolsUsed));
                    const toolsList = uniqueTools.join(', ');
                    await progressMsg.edit(`🔧 Used tools: ${toolsList}`);
                } catch (e) {
                    console.error('[AI] Failed to edit progress message:', e.message);
                }
            }

            return null;
        }
    }

    // Priority 2: If images found from generation tools (auto-send), download and send
    if (imageUrls.length > 0 && imageToolName) {
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

            // Build caption based on tool and custom caption
            let captionText = finalText;
            if (imageCaption) {
                // Tool provided custom caption, append it
                captionText = finalText + '\n\n' + imageCaption;
            } else if (imageToolName === 'image_search') {
                // Image search - add Pinterest attribution
                captionText = finalText + '\n\n_Image from Pinterest_';
            }
            // For other image tools (send_image, etc.), just use finalText

            const imageOptions = {
                image: imageBuffer,
                jpegThumbnail: thumbnail,
                caption: captionText
            };

            // Quote original user message (baileys format: third parameter)
            const quotedOptions = userMessage ? { quoted: userMessage.toBaileys() } : {};

            await sock.sendMessage(roomJid, imageOptions, quotedOptions);

            // Edit progress message to show tools used
            if (progressMsg) {
                try {
                    const uniqueTools = Array.from(new Set(toolsUsed));
                    const toolsList = uniqueTools.join(', ');
                    await progressMsg.edit(`🔧 Used tools: ${toolsList}`);
                    console.log('[AI] Progress message edited to show tools used (Path 2)');
                } catch (e) {
                    console.error('[AI] Failed to edit progress message:', e.message);
                }
            } else {
                console.log('[AI] No progressMsg to edit (Path 2)');
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

            // Edit progress message to show tools used
            if (progressMsg) {
                try {
                    const uniqueTools = Array.from(new Set(toolsUsed));
                    const toolsList = uniqueTools.join(', ');
                    await progressMsg.edit(`🔧 Used tools: ${toolsList}`);
                } catch (e) {
                    console.error('[AI] Failed to edit progress message:', e.message);
                }
            }

            return null;
        }
    }

    // Check if any tool returned a document
    let documentUrl = null;
    let documentFilename = null;
    let documentMimetype = null;
    let documentCaption = null;

    for (const msg of messages) {
        if (msg.role === 'user' && Array.isArray(msg.content)) {
            for (const item of msg.content) {
                if (item.type === 'tool_result' && item.content) {
                    try {
                        const parsed = JSON.parse(item.content);
                        if (parsed.document && parsed.fileName) {
                            documentUrl = parsed.document;
                            documentFilename = parsed.fileName;
                            documentMimetype = parsed.mimetype || 'application/octet-stream';
                            documentCaption = parsed.caption || null;
                            break;
                        }
                    } catch (e) {
                        // Not JSON or no document, skip
                    }
                }
            }
            if (documentUrl) break;
        }
    }

    // If document found, send it
    if (documentUrl) {
        try {
            console.log('[AI] Sending document:', documentUrl);
            const bot = require('wachan');
            const sock = bot.getSocket();

            const documentOptions = {
                document: { url: documentUrl },
                fileName: documentFilename,
                mimetype: documentMimetype
            };

            // Add caption if provided or use AI's response
            if (documentCaption) {
                documentOptions.caption = finalText + '\n\n' + documentCaption;
            } else if (finalText && finalText.trim().length > 0) {
                documentOptions.caption = finalText;
            }

            // Quote original user message
            const quotedOptions = userMessage ? { quoted: userMessage.toBaileys() } : {};

            await sock.sendMessage(roomJid, documentOptions, quotedOptions);

            // Edit progress message to show tools used
            if (progressMsg) {
                try {
                    const uniqueTools = Array.from(new Set(toolsUsed));
                    const toolsList = uniqueTools.join(', ');
                    await progressMsg.edit(`🔧 Used tools: ${toolsList}`);
                } catch (e) {
                    console.error('[AI] Failed to edit progress message:', e.message);
                }
            }

            // Save to memory after successful response
            await saveToMemory(roomJid, prompt, finalText, model, userMessage, imageBuffer, group);

            // Return null to prevent wachan from sending again
            return null;
        } catch (error) {
            console.error('[AI] Failed to send document:', error.message);

            // Fallback to text
            const bot = require('wachan');
            const sock = bot.getSocket();

            const textOptions = {
                text: finalText + `\n\n_Document unavailable: ${error.message}_`
            };

            const quotedOptions = userMessage ? { quoted: userMessage.toBaileys() } : {};

            await sock.sendMessage(roomJid, textOptions, quotedOptions);

            // Edit progress message to show tools used
            if (progressMsg) {
                try {
                    const uniqueTools = Array.from(new Set(toolsUsed));
                    const toolsList = uniqueTools.join(', ');
                    await progressMsg.edit(`🔧 Used tools: ${toolsList}`);
                } catch (e) {
                    console.error('[AI] Failed to edit progress message:', e.message);
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

        // Edit progress message to show tools used
        try {
            const uniqueTools = Array.from(new Set(toolsUsed));
            const toolsList = uniqueTools.join(', ');
            await progressMsg.edit(`🔧 Used tools: ${toolsList}`);
        } catch (error) {
            console.error('[AI] Failed to edit progress message:', error.message);
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
        // Validate roomJid
        if (!roomJid || typeof roomJid !== 'string') {
            console.error('[Memory] Invalid roomJid, skipping save:', roomJid);
            return;
        }

        // Skip saving if room is bot's own ID (prevent self-memory)
        const wachan = require('wachan');
        try {
            const botData = wachan.getBotData();
            // Check if roomJid matches bot's ID or LID
            if (roomJid === botData.id || roomJid === botData.lid ||
                roomJid === botData.deviceSpecificId || roomJid === botData.deviceSpecificLid) {
                console.log('[Memory] Skipping save for bot\'s own room:', roomJid);
                return;
            }
        } catch (error) {
            // If can't get bot data, continue anyway (bot might not be fully started)
            console.warn('[Memory] Could not verify bot ID, continuing save:', error.message);
        }

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
