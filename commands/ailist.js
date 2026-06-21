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
            const bot = require('wachan');
            const whitelist = await whitelistManager.getAll();

            if (whitelist.length === 0) {
                return '*AI Whitelist*\n\nNo whitelisted users yet.';
            }

            // Build text with mentions
            const textLines = [`*AI Whitelist* (${whitelist.length} users)\n`];
            const mentionedJids = [];

            for (let i = 0; i < whitelist.length; i++) {
                const user = whitelist[i];

                // If it's a JID (s.whatsapp.net), try to get LID via getUserData
                if (user.number.includes('@s.whatsapp.net')) {
                    try {
                        const userData = await bot.getUserData(user.number);
                        if (userData && userData.lid) {
                            // Use LID number for both display and mention
                            const lidNumber = userData.lid.split('@')[0];
                            textLines.push(`${i + 1}. @${lidNumber}`);
                            mentionedJids.push(userData.lid);
                        } else {
                            // No LID available, show plain phone number
                            const phoneNumber = user.number.split('@')[0];
                            textLines.push(`${i + 1}. ${phoneNumber}`);
                        }
                    } catch (err) {
                        // getUserData failed, show plain phone number
                        const phoneNumber = user.number.split('@')[0];
                        textLines.push(`${i + 1}. ${phoneNumber}`);
                    }
                } else if (user.number.includes('@lid')) {
                    // Already LID format, use directly
                    const lidNumber = user.number.split('@')[0];
                    textLines.push(`${i + 1}. @${lidNumber}`);
                    mentionedJids.push(user.number);
                } else {
                    // Unknown format, show plain
                    const numberPart = user.number.split('@')[0];
                    textLines.push(`${i + 1}. ${numberPart}`);
                }
            }

            // Return with proper mentions metadata
            return {
                text: textLines.join('\n'),
                mentions: mentionedJids
            };
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
