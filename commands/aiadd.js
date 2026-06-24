const whitelistManager = require('../whitelistManager');
const settingsManager = require('../settingsManager');

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

        // Check if models are configured
        const supportedModels = await settingsManager.getSupportedModels();
        if (!supportedModels || supportedModels.length === 0) {
            return '*Error:* No AI models configured. Please add models first in dashboard: Settings → AI Settings → Models.';
        }

        const defaultModel = await settingsManager.getDefaultModel();
        if (!defaultModel) {
            return '*Error:* No default AI model set. Please set default model in dashboard: Settings → AI Settings → Defaults.';
        }

        // Extract mentions from baileys message
        const mentions = getMentions(message);

        if (mentions.length === 0) {
            // Get current defaults to show in usage
            const defaultModel = await settingsManager.getDefaultModel();
            const defaultQuota = await settingsManager.getDefaultQuota();
            const defaultResetPeriod = await settingsManager.getDefaultResetPeriod();

            // Get model display name dynamically
            const supportedModels = await settingsManager.getSupportedModels();
            const defaultModelInfo = supportedModels.find(m => m.id === defaultModel);
            const modelName = defaultModelInfo ? (defaultModelInfo.displayName || defaultModelInfo.name) : defaultModel;

            const resetLabel = defaultResetPeriod === 'per5Hours' ? '5h' :
                              defaultResetPeriod === 'perDay' ? 'day' : 'month';

            // Build models list dynamically
            let modelsListText = '*Available Models:*\n';
            supportedModels.forEach(model => {
                const isDefault = model.id === defaultModel ? ' (default)' : '';
                modelsListText += `• \`${model.id}\` - ${model.displayName || model.name}${isDefault}\n`;
            });

            return '*Usage:* `.aiadd @mention [name] [--model model] [--quota N] [--reset period]`\n\n' +
                   modelsListText + '\n' +
                   '*Quota:* (default: ' + defaultQuota + ')\n' +
                   '• Any number between 1-10000\n\n' +
                   '*Reset Period:* (default: ' + resetLabel + ')\n' +
                   '• `5h` or `5hours` - Every 5 hours\n' +
                   '• `day` or `daily` - Every day\n' +
                   '• `month` or `monthly` - Every month\n\n' +
                   '*Current Defaults:*\n' +
                   '• Model: ' + modelName + '\n' +
                   '• Quota: ' + defaultQuota + '\n' +
                   '• Reset: ' + resetLabel + '\n\n' +
                   '*Examples:*\n' +
                   '• `.aiadd @6281234567890 John Doe`\n' +
                   '• `.aiadd @6281234567890 Jane --model claude-haiku-4`\n' +
                   '• `.aiadd @6281234567890 --quota 50 --reset 5h`\n' +
                   '• `.aiadd @6281234567890 Bob --model ' + defaultModel + ' --quota 200 --reset month`';
        }

        // Parse parameters
        const fullText = command.parameters.join(' ');
        let customName = null;
        let model = null; // Let whitelistManager get default
        let quota = null; // Let whitelistManager get default
        let resetPeriod = null; // Let whitelistManager get default

        // Extract --model value
        const modelMatch = fullText.match(/--model\s+(\S+)/);
        if (modelMatch) {
            const modelParam = modelMatch[1].toLowerCase();

            // Get supported models to validate
            const supportedModels = await settingsManager.getSupportedModels();
            const validModelIds = supportedModels.map(m => m.id);

            // Support legacy shorthand aliases for backwards compatibility
            const aliases = {
                'claude': 'claude-sonnet-4.5',
                'qwen': 'qwen3-coder-next',
                'haiku': 'claude-haiku-4'
            };

            // Try alias first, then check if it's a valid model ID
            const resolvedModel = aliases[modelParam] || modelParam;

            if (validModelIds.includes(resolvedModel)) {
                model = resolvedModel;
            } else {
                return `*Error:* Invalid model \`${modelParam}\`.\n\nAvailable models:\n${validModelIds.map(id => `• \`${id}\``).join('\n')}`;
            }
        }

        // Extract --quota value
        const quotaMatch = fullText.match(/--quota\s+(\d+)/);
        if (quotaMatch) {
            quota = parseInt(quotaMatch[1]);
            if (quota < 1 || quota > 10000) {
                return '*Error:* Quota must be between 1 and 10000.';
            }
        }

        // Extract --reset value
        const resetMatch = fullText.match(/--reset\s+(\S+)/);
        if (resetMatch) {
            const resetParam = resetMatch[1].toLowerCase();
            if (resetParam === '5h' || resetParam === '5hours') {
                resetPeriod = 'per5Hours';
            } else if (resetParam === 'day' || resetParam === 'daily') {
                resetPeriod = 'perDay';
            } else if (resetParam === 'month' || resetParam === 'monthly') {
                resetPeriod = 'perMonth';
            } else {
                return '*Error:* Invalid reset period. Use `5h`, `day`, or `month`.';
            }
        }

        // Extract name: everything between @mention and --flags
        let namePart = fullText.replace(/@\S+/g, '').trim(); // Remove @mentions
        if (modelMatch) {
            namePart = namePart.replace(/--model\s+\S+/, '').trim();
        }
        if (quotaMatch) {
            namePart = namePart.replace(/--quota\s+\d+/, '').trim();
        }
        if (resetMatch) {
            namePart = namePart.replace(/--reset\s+\S+/, '').trim();
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

                // Get user data from WhatsApp to get accurate pushName
                const wachan = require('wachan');
                let pushName = customName || null;
                let jidToStore = lid;

                try {
                    const userData = await wachan.getUserData(lid);
                    if (userData) {
                        // Use actual pushName if no custom name provided
                        if (!customName && userData.pushName) {
                            pushName = userData.pushName;
                        }
                        // Store JID if available, otherwise use LID
                        if (userData.id) {
                            jidToStore = userData.id;
                        }
                        console.log(`[AIADD] Got user data: ${userData.pushName} (JID: ${userData.id}, LID: ${userData.lid || 'none'})`);
                    }
                } catch (userDataError) {
                    console.warn(`[AIADD] Could not get user data for ${lid}, using LID directly:`, userDataError.message);
                }

                // Save with JID (preferred) or LID - whitelistManager will get defaults if null
                const normalized = await whitelistManager.addNumber(jidToStore, model, pushName, quota, resetPeriod);
                const displayNumber = '@' + normalized.split('@')[0];
                added.push({ display: displayNumber, jid: normalized });

                // Get actual values used (including defaults)
                const userInfo = (await whitelistManager.getAll()).find(u => u.number === normalized);
                const actualModel = userInfo?.model || await settingsManager.getDefaultModel();
                const actualQuota = userInfo?.quota || 100;
                const actualReset = userInfo?.resetPeriod || 'perDay';

                // Log with actual values
                const logName = pushName ? ` (${pushName})` : '';
                const resetLabel = actualReset === 'per5Hours' ? '5h' : actualReset === 'perDay' ? 'day' : 'month';
                console.log(`[AIADD] Added ${normalized}${logName}: ${actualModel}, ${actualQuota}/${resetLabel}`);
            } catch (error) {
                console.error(`[AIADD] Failed to add ${mention.jid}:`, error.message);
                errors.push(mention.jid);
            }
        }

        if (added.length === 0) {
            return '*Error:* Failed to add all numbers.';
        }

        // Get actual settings for response
        const firstAdded = added[0].jid;
        const userInfo = (await whitelistManager.getAll()).find(u => u.number === firstAdded);
        const actualModel = userInfo?.model || await settingsManager.getDefaultModel();
        const actualQuota = userInfo?.quota || 100;
        const actualReset = userInfo?.resetPeriod || 'perDay';

        const numberList = added.map(u => u.display).join('\n');
        const mentionList = added.map(u => u.jid);
        const resetLabel = actualReset === 'per5Hours' ? 'every 5 hours' :
                          actualReset === 'perDay' ? 'daily' : 'monthly';

        return {
            text: `✅ *Added to AI Whitelist*\n\n` +
                  `${numberList}\n\n` +
                  `*Settings:*\n` +
                  `• Model: ${actualModel}\n` +
                  `• Quota: ${actualQuota} requests\n` +
                  `• Reset: ${resetLabel}`,
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
