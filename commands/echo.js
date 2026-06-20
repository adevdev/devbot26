module.exports = {
    response: async (context, next) => {
        const { command } = context;
        const text = command.parameters.join(' ');

        if (!text) {
            return `Usage: ${command.prefix}echo <text>`;
        }

        return text;
    },
    options: {
        description: 'Echo back your message',
        sectionName: 'General'
    }
};
