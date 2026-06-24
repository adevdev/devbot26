const temporaryToolsManager = require('../temporaryToolsManager');
const https = require('https');
const http = require('http');

module.exports = {
    response: async (context, next) => {
        const { message, command } = context;

        const params = command.parameters;
        let toolCode = null;
        let source = null;
        let toolName = null;

        // Parse parameters
        // Supports:
        // .tooladd <name> <url>
        // .tooladd <url>
        // .tooladd <name> (with reply)
        // .tooladd (with reply)

        if (params.length >= 2) {
            // Format: .tooladd <name> <url>
            toolName = params[0];
            const url = params[1];

            if (!url.startsWith('http://') && !url.startsWith('https://')) {
                return '*Invalid URL.* URL must start with http:// or https://';
            }

            try {
                await message.reply('*Fetching tool from URL...*');
                toolCode = await fetchFromURL(url);
                source = `URL: ${url}`;
            } catch (error) {
                return `*Failed to fetch URL:*\n${error.message}`;
            }
        } else if (params.length === 1) {
            const param = params[0];

            // Check if it's a URL
            if (param.startsWith('http://') || param.startsWith('https://')) {
                // Format: .tooladd <url>
                try {
                    await message.reply('*Fetching tool from URL...*');
                    toolCode = await fetchFromURL(param);
                    source = `URL: ${param}`;
                } catch (error) {
                    return `*Failed to fetch URL:*\n${error.message}`;
                }
            } else {
                // Format: .tooladd <name> (with reply)
                toolName = param;
                const quoted = await message.getQuoted();

                if (!quoted || !quoted.text) {
                    return '*Error:* No message to reply to.\n\n' +
                           '*Usage:*\n' +
                           '`.tooladd <name>` (reply) - Load from reply with custom name\n' +
                           '`.tooladd <name> <URL>` - Load from URL with custom name\n' +
                           '`.tooladd <URL>` - Load from URL (auto name)\n' +
                           '`.tooladd` (reply) - Load from reply (auto name)';
                }

                toolCode = quoted.text;
                source = 'Replied message';
            }
        } else {
            // Format: .tooladd (with reply)
            const quoted = await message.getQuoted();

            if (!quoted || !quoted.text) {
                return '*Usage:*\n' +
                       '`.tooladd <name>` (reply) - Load from reply with custom name\n' +
                       '`.tooladd <name> <URL>` - Load from URL with custom name\n' +
                       '`.tooladd <URL>` - Load from URL (auto name)\n' +
                       '`.tooladd` (reply) - Load from reply (auto name)';
            }

            toolCode = quoted.text;
            source = 'Replied message';
        }

        // Try to load the tool
        try {
            // Evaluate the code to get tool object
            const toolModule = evalToolCode(toolCode);

            // Validate tool structure
            if (!toolModule || !toolModule.name || !toolModule.description || !toolModule.input_schema || !toolModule.implementation) {
                return '*Invalid tool structure.*\n\n' +
                       'Tool must export object with:\n' +
                       '• `name` (string)\n' +
                       '• `description` (string)\n' +
                       '• `input_schema` (object)\n' +
                       '• `implementation` (function)';
            }

            // Validate input_schema
            if (typeof toolModule.input_schema !== 'object' || !toolModule.input_schema.type) {
                return '*Invalid input_schema.*\n' +
                       'input_schema must be a valid JSON Schema object with at least a `type` field.';
            }

            // Use provided name or name from code
            if (!toolName) {
                toolName = toolModule.name;
            }

            // Add tool dynamically
            temporaryToolsManager.add(
                toolName,
                toolModule.description,
                toolModule.input_schema,
                toolModule.implementation,
                source
            );

            return `*Tool added successfully!*\n\n` +
                   `*Name:* ${toolName}\n` +
                   `*Description:* ${toolModule.description}\n` +
                   `*Source:* ${source}\n` +
                   `*Type:* Temporary (memory only)\n\n` +
                   `AI will automatically use this tool when needed.`;

        } catch (error) {
            return `*Failed to load tool:*\n${error.message}\n\n` +
                   '*Make sure the code exports valid tool structure.*';
        }
    },
    options: {
        aliases: ['tadd', 'temptool'],
        description: 'Dynamically load temporary AI tool',
        sectionName: 'Admin',
        ownerOnly: true,
        hidden: true
    }
};

// Fetch code from URL
function fetchFromURL(url) {
    return new Promise((resolve, reject) => {
        const client = url.startsWith('https') ? https : http;

        client.get(url, (res) => {
            if (res.statusCode !== 200) {
                reject(new Error(`HTTP ${res.statusCode}`));
                return;
            }

            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data));
        }).on('error', reject);
    });
}

// Evaluate tool code safely
function evalToolCode(code) {
    try {
        // Create isolated scope
        const module = { exports: {} };
        const exports = module.exports;

        // Evaluate code
        eval(code);

        return module.exports;
    } catch (error) {
        throw new Error(`Eval error: ${error.message}`);
    }
}
