const { startContinuousTyping } = require('../utils/typing');

module.exports = {
    response: async function(context, next) {
        const { message, command } = context;
        const bot = require('wachan');

        // Get code from quoted message or parameters
        const quotedMsg = await message.getQuoted();
        const commandText = quotedMsg?.text || command.parameters.join(' ') || '';

        // Show help if no code provided
        if (!commandText && command.usedName === 'compiler') {
            return 'Available languages:\n\n' +
                '.js NodeJS/Javascript\n' +
                '.php PHP\n' +
                '.py Python 3.6\n' +
                '.cp C Programming\n' +
                '.lua Lua Programming\n' +
                '.rb Ruby';
        }

        // Language configurations
        const configs = {
            js: {
                instruction: `Type: ${command.prefix}js <code>\n\nExample:\n${command.prefix}js console.log('Hello')\n\nOr reply to message containing NodeJS code\n\n*Note:* cl() is an alias for console.log()`,
                language: 'nodejs'
            },
            php: {
                instruction: `Type: ${command.prefix}php <code>\n\nExample:\n${command.prefix}php echo "Hello";`,
                language: 'php'
            },
            py: {
                instruction: `Type: ${command.prefix}py <code>\n\nExample:\n${command.prefix}py print("Hello")`,
                language: 'python'
            },
            cp: {
                instruction: `Type: ${command.prefix}cp <code>\n\nExample:\n${command.prefix}cp #include <stdio.h>\\nint main() { printf("Hello"); }`,
                language: 'c'
            },
            lua: {
                instruction: `Type: ${command.prefix}lua <code>\n\nExample:\n${command.prefix}lua print("Hello")`,
                language: 'lua'
            },
            rb: {
                instruction: `Type: ${command.prefix}rb <code>\n\nExample:\n${command.prefix}rb puts "Hello"`,
                language: 'ruby'
            }
        };

        const config = configs[command.usedName];

        if (!commandText) {
            return config.instruction;
        }

        // Build request body for new API format
        const body = {
            language: config.language,
            code: commandText
        };

        // Start continuous typing since code compilation can take time
        const stopTyping = startContinuousTyping(bot, message.room);

        try {
            // React loading
            await message.react('⏳');

            const response = await fetch("https://apied26.adevdev.com/compiler", {
                headers: {
                    "Content-Type": "application/json"
                },
                method: "POST",
                body: JSON.stringify(body)
            });

            const result = await response.json();

            // Stop typing after completion
            await stopTyping();

            // Check if request was successful
            if (!result.success) {
                await message.react('❌');
                return '❌ Error: ' + (result.error || 'Unknown error');
            }

            // React success
            await message.react('✅');

            return result.output || 'No output';

        } catch (error) {
            // Stop typing on error
            await stopTyping();
            await message.react('❌');

            console.error('Compiler Error:', error);
            return '❌ Error running code: ' + error.message;
        }
    },
    options: {
        aliases: ['js', 'php', 'py', 'cp', 'lua', 'rb'],
        description: 'Execute code in multiple languages',
        sectionName: 'Tools'
    }
};
