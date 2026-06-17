module.exports = {
    response: async (context) => {
        return 'pong!';
    },
    options: {
        description: 'Test bot response time',
        sectionName: 'General'
    }
};
