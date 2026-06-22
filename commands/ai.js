const whitelistManager = require('../whitelistManager');
const { startContinuousTyping } = require('../utils/typing');
const https = require('https');
const { Jimp } = require('jimp');
const memoryManager = require('../memoryManager');


// ============================================
// AI API Configuration - Edit these variables
// ============================================

// Model-to-Provider mapping
const MODEL_PROVIDERS = {
    // Anthropic-compatible models (all models use anthropic format)
    'qwen3-coder-next': 'anthropic',
    'claude-sonnet-4.5': 'anthropic'
};

// OpenAI Configuration
const OPENAI_ENDPOINT = 'ai2.adevdev.com';
const OPENAI_PATH = '/v1/chat/completions';

// Anthropic Configuration
const ANTHROPIC_ENDPOINT = 'ai2.adevdev.com';
const ANTHROPIC_PATH = '/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01'; // Check docs for latest version
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
        const { message, command } = context;
        const bot = require('wachan');

        // Check whitelist (skip if already checked by fallback handler)
        // ponytail: check both id and lid since @mentions use lid
        if (!command.skipWhitelistCheck) {
            const isWhitelistedById = await whitelistManager.isWhitelisted(message.sender.id);
            const isWhitelistedByLid = message.sender.lid ? await whitelistManager.isWhitelisted(message.sender.lid) : false;

            if (!isWhitelistedById && !isWhitelistedByLid) {
                return '*Access denied.* AI command is only available for whitelisted users.';
            }
        }

        // Get user's assigned model (try lid first since @mentions use lid, fallback to id)
        let userModel = message.sender.lid ? await whitelistManager.getModel(message.sender.lid) : null;
        if (!userModel || userModel === 'qwen3-coder-next') {
            userModel = await whitelistManager.getModel(message.sender.id);
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

        // Auto-switch to Claude for vision if user's model doesn't support it
        const VISION_CAPABLE_MODELS = ['claude-sonnet-4.5']; // Add more models here as you test them
        if (imageBuffer && !VISION_CAPABLE_MODELS.includes(userModel)) {
            console.log(`[AI] Image detected, auto-switching from ${userModel} to claude-sonnet-4.5 for vision`);
            userModel = 'claude-sonnet-4.5';
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

        // Check API key
        const API_KEY = process.env.AI_API_KEY;
        if (!API_KEY) {
            return '*Error:* AI_API_KEY not configured in .env file.';
        }

        // Start typing indicator
        const stopTyping = startContinuousTyping(bot, message.room);

        try {
            // Call AI API with tool support
            const response = await callAIAPIWithTools(prompt, userModel, API_KEY, message.room, imageBuffer, imageType, message);

            stopTyping();
            return response;

        } catch (error) {
            stopTyping();
            console.error('[AI] Error:', error.message);
            return `*AI Error:*\n${error.message}`;
        }
    },
    options: {
        aliases: ['ask', 'chat'],
        description: 'Ask AI assistant (whitelist only)',
        sectionName: 'AI',
        fallback: true // Mark this as fallback command
    }
};

// Fetch URL content
async function fetchUrl(url) {
    try {
        console.log('[FetchURL] Fetching:', url);
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            signal: AbortSignal.timeout(15000) // 15s timeout
        });

        if (!response.ok) {
            return JSON.stringify({
                error: `HTTP ${response.status}`,
                url: url
            });
        }

        const text = await response.text();

        // Limit response size (max 50KB)
        const MAX_SIZE = 50000;
        const trimmed = text.length > MAX_SIZE ? text.slice(0, MAX_SIZE) + '\n... (truncated)' : text;

        console.log('[FetchURL] Fetched', trimmed.length, 'bytes');
        return trimmed;

    } catch (error) {
        console.error('[FetchURL] Error:', error.message);
        return JSON.stringify({
            error: error.message,
            url: url
        });
    }
}

// Web search tool using EXA MCP endpoint (free, no API key)
async function webSearch(query) {
    try {
        const response = await fetch('https://mcp.exa.ai/mcp', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json, text/event-stream'
            },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: 1,
                method: 'tools/call',
                params: {
                    name: 'web_search_exa',
                    arguments: {
                        query: query,
                        type: 'auto',
                        numResults: 5,
                        livecrawl: 'fallback'
                    }
                }
            }),
            signal: AbortSignal.timeout(25000) // 25s timeout
        });

        if (!response.ok) {
            console.error('[WebSearch] EXA returned HTTP', response.status);
            return 'Search unavailable. Please answer based on your training data.';
        }

        const body = await response.text();

        // Parse response - can be direct JSON or SSE format
        const result = parseExaResponse(body);

        if (!result) {
            console.error('[WebSearch] No usable results from EXA');
            return 'No search results found. Please answer based on your training data.';
        }

        console.log('[WebSearch] Using EXA - results retrieved');
        return result;

    } catch (error) {
        console.error('[WebSearch] EXA error:', error.message);
        return 'Search unavailable. Please answer based on your training data.';
    }
}

