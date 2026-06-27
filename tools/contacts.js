/**
 * Contacts Tool - Get saved contacts from contact manager
 * Self-contained modular tool
 */

module.exports = {
    // Tool definition for AI API
    definition: {
        name: 'get_contacts',
        description: 'Get saved contacts from the contact manager. Returns a list of saved users and groups with their names, JIDs, and types. Use this when user asks about saved contacts, contact list, or needs to lookup a contact\'s WhatsApp ID. Can optionally filter by name or type (user/group).',
        input_schema: {
            type: 'object',
            properties: {
                name: {
                    type: 'string',
                    description: 'Optional: Filter contacts by name (partial match, case-insensitive). Leave empty to get all contacts.'
                },
                type: {
                    type: 'string',
                    enum: ['user', 'group'],
                    description: 'Optional: Filter by contact type - "user" for individual contacts or "group" for group contacts. Leave empty to get all types.'
                }
            },
            required: []
        }
    },

    // Metadata for UI/UX
    metadata: {
        icon: '📇',
        progressMessage: (input) => {
            if (input.name) {
                return `Searching contacts for: _${input.name}_`;
            } else if (input.type) {
                return `Getting ${input.type} contacts...`;
            }
            return `Getting saved contacts...`;
        },
        resultType: 'text'
    },

    // Execution logic
    execute: async function(input) {
        const { name, type } = input;

        try {
            const contactManager = require('../contactManager');

            console.log(`[Contacts] Fetching contacts - filter: name="${name || 'none'}", type="${type || 'none'}"`);

            // Get all contacts
            let contacts = await contactManager.getAllContacts();

            if (!contacts || contacts.length === 0) {
                return JSON.stringify({
                    success: true,
                    data: {
                        contacts: [],
                        count: 0,
                        message: 'No contacts saved yet. Contacts can be added using .contactadd command (owner-only).'
                    }
                });
            }

            // Filter by type if specified
            if (type) {
                contacts = contacts.filter(c => c.type === type);
            }

            // Filter by name if specified
            if (name) {
                const searchTerm = name.toLowerCase();
                contacts = contacts.filter(c =>
                    c.name.toLowerCase().includes(searchTerm)
                );
            }

            // Format contacts for response
            const formattedContacts = contacts.map(contact => ({
                name: contact.name,
                jid: contact.jid,
                type: contact.type,
                addedAt: contact.addedAt,
                addedBy: contact.addedBy || 'unknown'
            }));

            const result = {
                success: true,
                data: {
                    contacts: formattedContacts,
                    count: formattedContacts.length,
                    filters: {
                        name: name || null,
                        type: type || null
                    }
                }
            };

            console.log(`[Contacts] Found ${formattedContacts.length} contact(s)`);

            return JSON.stringify(result);

        } catch (error) {
            console.error('[Contacts] Error:', error.message);

            return JSON.stringify({
                success: false,
                error: error.message,
                filters: {
                    name: name || null,
                    type: type || null
                }
            });
        }
    }
};
