/**
 * User Info Tool - Get WhatsApp user information via wachan
 * Self-contained modular tool
 */

module.exports = {
    // Tool definition for AI API
    definition: {
        name: 'get_user_info',
        description: 'Get WhatsApp user information including profile name, phone number, and WhatsApp ID. Use this when user asks about someone\'s contact info, profile, or WhatsApp details. Requires a phone number or WhatsApp JID.',
        input_schema: {
            type: 'object',
            properties: {
                identifier: {
                    type: 'string',
                    description: 'Phone number (e.g., "6281234567890") or WhatsApp JID (e.g., "6281234567890@s.whatsapp.net"). Can be from conversation context or user-provided number.'
                }
            },
            required: ['identifier']
        }
    },

    // Metadata for UI/UX
    metadata: {
        icon: '👤',
        progressMessage: (input) => `Getting user info for _${input.identifier}_`,
        resultType: 'text'
    },

    // Execution logic
    execute: async function(input) {
        const { identifier } = input;

        try {
            const wachan = require('wachan');

            // Normalize identifier to JID format
            let jid = identifier;

            // If it's just a number without @, add @s.whatsapp.net
            if (!jid.includes('@')) {
                // Remove any non-digits
                const cleaned = jid.replace(/\D/g, '');
                jid = `${cleaned}@s.whatsapp.net`;
            }

            console.log(`[UserInfo] Fetching data for: ${jid}`);

            // Get user data from wachan
            const userData = await wachan.getUserData(jid);

            if (!userData) {
                return JSON.stringify({
                    success: false,
                    error: 'User not found or not in contact list',
                    identifier: identifier
                });
            }

            // Extract available information
            const result = {
                success: true,
                data: {
                    pushName: userData.pushName || 'Unknown',
                    jid: userData.id || jid,
                    lid: userData.lid || null,
                    name: userData.name || userData.pushName || 'Unknown',
                    // Additional fields if available
                    notify: userData.notify || null,
                    verifiedName: userData.verifiedName || null,
                    status: userData.status || null,
                    imgUrl: userData.imgUrl || null
                }
            };

            console.log(`[UserInfo] Found: ${result.data.pushName} (${result.data.jid})`);

            return JSON.stringify(result);

        } catch (error) {
            console.error('[UserInfo] Error:', error.message);

            return JSON.stringify({
                success: false,
                error: error.message,
                identifier: identifier
            });
        }
    }
};
