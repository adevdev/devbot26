// ===== CONSOLE OVERRIDES - MUST BE FIRST =====
// Suppress verbose Baileys session logs BEFORE any modules load

const originalConsoleLog = console.log.bind(console);
const originalConsoleError = console.error.bind(console);
const originalConsoleWarn = console.warn.bind(console);
const originalConsoleInfo = console.info.bind(console);
const originalConsoleDir = console.dir.bind(console);
const originalConsoleDebug = console.debug.bind(console);

// Unified suppression function
function shouldSuppressSessionLog(args) {
    const firstArg = args[0];
    const secondArg = args[1];

    // Check string pattern
    if (typeof firstArg === 'string' &&
        (firstArg.includes('Closing session') || firstArg.includes('Closing open session'))) {
        return true;
    }

    // Check if any argument is a SessionEntry object
    for (const arg of args) {
        if (arg && typeof arg === 'object' &&
            (arg._chains || arg.registrationId ||
             arg.currentRatchet || arg.indexInfo || arg.pendingPreKey)) {
            return true;
        }
    }

    return false;
}

// Override ALL console methods
console.log = function(...args) {
    if (shouldSuppressSessionLog(args)) {
        originalConsoleLog('[Session] Verbose log suppressed');
        return;
    }
    originalConsoleLog.apply(console, args);
};

console.error = function(...args) {
    if (shouldSuppressSessionLog(args)) {
        originalConsoleLog('[Session] Session error suppressed');
        return;
    }
    if (typeof args[0] === 'string' && args[0].includes('Bad MAC')) {
        originalConsoleLog('[Session] Bad MAC error suppressed');
        return;
    }
    originalConsoleError.apply(console, args);
};

console.warn = function(...args) {
    if (shouldSuppressSessionLog(args)) {
        originalConsoleLog('[Session] Session warning suppressed');
        return;
    }
    originalConsoleWarn.apply(console, args);
};

console.info = function(...args) {
    if (shouldSuppressSessionLog(args)) {
        originalConsoleLog('[Session] Session info suppressed');
        return;
    }
    originalConsoleInfo.apply(console, args);
};

console.dir = function(...args) {
    if (shouldSuppressSessionLog(args)) {
        originalConsoleLog('[Session] Session dir suppressed');
        return;
    }
    originalConsoleDir.apply(console, args);
};

console.debug = function(...args) {
    if (shouldSuppressSessionLog(args)) {
        originalConsoleLog('[Session] Session debug suppressed');
        return;
    }
    originalConsoleDebug.apply(console, args);
};

// ===== NOW LOAD MODULES =====

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

// Health monitor vars
let lastActivity = Date.now();
let reconnectAttempts = 0;
let healthCheckInterval = null;
let isReconnecting = false;
let isIntentionalShutdown = false;

// Message deduplication cache
const messageCache = new Map(); // Map<messageId, expiryTimestamp>
const MESSAGE_CACHE_TTL = 60000; // 60 seconds
const MESSAGE_CACHE_CLEANUP_INTERVAL = 60000; // Cleanup every 60 seconds

// Room settings cache - avoid DB hit on every message
const roomCache = new Map(); // Map<roomId, {settings, expiryTime}>
const ROOM_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Cleanup expired messages from cache
function cleanupMessageCache() {
    const now = Date.now();
    let cleaned = 0;

    for (const [messageId, expiryTime] of messageCache.entries()) {
        if (now > expiryTime) {
            messageCache.delete(messageId);
            cleaned++;
        }
    }

    if (cleaned > 0) {
        console.log(`[Cache] Cleaned ${cleaned} expired message(s), current size: ${messageCache.size}`);
    }
}

// Cleanup expired room cache
function cleanupRoomCache() {
    const now = Date.now();
    let cleaned = 0;

    for (const [roomId, data] of roomCache.entries()) {
        if (now > data.expiryTime) {
            roomCache.delete(roomId);
            cleaned++;
        }
    }

    if (cleaned > 0) {
        console.log(`[Cache] Cleaned ${cleaned} expired room(s), current size: ${roomCache.size}`);
    }
}

