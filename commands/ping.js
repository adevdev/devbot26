module.exports = {
    response: async (context, next) => {
        return 'pong!';
    },
    options: {
        description: 'Test bot response time',
        sectionName: 'General'
    }
};
