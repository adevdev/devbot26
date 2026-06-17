const wachan = require('wachan');
const commands = require('wachan/commands');

// Load semua commands dari folder
commands.fromFolder('./commands');

// Log semua pesan masuk
wachan.onReceive(wachan.messageType.any, async (context, next) => {
    const { message } = context;
    if (message.text) {
        console.log(`[${message.sender.name || message.sender.id}]: ${message.text}`);
    }
    next();
});

// Event: bot ready
wachan.onReady(() => {
    console.log('Bot WhatsApp siap!');
    const cmds = commands.getCommands();
    
    if (cmds && cmds.sections) {
        const total = Object.values(cmds.sections).flat().length + (cmds.unsectioned?.length || 0);
        console.log('Commands loaded:', total);
        
        const allCommands = [...(cmds.unsectioned || []), ...Object.values(cmds.sections).flat()];
        console.log('Available commands:', allCommands.map(c => c.name).join(', '));
    }
    
    console.log('Command prefix:', wachan.settings.commandPrefixes || ['/']);
});

// Event: connected
wachan.onConnected(() => {
    console.log('Authenticated!');
});

// Event: error
wachan.onError((error) => {
    console.error('Error:', error);
});

// Start bot
wachan.start();