// Get room settings with cache
async function getCachedRoomSettings(roomId, roomName = null, isGroup = false) {
    const now = Date.now();
    const cached = roomCache.get(roomId);

    // Return cached if valid
    if (cached && now < cached.expiryTime) {
        return cached.settings;
    }

    // Fetch from DB
    const roomManager = require('./roomManager');
    let settings = await roomManager.getRoomSettings(roomId);

    // Auto-create if not exists
    if (!settings) {
        settings = await roomManager.getOrCreateRoom(roomId, roomName, isGroup);
    }

    // Cache it
    roomCache.set(roomId, {
        settings,
        expiryTime: now + ROOM_CACHE_TTL
    });

    return settings;
}

// Invalidate room cache (call after updating room settings)
function invalidateRoomCache(roomId) {
    if (roomId) {
        roomCache.delete(roomId);
    } else {
        roomCache.clear(); // Clear all if no specific roomId
    }
}

// Start cleanup intervals
setInterval(cleanupMessageCache, MESSAGE_CACHE_CLEANUP_INTERVAL);
setInterval(cleanupRoomCache, ROOM_CACHE_TTL); // Cleanup room cache every 5min

// Safe JSON stringify with circular reference handling
function safeStringify(obj, maxLength = 1000) {
    const seen = new WeakSet();
    try {
        const str = JSON.stringify(obj, (key, value) => {
            if (typeof value === 'object' && value !== null) {
                if (seen.has(value)) {
                    return '[Circular]';
                }
                seen.add(value);
            }
            return value;
        });
        // Limit length to prevent massive outputs
        return str.length > maxLength ? str.substring(0, maxLength) + '... (truncated)' : str;
    } catch (e) {
        return '[Object - cannot stringify]';
    }
}

