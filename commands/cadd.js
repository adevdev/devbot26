const commands = require('wachan/commands');
const https = require('https');
const http = require('http');

module.exports = {
    response: async (context, next) => {
        const { message, command } = context;

        const params = command.parameters;
        let commandCode = null;
        let source = null;

        // Check if URL provided
        if (params.length > 0) {
            const url = params[0];

            // Validate URL
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
        }
        // Check if replying to a message
        else {
            const quoted = message.getQuoted();

            if (!quoted || !quoted.text) {
                return '*Usage:*\n' +
                       '`.cadd <URL>` - Load command from URL\n' +
                       '`.cadd` (reply to message) - Load command from message';
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

            // Extract command name from code or generate one
            const cmdName = extractCommandName(commandCode) || `temp${Date.now()}`;

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
        description: 'Dynamically load temporary command (Owner only)',
        sectionName: 'Admin',
        ownerOnly: true
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
