/**
 * AI Identity Module
 * Defines the bot's personality and role
 */

module.exports = {
    name: 'identity',
    description: 'AI personality and role definition',
    category: 'Core',
    generate: async (context) => {
        const { settingsManager } = context;
        const identity = await settingsManager.getAiIdentity();
        return identity || 'You are DevBot26, an AI assistant responding via WhatsApp.';
    }
};
