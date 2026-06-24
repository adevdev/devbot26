const tools = require('../tools');

module.exports = {
    response: async (context, next) => {
        const toolDefs = tools.toolDefinitions;

        if (!toolDefs || toolDefs.length === 0) {
            return '*No AI tools available.*';
        }

        // User-friendly tool descriptions
        const userFriendlyTools = {
            'web_search': {
                emoji: '🔍',
                title: 'Web Search',
                desc: 'AI can search for current information on the internet - news, prices, schedules, weather, and other real-time data.'
            },
            'fetch_url': {
                emoji: '📄',
                title: 'Fetch URL',
                desc: 'AI can read content from a website/link you provide to give summaries or analysis.'
            },
            'get_time': {
                emoji: '🕐',
                title: 'Get Time',
                desc: 'AI can check the current time in various formats (date, time, timezone, timestamp).'
            },
            'image_search': {
                emoji: '🖼️',
                title: 'Image Search',
                desc: 'AI can search for images/photos from Pinterest based on your request (e.g., "find cute cat pictures").'
            }
        };

        let output = '🛠️ *AI CAPABILITIES*\n\n';
        output += '_AI will automatically use these tools when needed._\n\n';

        toolDefs.forEach((tool) => {
            const friendly = userFriendlyTools[tool.name];
            if (friendly) {
                output += `${friendly.emoji} *${friendly.title}*\n`;
                output += `${friendly.desc}\n\n`;
            }
        });

        output += '💡 _Just chat normally, AI will decide which tool to use._';

        return output;
    },
    options: {
        description: 'Show available AI tools',
        sectionName: 'AI',
        aliases: ['tools', 'aitools']
    }
};
