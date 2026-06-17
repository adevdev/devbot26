module.exports = {
    response: async (context, next) => {
        const { message } = context;
        return `Halo juga, ${message.sender.name || 'teman'}! Ada yang bisa saya bantu?`;
    },
    options: {
        description: 'Say hello to the bot',
        sectionName: 'General'
    }
};
