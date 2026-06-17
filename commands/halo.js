module.exports = {
    response: async (context) => {
        const { message } = context;
        return `Halo juga, ${message.sender.name || 'teman'}! Ada yang bisa saya bantu?`;
    },
    options: {
        description: 'Say hello to the bot',
        sectionName: 'General'
    }
};
