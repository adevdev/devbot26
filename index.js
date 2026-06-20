const wachan = require('wachan');
const commands = require('wachan/commands');
const BotDashboard = require('./dashboard');
const credentialsManager = require('./credentialsManager');

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

// Graceful shutdown handler
process.on('SIGINT', async () => {
    console.log('\nShutting down gracefully...');
    await credentialsManager.closeConnection();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('\nShutting down gracefully...');
    await credentialsManager.closeConnection();
    process.exit(0);
});

// Start dashboard
dashboard.start(3000).then(async () => {
    dashboard.addLog('info', 'Auto-starting bot...');
    await initBot();
});

// Setup start bot handler
dashboard.onStartBot(async () => {
    await initBot();
});

// Setup stop bot handler
dashboard.onStopBot(async () => {
    if (botSocket) {
        try {
            // Sync credentials before stopping
            await syncCredsToStorage();

            // Just disconnect, don't logout (keep credentials)
            if (typeof botSocket.end === 'function') {
                await botSocket.end();
            } else if (typeof botSocket.ws?.close === 'function') {
                botSocket.ws.close();
            }
            botSocket = null;
        } catch (error) {
            console.error('Stop error:', error.message);
        }
    }
});

// Load all commands from folder
commands.fromFolder('./commands');

// Log command execution
commands.beforeEach((context, next) => {
    const { message, command, group } = context;
    const groupName = group ? `[${group.subject || 'Group'}] ` : '';
    const senderName = message.sender?.name || message.sender?.id || message.from || 'Unknown';
    const logMsg = `${groupName}${senderName}: .${command.usedName} ${command.parameters.join(' ')}`;

    console.log(`[COMMAND] ${logMsg}`);

    next();
});

// Sync credentials to storage
async function syncCredsToStorage() {
    // Skip sync if using file storage (already in correct location)
    if (credentialsManager.getStorageType() === 'file') {
        return;
    }

    try {
        const fs = require('fs');
        const credsPath = './wachan/state/creds.json';

        // Read from wachan's file location
        if (fs.existsSync(credsPath)) {
            const data = JSON.parse(fs.readFileSync(credsPath, 'utf-8'));
            await credentialsManager.saveCreds(data);
        }
    } catch (error) {
        console.error('Failed to sync credentials to storage:', error.message);
    }
}

// Sync credentials from storage to wachan's expected location
async function syncCredsFromStorage() {
    // Skip sync if using file storage (already in correct location)
    if (credentialsManager.getStorageType() === 'file') {
        return;
    }

    try {
        const fs = require('fs');
        const path = require('path');
        const credsPath = './wachan/state/creds.json';

        const data = await credentialsManager.loadCreds();
        if (data) {
            const dir = path.dirname(credsPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(credsPath, JSON.stringify(data, null, 2));
            console.log('Credentials synced from storage to file');
        }
    } catch (error) {
        console.error('Failed to sync credentials from storage:', error.message);
        throw error; // Re-throw to prevent bot from starting with missing creds
    }
}

// Log all incoming messages
wachan.onReceive(wachan.messageType.any, async (context, next) => {
    const { message, group } = context;
    if (message.text && !message.text.startsWith('.')) {
        const groupName = group ? `[${group.subject || 'Group'}] ` : '';
        const senderName = message.sender?.name || message.sender?.id || message.from || 'Unknown';
        const logMsg = `${groupName}[${senderName}]: ${message.text}`;

        console.log(logMsg);
    }
    next();
});

// Event: bot ready
wachan.onReady(() => {
    console.log('Ready!');
    dashboard.setStatus('connected');

    const cmds = commands.getCommands();

    if (cmds && cmds.sections) {
        const total = Object.values(cmds.sections).flat().length + (cmds.unsectioned?.length || 0);
        console.log('Commands loaded:', total);

        const allCommands = [...(cmds.unsectioned || []), ...Object.values(cmds.sections).flat()];
        const cmdNames = allCommands.map(c => c.name).join(', ');
        console.log('Available commands:', cmdNames);
    }

    const prefixes = wachan.settings.commandPrefixes || ['/'];
    console.log('Command prefix:', prefixes.join(', '));

    console.log('[EPHEMERAL] Auto 1-year ephemeral enabled');
});

// Event: connected
wachan.onConnected(async () => {
    console.log('Authenticated!');
    dashboard.addLog('success', 'Authenticated!');

    // Store socket reference
    botSocket = wachan.getSocket();

    // Sync credentials to storage after successful auth
    await syncCredsToStorage();

    // Listen to baileys connection updates for pairing code
    if (botSocket) {
        botSocket.ev.on('connection.update', (update) => {
            if (update.code) {
                console.log(`🔑 PAIRING CODE: ${update.code}`);
                console.log('Enter this code in WhatsApp > Linked Devices > Link a Device');
            }
        });
    }

    // Wrap sendMessage to auto-inject 1 year ephemeral
    const originalSendMessage = botSocket.sendMessage.bind(botSocket);

    botSocket.sendMessage = async (jid, content, options = {}) => {
        // Inject ephemeral expiration
        const modifiedOptions = {
            ...options,
            ephemeralExpiration: 31536000 // 1 year
        };
        return originalSendMessage(jid, content, modifiedOptions);
    };
});

// Event: error
wachan.onError((error) => {
    console.error('Error:', error);
});

// Initialize bot
async function initBot() {
    dashboard.setStatus('connecting');
    console.log('Checking for existing credentials...');
    console.log(`Using credentials storage: ${credentialsManager.getStorageType()}`);

    let phoneNumber = null;

    // Only ask for phone number if credentials don't exist
    const credsExist = await credentialsManager.credentialsExist();

    if (!credsExist) {
        console.log('No credentials found. Phone number required.');
        phoneNumber = await dashboard.requestPhoneNumber();
        console.log(`Starting bot with phone: ${phoneNumber}`);

        wachan.start({
            phoneNumber: phoneNumber
        });
    } else {
        console.log('Credentials found. Starting bot...');

        // Sync credentials from storage to wachan's file location
        await syncCredsFromStorage();

        // Start without phone number - wachan will use existing creds
        wachan.start({
            phoneNumber: null
        });
    }
}
