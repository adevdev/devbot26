const wachan = require('wachan');
const commands = require('wachan/commands');
const BotDashboard = require('./dashboard');
const credentialsManager = require('./credentialsManager');

// Initialize dashboard
const dashboard = new BotDashboard();

let botSocket = null;
let botStartTime = null;
let messagesReceived = 0;
let messagesSent = 0;

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
    // Pass commands module to dashboard for command management
    dashboard.setCommandsModule(commands);

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

// Load all commands from folder FIRST
commands.fromFolder('./commands');

// Fallback handler for unknown commands -> route to AI
// Registered AFTER loading commands so we can check if command exists
wachan.onReceive(wachan.messageType.text, async (context, next) => {
    const { message } = context;
    const prefixes = wachan.settings.commandPrefixes || ['.'];

    // Check if message starts with a command prefix
    let usedPrefix = null;
    for (const prefix of prefixes) {
        if (message.text.startsWith(prefix)) {
            usedPrefix = prefix;
            break;
        }
    }

    if (!usedPrefix) {
        next();
        return;
    }

    // Extract command name
    const textWithoutPrefix = message.text.slice(usedPrefix.length);
    const parts = textWithoutPrefix.split(' ');
    const commandName = parts[0].toLowerCase();

    // Check if command exists (now commands are loaded)
    const commandInfo = commands.getCommandInfo(commandName);

    if (commandInfo) {
        // Command exists, let it handle normally
        next();
        return;
    }

    // Unknown command - check whitelist then route to AI
    try {
        // Check whitelist first
        const whitelistManager = require('./whitelistManager');
        const isWhitelisted = await whitelistManager.isWhitelisted(message.sender.id);

        if (!isWhitelisted) {
            // Silently ignore unknown commands from non-whitelisted users
            // Don't reveal AI feature existence
            return;
        }

        // Import AI command module directly
        const aiCommandModule = require('./commands/ai.js');

        // Reconstruct context for AI command
        const aiContext = {
            message: message,
            command: {
                prefix: usedPrefix,
                name: 'ai',
                usedName: 'ai',
                parameters: textWithoutPrefix.split(' '), // Full text as parameters
                description: 'AI assistant (fallback)',
                aliases: [],
                skipWhitelistCheck: true // Already checked in fallback
            },
            group: context.group
        };

        const response = await aiCommandModule.response(aiContext, () => {});
        if (response) {
            await message.reply(response);
            messagesSent++;
        }
    } catch (error) {
        console.error('[AI Fallback] Error:', error.message);
        // Silently fail - don't send error to user for unknown commands
    }

    // Don't call next() - we handled it
});

// Owner-only command check
commands.beforeEach((context, next) => {
    const { ownerOnly } = context.command;
    const OWNER_ID = process.env.OWNER_ID;

    if (ownerOnly) {
        if (!OWNER_ID) {
            return '*Bot configuration error.* OWNER_ID not set in .env file.';
        }

        if (context.message.sender.id !== OWNER_ID) {
            return '*Access denied.* Only bot owner can use this command.';
        }
    }

    next();
});

// Special handler for "Dev" message - exclusive monitoring command
wachan.onReceive(wachan.messageType.text, async (context, next) => {
    const { message } = context;

    if (message.text && message.text.trim().toLowerCase() === 'dev') {
        const uptime = botStartTime ? Date.now() - botStartTime : 0;
        const uptimeSeconds = Math.floor(uptime / 1000);
        const uptimeMinutes = Math.floor(uptimeSeconds / 60);
        const uptimeHours = Math.floor(uptimeMinutes / 60);
        const uptimeDays = Math.floor(uptimeHours / 24);

        const uptimeStr = uptimeDays > 0
            ? `${uptimeDays}d ${uptimeHours % 24}h ${uptimeMinutes % 60}m ${uptimeSeconds % 60}s`
            : uptimeHours > 0
            ? `${uptimeHours}h ${uptimeMinutes % 60}m ${uptimeSeconds % 60}s`
            : uptimeMinutes > 0
            ? `${uptimeMinutes}m ${uptimeSeconds % 60}s`
            : `${uptimeSeconds}s`;

        const stats = `*Bot Statistics*\n\n` +
                     `*Uptime:* ${uptimeStr}\n` +
                     `*Messages Received:* ${messagesReceived.toLocaleString()}\n` +
                     `*Messages Sent:* ${messagesSent.toLocaleString()}`;

        await context.reply(stats);
        messagesSent++;

        console.log('[DEV] Statistics sent');
        return; // Don't pass to next handler
    }

    next();
});

