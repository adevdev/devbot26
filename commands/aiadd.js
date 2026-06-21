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
            // Silent ignore for non-owner
            return;
        }

        // Extract mentions from baileys message
        const mentions = getMentions(message);

        if (mentions.length === 0) {
            return '*Usage:* `.aiadd @mention [model]`\n\n' +
                   'Models:\n' +
                   '• `claude` - Claude Sonnet 4.5\n' +
                   '• `qwen` or empty - Qwen3 Coder Next (default)\n\n' +
                   'Example: `.aiadd @6281234567890 claude`';
        }

        // Parse model parameter (last non-@ param)
        let modelParam = '';
        const nonMentionParams = command.parameters.filter(p => !p.startsWith('@'));
        if (nonMentionParams.length > 0) {
            modelParam = nonMentionParams[nonMentionParams.length - 1].toLowerCase();
        }

        let model;
        if (modelParam === 'claude') {
            model = 'claude-sonnet-4.5';
        } else if (modelParam === 'qwen' || modelParam === '') {
            model = 'qwen3-coder-next';
        } else {
            return '*Error:* Invalid model. Use `claude` or `qwen` (default).';
        }

        // Add all mentions to whitelist
        const added = [];
        const errors = [];

        for (const targetNumber of mentions) {
            try {
                const normalized = await whitelistManager.addNumber(targetNumber, model);
                const displayNumber = '@' + normalized.split('@')[0];
                added.push({ display: displayNumber, jid: normalized });
                console.log(`[AIADD] Added ${normalized} with model ${model}`);
            } catch (error) {
                console.error(`[AIADD] Failed to add ${targetNumber}:`, error.message);
                errors.push(targetNumber);
            }
        }

        if (added.length === 0) {
            return '*Error:* Failed to add all numbers.';
        }

        const numberList = added.map(u => u.display).join('\n');
        const mentionList = added.map(u => u.jid);

        return {
            text: `✅ *Added to AI Whitelist*\n\n${numberList}`,
            mentions: mentionList
        };
    },
    options: {
        description: 'Add number to AI whitelist (owner only)',
        sectionName: 'Owner',
        ownerOnly: true,
        hidden: true // Don't show in help menu
    }
};
