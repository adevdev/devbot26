/**
 * Wait for Reply Tool
 * Wait for user to reply to the conversation
 * Useful for multi-step interactive conversations
 */

module.exports = {
    // Tool definition (sent to AI)
    definition: {
        name: 'wait_reply',
        description: 'Wait for user to send a reply message in interactive conversations. **IMPORTANT: Use this tool when you need to ask a question and REQUIRE the user\'s answer before continuing.** This tool handles BOTH sending your prompt message AND waiting for the reply in one step - do NOT use send_message separately before this tool. Perfect for: asking questions that need answers, confirmations (yes/no), multi-step forms, collecting user information, getting user choices. Supports cross-chat scenarios where you can wait for replies from different users/groups than the current conversation.',
        input_schema: {
            type: 'object',
            properties: {
                prompt: {
                    type: 'string',
                    description: 'Optional message to send before waiting for reply. Use this to ask a question or request specific information. The message will be sent to the targetJid if specified, otherwise to the current chat.'
                },
                targetJid: {
                    type: 'string',
                    description: 'Optional JID (WhatsApp ID) of the user or group to wait for reply from. Format: "6289xxx@s.whatsapp.net" for users or "123xxx@g.us" for groups. If not provided, waits for reply from the user who triggered this conversation.'
                },
                timeout: {
                    type: 'number',
                    description: 'Maximum time to wait for reply in seconds (1-300). Default is 60 seconds. The tool will return a timeout error if user doesn\'t reply within this time.',
                    minimum: 1,
                    maximum: 300
                }
            },
            required: []
        }
    },

    // Metadata for UI/UX
    metadata: {
        icon: '⏳',
        progressMessage: (input) => input.prompt ? `Asking: "${input.prompt}"` : 'Waiting for user reply...'
    },

    // Execution logic
    execute: async function(input, context) {
        const { prompt, targetJid, timeout = 60 } = input;

        try {
            // Determine who to wait for reply from
            let waitFromJid;

            if (targetJid) {
                // Use specified target JID
                waitFromJid = targetJid;
                console.log(`[WaitReply] Using specified target: ${targetJid}`);
            } else {
                // Fallback to sender who triggered the conversation
                waitFromJid = context?.message?.sender?.id || context?.message?.from;
                if (!waitFromJid) {
                    return JSON.stringify({
                        error: 'Cannot determine sender JID from context and no targetJid provided'
                    });
                }
                console.log(`[WaitReply] Using sender from context: ${waitFromJid}`);
            }

            // Get wachan instance
            const wachan = require('wachan');

            console.log(`[WaitReply] Starting wait for reply from ${waitFromJid} (timeout: ${timeout}s)`);

            const timeoutMs = timeout * 1000;

            // IMPORTANT: Start waiting FIRST (listener registers immediately in Promise constructor)
            // This prevents race condition where user replies before listener is ready
            const replyPromise = waitForUserReply(waitFromJid, timeoutMs, wachan);

            // Now send prompt message if provided (listener is already active)
            if (prompt) {
                await wachan.sendMessage(waitFromJid, { text: prompt });
                console.log(`[WaitReply] Sent prompt to ${waitFromJid}: ${prompt}`);
            }

            // Wait for the reply
            const reply = await replyPromise;

            console.log(`[WaitReply] Received reply from ${waitFromJid}`);

            return JSON.stringify({
                success: true,
                from: waitFromJid,
                reply: {
                    text: reply.text || null,
                    hasMedia: !!reply.media,
                    mediaType: reply.media?.type || null,
                    timestamp: reply.timestamp
                }
            });

        } catch (error) {
            if (error.message === 'TIMEOUT') {
                console.log('[WaitReply] Timeout waiting for user reply');
                return JSON.stringify({
                    error: 'Timeout: User did not reply within the specified time',
                    timeout: timeout
                });
            }

            console.error('[WaitReply] Error:', error.message);
            return JSON.stringify({
                error: error.message
            });
        }
    }
};

// Wait for message from specific sender (internal implementation)
function waitForUserReply(senderJid, timeoutMs, wachan) {
    return new Promise((resolve, reject) => {
        let timeoutHandle;
        let receiver;

        // Get dashboard instance to register active wait session
        let dashboard = null;
        try {
            // Access dashboard from index.js global scope via require cache
            const indexModule = require.cache[require.resolve('../index.js')];
            if (indexModule && indexModule.exports && indexModule.exports.dashboard) {
                dashboard = indexModule.exports.dashboard;
            }
        } catch (e) {
            console.warn('[WaitReply] Could not access dashboard for session tracking');
        }

        // Register this sender as having an active wait session
        if (dashboard && dashboard.activeWaitSessions) {
            dashboard.activeWaitSessions.add(senderJid);
            console.log(`[WaitReply] Registered wait session for ${senderJid}`);
        }

        // Cleanup function
        const cleanup = () => {
            if (timeoutHandle) clearTimeout(timeoutHandle);
            if (receiver && typeof receiver.remove === 'function') {
                receiver.remove();
            }
            // Remove from active sessions
            if (dashboard && dashboard.activeWaitSessions) {
                dashboard.activeWaitSessions.delete(senderJid);
                console.log(`[WaitReply] Unregistered wait session for ${senderJid}`);
            }
        };

        // Set timeout
        timeoutHandle = setTimeout(() => {
            cleanup();
            reject(new Error('TIMEOUT'));
        }, timeoutMs);

        // Register message listener
        receiver = wachan.onReceive(wachan.messageType.any, async (context, next) => {
            const { message } = context;

            // Check if message is from target sender
            if (message.sender?.id === senderJid || message.from === senderJid) {
                cleanup();
                resolve({
                    text: message.text || null,
                    media: message.media || null,
                    timestamp: new Date().toISOString()
                });
                return; // Don't call next - we consumed this
            }

            next(); // Pass to other handlers
        });
    });
}
