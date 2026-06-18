const wachan = require('wachan');
const commands = require('wachan/commands');

// Load semua commands dari folder
commands.fromFolder('./commands');

// Log command execution
commands.beforeEach((context, next) => {
    const { message, command, group } = context;
    const groupName = group ? `[${group.subject || 'Group'}] ` : '';
    console.log(`[COMMAND] ${groupName}${message.sender.name || message.sender.id}: .${command.usedName} ${command.parameters.join(' ')}`);
    next();
});

// Log semua pesan masuk
wachan.onReceive(wachan.messageType.any, async (context, next) => {
    const { message, group } = context;
    if (message.text && !message.text.startsWith('.')) {
        const groupName = group ? `[${group.subject || 'Group'}] ` : '';
        console.log(`${groupName}[${message.sender.name || message.sender.id}]: ${message.text}`);
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
    
    // Wrap sendMessage untuk auto-inject ephemeral 1 tahun
    const sock = wachan.getSocket();
    const originalSendMessage = sock.sendMessage.bind(sock);
    
    sock.sendMessage = async (jid, content, options = {}) => {
        // Inject ephemeral expiration
        const modifiedOptions = {
            ...options,
            ephemeralExpiration: 31536000 // 1 tahun
        };
        return originalSendMessage(jid, content, modifiedOptions);
    };
    
    console.log('[EPHEMERAL] Auto 1-year ephemeral enabled for all outgoing messages');
});

// Event: error
wachan.onError((error) => {
    console.error('Error:', error);
});

// Start bot
wachan.start();
