/**
 * Send Message Tool - Send WhatsApp messages via wachan
 * Self-contained modular tool
 */

module.exports = {
    // Tool definition for AI API
    definition: {
        name: 'send_message',
        description: 'Send a WhatsApp message to a user or group using the bot. Use this when user asks to send a message, notify someone, or deliver information to a specific contact. Supports text messages with optional message quoting (reply). The bot must have access to send messages to the target.',
        input_schema: {
            type: 'object',
            properties: {
                targetId: {
                    type: 'string',
                    description: 'WhatsApp JID of the recipient (e.g., "6281234567890@s.whatsapp.net" for users or "120363012345678901@g.us" for groups). Can also be a phone number which will be converted to JID format.'
                },
                text: {
                    type: 'string',
                    description: 'The text message content to send. Can include markdown formatting and emojis.'
                },
                quotedMessageId: {
                    type: 'string',
                    description: 'Optional: Message ID to quote/reply to. If provided, the sent message will appear as a reply to that message.'
                }
            },
            required: ['targetId', 'text']
        }
    },

    // Metadata for UI/UX
    metadata: {
        icon: '📤',
        progressMessage: (input) => `Sending message to _${input.targetId}_`,
        resultType: 'text'
    },

    // Execution logic
    execute: async function(input) {
        let { targetId, text, quotedMessageId } = input;

        try {
            const wachan = require('wachan');

            console.log(`[SendMessage] Preparing to send message to: ${targetId}`);

            // Normalize targetId to JID format
            if (!targetId.includes('@')) {
                // If it's just a number, assume it's a phone number for a user
                const cleaned = targetId.replace(/\D/g, '');
                targetId = `${cleaned}@s.whatsapp.net`;
                console.log(`[SendMessage] Normalized to JID: ${targetId}`);
            }

            // Handle LID conversion if needed
            if (targetId.includes('@lid')) {
                try {
                    const userData = await wachan.getUserData(targetId);
                    const actualJid = userData.id;
                    console.log(`[SendMessage] Converted LID ${targetId} to JID ${actualJid}`);
                    targetId = actualJid;
                } catch (e) {
                    console.error('[SendMessage] Failed to convert LID:', e);
                    return JSON.stringify({
                        success: false,
                        error: 'Failed to convert LID to JID. Recipient may not be accessible.'
                    });
                }
            }

            // Validate text
            if (!text || text.trim().length === 0) {
                return JSON.stringify({
                    success: false,
                    error: 'Message text cannot be empty'
                });
            }

            // Prepare message options
            const messageOptions = {
                text: text.trim()
            };

            // Add quoted message if provided
            if (quotedMessageId) {
                messageOptions.quoted = {
                    key: {
                        id: quotedMessageId
                    }
                };
                console.log(`[SendMessage] Quoting message: ${quotedMessageId}`);
            }

            // Send the message
            console.log(`[SendMessage] Sending to ${targetId}: ${text.substring(0, 50)}${text.length > 50 ? '...' : ''}`);

            const sentMessage = await wachan.sendMessage(targetId, messageOptions);

            const result = {
                success: true,
                message: 'Message sent successfully',
                data: {
                    targetId: targetId,
                    messageId: sentMessage?.key?.id || 'unknown',
                    timestamp: Date.now(),
                    textLength: text.length,
                    quoted: !!quotedMessageId
                }
            };

            console.log(`[SendMessage] Successfully sent message. ID: ${result.data.messageId}`);

            return JSON.stringify(result);

        } catch (error) {
            console.error('[SendMessage] Error:', error.message);

            return JSON.stringify({
                success: false,
                error: error.message,
                targetId: targetId
            });
        }
    }
};
