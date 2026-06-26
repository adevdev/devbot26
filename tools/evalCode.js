/**
 * Eval Tool - Execute JavaScript code
 * SECURITY: Owner-only, runs in bot process context
 * Can access all bot internals - USE WITH EXTREME CAUTION
 */

module.exports = {
    // Tool definition for AI API
    definition: {
        name: 'eval_code',
        description: `Execute JavaScript code in the bot process context. Owner-only feature.

**Available variables:**
- context: { message, sender, group, room info }
- require(): Load any Node.js module or bot module

**Common bot modules:**
- require('wachan'): Main WhatsApp client (send messages, get user data, etc)
- require('./roomManager'): Room settings and permissions
- require('./whitelistManager'): AI whitelist management
- require('./settingsManager'): AI settings (models, defaults, etc)
- require('./commands'): Command registry
- require('./tools'): AI tools registry

**Useful patterns:**
- Get all rooms: await require('./roomManager').getAllRooms()
- Check whitelist: await require('./whitelistManager').getAll()
- Bot uptime: Math.floor(process.uptime()) + 's'
- Memory usage: process.memoryUsage()
- Send message: await require('wachan').sendMessage(jid, 'text')

Use "return" for values or console.log() for output. Supports async/await.`,
        input_schema: {
            type: 'object',
            properties: {
                code: {
                    type: 'string',
                    description: 'The JavaScript code to execute. Can be sync or async. Use "return" for return values or console.log for output.'
                }
            },
            required: ['code']
        }
    },

    // Metadata for UI/UX
    metadata: {
        icon: '⚡',
        progressMessage: (input) => `Executing JavaScript: \`${input.code.slice(0, 40)}${input.code.length > 40 ? '...' : ''}\``,
        resultType: 'text'
    },

    // Execution logic
    execute: async function(input, context) {
        const code = input.code;

        // SECURITY CHECK: Owner-only
        const OWNER_ID = process.env.OWNER_ID;
        if (!OWNER_ID) {
            return 'Error: OWNER_ID not configured. This tool is disabled for security.';
        }

        // Check if context has sender info
        if (!context || !context.message || !context.message.sender) {
            return 'Error: Unable to verify user identity. Execution blocked for security.';
        }

        const senderId = context.message.sender.id;
        if (senderId !== OWNER_ID) {
            return 'Error: This tool is owner-only. Execution blocked for security.';
        }

        // Validate code
        if (!code || typeof code !== 'string' || code.trim().length === 0) {
            return 'Error: Invalid code. Please provide valid JavaScript code.';
        }

        try {
            console.log(`[EvalCode] Owner ${senderId} executing JavaScript`);

            // Capture console output
            const logs = [];
            const originalLog = console.log;
            const originalError = console.error;
            const originalWarn = console.warn;

            console.log = (...args) => {
                logs.push(['LOG', args.map(a => String(a)).join(' ')]);
                originalLog(...args);
            };
            console.error = (...args) => {
                logs.push(['ERROR', args.map(a => String(a)).join(' ')]);
                originalError(...args);
            };
            console.warn = (...args) => {
                logs.push(['WARN', args.map(a => String(a)).join(' ')]);
                originalWarn(...args);
            };

            let result;
            let isAsync = false;

            try {
                // Wrap code in async function to support await
                const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
                const fn = new AsyncFunction('require', 'context', code);

                // Execute with timeout (10 seconds for eval)
                const timeoutPromise = new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Execution timeout (10s)')), 10000)
                );

                result = await Promise.race([
                    fn(require, context),
                    timeoutPromise
                ]);

                isAsync = true;
            } catch (asyncError) {
                // If async failed, try sync eval
                try {
                    result = eval(code);
                } catch (syncError) {
                    throw asyncError; // Prefer async error message
                }
            }

            // Restore console
            console.log = originalLog;
            console.error = originalError;
            console.warn = originalWarn;

            // Format output
            let output = '';

            // Add console logs if any
            if (logs.length > 0) {
                output += '**Console Output:**\n```\n';
                logs.forEach(([type, msg]) => {
                    output += `[${type}] ${msg}\n`;
                });
                output += '```\n\n';
            }

            // Add return value
            if (result !== undefined) {
                output += '**Return Value:**\n```js\n';

                // Format result
                if (typeof result === 'object' && result !== null) {
                    try {
                        output += JSON.stringify(result, null, 2);
                    } catch (e) {
                        output += String(result);
                    }
                } else {
                    output += String(result);
                }

                output += '\n```';
            }

            if (!output) {
                output = '✓ Code executed successfully (no output)';
            }

            // Truncate if too long
            if (output.length > 3500) {
                output = output.slice(0, 3500) + '\n\n... (output truncated)';
            }

            console.log(`[EvalCode] Execution completed successfully`);
            return output;

        } catch (error) {
            // Restore console in case of error
            console.log = console.log.bind(console);
            console.error = console.error.bind(console);
            console.warn = console.warn.bind(console);

            console.error('[EvalCode] Execution error:', error.message);

            // Format error output
            let errorOutput = '**Execution Error:**\n```js\n';
            errorOutput += error.stack || error.message;
            errorOutput += '\n```';

            // Truncate error if too long
            if (errorOutput.length > 3500) {
                errorOutput = errorOutput.slice(0, 3500) + '\n\n... (error truncated)';
            }

            return errorOutput;
        }
    }
};
