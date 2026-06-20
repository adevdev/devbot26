const commands = require('wachan/commands');
const https = require('https');
const http = require('http');

module.exports = {
    response: async (context, next) => {
        const { message, command } = context;

        const params = command.parameters;
        let commandCode = null;
        let source = null;
        let cmdName = null;

        // Parse parameters
        // Supports:
        // .cadd <name> <url>
        // .cadd <url>
        // .cadd <name> (with reply)
        // .cadd (with reply)

        if (params.length >= 2) {
            // Format: .cadd <name> <url>
            cmdName = params[0];
            const url = params[1];

            if (!url.startsWith('http://') && !url.startsWith('https://')) {
                return '*Invalid URL.* URL must start with http:// or https://';
            }

            try {
                await message.reply('*Fetching command from URL...*');
                commandCode = await fetchFromURL(url);
                source = `URL: ${url}`;
            } catch (error) {
                return `*Failed to fetch URL:*\n${error.message}`;
            }
        } else if (params.length === 1) {
            const param = params[0];

            // Check if it's a URL
            if (param.startsWith('http://') || param.startsWith('https://')) {
                // Format: .cadd <url>
                try {
                    await message.reply('*Fetching command from URL...*');
                    commandCode = await fetchFromURL(param);
                    source = `URL: ${param}`;
                } catch (error) {
                    return `*Failed to fetch URL:*\n${error.message}`;
                }
            } else {
                // Format: .cadd <name> (with reply)
                cmdName = param;
                const quoted = await message.getQuoted();

                if (!quoted || !quoted.text) {
                    return '*Error:* No message to reply to.\n\n' +
                           '*Usage:*\n' +
                           '`.cadd <name>` (reply) - Load from reply with custom name\n' +
                           '`.cadd <name> <URL>` - Load from URL with custom name\n' +
                           '`.cadd <URL>` - Load from URL (auto name)\n' +
                           '`.cadd` (reply) - Load from reply (auto name)';
                }

                commandCode = quoted.text;
                source = 'Replied message';
            }
        } else {
            // Format: .cadd (with reply)
            const quoted = await message.getQuoted();

            if (!quoted || !quoted.text) {
                return '*Usage:*\n' +
                       '`.cadd <name>` (reply) - Load from reply with custom name\n' +
                       '`.cadd <name> <URL>` - Load from URL with custom name\n' +
                       '`.cadd <URL>` - Load from URL (auto name)\n' +
                       '`.cadd` (reply) - Load from reply (auto name)';
            }

            commandCode = quoted.text;
            source = 'Replied message';
        }

        // Try to load the command
        try {
            // Evaluate the code to get command object
            const commandModule = evalCommandCode(commandCode);

            // Validate command structure
            if (!commandModule || !commandModule.response) {
                return '*Invalid command structure.*\n' +
                       'Command must export object with `response` function.';
            }

            // Use provided name, or extract from code, or generate one
            if (!cmdName) {
                cmdName = extractCommandName(commandCode) || `temp${Date.now()}`;
            }

            // Add command dynamically
            commands.add(cmdName, commandModule.response, {
                ...commandModule.options,
                temporary: true,
                source: source
            });

            return `*Command added successfully!*\n\n` +
                   `*Name:* ${cmdName}\n` +
                   `*Source:* ${source}\n` +
                   `*Type:* Temporary (memory only)\n\n` +
                   `Use: \`.${cmdName}\``;

        } catch (error) {
            return `*Failed to load command:*\n${error.message}\n\n` +
                   '*Make sure the code exports valid command structure.*';
        }
    },
    options: {
        aliases: ['commandadd', 'tempcmd'],
        description: 'Dynamically load temporary command',
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

// Evaluate command code safely
function evalCommandCode(code) {
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

// Extract command name from code
function extractCommandName(code) {
    // Try to find module.exports assignment with name
    const nameMatch = code.match(/\/\/\s*@name\s+(\w+)/i) ||
                     code.match(/name:\s*['"](\w+)['"]/);

    if (nameMatch) {
        return nameMatch[1];
    }

    return null;
}
