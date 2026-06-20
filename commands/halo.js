module.exports = {
    response: async (context, next) => {
        const { message } = context;
        return `Hello, ${message.sender.name || 'friend'}! How can I help you?`;
    },
    options: {
        aliases: ['hi', 'hey'],
        description: 'Say hello to the bot',
        sectionName: 'General'
    }
};
