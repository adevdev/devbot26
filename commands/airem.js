const whitelistManager = require('../whitelistManager');

// Helper to extract mentions from baileys message
function getMentions(message) {
    const baileys = message.toBaileys();
    const mentionedJid = baileys?.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
    return mentionedJid;
}

module.exports = {
    response: async (context, next) => {
        const { message, command } = context;

        // Owner-only check
        const OWNER_ID = process.env.OWNER_ID;
        if (!OWNER_ID) {
            return '*Error:* OWNER_ID not configured.';
        }

        if (message.sender.id !== OWNER_ID) {
            return;
        }

        // Extract mentions from baileys message
        const mentions = getMentions(message);

        if (mentions.length === 0) {
            return '*Usage:* `.airem @mention`\n\nRemove a user from AI whitelist.';
        }

        // Get first mentioned number
        const targetNumber = mentions[0];

        // Remove from whitelist
        try {
            const existed = await whitelistManager.removeNumber(targetNumber);
            const displayNumber = '@' + targetNumber.split('@')[0];

            if (existed) {
                console.log(`[AIREM] Removed ${targetNumber}`);
                return {
                    text: `❌ *Removed from AI Whitelist*\n\nNumber: ${displayNumber}`,
                    mentions: [targetNumber]
                };
            } else {
                return `*Not found:* ${displayNumber} is not in whitelist.`;
            }
        } catch (error) {
            console.error('[AIREM] Error:', error.message);
            return `*Error:* ${error.message}`;
        }
    },
    options: {
        description: 'Remove number from AI whitelist (owner only)',
        sectionName: 'Owner',
        ownerOnly: true,
        hidden: true
    }
};
