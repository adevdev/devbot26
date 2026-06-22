const whitelistManager = require('../whitelistManager');

// Helper to extract mentions from baileys message
function getMentions(message) {
    const baileys = message.toBaileys();
    const mentionedJid = baileys?.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
    return mentionedJid.map(jid => ({ jid }));
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
            return '*Usage:* `.aiadd @mention [name] [--model model]`\n\n' +
                   'Models:\n' +
                   '• `claude` - Claude Sonnet 4.5\n' +
                   '• `qwen` or empty - Qwen3 Coder Next (default)\n\n' +
                   'Examples:\n' +
                   '• `.aiadd @6281234567890 John Doe`\n' +
                   '• `.aiadd @6281234567890 Jane --model claude`\n' +
                   '• `.aiadd @6281234567890` (no name)';
        }

        // Parse parameters
        const fullText = command.parameters.join(' ');
        let customName = null;
        let model = 'qwen3-coder-next'; // Default

        // Extract --model value
        const modelMatch = fullText.match(/--model\s+(\S+)/);
        if (modelMatch) {
            const modelParam = modelMatch[1].toLowerCase();
            if (modelParam === 'claude') {
                model = 'claude-sonnet-4.5';
            } else if (modelParam === 'qwen') {
                model = 'qwen3-coder-next';
            } else {
                return '*Error:* Invalid model. Use `claude` or `qwen`.';
            }
        }

        // Extract name: everything between @mention and --model (or end)
        // Remove @ mentions and --model part
        let namePart = fullText.replace(/@\S+/g, '').trim(); // Remove @mentions
        if (modelMatch) {
            namePart = namePart.replace(/--model\s+\S+/, '').trim(); // Remove --model part
        }

        if (namePart) {
            customName = namePart.trim();
        }

        // Add all mentions to whitelist
        const added = [];
        const errors = [];

        for (const mention of mentions) {
            try {
                const lid = mention.jid; // This is LID format from mention
                const pushName = customName || null;

                // Save LID directly (no JID resolution)
                const normalized = await whitelistManager.addNumber(lid, model, pushName);
                const displayNumber = '@' + normalized.split('@')[0];
                added.push({ display: displayNumber, jid: normalized });

                // Log with LID and pushName
                const logName = pushName ? ` (${pushName})` : '';
                console.log(`[AIADD] Added ${normalized}${logName} with model ${model}`);
            } catch (error) {
                console.error(`[AIADD] Failed to add ${mention.jid}:`, error.message);
                errors.push(mention.jid);
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
