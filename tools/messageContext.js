/**
 * Message Context Tool - Get current conversation context from wachan
 * Self-contained modular tool
 */

module.exports = {
    // Tool definition for AI API
    definition: {
        name: 'get_message_context',
        description: 'Get information about the current conversation context including sender details, room type (group/private), quoted message info, and media presence. Use this when you need to understand who you are talking to, what group you are in, or details about the current message thread.',
        input_schema: {
            type: 'object',
            properties: {
                info_type: {
                    type: 'string',
                    description: 'Type of context info needed. Options: "sender" (who sent message), "room" (chat/group info), "quoted" (info about quoted/replied message), "all" (everything)',
                    enum: ['sender', 'room', 'quoted', 'all']
                }
            },
            required: ['info_type']
        }
    },

    // Metadata for UI/UX
    metadata: {
        icon: '💬',
        progressMessage: (input) => `Getting conversation context...`,
        resultType: 'text'
    },

    // Execution logic
    // NOTE: This tool needs access to the current message context
    // It should be called with the message object passed from ai.js
    execute: async function(input, context = null) {
        const { info_type } = input;

        try {
            // Context should be passed from ai.js during tool execution
            if (!context || !context.message) {
                return JSON.stringify({
                    success: false,
                    error: 'Message context not available. This tool requires active conversation context.'
                });
            }

            const message = context.message;
            const wachan = require('wachan');

            console.log(`[MessageContext] Getting ${info_type} info`);

            const result = {
                success: true,
                data: {}
            };

            // Get sender info
            if (info_type === 'sender' || info_type === 'all') {
                const senderId = message.sender.id;
                let senderName = message.sender.name || 'Unknown';

                try {
                    const userData = await wachan.getUserData(senderId);
                    if (userData && userData.pushName) {
                        senderName = userData.pushName;
                    }
                } catch (e) {
                    // Use fallback
                }

                result.data.sender = {
                    id: senderId,
                    name: senderName,
                    lid: message.sender.lid || null,
                    isMe: message.sender.isMe || false
                };
            }

            // Get room info
            if (info_type === 'room' || info_type === 'all') {
                const isGroup = message.room.includes('@g.us');

                result.data.room = {
                    id: message.room,
                    type: isGroup ? 'group' : 'private',
                    isGroup: isGroup
                };

                // If it's a group, get group metadata
                if (isGroup) {
                    try {
                        const sock = wachan.getSocket();
                        if (sock) {
                            const groupMeta = await sock.groupMetadata(message.room);
                            if (groupMeta) {
                                result.data.room.name = groupMeta.subject || 'Unknown Group';
                                result.data.room.participantsCount = groupMeta.participants?.length || 0;
                            }
                        }
                    } catch (e) {
                        console.error('[MessageContext] Could not get group metadata:', e.message);
                    }
                }
            }

            // Get quoted message info
            if (info_type === 'quoted' || info_type === 'all') {
                try {
                    const quotedMsg = await message.getQuoted();

                    if (quotedMsg) {
                        result.data.quoted = {
                            exists: true,
                            text: quotedMsg.text || null,
                            senderId: quotedMsg.sender?.id || null,
                            senderName: quotedMsg.sender?.name || 'Unknown',
                            hasMedia: quotedMsg.isMedia || false,
                            mediaType: quotedMsg.type || null
                        };
                    } else {
                        result.data.quoted = {
                            exists: false
                        };
                    }
                } catch (e) {
                    result.data.quoted = {
                        exists: false,
                        error: 'Could not fetch quoted message'
                    };
                }
            }

            // Additional message info (always included)
            result.data.message = {
                hasMedia: message.isMedia || false,
                mediaType: message.type || 'text',
                timestamp: message.timestamp || Date.now()
            };

            console.log(`[MessageContext] Context retrieved successfully`);

            return JSON.stringify(result);

        } catch (error) {
            console.error('[MessageContext] Error:', error.message);

            return JSON.stringify({
                success: false,
                error: error.message
            });
        }
    }
};