// Parse EXA response (handles both JSON and SSE formats)
function parseExaResponse(body) {
    const trimmed = body.trim();

    // Try direct JSON parse first
    if (trimmed.startsWith('{')) {
        try {
            const parsed = JSON.parse(trimmed);
            if (parsed.result && parsed.result.content) {
                const textContent = parsed.result.content.find(item => item.text);
                return textContent ? textContent.text : null;
            }
        } catch (e) {
            // Not valid JSON, continue to SSE parsing
        }
    }

    // Try SSE format (event: message\ndata: {...})
    for (const line of body.split('\n')) {
        if (!line.startsWith('data: ')) continue;

        try {
            const data = line.substring(6).trim();
            const parsed = JSON.parse(data);
            if (parsed.result && parsed.result.content) {
                const textContent = parsed.result.content.find(item => item.text);
                return textContent ? textContent.text : null;
            }
        } catch (e) {
            // Invalid JSON in this line, continue
        }
    }

    return null;
}

// Get current time
function getCurrentTime() {
    const now = new Date();
    return JSON.stringify({
        iso: now.toISOString(),
        utc: now.toUTCString(),
        local: now.toLocaleString('en-US', {
            dateStyle: 'full',
            timeStyle: 'long'
        }),
        unix: Math.floor(now.getTime() / 1000),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        day: now.toLocaleDateString('en-US', { weekday: 'long' })
    }, null, 2);
}

