/**
 * Delete Contact Tool - Remove contact from contact manager
 * Self-contained modular tool
 */

module.exports = {
    // Tool definition for AI API
    definition: {
        name: 'delete_contact',
        description: 'Delete a saved contact from the contact manager. This permanently removes the contact from storage. Use this when user asks to delete, remove, or forget a contact. The contact JID must match exactly.',
        input_schema: {
            type: 'object',
            properties: {
                jid: {
                    type: 'string',
                    description: 'WhatsApp JID of the contact to delete (e.g., "6281234567890@s.whatsapp.net" for users or "120363012345678901@g.us" for groups). Must be the exact JID stored in the contact manager.'
                }
            },
            required: ['jid']
        }
    },

    // Metadata for UI/UX
    metadata: {
        icon: '🗑️',
        progressMessage: (input) => `Deleting contact: _${input.jid}_`,
        resultType: 'text'
    },

    // Execution logic
    execute: async function(input) {
        const { jid } = input;

        try {
            const contactManager = require('../contactManager');

            console.log(`[DeleteContact] Attempting to delete contact - jid="${jid}"`);

            // Check if contact exists before deleting
            const existing = await contactManager.getContact(jid);
            if (!existing) {
                return JSON.stringify({
                    success: false,
                    error: 'Contact not found',
                    message: 'No contact with this JID exists in the contact manager.',
                    jid: jid
                });
            }

            // Store contact info before deletion for response
            const contactInfo = {
                name: existing.name,
                jid: existing.jid,
                type: existing.type
            };

            // Delete the contact
            await contactManager.removeContact(jid);

            const result = {
                success: true,
                message: 'Contact deleted successfully',
                data: contactInfo
            };

            console.log(`[DeleteContact] Successfully deleted: ${contactInfo.name} (${jid})`);

            return JSON.stringify(result);

        } catch (error) {
            console.error('[DeleteContact] Error:', error.message);

            return JSON.stringify({
                success: false,
                error: error.message,
                jid: jid
            });
        }
    }
};
