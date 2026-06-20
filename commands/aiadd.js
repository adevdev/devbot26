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

        // Get first mentioned number
        const targetNumber = mentions[0];

        // Parse model parameter (skip first param if it starts with @)
        let modelParam = '';
        if (command.parameters.length > 0) {
            const firstParam = command.parameters[0];
            // If first param starts with @, check second param for model
            if (firstParam.startsWith('@')) {
                modelParam = command.parameters.length > 1 ? command.parameters[1].toLowerCase() : '';
            } else {
                modelParam = firstParam.toLowerCase();
            }
        }

        let model;
        if (modelParam === 'claude') {
            model = 'claude-sonnet-4.5';
        } else if (modelParam === 'qwen' || modelParam === '') {
            model = 'qwen3-coder-next';
        } else {
            return '*Error:* Invalid model. Use `claude` or `qwen` (default).';
        }

        // Add to whitelist
        try {
            const normalized = await whitelistManager.addNumber(targetNumber, model);
            const displayNumber = normalized.replace('@s.whatsapp.net', '');
            const modelDisplay = model === 'claude-sonnet-4.5' ? 'Claude Sonnet 4.5' : 'Qwen3 Coder Next';

            console.log(`[AIADD] Added ${normalized} with model ${model}`);

            return `✅ *Added to AI Whitelist*\n\n` +
                   `Number: ${displayNumber}\n` +
                   `Model: ${modelDisplay}`;
        } catch (error) {
            console.error('[AIADD] Error:', error.message);
            return `*Error:* ${error.message}`;
        }
    },
    options: {
        description: 'Add number to AI whitelist (owner only)',
        sectionName: 'Owner',
        ownerOnly: true,
        hidden: true // Don't show in help menu
    }
};
