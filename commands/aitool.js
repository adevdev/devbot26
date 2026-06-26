const tools = require('../tools');
const whitelistManager = require('../whitelistManager');

module.exports = {
    response: async (context, next) => {
        const { message } = context;
        const senderNumber = message.sender.id;

        // Check if user is whitelisted
        const isWhitelisted = await whitelistManager.isWhitelisted(senderNumber);
        if (!isWhitelisted) {
            return '*You need to be whitelisted to use AI tools.*\n\n' +
                   'Contact the bot owner to get access.';
        }

        // Get user's enabled tools
        const userEnabledTools = await whitelistManager.getEnabledTools(senderNumber);

        // Get all available tools dynamically (static + temporary)
        const toolDefs = tools.getAllDefinitions();

        if (!toolDefs || toolDefs.length === 0) {
            return '*No AI tools available.*';
        }

        // Filter out template/example tools
        const excludedTools = ['my_tool_name']; // Template tools to hide from listing
        let visibleTools = toolDefs.filter(tool => !excludedTools.includes(tool.name));

        // Filter by user's enabled tools
        // If userEnabledTools is empty array → all tools enabled
        // If userEnabledTools has items → only show those tools
        if (userEnabledTools.length > 0) {
            visibleTools = visibleTools.filter(tool => userEnabledTools.includes(tool.name));
        }

        if (visibleTools.length === 0) {
            return '*No AI tools enabled for your account.*\n\n' +
                   'Contact the bot owner to enable tools.';
        }

        let output = '🛠️ *AI CAPABILITIES*\n\n';
        output += '_AI will automatically use these tools when needed._\n\n';

        // Display each tool dynamically
        visibleTools.forEach((tool) => {
            // Get icon from metadata if available
            const toolMetadata = tools.getMetadata(tool.name);
            const icon = toolMetadata?.icon || '🔧';

            // Format tool name for display (convert snake_case to Title Case)
            const displayName = tool.name
                .split('_')
                .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                .join(' ');

            // Use tool description from definition
            const description = tool.description || 'No description available';

            output += `${icon} *${displayName}*\n`;
            output += `${description}\n\n`;
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
