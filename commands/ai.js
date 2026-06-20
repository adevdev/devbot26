const whitelistManager = require('../whitelistManager');
const { startContinuousTyping } = require('../utils/typing');
const https = require('https');

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
        if (!command.skipWhitelistCheck) {
            const isWhitelisted = await whitelistManager.isWhitelisted(message.sender.id);

            if (!isWhitelisted) {
                return '*Access denied.* AI command is only available for whitelisted users.';
            }
        }

        // Get user's assigned model
        const userModel = await whitelistManager.getModel(message.sender.id);
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
            const response = await callAIAPIWithTools(prompt, userModel, API_KEY);

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

// Call AI API with tool support (multi-turn)
async function callAIAPIWithTools(prompt, model, apiKey) {
    // System prompt for WhatsApp formatting
    const systemPrompt = `You are a helpful AI assistant responding via WhatsApp.

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

    // Define web search tool
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
        }
    ];

    // First API call with tools
    let response = await callAIAPI(messages, tools, systemPrompt, model, apiKey);

    // Check if AI wants to use a tool
    if (response.stop_reason === 'tool_use') {
        // Find tool_use in content
        const toolUse = response.content.find(block => block.type === 'tool_use');

        if (toolUse && toolUse.name === 'web_search') {
            console.log('[AI] Using web search:', toolUse.input.query);

            // Execute search
            const searchResults = await webSearch(toolUse.input.query);

            // Add assistant message with tool use
            messages.push({
                role: 'assistant',
                content: response.content
            });

            // Add tool result
            messages.push({
                role: 'user',
                content: [
                    {
                        type: 'tool_result',
                        tool_use_id: toolUse.id,
                        content: searchResults
                    }
                ]
            });

            // Second API call with tool results
            response = await callAIAPI(messages, tools, systemPrompt, model, apiKey);
        }
    }

    // Extract final text response
    const textContent = response.content.find(block => block.type === 'text');
    return textContent ? textContent.text.trim() : 'No response generated.';
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