// Pipe console.log to dashboard (session suppression already handled at top)
const dashboardLogger = console.log;
console.log = function(...args) {
    try {
        const message = args.map(arg => {
            if (typeof arg === 'object' && arg !== null) {
                return safeStringify(arg);
            }
            return String(arg);
        }).join(' ');

        // Still log to PowerShell via original override
        dashboardLogger(...args);

        // Block technical detail logs from dashboard
        const blockPrefixes = [
            '[AI] Command from',
            '[AI] Auto-adding',
            '[AI] Got user data',
            '[AI] Auto-added',
            '[AI] Quota check',
            '[AI] User model',
            '[AI] Starting API',
            '[AI] Initial API',
            '[AI] Final text',
            '[AI] Response',
            '[AI] Usage',
            '[AI Settings]',
            '[Whitelist]',
            '[Quota]',
            '[Memory]',
            '[DASHBOARD] Terminal',
            '[AIADD]',
            'Synced'
        ];

        const shouldBlock = blockPrefixes.some(prefix => message.startsWith(prefix));

        // Send to dashboard if NOT blocked
        if (dashboard && !shouldBlock) {
            dashboard.addLog('info', message);
        }
    } catch (error) {
        originalConsoleLog('[LOG ERROR]', error.message);
        dashboardLogger(...args);
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
            // Mark as intentional shutdown to prevent auto-reconnect
            isIntentionalShutdown = true;

            // Stop health monitor
            stopHealthMonitor();

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

// Room check for commands - BEFORE owner check
commands.beforeEach(async (context, next) => {
    const { message, group, command } = context;
    const roomManager = require('./roomManager');
    const roomId = message.room;
    const isGroup = !!group;

    // Get room name for cache key
    let roomName = null;
    if (isGroup && group.subject) {
        roomName = group.subject;
    } else if (!isGroup) {
        try {
            const wachan = require('wachan');
            const userData = await wachan.getUserData(message.sender.id);
            if (userData && userData.pushName) {
                roomName = userData.pushName;
            }
        } catch (e) {
            roomName = message.sender.id;
        }
    }

    // Get cached room settings
    const roomSettings = await getCachedRoomSettings(roomId, roomName, isGroup);

    // Check if room is ignored
    if (roomSettings.ignoreAll) {
        return;
    }

    // Check if command is allowed in this room
    const commandName = command.name;
    const allowed = await roomManager.isCommandAllowed(roomId, commandName);

    if (!allowed) {
        return;
    }

    // Store roomSettings in context for later use
    context.roomSettings = roomSettings;

    // Continue to next middleware
    next();
});

// Owner-only command check
wachan.onReceive(wachan.messageType.any, async (context, next) => {
    const { message, group } = context;
    const roomId = message.room;
    const isGroup = !!group;

    // Get room name for cache
    let roomName = null;
    if (isGroup && group.subject) {
        roomName = group.subject;
    } else if (!isGroup) {
        try {
            const wachan = require('wachan');
            const userData = await wachan.getUserData(message.sender.id);
            if (userData && userData.pushName) {
                roomName = userData.pushName;
            }
        } catch (e) {
            roomName = message.sender.id;
        }
    }

    // Get cached room settings
    const roomSettings = await getCachedRoomSettings(roomId, roomName, isGroup);

    // Check if bot should ignore this room entirely
    if (roomSettings.ignoreAll) {
        return;
    }

    // Store room settings in context for later checks
    context.roomSettings = roomSettings;

    next();
});

// Fallback handler: Private messages -> AI by default, Groups -> AI only for unknown commands with prefix
// Registered AFTER loading commands so we can check if command exists
wachan.onReceive(wachan.messageType.any, async (context, next) => {
    const { message, group } = context;
    const prefixes = wachan.settings.commandPrefixes || ['.'];
    const isGroup = !!group; // true if group message

    // Count messages
    messagesReceived++;

    // Skip if no text (pure media without caption)
    if (!message.text) {
        next();
        return;
    }

    // Check if message starts with a command prefix
    let usedPrefix = null;
    for (const prefix of prefixes) {
        if (message.text.startsWith(prefix)) {
            usedPrefix = prefix;
            break;
        }
    }

    // If prefix found, check if it's a valid command
    if (usedPrefix) {
        const textWithoutPrefix = message.text.slice(usedPrefix.length);
        const parts = textWithoutPrefix.split(' ');
        const commandName = parts[0].toLowerCase();
        const commandInfo = commands.getCommandInfo(commandName);

        if (commandInfo) {
            // Valid command exists - check room permissions
            if (context.roomSettings) {
                const roomManager = require('./roomManager');
                const allowed = await roomManager.isCommandAllowed(message.room, commandName);

                if (!allowed) {
                    // Command not allowed in this room - silently ignore
                    return;
                }
            }

            // Valid command allowed, let it handle normally
            next();
            return;
        }

        // Unknown command with prefix -> check if AI allowed, then route to AI
        if (isGroup && context.roomSettings) {
            const roomManager = require('./roomManager');
            const aiAllowed = await roomManager.isAIAllowed(message.room);
            if (!aiAllowed) {
                // AI not allowed in this room
                return;
            }
        }

        // AI allowed, route unknown command to AI
        try {
            const aiCommandModule = require('./commands/ai.js');
            const aiContext = {
                message: message,
                command: {
                    prefix: usedPrefix,
                    name: 'ai',
                    usedName: 'ai',
                    parameters: textWithoutPrefix.split(' '),
                    description: 'AI assistant (fallback)',
                    aliases: [],
                    skipWhitelistCheck: false
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
        }
        return; // Don't call next()
    }

    // No prefix found
    if (isGroup) {
        // In groups, require prefix for commands
        next();
        return;
    }

    // Private message without prefix
    // BUT: check for special commands first (dev, $cmd, #eval)
    const text = message.text.trim();

    // Skip AI if this is a special command
    if (text.toLowerCase() === 'dev' || text.startsWith('$') || text.startsWith('#')) {
        next();
        return;
    }

    // Check if this sender has an active wait-for-reply session
    const senderId = message.sender?.id || message.from;
    if (dashboard.hasActiveWaitSession(senderId)) {
        // Let wait-for-reply handler receive this message
        next();
        return;
    }

    // Private message without prefix -> route to AI
    try {
        const aiCommandModule = require('./commands/ai.js');
        const aiContext = {
            message: message,
            command: {
                prefix: '',
                name: 'ai',
                usedName: 'ai',
                parameters: [message.text], // Entire message as parameter
                description: 'AI assistant (private chat)',
                aliases: [],
                skipWhitelistCheck: false
            },
            group: context.group
        };

        const response = await aiCommandModule.response(aiContext, () => {});
        if (response) {
            await message.reply(response);
            messagesSent++;
        }
    } catch (error) {
        console.error('[AI Private] Error:', error.message);
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
        // Log dev command received
        const senderName = message.sender.name || 'Unknown';
        console.log(`[COMMAND] ${senderName}: dev`);

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

        // Log removed - no need to log statistics sent
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
        // Silent ignore for non-owners
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
        // Silent ignore for non-owners
        return;
    }

    // Extract code (remove # prefix)
    const code = message.text.slice(1).trim();

    if (!code) {
        await message.reply('*Usage:* #<javascript code>\n\nExample: #console.log("hello")');
        return;
    }

    console.log(`[EVAL] Executing: ${code}`);

    // Save reference to intercepted console.log (NOT the original one)
    const interceptedLog = console.log;

    try {
        // Capture console.log output
        const logs = [];

        // Safe stringify helper for EVAL output
        const safeEvalStringify = (arg) => {
            if (typeof arg === 'object' && arg !== null) {
                const seen = new WeakSet();
                try {
                    return JSON.stringify(arg, (key, value) => {
                        if (typeof value === 'object' && value !== null) {
                            if (seen.has(value)) return '[Circular]';
                            seen.add(value);
                        }
                        return value;
                    }, 2);
                } catch (e) {
                    return '[Object - cannot stringify]';
                }
            }
            return String(arg);
        };

        console.log = (...args) => {
            try {
                const msg = args.map(arg => safeEvalStringify(arg)).join(' ');
                logs.push(msg);
                interceptedLog(...args); // Use intercepted log, not original
            } catch (e) {
                logs.push('[Error capturing log]');
                interceptedLog('[EVAL Log Error]', e.message);
            }
        };

        // Wrap code in async IIFE to support await
        // Try as expression first (with return), fallback to statement
        let asyncCode;
        let result;

        try {
            // Try as expression with return
            asyncCode = `(async () => { return (${code}) })()`;
            result = eval(asyncCode);
        } catch (e) {
            // Failed as expression, try as statement
            asyncCode = `(async () => { ${code} })()`;
            result = eval(asyncCode);
        }

        // Restore console.log
        console.log = interceptedLog;

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
            const resultStr = safeEvalStringify(result);

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
        // Restore console.log on error (back to intercepted version, not original)
        console.log = interceptedLog;

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

    // Deduplication check - prevent processing duplicate messages
    const messageId = message.key?.id;
    if (messageId) {
        const now = Date.now();
        const cachedExpiry = messageCache.get(messageId);

        // Check if message already processed and not expired
        if (cachedExpiry && now < cachedExpiry) {
            console.log(`[Dedupe] Skipped duplicate message: ${messageId}`);
            return; // Skip processing - don't call next()
        }

        // Add to cache with expiry timestamp
        messageCache.set(messageId, now + MESSAGE_CACHE_TTL);
    }

    // Update activity timestamp
    lastActivity = Date.now();

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
wachan.onReady(async () => {
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

    // Sync whitelist from MongoDB on startup
    const whitelistManager = require('./whitelistManager');
    await whitelistManager.syncFromMongoDB();

    // Start task scheduler
    const taskScheduler = require('./taskScheduler');
    await taskScheduler.start();
});

// Event: connected
wachan.onConnected(async () => {
    console.log('Authenticated!');
    dashboard.addLog('success', 'Authenticated!');

    // Store socket reference
    botSocket = wachan.getSocket();

    // Sync credentials to storage after successful auth
    await syncCredsToStorage();

    // Update activity timestamp
    lastActivity = Date.now();

    // Listen to baileys connection updates for pairing code AND reconnection
    if (botSocket) {
        botSocket.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, code } = update;

            // Update activity on any connection event
            lastActivity = Date.now();

            if (code) {
                console.log(`🔑 PAIRING CODE: ${code}`);
                console.log('Enter this code in WhatsApp > Linked Devices > Link a Device');
            }

            if (connection === 'close') {
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                const shouldReconnect = statusCode !== 401; // 401 = loggedOut

                console.log(`[Connection] Closed, status: ${statusCode}, reconnect: ${shouldReconnect}`);

                // Stop health monitor on close
                stopHealthMonitor();

                // Check if this was an intentional shutdown
                if (isIntentionalShutdown) {
                    console.log('[Connection] Intentional shutdown, not reconnecting');
                    dashboard.setStatus('disconnected');
                    botSocket = null;
                    isIntentionalShutdown = false; // Reset flag
                } else if (shouldReconnect) {
                    dashboard.setStatus('reconnecting');
                    await reconnectBot();
                } else {
                    console.log('[Connection] Logged out, not reconnecting');
                    dashboard.setStatus('disconnected');
                    botSocket = null;
                }
            } else if (connection === 'open') {
                console.log('[Connection] Opened successfully');
                dashboard.setStatus('connected');
                reconnectAttempts = 0; // Reset on success

                // Start health monitor
                startHealthMonitor();
            }
        });

        // Track activity on messages
        botSocket.ev.on('messages.upsert', () => {
            lastActivity = Date.now();
        });
    }

    // Wrap sendMessage to auto-inject 1 year ephemeral and track sent messages
    const originalSendMessage = botSocket.sendMessage.bind(botSocket);

    botSocket.sendMessage = async (jid, content, options = {}) => {
        // Update activity on send
        lastActivity = Date.now();

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

// Health monitor - detects silent connection death
function startHealthMonitor() {
    if (healthCheckInterval) {
        clearInterval(healthCheckInterval);
    }

    healthCheckInterval = setInterval(() => {
        const idleTime = Date.now() - lastActivity;
        const idleMinutes = Math.floor(idleTime / 60000);

        // 10 minutes idle = potential dead connection
        if (idleTime > 10 * 60 * 1000) {
            console.log(`[Health] Connection idle for ${idleMinutes}m, forcing reconnect...`);

            // Force close socket to trigger reconnect
            if (botSocket?.ws) {
                try {
                    botSocket.ws.close();
                } catch (e) {
                    console.error('[Health] Error closing socket:', e.message);
                }
            }
        }
    }, 5 * 60 * 1000); // Check every 5 minutes
}

function stopHealthMonitor() {
    if (healthCheckInterval) {
        clearInterval(healthCheckInterval);
        healthCheckInterval = null;
    }
}

// Reconnect with exponential backoff
async function reconnectBot() {
    if (isReconnecting) return;

    isReconnecting = true;
    reconnectAttempts++;

    const delay = Math.min(1000 * Math.pow(2, reconnectAttempts - 1), 30000);
    console.log(`[Reconnect] Attempt ${reconnectAttempts}, waiting ${delay}ms...`);

    await new Promise(resolve => setTimeout(resolve, delay));

    try {
        await initBot();
        isReconnecting = false;
    } catch (error) {
        console.error('[Reconnect] Failed:', error.message);
        isReconnecting = false;

        // Retry if attempts < 10
        if (reconnectAttempts < 10) {
            await reconnectBot();
        } else {
            console.error('[Reconnect] Max attempts reached, giving up');
            dashboard.setStatus('error');
        }
    }
}

// Initialize bot
async function initBot() {
    // Reset intentional shutdown flag when starting bot
    isIntentionalShutdown = false;

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
            phoneNumber: phoneNumber,
            configOverrides: {
                keepAliveIntervalMs: 25000,
                connectTimeoutMs: 60000,
                defaultQueryTimeoutMs: 60000,
                markOnlineOnConnect: false,
                // Session & message retry config (fail fast)
                retryRequestDelayMs: 10,
                maxMsgRetryCount: 1,
                // Auto-handle session errors gracefully
                emitOwnEvents: false,
                shouldIgnoreJid: () => false
            }
        });
    } else {
        console.log('Credentials found. Starting bot...');

        // Sync credentials from storage to wachan's file location
        await syncCredsFromStorage();

        // Start without phone number - wachan will use existing creds
        wachan.start({
            phoneNumber: null,
            configOverrides: {
                keepAliveIntervalMs: 25000,
                connectTimeoutMs: 60000,
                defaultQueryTimeoutMs: 60000,
                markOnlineOnConnect: false,
                // Session & message retry config (fail fast)
                retryRequestDelayMs: 10,
                maxMsgRetryCount: 1,
                // Auto-handle session errors gracefully
                emitOwnEvents: false,
                shouldIgnoreJid: () => false
            }
        });
    }
}

// Export dashboard for tools that need to access activeWaitSessions
module.exports = { dashboard, invalidateRoomCache };
