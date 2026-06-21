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

        // Remove all mentions from whitelist
        const removed = [];
        const notFound = [];

        for (const targetNumber of mentions) {
            try {
                const existed = await whitelistManager.removeNumber(targetNumber);
                const displayNumber = '@' + targetNumber.split('@')[0];

                if (existed) {
                    removed.push({ display: displayNumber, jid: targetNumber });
                    console.log(`[AIREM] Removed ${targetNumber}`);
                } else {
                    notFound.push(displayNumber);
                }
            } catch (error) {
                console.error(`[AIREM] Failed to remove ${targetNumber}:`, error.message);
                notFound.push('@' + targetNumber.split('@')[0]);
            }
        }

        if (removed.length === 0) {
            return '*Error:* No numbers were removed (not found in whitelist).';
        }

        const numberList = removed.map(u => u.display).join('\n');
        const mentionList = removed.map(u => u.jid);

        return {
            text: `❌ *Removed from AI Whitelist*\n\n${numberList}`,
            mentions: mentionList
        };
    },
    options: {
        description: 'Remove number from AI whitelist (owner only)',
        sectionName: 'Owner',
        ownerOnly: true,
        hidden: true
    }
};
