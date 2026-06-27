/**
 * Contact Command - List saved contacts
 * Available to all users
 */

const contactManager = require('../contactManager');

module.exports = {
    response: async (context, next) => {
        const { message, command } = context;

        try {
            const contacts = await contactManager.getAllContacts();

            if (contacts.length === 0) {
                return `*📇 Saved Contacts*\n\nNo contacts saved yet.\n\n` +
                       `Owner can add contacts using:\n` +
                       `${command.prefix}contactadd @user`;
            }

            // Build text list similar to ailist
            const textLines = [`*📇 Saved Contacts* (${contacts.length} total)\n`];

            for (let i = 0; i < contacts.length; i++) {
                const contact = contacts[i];
                const typeIcon = contact.type === 'user' ? '👤' : '👥';
                const identifier = contact.jid.split('@')[0]; // Get number/group ID part

                textLines.push(`${i + 1}. ${typeIcon} ${contact.name} (${identifier})`);
            }

            return textLines.join('\n');

        } catch (error) {
            console.error('[Contact] Error:', error);
            return `*Error:* ${error.message}`;
        }
    },
    options: {
        aliases: ['contacts', 'contactlist'],
        description: 'List saved contacts',
        sectionName: 'Tools'
    }
};
