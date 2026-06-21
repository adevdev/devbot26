const whitelistManager = require('../whitelistManager');
const { startContinuousTyping } = require('../utils/typing');
const https = require('https');
const { Jimp } = require('jimp');

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

// ============================================
// AI API Configuration - Edit these variables
// ============================================
const AI_PROVIDER = 'anthropic'; // 'openai' or 'anthropic'

// OpenAI Configuration
const OPENAI_ENDPOINT = 'ai2.adevdev.com';
const OPENAI_PATH = '/v1/chat/completions';
const OPENAI_MODEL = 'claude-sonnet-4.5';

// Anthropic Configuration
const ANTHROPIC_ENDPOINT = 'ai2.adevdev.com';
const ANTHROPIC_PATH = '/v1/messages';
const ANTHROPIC_MODEL = 'claude-sonnet-4.5'; // or 'claude-3-5-sonnet-20241022'
const ANTHROPIC_VERSION = '2023-06-01'; // Check docs for latest version
// ============================================

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

        if (!prompt) {
            return '*Usage:*\n' +
                   '`.ai <your question>`\n' +
                   'or reply to a message with `.ai`\n' +
                   'or reply to a message with `.ai <your comment>`';
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
            const response = await callAIAPIWithTools(prompt, userModel, API_KEY, message.room);

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
async function callAIAPIWithTools(prompt, model, apiKey, roomJid) {
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
    const systemPrompt = `You are a helpful AI assistant responding via WhatsApp.

IMPORTANT CONTEXT:
Current date: ${currentDate}
Current time: ${currentTime}

CRITICAL INSTRUCTIONS:
- Your training data has a knowledge cutoff date. The current date (${currentDate}) may be AFTER your training cutoff.
- For ANY query about current events, prices, holidays, schedules, news, weather, or time-sensitive information, you MUST use the web_search tool.
- For queries about "today", "this month", "this year", or specific future dates, ALWAYS use web_search first.
- Use the get_time tool if you need detailed timestamp information (unix time, ISO format, timezone, etc).
- When user asks for images/pictures/photos, ONLY use image_search tool. DO NOT use web_search for image requests.
- The image_search tool returns Pinterest image URLs - use it for any visual content request.
- Do NOT rely on your training data for time-sensitive information - always search the web first.

Format your responses for WhatsApp:
- Use *bold* for emphasis on important info
- Use _italic_ for less important details
- Use • for bullet points
- Keep responses concise and mobile-friendly
- Use emojis where appropriate (💰 for money, 📊 for stats, 📈 for trends, etc.)
- Break long text into short paragraphs
- Use line breaks for readability

Example good formatting:
*Bitcoin Price Today:* 💰

*$63,850 - $63,950 USD*

📈 24h Change: *+1.1% to +1.35%*

_Sources:_
• CoinMarketCap: $63,880
• CoinDesk: $63,899

Market cap: ~$1.28 trillion USD`;

    const messages = [
        {
            role: 'user',
            content: prompt
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

    // Tool calling loop (max 5 rounds to prevent infinite loops)
    let response = await callAIAPI(messages, tools, systemPrompt, model, apiKey);
    let iterations = 0;
    const MAX_ITERATIONS = 5;

    while (response.stop_reason === 'tool_use' && iterations < MAX_ITERATIONS) {
        iterations++;

        // Find ALL tool_use blocks in content
        const toolUses = response.content.filter(block => block.type === 'tool_use');

        if (toolUses.length === 0) break;

        // Execute all tools
        const toolResults = [];
        let imageSearchResult = null; // Track if image_search was used

        for (const toolUse of toolUses) {
            let toolResult;

            // Execute the appropriate tool
            if (toolUse.name === 'web_search') {
                console.log('[AI] Using web search:', toolUse.input.query);
                toolResult = await webSearch(toolUse.input.query);
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
                        await sock.sendMessage(roomJid, {
                            image: imageBuffer,
                            jpegThumbnail: thumbnail
                        });

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
            await sock.sendMessage(roomJid, {
                image: imageBuffer,
                jpegThumbnail: thumbnail,
                caption: finalText + `\n\n_Image from Pinterest_`
            });

            // Return null to prevent wachan from sending again
            return null;
        } catch (error) {
            console.error('[AI] Failed to download image:', error.message);
            // Fallback to text only
            return finalText + `\n\n_Image unavailable: ${error.message}_`;
        }
    }

    return finalText;
}

// Call AI API (supports OpenAI and Anthropic)
function callAIAPI(messages, tools, systemPrompt, model, apiKey) {
    return new Promise((resolve, reject) => {
        let endpoint, path, payload, headers;

        if (AI_PROVIDER === 'openai') {
            // OpenAI API format - system prompt as first message
            endpoint = OPENAI_ENDPOINT;
            path = OPENAI_PATH;

            // Add system message at the beginning
            const messagesWithSystem = [
                { role: 'system', content: systemPrompt },
                ...messages
            ];

            const payloadObj = {
                model: model, // Use dynamic model
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
        } else if (AI_PROVIDER === 'anthropic') {
            // Anthropic API format - system as separate field
            endpoint = ANTHROPIC_ENDPOINT;
            path = ANTHROPIC_PATH;

            const payloadObj = {
                model: model, // Use dynamic model
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
            reject(new Error(`Unsupported AI provider: ${AI_PROVIDER}`));
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

                    const parsed = JSON.parse(data);

                    // Return full response object for tool calling support
                    if (AI_PROVIDER === 'openai') {
                        if (parsed.choices && parsed.choices[0]) {
                            resolve({
                                content: [{ type: 'text', text: parsed.choices[0].message.content }],
                                stop_reason: parsed.choices[0].finish_reason
                            });
                        } else {
                            reject(new Error('Unexpected OpenAI API response format'));
                        }
                    } else if (AI_PROVIDER === 'anthropic') {
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