// Special handler for shell commands with $ prefix - owner only
wachan.onReceive(wachan.messageType.text, async (context, next) => {
    const { message } = context;

    // Check if message starts with $
    if (!message.text || !message.text.startsWith('$')) {
        next();
        return;
    }

    // Owner-only check
    const OWNER_ID = process.env.OWNER_ID;
    if (!OWNER_ID) {
        await message.reply('*Error:* OWNER_ID not configured.');
        return;
    }

    if (message.sender.id !== OWNER_ID) {
        await message.reply('*Access denied.* Shell commands are owner-only.');
        return;
    }

    // Extract command (remove $ prefix)
    const shellCommand = message.text.slice(1).trim();

    if (!shellCommand) {
        await message.reply('*Usage:* $<command>\n\nExample: $ls -la');
        return;
    }

    console.log(`[SHELL] Executing: ${shellCommand}`);

    try {
        const { exec } = require('child_process');
        const util = require('util');
        const execPromise = util.promisify(exec);

        // Execute command with 30s timeout
        const { stdout, stderr } = await execPromise(shellCommand, {
            timeout: 30000,
            maxBuffer: 1024 * 1024 // 1MB buffer
        });

        // Prepare output - just raw result
        let output = '';
        if (stdout) {
            output += stdout.trim();
        }
        if (stderr) {
            output += (stdout ? '\n\n' : '') + stderr.trim();
        }
        if (!stdout && !stderr) {
            output = '(no output)';
        }

        // Limit output length (WhatsApp has message size limits)
        const MAX_LENGTH = 4000;
        if (output.length > MAX_LENGTH) {
            output = output.slice(0, MAX_LENGTH) + '\n... (truncated)';
        }

        await message.reply(output);
        messagesSent++;

    } catch (error) {
        // Just send the error message directly
        let errorMsg = error.message;

        // Include stderr if available
        if (error.stderr) {
            errorMsg = error.stderr.trim();
        }

        // Include stdout if command had partial output before error
        if (error.stdout) {
            errorMsg = error.stdout.trim() + (error.stderr ? '\n' + error.stderr.trim() : '');
        }

        await message.reply(errorMsg);
        messagesSent++;
        console.error('[SHELL] Error:', error.message);
    }

    // Don't call next() - we handled it
});

// Special handler for eval commands with # prefix - owner only
wachan.onReceive(wachan.messageType.text, async (context, next) => {
    const { message } = context;

    // Check if message starts with #
    if (!message.text || !message.text.startsWith('#')) {
        next();
        return;
    }

    // Owner-only check
    const OWNER_ID = process.env.OWNER_ID;
    if (!OWNER_ID) {
        await message.reply('*Error:* OWNER_ID not configured.');
        return;
    }

    if (message.sender.id !== OWNER_ID) {
        await message.reply('*Access denied.* Eval commands are owner-only.');
        return;
    }

    // Extract code (remove # prefix)
    const code = message.text.slice(1).trim();

    if (!code) {
        await message.reply('*Usage:* #<javascript code>\n\nExample: #console.log("hello")');
        return;
    }

    console.log(`[EVAL] Executing: ${code}`);

    try {
        // Capture console.log output
        const logs = [];
        const originalLog = console.log;
        console.log = (...args) => {
            const msg = args.map(arg =>
                typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
            ).join(' ');
            logs.push(msg);
            originalLog(...args); // Still log to console
        };

        // Execute code
        let result = eval(code);

        // Restore console.log
        console.log = originalLog;

        // Handle async results (promises)
        if (result instanceof Promise) {
            result = await result;
        }

        // Prepare output
        let output = '';

        // Add captured logs
        if (logs.length > 0) {
            output = logs.join('\n');
        }

        // Add return value if not undefined
        if (result !== undefined) {
            const resultStr = typeof result === 'object'
                ? JSON.stringify(result, null, 2)
                : String(result);

            if (output) {
                output += '\n→ ' + resultStr;
            } else {
                output = resultStr;
            }
        }

        // If no output at all
        if (!output) {
            output = '(no output)';
        }

        // Limit output length
        const MAX_LENGTH = 4000;
        if (output.length > MAX_LENGTH) {
            output = output.slice(0, MAX_LENGTH) + '\n... (truncated)';
        }

        await message.reply(output);
        messagesSent++;

    } catch (error) {
        // Restore console.log on error
        console.log = originalConsoleLog;

        await message.reply(error.message);
        messagesSent++;
        console.error('[EVAL] Error:', error.message);
    }

    // Don't call next() - we handled it
});

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

    // Increment received counter
    messagesReceived++;

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

    // Set bot start time for uptime tracking
    botStartTime = Date.now();

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

    // Wrap sendMessage to auto-inject 1 year ephemeral and track sent messages
    const originalSendMessage = botSocket.sendMessage.bind(botSocket);

    botSocket.sendMessage = async (jid, content, options = {}) => {
        // Inject ephemeral expiration
        const modifiedOptions = {
            ...options,
            ephemeralExpiration: 31536000 // 1 year
        };
        const result = await originalSendMessage(jid, content, modifiedOptions);

        // Track sent message
        messagesSent++;

        return result;
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
