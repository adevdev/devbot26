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
            return 'Berikut list program yang bisa dijalankan:\n\n' +
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
                instruction: `Ketik: ${command.prefix}js <kode>\n\nContoh:\n${command.prefix}js console.log('Hello')\n\nAtau reply pesan yang berisi kode NodeJS\n\n*Catatan:* cl() adalah alias console.log()`,
                language: 'nodejs'
            },
            php: {
                instruction: `Ketik: ${command.prefix}php <kode>\n\nContoh:\n${command.prefix}php echo "Hello";`,
                language: 'php'
            },
            py: {
                instruction: `Ketik: ${command.prefix}py <kode>\n\nContoh:\n${command.prefix}py print("Hello")`,
                language: 'python'
            },
            cp: {
                instruction: `Ketik: ${command.prefix}cp <kode>\n\nContoh:\n${command.prefix}cp #include <stdio.h>\\nint main() { printf("Hello"); }`,
                language: 'c'
            },
            lua: {
                instruction: `Ketik: ${command.prefix}lua <kode>\n\nContoh:\n${command.prefix}lua print("Hello")`,
                language: 'lua'
            },
            rb: {
                instruction: `Ketik: ${command.prefix}rb <kode>\n\nContoh:\n${command.prefix}rb puts "Hello"`,
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

            return result.output || 'Tidak ada output';

        } catch (error) {
            // Stop typing on error
            await stopTyping();
            await message.react('❌');

            console.error('Compiler Error:', error);
            return '❌ Error menjalankan kode: ' + error.message;
        }
    },
    options: {
        aliases: ['js', 'php', 'py', 'cp', 'lua', 'rb'],
        description: 'Coba kode',
        sectionName: 'Alat'
    }
};
