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

        // Check whitelist
        const isWhitelisted = await whitelistManager.isWhitelisted(message.sender.id);

        if (!isWhitelisted) {
            return '*Access denied.* AI command is only available for whitelisted users.';
        }

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
        const stopTyping = startContinuousTyping(message.room);

        try {
            // Call AI API
            const response = await callAIAPI(prompt, API_KEY);

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

// Call AI API (supports OpenAI and Anthropic)
function callAIAPI(prompt, apiKey) {
    return new Promise((resolve, reject) => {
        let endpoint, path, payload, headers;

        if (AI_PROVIDER === 'openai') {
            // OpenAI API format
            endpoint = OPENAI_ENDPOINT;
            path = OPENAI_PATH;
            payload = JSON.stringify({
                model: OPENAI_MODEL,
                messages: [
                    {
                        role: 'user',
                        content: prompt
                    }
                ]
            });
            headers = {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
                'Content-Length': Buffer.byteLength(payload)
            };
        } else if (AI_PROVIDER === 'anthropic') {
            // Anthropic API format
            endpoint = ANTHROPIC_ENDPOINT;
            path = ANTHROPIC_PATH;
            payload = JSON.stringify({
                model: ANTHROPIC_MODEL,
                max_tokens: 1024,
                messages: [
                    {
                        role: 'user',
                        content: prompt
                    }
                ]
            });
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

                    // Extract response based on provider
                    if (AI_PROVIDER === 'openai') {
                        if (parsed.choices && parsed.choices[0] && parsed.choices[0].message) {
                            resolve(parsed.choices[0].message.content.trim());
                        } else {
                            reject(new Error('Unexpected OpenAI API response format'));
                        }
                    } else if (AI_PROVIDER === 'anthropic') {
                        if (parsed.content && parsed.content[0] && parsed.content[0].text) {
                            resolve(parsed.content[0].text.trim());
                        } else {
                            reject(new Error('Unexpected Anthropic API response format'));
                        }
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
        req.setTimeout(30000, () => {
            req.destroy();
            reject(new Error('API request timeout (30s)'));
        });

        req.write(payload);
        req.end();
    });
}
