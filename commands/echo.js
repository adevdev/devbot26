module.exports = {
    response: async (context) => {
        const { command } = context;
        const text = command.parameters.join(' ');
        
        if (!text) {
            return 'Gunakan: /echo <text>';
        }
        
        return text;
    },
    options: {
        description: 'Echo back your message',
        sectionName: 'General'
    }
};
