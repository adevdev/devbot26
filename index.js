const wachan = require('wachan');
const commands = require('wachan/commands');
const BotDashboard = require('./dashboard');

// Initialize dashboard
const dashboard = new BotDashboard();

let botSocket = null;

// Intercept console.log to pipe to dashboard
const originalConsoleLog = console.log.bind(console);
console.log = function(...args) {
    const message = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : String(arg)).join(' ');

    // Still log to PowerShell
    originalConsoleLog(...args);

    // Also send to dashboard
    if (dashboard) {
        dashboard.addLog('info', message);
    }
};

// Start dashboard
dashboard.start(3000).then(() => {
    dashboard.addLog('info', 'Dashboard ready. Click Start to begin.');
    dashboard.setStatus('stopped');
});

// Setup start bot handler
dashboard.onStartBot(async () => {
    dashboard.addLog('info', 'Starting bot...');
    await initBot();
});

// Setup stop bot handler
dashboard.onStopBot(async () => {
    dashboard.addLog('info', 'Stopping bot...');
    if (botSocket) {
        try {
            // Just disconnect, don't logout (keep credentials)
            if (typeof botSocket.end === 'function') {
                await botSocket.end();
            } else if (typeof botSocket.ws?.close === 'function') {
                botSocket.ws.close();
            }
            botSocket = null;
            dashboard.addLog('success', 'Bot stopped successfully');
        } catch (error) {
            dashboard.addLog('error', `Stop error: ${error.message}`);
        }
    }
});

// Load semua commands dari folder
commands.fromFolder('./commands');

// Log command execution
commands.beforeEach((context, next) => {
    const { message, command, group } = context;
    const groupName = group ? `[${group.subject || 'Group'}] ` : '';
    const logMsg = `${groupName}${message.sender.name || message.sender.id}: .${command.usedName} ${command.parameters.join(' ')}`;
    
    console.log(`[COMMAND] ${logMsg}`);
    dashboard.addLog('command', logMsg);
    
    next();
});

// Log semua pesan masuk
wachan.onReceive(wachan.messageType.any, async (context, next) => {
    const { message, group } = context;
    if (message.text && !message.text.startsWith('.')) {
        const groupName = group ? `[${group.subject || 'Group'}] ` : '';
        const logMsg = `${groupName}[${message.sender.name || message.sender.id}]: ${message.text}`;
        
        console.log(logMsg);
        dashboard.addLog('message', logMsg);
    }
    next();
});

// Event: bot ready
wachan.onReady(() => {
    console.log('Bot WhatsApp siap!');
    dashboard.addLog('success', 'Bot WhatsApp siap!');
    dashboard.setStatus('connected');
    
    const cmds = commands.getCommands();
    
    if (cmds && cmds.sections) {
        const total = Object.values(cmds.sections).flat().length + (cmds.unsectioned?.length || 0);
        console.log('Commands loaded:', total);
        dashboard.addLog('info', `Commands loaded: ${total}`);
        
        const allCommands = [...(cmds.unsectioned || []), ...Object.values(cmds.sections).flat()];
        const cmdNames = allCommands.map(c => c.name).join(', ');
        console.log('Available commands:', cmdNames);
        dashboard.addLog('info', `Available commands: ${cmdNames}`);
    }
    
    const prefixes = wachan.settings.commandPrefixes || ['/'];
    console.log('Command prefix:', prefixes);
    dashboard.addLog('info', `Command prefix: ${prefixes.join(', ')}`);
    
    console.log('[EPHEMERAL] Auto 1-year ephemeral enabled');
    dashboard.addLog('info', 'Auto 1-year ephemeral enabled for all messages');
});

// Event: connected
wachan.onConnected(() => {
    console.log('Authenticated!');
    dashboard.addLog('success', 'Authenticated!');

    // Store socket reference
    botSocket = wachan.getSocket();

    // Listen to baileys connection updates for pairing code
    if (botSocket) {
        botSocket.ev.on('connection.update', (update) => {
            if (update.qr) {
                dashboard.addLog('info', 'QR code generated (not displayed in terminal)');
            }
            if (update.code) {
                dashboard.addLog('success', `🔑 PAIRING CODE: ${update.code}`);
                dashboard.addLog('info', 'Enter this code in WhatsApp > Linked Devices > Link a Device');
            }
        });
    }
    
    // Wrap sendMessage untuk auto-inject ephemeral 1 tahun
    const originalSendMessage = botSocket.sendMessage.bind(botSocket);
    
    botSocket.sendMessage = async (jid, content, options = {}) => {
        // Inject ephemeral expiration
        const modifiedOptions = {
            ...options,
            ephemeralExpiration: 31536000 // 1 tahun
        };
        return originalSendMessage(jid, content, modifiedOptions);
    };
});

// Event: error
wachan.onError((error) => {
    console.error('Error:', error);
    dashboard.addLog('error', `Bot error: ${error.message}`);
});

// Initialize bot
async function initBot() {
    dashboard.setStatus('connecting');
    dashboard.addLog('info', 'Checking for existing credentials...');

    const fs = require('fs');
    const credsPath = './wachan/state/creds.json';

    let phoneNumber = null;

    // Only ask for phone number if credentials don't exist
    if (!fs.existsSync(credsPath)) {
        dashboard.addLog('info', 'No credentials found. Phone number required.');
        phoneNumber = await dashboard.requestPhoneNumber();
        dashboard.addLog('info', `Starting bot with phone: ${phoneNumber}`);

        wachan.start({
            phoneNumber: phoneNumber
        });
    } else {
        dashboard.addLog('info', 'Credentials found. Starting bot...');

        // Start without phone number - wachan will use existing creds
        wachan.start({
            phoneNumber: null
        });
    }
}
