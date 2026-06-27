/**
 * Save Contact Tool - Add contact to contact manager
 * Self-contained modular tool
 */

module.exports = {
    // Tool definition for AI API
    definition: {
        name: 'save_contact',
        description: 'Save a contact (user or group) to the contact manager. This stores the contact for future reference and makes it available to other AI tools. Use this when user asks to save, add, or remember a contact. The contact will be permanently stored.',
        input_schema: {
            type: 'object',
            properties: {
                jid: {
                    type: 'string',
                    description: 'WhatsApp JID of the contact (e.g., "6281234567890@s.whatsapp.net" for users or "120363012345678901@g.us" for groups). Can also be a LID which will be automatically converted.'
                },
                name: {
                    type: 'string',
                    description: 'Optional: Display name for the contact. If not provided, will be automatically fetched from WhatsApp.'
                },
                type: {
                    type: 'string',
                    enum: ['user', 'group'],
                    description: 'Optional: Contact type. If not provided, will be automatically detected from JID format.'
                }
            },
            required: ['jid']
        }
    },

    // Metadata for UI/UX
    metadata: {
        icon: '💾',
        progressMessage: (input) => `Saving contact: _${input.name || input.jid}_`,
        resultType: 'text'
    },

    // Execution logic
    execute: async function(input) {
        let { jid, name, type } = input;

        try {
            const contactManager = require('../contactManager');
            const wachan = require('wachan');

            console.log(`[SaveContact] Saving contact - jid="${jid}", name="${name || 'auto'}", type="${type || 'auto'}"`);

            // Handle LID conversion
            if (jid.includes('@lid')) {
                try {
                    const userData = await wachan.getUserData(jid);
                    const actualJid = userData.id;
                    console.log(`[SaveContact] Converted LID ${jid} to JID ${actualJid}`);
                    jid = actualJid;
                } catch (e) {
                    console.error('[SaveContact] Failed to convert LID:', e);
                    return JSON.stringify({
                        success: false,
                        error: 'Failed to convert LID to JID. User may not be accessible.'
                    });
                }
            }

            // Auto-detect type if not provided
            if (!type) {
                if (jid.includes('@g.us')) {
                    type = 'group';
                } else if (jid.includes('@s.whatsapp.net')) {
                    type = 'user';
                } else {
                    return JSON.stringify({
                        success: false,
                        error: 'Invalid JID format. Must be a valid WhatsApp JID.'
                    });
                }
            }

            // Check if contact already exists
            const existing = await contactManager.getContact(jid);
            if (existing) {
                return JSON.stringify({
                    success: false,
                    error: 'Contact already exists',
                    data: {
                        name: existing.name,
                        jid: existing.jid,
                        type: existing.type,
                        addedAt: existing.addedAt
                    }
                });
            }

            // Auto-fetch name if not provided
            if (!name) {
                try {
                    if (type === 'group') {
                        const sock = wachan.getSocket();
                        const groupMetadata = await sock.groupMetadata(jid);
                        name = groupMetadata.subject || jid.split('@')[0];
                    } else {
                        const userData = await wachan.getUserData(jid);
                        name = userData?.pushName || userData?.notify || jid.split('@')[0];
                    }
                } catch (e) {
                    console.warn('[SaveContact] Failed to fetch name, using JID:', e.message);
                    name = jid.split('@')[0];
                }
            }

            // Save contact (addedBy will be 'ai' since we don't have message context)
            await contactManager.addContact(jid, name, type, 'ai');

            const result = {
                success: true,
                message: 'Contact saved successfully',
                data: {
                    name: name,
                    jid: jid,
                    type: type
                }
            };

            console.log(`[SaveContact] Successfully saved: ${name} (${jid})`);

            return JSON.stringify(result);

        } catch (error) {
            console.error('[SaveContact] Error:', error.message);

            return JSON.stringify({
                success: false,
                error: error.message,
                jid: jid
            });
        }
    }
};