// Call AI API with tool support (multi-turn)
async function callAIAPIWithTools(prompt, model, apiKey, roomJid, imageBuffer = null, imageType = null, userMessage = null) {
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

    // System prompt for WhatsApp formatting
    let systemPrompt = `You are a helpful AI assistant responding via WhatsApp.

IMPORTANT CONTEXT:
Current date: ${currentDate}
Current time: ${currentTime}`;

    // Inject memory context if available
    if (memoryContext) {
        systemPrompt += `\n\n${memoryContext}\n\n---\n\nUse the conversation history above to maintain context and continuity in your responses.`;
    }

    systemPrompt += `

CRITICAL INSTRUCTIONS:
- Your training data has a knowledge cutoff date. The current date (${currentDate}) may be AFTER your training cutoff.
- For ANY query about current events, prices, holidays, schedules, news, weather, or time-sensitive information, you MUST use the web_search tool.
- For queries about "today", "this month", "this year", or specific future dates, ALWAYS use web_search first.
- Use the get_time tool if you need detailed timestamp information (unix time, ISO format, timezone, etc).
- When user asks for images/pictures/photos, ONLY use image_search tool. DO NOT use web_search for image requests.
- The image_search tool returns Pinterest image URLs - use it for any visual content request.
- Do NOT rely on your training data for time-sensitive information - always search the web first.

WhatsApp Formatting Rules (IMPORTANT):
- Bold: *text* (asterisks with NO spaces after opening or before closing)
  ✓ Good: *Bitcoin Price* or *Price:* $50k
  ✗ Bad: * Bitcoin Price * or *compiled knowledge*
- Italic: _text_ (underscores with NO spaces)
  ✓ Good: _Source: CoinDesk_
  ✗ Bad: _ italic text _
- Monospace: \`text\` (backticks for code/commands)
  ✓ Good: \`/capture <url>\`
- DO NOT use asterisks in the middle of sentences for emphasis - WhatsApp may not render them correctly
- Put bold/italic formatting at the START of lines or after line breaks for best results
- Use emojis for visual breaks: 💰 📊 📈 ⚡ 🔍 ✅ ❌
- Keep responses concise and mobile-friendly
- Use • or numbered lists for multiple items
- Break long text into short paragraphs with empty lines between them

Example GOOD formatting:
*Bitcoin Price Today* 💰

The current price is $63,850 USD

📈 *24h Change:* +1.35%
💵 *Market Cap:* $1.28 trillion

_Last updated: ${currentTime}_

Example BAD formatting (avoid):
LLM builds/maintains your *compounding second brain* — not just retrieval, but *compiled knowledge*

Instead write:
LLM builds your compounding second brain

*Key features:*
• Not just retrieval
• Compiled knowledge layer
• Continuous learning


Example good formatting:
*Bitcoin Price Today:* 💰

*$63,850 - $63,950 USD*

📈 24h Change: *+1.1% to +1.35%*

_Sources:_
• CoinMarketCap: $63,880
• CoinDesk: $63,899

Market cap: ~$1.28 trillion USD`;

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

    // Define tools
    const tools = [
        {
            name: 'web_search',
            description: 'Search the web for current information, news, or any topic. Use this when you need up-to-date information or information you do not have in your training data.',
            input_schema: {
                type: 'object',
                properties: {
                    query: {
                        type: 'string',
                        description: 'The search query'
                    }
                },
                required: ['query']
            }
        },
        {
            name: 'fetch_url',
            description: 'Fetch and read the content from a URL. Use this to access specific web pages, GitHub files, documentation, articles, or any URL content.',
            input_schema: {
                type: 'object',
                properties: {
                    url: {
                        type: 'string',
                        description: 'The URL to fetch (must include http:// or https://)'
                    }
                },
                required: ['url']
            }
        },
        {
            name: 'get_time',
            description: 'Get current date and time in multiple formats. Use when user asks about current time, date, day of week, or needs timestamp.',
            input_schema: {
                type: 'object',
                properties: {},
                required: []
            }
        },
        {
            name: 'image_search',
            description: 'Search for images on Pinterest and returns high-quality image URLs. Use this tool EXCLUSIVELY when user asks for pictures, images, photos, or any visual content. Do NOT use web_search for image requests - this tool provides everything needed.',
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
        }
    ];

    // Tool calling loop (max iterations to prevent infinite loops)
    let response;
    try {
        response = await callAIAPI(messages, tools, systemPrompt, model, apiKey);
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

        // Send progress message for first tool
        const firstTool = toolUses[0];
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

        // Execute all tools
        const toolResults = [];
        let imageSearchResult = null; // Track if image_search was used

        for (const toolUse of toolUses) {
            let toolResult;

            // Execute the appropriate tool
            if (toolUse.name === 'web_search') {
                console.log('[AI] Using web search:', toolUse.input.query);
                toolResult = await webSearch(toolUse.input.query);
            } else if (toolUse.name === 'fetch_url') {
                console.log('[AI] Fetching URL:', toolUse.input.url);
                toolResult = await fetchUrl(toolUse.input.url);
            } else if (toolUse.name === 'get_time') {
                console.log('[AI] Getting current time');
                toolResult = getCurrentTime();
            } else if (toolUse.name === 'image_search') {
                console.log('[AI] Searching images:', toolUse.input.query);
                try {
                    // Call Pinterest API endpoint
                    const apiUrl = `https://apied26.adevdev.com/pinterest?q=${encodeURIComponent(toolUse.input.query)}`;
                    const apiResponse = await fetch(apiUrl);
                    const apiData = await apiResponse.json();

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
        response = await callAIAPI(messages, tools, systemPrompt, model, apiKey);
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
        response = await callAIAPI(messages, [], systemPrompt, model, apiKey);
    }

    // Extract final text response
    const textContent = response.content.find(block => block.type === 'text');
    const finalText = textContent ? textContent.text.trim() : 'No response generated.';

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

            // Quote last progress message if exists
            if (progressMsg) {
                imageOptions.quoted = progressMsg.toBaileys();
            }

            await sock.sendMessage(roomJid, imageOptions);

            // Return null to prevent wachan from sending again
            return null;
        } catch (error) {
            console.error('[AI] Failed to download image:', error.message);
            // Fallback to text only with quote
            if (progressMsg) {
                const bot = require('wachan');
                const sock = bot.getSocket();
                await sock.sendMessage(roomJid, {
                    text: finalText + `\n\n_Image unavailable: ${error.message}_`
                }, { quoted: progressMsg.toBaileys() });
                return null;
            }
            return finalText + `\n\n_Image unavailable: ${error.message}_`;
        }
    }

    // Send final text - edit progress message if exists, otherwise return to wachan
    if (progressMsg) {
        await progressMsg.edit(finalText);

        // Save to memory after successful response
        await saveToMemory(roomJid, prompt, finalText, model, userMessage, imageBuffer);

        return null; // Already sent via edit
    }

    // Save to memory before returning
    await saveToMemory(roomJid, prompt, finalText, model, userMessage, imageBuffer);

    return finalText;
}

// Helper function to save conversation to memory
async function saveToMemory(roomJid, userPrompt, aiResponse, model, userMessage, imageBuffer) {
    try {
        // Save user message
        const userMetadata = {
            sender: userMessage?.sender?.id || 'unknown',
            hasImage: !!imageBuffer
        };
        await memoryManager.saveMessage(roomJid, 'user', userPrompt, userMetadata);

        // Save assistant response
        const assistantMetadata = {
            model: model
        };
        await memoryManager.saveMessage(roomJid, 'assistant', aiResponse, assistantMetadata);
    } catch (error) {
        console.error('[AI] Failed to save to memory:', error.message);
        // Don't throw - memory failure shouldn't break the response
    }
}

// Call AI API (supports OpenAI and Anthropic)
function callAIAPI(messages, tools, systemPrompt, model, apiKey) {
    return new Promise((resolve, reject) => {
        // Determine provider from model
        const provider = MODEL_PROVIDERS[model];

        if (!provider) {
            reject(new Error(`Unknown model: ${model}. Please add it to MODEL_PROVIDERS mapping.`));
            return;
        }

        let endpoint, path, payload, headers;

        if (provider === 'openai') {
            // OpenAI API format - system prompt as first message
            endpoint = OPENAI_ENDPOINT;
            path = OPENAI_PATH;

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
            endpoint = ANTHROPIC_ENDPOINT;
            path = ANTHROPIC_PATH;

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
                'anthropic-version': ANTHROPIC_VERSION,
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
        req.setTimeout(45000, () => {
            req.destroy();
            reject(new Error('API request timeout (45s)'));
        });

        req.write(payload);
        req.end();
    });
}
