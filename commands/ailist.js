const whitelistManager = require('../whitelistManager');

module.exports = {
    response: async (context, next) => {
        const { message } = context;

        // Owner-only check
        const OWNER_ID = process.env.OWNER_ID;
        if (!OWNER_ID) {
            return '*Error:* OWNER_ID not configured.';
        }

        if (message.sender.id !== OWNER_ID) {
            return;
        }

        try {
            const whitelist = await whitelistManager.getAll();

            if (whitelist.length === 0) {
                return '*AI Whitelist*\n\nNo whitelisted users yet.';
            }

            // Build text without mentions
            const textLines = [`*AI Whitelist* (${whitelist.length} users)\n`];

            for (let i = 0; i < whitelist.length; i++) {
                const user = whitelist[i];
                const jidNumber = user.jid.split('@')[0];
                const pushName = user.pushName || 'Unknown';

                textLines.push(`${i + 1}. ${pushName} (${jidNumber})`);
            }

            return textLines.join('\n');
        } catch (error) {
            console.error('[AILIST] Error:', error.message);
            return `*Error:* ${error.message}`;
        }
    },
    options: {
        description: 'List whitelisted AI users (owner only)',
        sectionName: 'Owner',
        ownerOnly: true,
        hidden: true
    }
};
