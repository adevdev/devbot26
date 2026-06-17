const commands = require('wachan/commands');

module.exports = {
    response: async (context, next) => {
        const menu = commands.generateMenu({
            header: '🤖 *BOT COMMAND LIST* 🤖\n\n',
            commandFormat: '• `<<prefix>><<name>>` - <<description>>',
            sectionTitleFormat: '📁 *<<section>>*\n',
            sectionSeparator: '\n\n',
            noDescriptionPlaceholder: 'No description'
        });
        
        return menu;
    },
    options: {
        description: 'Show all available commands',
        sectionName: 'General',
        aliases: ['help', 'commands']
    }
};
