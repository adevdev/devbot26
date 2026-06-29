const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const session = require('express-session');
const bcrypt = require('bcrypt');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const memoryManager = require('./memoryManager');
require('dotenv').config();

class BotDashboard {
    constructor() {
        this.app = express();
        this.server = http.createServer(this.app);
        this.io = new Server(this.server);
        this.logs = [];
        this.maxLogs = 500;
        this.botStatus = 'disconnected';
        this.phoneNumber = null;
        this.phoneResolve = null;
        this.awaitingPhoneInput = false;
        this.startBotCallback = null;
        this.stopBotCallback = null;
        this.commandsModule = null; // Reference to wachan/commands module
        this.activeWaitSessions = new Set(); // Track active wait-for-reply sessions

        // Load auth credentials from environment variables
        this.authUsername = process.env.DASHBOARD_USERNAME || 'admin';
        // Store hashed password (will be compared with bcrypt)
        this.authPasswordHash = null;
        this.initPasswordHash();

        this.setupMiddleware();
        this.setupRoutes();
        this.setupSocketIO();
    }

    // Initialize password hash from environment variable
    async initPasswordHash() {
        const plainPassword = process.env.DASHBOARD_PASSWORD || 'admin123';
        this.authPasswordHash = await bcrypt.hash(plainPassword, 10);
        console.log('[DASHBOARD] Password hash initialized');
    }

    setupMiddleware() {
        // Security headers with helmet
        this.app.use(helmet({
            contentSecurityPolicy: false, // Disable CSP for now to allow inline scripts
        }));

        // Rate limiting for login endpoint
        const loginLimiter = rateLimit({
            windowMs: 15 * 60 * 1000, // 15 minutes
            max: 5, // 5 attempts per window
            message: { success: false, message: 'Too many login attempts, please try again later.' },
            standardHeaders: true,
            legacyHeaders: false,
        });

        this.app.use('/api/login', loginLimiter);

        // Session middleware
        const isProduction = process.env.NODE_ENV === 'production';
        const useHttps = process.env.HTTPS_ENABLED === 'true';
        const sessionMiddleware = session({
            secret: process.env.SESSION_SECRET || 'devbot26-secret-key-change-this',
            resave: false,
            saveUninitialized: false,
            cookie: {
                secure: useHttps, // Only enable secure flag when HTTPS is actually used
                httpOnly: true,
                sameSite: 'strict',
                maxAge: 24 * 60 * 60 * 1000 // 24 hours
            }
        });

        this.app.use(sessionMiddleware);
        this.app.use(express.json());
        this.app.use(express.static(path.join(__dirname, 'public')));
        this.app.use('/tmp', express.static(path.join(__dirname, 'tmp'))); // Serve temp files

        // Share session with socket.io
        this.io.use((socket, next) => {
            sessionMiddleware(socket.request, {}, next);
        });
    }

    // Auth middleware
    requireAuth(req, res, next) {
        if (req.session && req.session.authenticated) {
            next();
        } else {
            res.status(401).json({ error: 'Unauthorized' });
        }
    }

    // API Key middleware
    requireApiKey(req, res, next) {
        const apiKey = req.headers['x-api-key'];
        const validKey = process.env.BOT_API_SECRET;

        if (!validKey) {
            return res.status(500).json({ success: false, error: 'API key not configured' });
        }

        if (apiKey === validKey) {
            next();
        } else {
            res.status(401).json({ success: false, error: 'Invalid API key' });
        }
    }
    
    setupRoutes() {
        // Main dashboard - serve minified HTML in production
        this.app.get('/', (req, res) => {
            const isDevelopment = process.env.NODE_ENV !== 'production';
            const htmlFile = isDevelopment ? 'dashboard.html' : 'dashboard.min.html';
            const htmlPath = path.join(__dirname, 'public', htmlFile);

            // Check if file exists
            const fs = require('fs');
            if (!fs.existsSync(htmlPath)) {
                console.error(`[DASHBOARD] ${htmlFile} not found! Run 'npm run build' first.`);
                return res.status(500).send('<!DOCTYPE html><html><body><h1>Error</h1><p>Dashboard not built. Run: npm run build</p></body></html>');
            }

            res.sendFile(htmlPath);
        });

        // Dynamic script serving: dev = dashboard.js, prod = dashboard.min.js
        this.app.get('/app.js', (req, res) => {
            const isDevelopment = process.env.NODE_ENV !== 'production';
            const scriptFile = isDevelopment ? 'dashboard.js' : 'dashboard.min.js';
            const scriptPath = path.join(__dirname, 'public', scriptFile);

            // Check if file exists
            const fs = require('fs');
            if (!fs.existsSync(scriptPath)) {
                console.error(`[DASHBOARD] ${scriptFile} not found! Run 'npm run build' first.`);
                return res.status(500).send('// Application script not found. Run npm run build.');
            }

            res.sendFile(scriptPath);
        });

        // Login API
        this.app.post('/api/login', async (req, res) => {
            const { username, password } = req.body;

            // Input validation
            if (!username || !password || typeof username !== 'string' || typeof password !== 'string') {
                return res.status(400).json({ success: false, message: 'Invalid input' });
            }

            // Sanitize username (basic)
            const sanitizedUsername = username.trim();

            // Check username and password with bcrypt
            try {
                const isPasswordValid = await bcrypt.compare(password, this.authPasswordHash);

                if (sanitizedUsername === this.authUsername && isPasswordValid) {
                    // Regenerate session to prevent session fixation
                    req.session.regenerate((err) => {
                        if (err) {
                            console.error('[DASHBOARD] Session regeneration error:', err);
                            return res.status(500).json({ success: false, message: 'Login failed' });
                        }

                        req.session.authenticated = true;
                        req.session.username = sanitizedUsername;
                        res.json({ success: true });
                    });
                } else {
                    // Use same error message for both username and password failures (security best practice)
                    res.status(401).json({ success: false, message: 'Invalid credentials' });
                }
            } catch (error) {
                console.error('[DASHBOARD] Login error:', error);
                res.status(500).json({ success: false, message: 'Login failed' });
            }
        });

        // Logout API
        this.app.post('/api/logout', (req, res) => {
            req.session.destroy((err) => {
                if (err) {
                    res.status(500).json({ success: false, error: 'Logout failed' });
                } else {
                    res.clearCookie('connect.sid'); // Clear session cookie
                    res.json({ success: true });
                }
            });
        });

        // Check auth status
        this.app.get('/api/auth-status', (req, res) => {
            res.json({ authenticated: req.session && req.session.authenticated === true });
        });

        // API: Send message (requires API key)
        this.app.post('/api/send-message', this.requireApiKey.bind(this), async (req, res) => {
            try {
                const { to, message } = req.body;

                // Validate input
                if (!to || !message) {
                    return res.status(400).json({ success: false, error: 'Missing required fields: to, message' });
                }

                if (typeof to !== 'string' || typeof message !== 'string') {
                    return res.status(400).json({ success: false, error: 'Invalid field types' });
                }

                // Check bot status
                if (this.botStatus !== 'connected') {
                    return res.status(503).json({ success: false, error: 'Bot not connected' });
                }

                // Get bot socket from wachan
                const wachan = require('wachan');
                const socket = wachan.getSocket();

                if (!socket) {
                    return res.status(503).json({ success: false, error: 'Bot socket not available' });
                }

                // Normalize target (add @s.whatsapp.net if not present)
                let target = to.trim();
                if (!/[@]/.test(target)) {
                    target = `${target}@s.whatsapp.net`;
                }

                // Send message
                await socket.sendMessage(target, { text: message });

                this.addLog('info', `[API] Message sent to ${target}`);
                res.json({ success: true, message: 'Message sent successfully', to: target });

            } catch (error) {
                this.addLog('error', `[API] Send message failed: ${error.message}`);
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // API: Wait for reply (requires API key)
        this.app.post('/api/wait-for-reply', this.requireApiKey.bind(this), async (req, res) => {
            try {
                const { from, timeout = 60000 } = req.body;

                // Validate input
                if (!from) {
                    return res.status(400).json({ success: false, error: 'Missing required field: from' });
                }

                if (typeof from !== 'string') {
                    return res.status(400).json({ success: false, error: 'Invalid field type for from' });
                }

                // Validate timeout
                const timeoutMs = parseInt(timeout);
                if (isNaN(timeoutMs) || timeoutMs < 1000 || timeoutMs > 300000) {
                    return res.status(400).json({ success: false, error: 'Timeout must be between 1000 and 300000 ms' });
                }

                // Check bot status
                if (this.botStatus !== 'connected') {
                    return res.status(503).json({ success: false, error: 'Bot not connected' });
                }

                // Normalize sender (add @s.whatsapp.net if not present)
                let sender = from.trim();
                if (!/[@]/.test(sender)) {
                    sender = `${sender}@s.whatsapp.net`;
                }

                this.addLog('info', `[API] Waiting for reply from ${sender} (timeout: ${timeoutMs}ms)`);

                // Wait for message
                const wachan = require('wachan');
                const reply = await this.waitForMessageFrom(sender, timeoutMs, wachan);

                this.addLog('info', `[API] Reply received from ${sender}`);
                res.json({
                    success: true,
                    message: 'Reply received',
                    from: sender,
                    reply: {
                        text: reply.text || null,
                        hasMedia: !!reply.media,
                        mediaType: reply.media?.type || null,
                        timestamp: reply.timestamp
                    }
                });

            } catch (error) {
                if (error.message === 'TIMEOUT') {
                    this.addLog('info', `[API] Wait for reply timeout`);
                    return res.status(408).json({ success: false, error: 'Timeout waiting for reply' });
                }

                this.addLog('error', `[API] Wait for reply failed: ${error.message}`);
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Protected API endpoints
        // API: Restart bot instance
        this.app.post('/api/restart', this.requireAuth.bind(this), async (req, res) => {
            try {
                this.addLog('info', 'Restarting bot instance...');
                this.setStatus('restarting');
                
                // Stop current bot
                if (this.stopBotCallback) {
                    await this.stopBotCallback();
                }
                
                // Wait a bit
                await new Promise(resolve => setTimeout(resolve, 2000));
                
                // Start new bot
                if (this.startBotCallback) {
                    await this.startBotCallback();
                }
                
                res.json({ success: true });
            } catch (error) {
                this.addLog('error', `Restart failed: ${error.message}`);
                this.setStatus('stopped');
                res.status(500).json({ success: false, error: error.message });
            }
        });
        
        // API: Shutdown bot instance
        this.app.post('/api/shutdown', this.requireAuth.bind(this), async (req, res) => {
            try {
                this.addLog('info', 'Shutting down bot instance...');

                if (this.stopBotCallback) {
                    await this.stopBotCallback();
                }

                this.awaitingPhoneInput = false;
                this.setStatus('stopped');
                this.addLog('success', 'Bot stopped. Click Start to run again.');

                res.json({ success: true });
            } catch (error) {
                this.addLog('error', `Shutdown failed: ${error.message}`);
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // API: Start bot instance
        this.app.post('/api/start', this.requireAuth.bind(this), async (req, res) => {
            try {
                this.addLog('info', 'Starting bot instance...');
                this.setStatus('connecting');

                if (this.startBotCallback) {
                    await this.startBotCallback();
                }

                res.json({ success: true });
            } catch (error) {
                this.addLog('error', `Start failed: ${error.message}`);
                this.setStatus('stopped');
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // API: Stop bot (during connection)
        this.app.post('/api/stop', this.requireAuth.bind(this), async (req, res) => {
            try {
                this.addLog('info', 'Stopping bot connection...');

                if (this.stopBotCallback) {
                    await this.stopBotCallback();
                }

                this.awaitingPhoneInput = false;
                this.setStatus('stopped');
                this.addLog('success', 'Bot connection stopped.');

                res.json({ success: true });
            } catch (error) {
                this.addLog('error', `Stop failed: ${error.message}`);
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // API: Change phone number
        this.app.post('/api/change-phone', this.requireAuth.bind(this), async (req, res) => {
            try {
                this.addLog('info', 'Changing phone number...');

                // Stop current connection
                if (this.stopBotCallback) {
                    await this.stopBotCallback();
                }

                // Clear saved phone and awaiting state
                this.phoneNumber = null;
                this.awaitingPhoneInput = false;

                await new Promise(resolve => setTimeout(resolve, 1000));

                // Restart with new phone
                this.addLog('info', 'Ready for new phone number.');
                this.setStatus('connecting');

                if (this.startBotCallback) {
                    await this.startBotCallback();
                }

                res.json({ success: true });
            } catch (error) {
                this.addLog('error', `Change phone failed: ${error.message}`);
                this.setStatus('stopped');
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // API: Get all commands
        this.app.get('/api/commands', this.requireAuth.bind(this), (req, res) => {
            try {
                if (!this.commandsModule) {
                    return res.json({ success: true, commands: [] });
                }

                const allCommands = this.commandsModule.getCommands();
                const commandList = [];

                // Flatten commands from sections and unsectioned
                if (allCommands.sections) {
                    Object.entries(allCommands.sections).forEach(([section, cmds]) => {
                        cmds.forEach(cmd => {
                            commandList.push({
                                name: cmd.name,
                                aliases: cmd.aliases || [],
                                description: cmd.description || 'No description',
                                sectionName: cmd.sectionName || section,
                                temporary: cmd.temporary || false,
                                source: cmd.source || 'File',
                                ownerOnly: cmd.ownerOnly || false,
                                adminOnly: cmd.adminOnly || false
                            });
                        });
                    });
                }

                if (allCommands.unsectioned) {
                    allCommands.unsectioned.forEach(cmd => {
                        commandList.push({
                            name: cmd.name,
                            aliases: cmd.aliases || [],
                            description: cmd.description || 'No description',
                            sectionName: cmd.sectionName || 'Unsectioned',
                            temporary: cmd.temporary || false,
                            source: cmd.source || 'File',
                            ownerOnly: cmd.ownerOnly || false,
                            adminOnly: cmd.adminOnly || false
                        });
                    });
                }

                res.json({ success: true, commands: commandList });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // API: Add temporary command
        this.app.post('/api/commands', this.requireAuth.bind(this), async (req, res) => {
            try {
                const { name, code, source } = req.body;

                if (!name || !code) {
                    return res.status(400).json({ success: false, error: 'Name and code are required' });
                }

                if (!this.commandsModule) {
                    return res.status(500).json({ success: false, error: 'Commands module not available' });
                }

                // Evaluate code
                const commandModule = this.evalCommandCode(code);

                if (!commandModule || !commandModule.response) {
                    return res.status(400).json({ success: false, error: 'Invalid command structure' });
                }

                // Add command
                this.commandsModule.add(name, commandModule.response, {
                    ...commandModule.options,
                    temporary: true,
                    source: source || 'Dashboard'
                });

                this.addLog('success', `Command '${name}' added via dashboard`);
                res.json({ success: true, message: `Command '${name}' added successfully` });
            } catch (error) {
                this.addLog('error', `Failed to add command: ${error.message}`);
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // API: Remove command
        this.app.delete('/api/commands/:name', this.requireAuth.bind(this), (req, res) => {
            try {
                const { name } = req.params;

                if (!this.commandsModule) {
                    return res.status(500).json({ success: false, error: 'Commands module not available' });
                }

                const cmdInfo = this.commandsModule.getCommandInfo(name);

                if (!cmdInfo) {
                    return res.status(404).json({ success: false, error: 'Command not found' });
                }

                // Only allow removing temporary commands
                if (!cmdInfo.temporary) {
                    return res.status(403).json({ success: false, error: 'Cannot remove permanent commands' });
                }

                // Remove command by removing its receiver
                if (cmdInfo.receiver && typeof cmdInfo.receiver.remove === 'function') {
                    cmdInfo.receiver.remove();
                    this.addLog('success', `Command '${name}' removed via dashboard`);
                    res.json({ success: true, message: `Command '${name}' removed successfully` });
                } else {
                    res.status(500).json({ success: false, error: 'Cannot remove command' });
                }
            } catch (error) {
                this.addLog('error', `Failed to remove command: ${error.message}`);
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // ===== MEMORY MANAGEMENT ENDPOINTS =====

        // API: Get all rooms with memory
        this.app.get('/api/memory', this.requireAuth.bind(this), async (req, res) => {
            try {
                const rooms = await memoryManager.getAllRooms();
                res.json({ success: true, memories: rooms });
            } catch (error) {
                this.addLog('error', `Failed to get memory rooms: ${error.message}`);
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // ===== ROOM MANAGEMENT ENDPOINTS =====

        // API: Get all rooms
        this.app.get('/api/rooms', this.requireAuth.bind(this), async (req, res) => {
            try {
                const roomManager = require('./roomManager');
                const rooms = await roomManager.getAllRooms();
                res.json({ success: true, rooms });
            } catch (error) {
                this.addLog('error', `Failed to get rooms: ${error.message}`);
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // API: Add or update room
        this.app.post('/api/rooms', this.requireAuth.bind(this), async (req, res) => {
            try {
                const { roomId, name, allowAI, allowAiCommand, allowCommands, ignoreAll, allowedCommands } = req.body;

                if (!roomId) {
                    return res.status(400).json({ success: false, error: 'roomId required' });
                }

                const roomManager = require('./roomManager');
                const existing = await roomManager.getRoomSettings(roomId);

                let room;
                if (existing) {
                    room = await roomManager.updateRoom(roomId, {
                        name,
                        allowAI,
                        allowAiCommand,
                        allowCommands,
                        ignoreAll,
                        allowedCommands
                    });
                    this.addLog('success', `Updated room: ${name || roomId}`);
                } else {
                    room = await roomManager.addRoom(roomId, name, {
                        allowAI,
                        allowAiCommand,
                        allowCommands,
                        ignoreAll,
                        allowedCommands
                    });
                    this.addLog('success', `Added room: ${name || roomId}`);
                }

                res.json({ success: true, room });
            } catch (error) {
                this.addLog('error', `Failed to add/update room: ${error.message}`);
                res.status(400).json({ success: false, error: error.message });
            }
        });

        // API: Update room settings
        this.app.put('/api/rooms/:roomId', this.requireAuth.bind(this), async (req, res) => {
            try {
                const { roomId } = req.params;
                const updates = req.body;

                const roomManager = require('./roomManager');
                const room = await roomManager.updateRoom(roomId, updates);

                this.addLog('success', `Updated room settings: ${room.name || roomId}`);
                res.json({ success: true, room });
            } catch (error) {
                this.addLog('error', `Failed to update room: ${error.message}`);
                res.status(400).json({ success: false, error: error.message });
            }
        });

        // API: Delete room
        this.app.delete('/api/rooms/:roomId', this.requireAuth.bind(this), async (req, res) => {
            try {
                const { roomId } = req.params;

                const roomManager = require('./roomManager');
                const removed = await roomManager.removeRoom(roomId);

                if (removed) {
                    this.addLog('success', `Removed room: ${roomId}`);
                    res.json({ success: true });
                } else {
                    res.status(404).json({ success: false, error: 'Room not found' });
                }
            } catch (error) {
                this.addLog('error', `Failed to remove room: ${error.message}`);
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // API: Get memory details for a specific room
        this.app.get('/api/memory/:roomId', this.requireAuth.bind(this), async (req, res) => {
            try {
                const { roomId } = req.params;
                const messages = await memoryManager.loadMemory(roomId);
                const stats = await memoryManager.getMemoryStats(roomId);

                res.json({
                    success: true,
                    roomId,
                    messages,
                    stats
                });
            } catch (error) {
                this.addLog('error', `Failed to get memory for ${req.params.roomId}: ${error.message}`);
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // API: Clear memory for a specific room
        this.app.delete('/api/memory/:roomId', this.requireAuth.bind(this), async (req, res) => {
            try {
                const { roomId } = req.params;
                const cleared = await memoryManager.clearMemory(roomId);

                if (cleared) {
                    this.addLog('success', `Memory cleared for room: ${roomId}`);
                    res.json({ success: true, message: `Memory cleared for ${roomId}` });
                } else {
                    res.status(500).json({ success: false, error: 'Failed to clear memory' });
                }
            } catch (error) {
                this.addLog('error', `Failed to clear memory for ${req.params.roomId}: ${error.message}`);
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // API: Get all whitelisted numbers
        this.app.get('/api/whitelist', this.requireAuth.bind(this), async (req, res) => {
            try {
                const whitelistManager = require('./whitelistManager');
                const numbers = await whitelistManager.getAll();

                res.json({ success: true, numbers: numbers });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // API: Add number to whitelist
        this.app.post('/api/whitelist', this.requireAuth.bind(this), async (req, res) => {
            try {
                const { number, model, pushName, quota, resetPeriod, maxToolIterations } = req.body;

                if (!number || typeof number !== 'string') {
                    return res.status(400).json({ success: false, error: 'Valid phone number is required' });
                }

                // Validate format (basic) - support both JID and LID
                const sanitized = number.trim();
                if (!/^\d+(@s\.whatsapp\.net|@lid)?$/.test(sanitized)) {
                    return res.status(400).json({ success: false, error: 'Invalid phone number format' });
                }

                // Validate model dynamically from settings
                const settingsManager = require('./settingsManager');
                await settingsManager.initialize(); // Force reload to get latest models
                const supportedModels = await settingsManager.getSupportedModels();
                const validModelIds = supportedModels.map(m => m.id);

                // Use provided model if valid, otherwise use default from settings
                let selectedModel;
                if (model && validModelIds.includes(model)) {
                    selectedModel = model;
                } else {
                    selectedModel = await settingsManager.getDefaultModel();
                }

                // Validate pushName if provided
                const sanitizedPushName = pushName && typeof pushName === 'string' ? pushName.trim() : null;

                // Validate quota
                const selectedQuota = quota && typeof quota === 'number' && quota >= 1 && quota <= 10000 ? quota : 100;

                // Validate resetPeriod
                const validResetPeriods = ['per5Hours', 'perDay', 'perMonth'];
                const selectedResetPeriod = resetPeriod && validResetPeriods.includes(resetPeriod) ? resetPeriod : 'perDay';

                // Validate maxToolIterations (null or 1-50)
                let selectedMaxToolIterations = null;
                if (maxToolIterations !== null && maxToolIterations !== undefined) {
                    if (typeof maxToolIterations === 'number' && maxToolIterations >= 1 && maxToolIterations <= 50) {
                        selectedMaxToolIterations = maxToolIterations;
                    }
                }

                const whitelistManager = require('./whitelistManager');
                const normalized = await whitelistManager.addNumber(sanitized, selectedModel, sanitizedPushName, selectedQuota, selectedResetPeriod, selectedMaxToolIterations);

                const logName = sanitizedPushName ? ` (${sanitizedPushName})` : '';
                const resetLabel = selectedResetPeriod === 'per5Hours' ? '5h' : selectedResetPeriod === 'perDay' ? 'day' : 'month';
                this.addLog('success', `Added ${normalized}${logName} to AI whitelist: ${selectedModel}, ${selectedQuota}/${resetLabel}`);
                res.json({
                    success: true,
                    message: 'Number added to whitelist',
                    number: normalized,
                    model: selectedModel,
                    pushName: sanitizedPushName,
                    quota: selectedQuota,
                    resetPeriod: selectedResetPeriod,
                    maxToolIterations: selectedMaxToolIterations
                });
            } catch (error) {
                this.addLog('error', `Failed to add to whitelist: ${error.message}`);
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // API: Update whitelist entry (change model or number)
        this.app.put('/api/whitelist/:number', this.requireAuth.bind(this), async (req, res) => {
            try {
                const { number } = req.params;
                const { model, newNumber, pushName, quota, usageCount, resetPeriod, enabledTools, maxToolIterations } = req.body;

                // Validate model dynamically from settings
                const settingsManager = require('./settingsManager');
                await settingsManager.initialize(); // Force reload to get latest models
                const supportedModels = await settingsManager.getSupportedModels();
                const validModelIds = supportedModels.map(m => m.id);

                if (!model || !validModelIds.includes(model)) {
                    return res.status(400).json({
                        success: false,
                        error: `Valid model is required. Available: ${validModelIds.join(', ')}`
                    });
                }

                const whitelistManager = require('./whitelistManager');
                const decodedOldNumber = decodeURIComponent(number);

                // Check if old number exists
                const isWhitelisted = await whitelistManager.isWhitelisted(decodedOldNumber);
                if (!isWhitelisted) {
                    return res.status(404).json({ success: false, error: 'Number not found in whitelist' });
                }

                // Validate pushName if provided
                const sanitizedPushName = pushName && typeof pushName === 'string' ? pushName.trim() : null;

                // Validate quota
                const selectedQuota = quota && typeof quota === 'number' && quota >= 1 && quota <= 10000 ? quota : 100;

                // Validate usageCount
                const selectedUsageCount = usageCount !== undefined && typeof usageCount === 'number' &&
                                          usageCount >= 0 && usageCount <= selectedQuota ? usageCount : 0;

                // Validate resetPeriod
                const validResetPeriods = ['per5Hours', 'perDay', 'perMonth'];
                const selectedResetPeriod = resetPeriod && validResetPeriods.includes(resetPeriod) ? resetPeriod : 'perDay';

                // Validate enabledTools (should be array of tool names)
                const selectedEnabledTools = Array.isArray(enabledTools) ? enabledTools : [];

                // Validate maxToolIterations (null or 1-50)
                let selectedMaxToolIterations = null;
                if (maxToolIterations !== null && maxToolIterations !== undefined) {
                    if (typeof maxToolIterations === 'number' && maxToolIterations >= 1 && maxToolIterations <= 50) {
                        selectedMaxToolIterations = maxToolIterations;
                    }
                }

                // If number is being changed
                if (newNumber && newNumber !== decodedOldNumber) {
                    // Validate new number format
                    const sanitized = newNumber.trim();
                    if (!/^\d+(@s\.whatsapp\.net|@lid)?$/.test(sanitized)) {
                        return res.status(400).json({ success: false, error: 'Invalid phone number format' });
                    }

                    // Remove old number
                    await whitelistManager.removeNumber(decodedOldNumber);

                    // Add new number with all settings
                    const normalized = await whitelistManager.addNumber(sanitized, model, sanitizedPushName, selectedQuota, selectedResetPeriod, selectedMaxToolIterations);

                    // Update usage count if provided
                    if (selectedUsageCount > 0) {
                        await whitelistManager.setUsageCount(normalized, selectedUsageCount);
                    }

                    // Update enabled tools
                    await whitelistManager.updateEnabledTools(normalized, selectedEnabledTools);

                    const logName = sanitizedPushName ? ` (${sanitizedPushName})` : '';
                    const resetLabel = selectedResetPeriod === 'per5Hours' ? '5h' : selectedResetPeriod === 'perDay' ? 'day' : 'month';
                    this.addLog('success', `Updated whitelist: ${decodedOldNumber} → ${normalized}${logName} (${model}, ${selectedQuota}/${resetLabel})`);
                    res.json({
                        success: true,
                        message: 'Whitelist entry updated',
                        number: normalized,
                        model,
                        pushName: sanitizedPushName,
                        quota: selectedQuota,
                        usageCount: selectedUsageCount,
                        resetPeriod: selectedResetPeriod,
                        enabledTools: selectedEnabledTools,
                        maxToolIterations: selectedMaxToolIterations
                    });
                } else {
                    // Just update settings for same number
                    await whitelistManager.addNumber(decodedOldNumber, model, sanitizedPushName, selectedQuota, selectedResetPeriod, selectedMaxToolIterations);

                    // Update usage count
                    await whitelistManager.setUsageCount(decodedOldNumber, selectedUsageCount);

                    // Update enabled tools
                    await whitelistManager.updateEnabledTools(decodedOldNumber, selectedEnabledTools);

                    const logName = sanitizedPushName ? ` (${sanitizedPushName})` : '';
                    const resetLabel = selectedResetPeriod === 'per5Hours' ? '5h' : selectedResetPeriod === 'perDay' ? 'day' : 'month';
                    this.addLog('success', `Updated ${decodedOldNumber}${logName}: ${model}, ${selectedQuota}/${resetLabel}, usage: ${selectedUsageCount}`);
                    res.json({
                        success: true,
                        message: 'Whitelist entry updated',
                        number: decodedOldNumber,
                        model,
                        pushName: sanitizedPushName,
                        quota: selectedQuota,
                        usageCount: selectedUsageCount,
                        resetPeriod: selectedResetPeriod,
                        enabledTools: selectedEnabledTools,
                        maxToolIterations: selectedMaxToolIterations
                    });
                }
            } catch (error) {
                this.addLog('error', `Failed to update whitelist: ${error.message}`);
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // API: Remove number from whitelist
        this.app.delete('/api/whitelist/:number', this.requireAuth.bind(this), async (req, res) => {
            try {
                const { number } = req.params;

                const whitelistManager = require('./whitelistManager');
                const existed = await whitelistManager.removeNumber(decodeURIComponent(number));

                if (existed) {
                    this.addLog('success', `Removed ${number} from AI whitelist`);
                    res.json({ success: true, message: 'Number removed from whitelist' });
                } else {
                    res.status(404).json({ success: false, error: 'Number not found in whitelist' });
                }
            } catch (error) {
                this.addLog('error', `Failed to remove from whitelist: ${error.message}`);
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // ============================================
        // Contact Management API Routes
        // ============================================

        // API: Get all contacts
        this.app.get('/api/contacts', this.requireAuth.bind(this), async (req, res) => {
            try {
                const contactManager = require('./contactManager');
                const contacts = await contactManager.getAllContacts();

                res.json({
                    success: true,
                    contacts: contacts
                });
            } catch (error) {
                this.addLog('error', `Failed to get contacts: ${error.message}`);
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // API: Add contact
        this.app.post('/api/contacts', this.requireAuth.bind(this), async (req, res) => {
            try {
                const { jid, name, type } = req.body;

                if (!jid || !name || !type) {
                    return res.status(400).json({
                        success: false,
                        error: 'Missing required fields: jid, name, type'
                    });
                }

                if (!['user', 'group'].includes(type)) {
                    return res.status(400).json({
                        success: false,
                        error: 'Type must be "user" or "group"'
                    });
                }

                const contactManager = require('./contactManager');

                // Check if already exists
                const existing = await contactManager.getContact(jid);
                if (existing) {
                    return res.status(400).json({
                        success: false,
                        error: 'Contact already exists'
                    });
                }

                await contactManager.addContact(jid, name, type, 'dashboard');

                this.addLog('success', `Added contact: ${name} (${type})`);
                res.json({
                    success: true,
                    message: 'Contact added'
                });
            } catch (error) {
                this.addLog('error', `Failed to add contact: ${error.message}`);
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // API: Delete contact
        this.app.delete('/api/contacts/:jid', this.requireAuth.bind(this), async (req, res) => {
            try {
                const { jid } = req.params;
                const decodedJid = decodeURIComponent(jid);

                const contactManager = require('./contactManager');
                const existed = await contactManager.removeContact(decodedJid);

                if (existed) {
                    this.addLog('success', `Removed contact: ${decodedJid}`);
                    res.json({ success: true, message: 'Contact removed' });
                } else {
                    res.status(404).json({ success: false, error: 'Contact not found' });
                }
            } catch (error) {
                this.addLog('error', `Failed to remove contact: ${error.message}`);
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // API: Get AI default settings
        this.app.get('/api/ai-settings/defaults', this.requireAuth.bind(this), async (req, res) => {
            try {
                const settingsManager = require('./settingsManager');
                const defaults = await settingsManager.getAll();

                res.json({
                    success: true,
                    defaults: {
                        defaultModel: defaults.defaultModel,
                        defaultQuota: defaults.defaultQuota,
                        defaultResetPeriod: defaults.defaultResetPeriod,
                        defaultVisionModel: defaults.defaultVisionModel,
                        defaultEnabledTools: defaults.defaultEnabledTools || [],
                        whitelistMode: defaults.whitelistMode || 'strict',
                        aiIdentity: defaults.aiIdentity || 'You are DevBot26, an AI assistant responding via WhatsApp.',
                        maxMemoryMessages: defaults.maxMemoryMessages || 100,
                        maxToolIterations: defaults.maxToolIterations || 10
                    }
                });
            } catch (error) {
                this.addLog('error', `Failed to get AI defaults: ${error.message}`);
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // API: Update AI default settings
        this.app.put('/api/ai-settings/defaults', this.requireAuth.bind(this), async (req, res) => {
            try {
                const { defaultModel, defaultQuota, defaultResetPeriod, defaultVisionModel, whitelistMode, aiIdentity, maxMemoryMessages, maxToolIterations, defaultEnabledTools } = req.body;

                const settingsManager = require('./settingsManager');

                // Validate models dynamically
                await settingsManager.initialize();
                const supportedModels = await settingsManager.getSupportedModels();
                const validModelIds = supportedModels.map(m => m.id);

                if (defaultModel && !validModelIds.includes(defaultModel)) {
                    return res.status(400).json({
                        success: false,
                        error: `Invalid default model. Available: ${validModelIds.join(', ')}`
                    });
                }

                if (defaultVisionModel && !validModelIds.includes(defaultVisionModel)) {
                    return res.status(400).json({
                        success: false,
                        error: `Invalid vision model. Available: ${validModelIds.join(', ')}`
                    });
                }

                // Validate defaultEnabledTools if provided
                const validatedEnabledTools = Array.isArray(defaultEnabledTools) ? defaultEnabledTools : undefined;

                await settingsManager.updateSettings({
                    defaultModel,
                    defaultQuota,
                    defaultResetPeriod,
                    defaultVisionModel,
                    whitelistMode,
                    aiIdentity,
                    maxMemoryMessages,
                    maxToolIterations,
                    defaultEnabledTools: validatedEnabledTools
                });

                // Get model name for logging (dynamic)
                const modelInfo = supportedModels.find(m => m.id === defaultModel);
                const modelName = modelInfo ? modelInfo.name : defaultModel;

                const resetLabel = defaultResetPeriod === 'per5Hours' ? '5h' :
                                  defaultResetPeriod === 'perDay' ? 'day' : 'month';

                let logMessage = `Updated AI defaults: ${modelName}, ${defaultQuota}/${resetLabel}`;
                if (whitelistMode) {
                    logMessage += `, whitelist: ${whitelistMode}`;
                }
                if (aiIdentity) {
                    logMessage += `, identity updated`;
                }
                if (validatedEnabledTools !== undefined) {
                    logMessage += `, tools: ${validatedEnabledTools.length || 'none'}`;
                }
                if (maxMemoryMessages) {
                    logMessage += `, max memory: ${maxMemoryMessages}`;
                }
                if (maxToolIterations) {
                    logMessage += `, max tool iterations: ${maxToolIterations}`;
                }

                this.addLog('success', logMessage);
                res.json({
                    success: true,
                    message: 'Default settings updated',
                    defaults: {
                        defaultModel,
                        defaultQuota,
                        defaultResetPeriod,
                        defaultVisionModel,
                        whitelistMode,
                        aiIdentity,
                        maxMemoryMessages,
                        maxToolIterations
                    }
                });
            } catch (error) {
                this.addLog('error', `Failed to update AI defaults: ${error.message}`);
                res.status(400).json({ success: false, error: error.message });
            }
        });

        // API: Get supported models
        this.app.get('/api/ai-settings/models', this.requireAuth.bind(this), async (req, res) => {
            try {
                const settingsManager = require('./settingsManager');
                const models = await settingsManager.getSupportedModels();

                res.json({
                    success: true,
                    models: models
                });
            } catch (error) {
                this.addLog('error', `Failed to get models: ${error.message}`);
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // API: Add new model
        this.app.post('/api/ai-settings/models', this.requireAuth.bind(this), async (req, res) => {
            try {
                const { id, displayName, provider, supportsVision, enabled } = req.body;

                if (!id || !displayName) {
                    return res.status(400).json({ success: false, error: 'Model ID and display name are required' });
                }

                const settingsManager = require('./settingsManager');
                const newModel = await settingsManager.addModel({
                    id,
                    displayName,
                    provider: provider || 'anthropic',
                    supportsVision: supportsVision || false,
                    enabled: enabled !== undefined ? enabled : true
                });

                this.addLog('success', `Added AI model: ${displayName} (${id}, ${provider || 'anthropic'})`);
                res.json({
                    success: true,
                    message: 'Model added successfully',
                    model: newModel
                });
            } catch (error) {
                this.addLog('error', `Failed to add model: ${error.message}`);
                res.status(400).json({ success: false, error: error.message });
            }
        });

        // API: Update model
        this.app.put('/api/ai-settings/models/:id', this.requireAuth.bind(this), async (req, res) => {
            try {
                const { id } = req.params;
                const { displayName, provider, supportsVision, enabled } = req.body;

                const settingsManager = require('./settingsManager');
                const updatedModel = await settingsManager.updateModel(id, {
                    displayName,
                    provider,
                    supportsVision,
                    enabled
                });

                this.addLog('success', `Updated AI model: ${id}`);
                res.json({
                    success: true,
                    message: 'Model updated successfully',
                    model: updatedModel
                });
            } catch (error) {
                this.addLog('error', `Failed to update model: ${error.message}`);
                res.status(400).json({ success: false, error: error.message });
            }
        });

        // API: Remove model
        this.app.delete('/api/ai-settings/models/:id', this.requireAuth.bind(this), async (req, res) => {
            try {
                const { id } = req.params;

                const settingsManager = require('./settingsManager');
                await settingsManager.removeModel(id);

                this.addLog('success', `Removed AI model: ${id}`);
                res.json({
                    success: true,
                    message: 'Model removed successfully'
                });
            } catch (error) {
                this.addLog('error', `Failed to remove model: ${error.message}`);
                res.status(400).json({ success: false, error: error.message });
            }
        });

        // API: Get API configuration
        this.app.get('/api/ai-settings/api-config', this.requireAuth.bind(this), async (req, res) => {
            try {
                const settingsManager = require('./settingsManager');
                const apiEndpoint = await settingsManager.getApiEndpoint();
                const apiKey = await settingsManager.getApiKey();
                const apiTimeout = await settingsManager.getApiTimeout();
                const settings = await settingsManager.getAll();

                res.json({
                    success: true,
                    config: {
                        apiEndpoint: apiEndpoint,
                        apiKey: apiKey,
                        apiTimeout: apiTimeout,
                        storedEndpoint: settings.apiEndpoint, // Raw stored value (null if using env)
                        storedKey: settings.apiKey,           // Raw stored value (null if using env)
                        isOverridden: !!(settings.apiEndpoint || settings.apiKey)
                    }
                });
            } catch (error) {
                this.addLog('error', `Failed to get API config: ${error.message}`);
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // API: Update API configuration
        this.app.put('/api/ai-settings/api-config', this.requireAuth.bind(this), async (req, res) => {
            try {
                const { apiEndpoint, apiKey, apiTimeout } = req.body;

                // Validate apiTimeout if provided
                if (apiTimeout !== undefined && (typeof apiTimeout !== 'number' || apiTimeout < 10000 || apiTimeout > 600000)) {
                    return res.status(400).json({
                        success: false,
                        error: 'API timeout must be between 10000 and 600000 milliseconds (10-600 seconds)'
                    });
                }

                const settingsManager = require('./settingsManager');
                await settingsManager.updateSettings({
                    apiEndpoint: apiEndpoint || null,
                    apiKey: apiKey || null,
                    apiTimeout: apiTimeout || undefined
                });

                const timeoutLog = apiTimeout ? `, timeout=${apiTimeout / 1000}s` : '';
                if (apiEndpoint || apiKey || apiTimeout) {
                    this.addLog('success', `Updated API config: endpoint=${apiEndpoint || 'env'}, key=${apiKey ? 'set' : 'env'}${timeoutLog}`);
                } else {
                    this.addLog('success', 'Reverted API config to .env values');
                }

                res.json({
                    success: true,
                    message: 'API configuration updated'
                });
            } catch (error) {
                this.addLog('error', `Failed to update API config: ${error.message}`);
                res.status(400).json({ success: false, error: error.message });
            }
        });

        // API: Get system prompts
        this.app.get('/api/ai-settings/system-prompts', this.requireAuth.bind(this), async (req, res) => {
            try {
                const settingsManager = require('./settingsManager');
                const available = await settingsManager.getAvailableSystemPrompts();
                const enabled = await settingsManager.getEnabledSystemPrompts();

                // Empty array means all enabled
                const isAllEnabled = enabled.length === 0;

                const prompts = available.map(prompt => ({
                    name: prompt.name,
                    description: prompt.description,
                    category: prompt.category,
                    file: prompt.file,
                    enabled: isAllEnabled || enabled.includes(prompt.name)
                }));

                res.json({
                    success: true,
                    prompts: prompts,
                    allEnabled: isAllEnabled
                });
            } catch (error) {
                this.addLog('error', `Failed to get system prompts: ${error.message}`);
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // API: Update enabled system prompts
        this.app.put('/api/ai-settings/system-prompts', this.requireAuth.bind(this), async (req, res) => {
            try {
                const { enabledPrompts } = req.body;

                if (!Array.isArray(enabledPrompts)) {
                    return res.status(400).json({
                        success: false,
                        error: 'enabledPrompts must be an array'
                    });
                }

                const settingsManager = require('./settingsManager');
                await settingsManager.updateEnabledSystemPrompts(enabledPrompts);

                const message = enabledPrompts.length === 0
                    ? 'All system prompts enabled'
                    : `Enabled ${enabledPrompts.length} system prompts`;

                this.addLog('success', message);
                res.json({
                    success: true,
                    message: message,
                    enabledPrompts: enabledPrompts
                });
            } catch (error) {
                this.addLog('error', `Failed to update system prompts: ${error.message}`);
                res.status(400).json({ success: false, error: error.message });
            }
        });

        // API: Get all tools
        this.app.get('/api/tools', this.requireAuth.bind(this), async (req, res) => {
            try {
                const tools = require('./tools');
                const temporaryToolsManager = require('./temporaryToolsManager');

                // Get all tool definitions (static + temporary, already merged)
                const allDefinitions = tools.getAllDefinitions();

                // Add metadata to distinguish static vs temporary tools
                const toolsWithMeta = allDefinitions.map(toolDef => {
                    const isTemporary = temporaryToolsManager.has(toolDef.name);

                    if (isTemporary) {
                        // Get temporary tool details
                        const tempTool = temporaryToolsManager.getAll().find(t => t.name === toolDef.name);
                        return {
                            name: toolDef.name,
                            description: toolDef.description,
                            input_schema: toolDef.input_schema,
                            temporary: true,
                            source: tempTool.source,
                            addedAt: tempTool.addedAt
                        };
                    } else {
                        // Static tool from tools/ directory
                        const source = tools.getToolSource(toolDef.name);

                        return {
                            name: toolDef.name,
                            description: toolDef.description,
                            input_schema: toolDef.input_schema,
                            temporary: false,
                            source: source || 'unknown'
                        };
                    }
                });

                res.json({ success: true, tools: toolsWithMeta });
            } catch (error) {
                this.addLog('error', `Failed to get tools: ${error.message}`);
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // API: Delete temporary tool
        this.app.delete('/api/tools/:name', this.requireAuth.bind(this), async (req, res) => {
            try {
                const { name } = req.params;
                const temporaryToolsManager = require('./temporaryToolsManager');

                // Only allow deleting temporary tools
                if (!temporaryToolsManager.has(name)) {
                    return res.status(404).json({ success: false, error: 'Tool not found or is not temporary' });
                }

                const removed = temporaryToolsManager.remove(name);

                if (removed) {
                    this.addLog('success', `Deleted temporary tool: ${name}`);
                    res.json({ success: true, message: 'Temporary tool deleted successfully' });
                } else {
                    res.status(404).json({ success: false, error: 'Tool not found' });
                }
            } catch (error) {
                this.addLog('error', `Failed to delete tool: ${error.message}`);
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // API: Add temporary tool
        this.app.post('/api/tools/temporary', this.requireAuth.bind(this), async (req, res) => {
            try {
                const { name, description, input_schema, implementation } = req.body;

                if (!name || !description || !input_schema || !implementation) {
                    return res.status(400).json({ success: false, error: 'Missing required fields: name, description, input_schema, implementation' });
                }

                // Validate name format (snake_case)
                if (!/^[a-z][a-z0-9_]*$/.test(name)) {
                    return res.status(400).json({ success: false, error: 'Tool name must be snake_case (lowercase letters, numbers, underscores)' });
                }

                // Validate input_schema
                if (typeof input_schema !== 'object' || !input_schema.type) {
                    return res.status(400).json({ success: false, error: 'Invalid input_schema: must be an object with a type field' });
                }

                // Evaluate implementation code to create function
                let implementationFn;
                try {
                    // Wrap in function to eval
                    implementationFn = eval(`(${implementation})`);

                    if (typeof implementationFn !== 'function') {
                        return res.status(400).json({ success: false, error: 'Implementation must be a function' });
                    }
                } catch (error) {
                    return res.status(400).json({ success: false, error: `Invalid implementation code: ${error.message}` });
                }

                const temporaryToolsManager = require('./temporaryToolsManager');

                // Check if tool already exists
                if (temporaryToolsManager.has(name)) {
                    return res.status(400).json({ success: false, error: 'Tool with this name already exists' });
                }

                // Add tool
                temporaryToolsManager.add(name, description, input_schema, implementationFn, 'Dashboard');

                this.addLog('success', `Added temporary tool: ${name}`);
                res.json({ success: true, message: 'Temporary tool added successfully' });
            } catch (error) {
                this.addLog('error', `Failed to add temporary tool: ${error.message}`);
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // ===== SCHEDULED TASKS ENDPOINTS =====

        // API: Get all scheduled tasks
        this.app.get('/api/scheduled-tasks', this.requireAuth.bind(this), async (req, res) => {
            try {
                const { status } = req.query;
                const scheduleManager = require('./scheduleManager');

                let tasks;
                if (status && status !== 'all') {
                    tasks = await scheduleManager.getAllTasks(status);
                } else {
                    tasks = await scheduleManager.getAllTasks();
                }

                // Sort by scheduled time
                tasks.sort((a, b) => {
                    if (a.status === 'pending' && b.status === 'pending') {
                        return a.scheduledTime - b.scheduledTime;
                    }
                    return b.createdAt - a.createdAt;
                });

                res.json({ success: true, tasks, count: tasks.length });
            } catch (error) {
                this.addLog('error', `Failed to get scheduled tasks: ${error.message}`);
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // API: Get specific task
        this.app.get('/api/scheduled-tasks/:taskId', this.requireAuth.bind(this), async (req, res) => {
            try {
                const { taskId } = req.params;
                const scheduleManager = require('./scheduleManager');

                const task = await scheduleManager.getTask(taskId);

                if (!task) {
                    return res.status(404).json({ success: false, error: 'Task not found' });
                }

                res.json({ success: true, task });
            } catch (error) {
                this.addLog('error', `Failed to get task: ${error.message}`);
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // API: Cancel scheduled task
        this.app.delete('/api/scheduled-tasks/:taskId', this.requireAuth.bind(this), async (req, res) => {
            try {
                const { taskId } = req.params;
                const scheduleManager = require('./scheduleManager');
                const taskScheduler = require('./taskScheduler');

                // Get task first
                const task = await scheduleManager.getTask(taskId);

                if (!task) {
                    return res.status(404).json({ success: false, error: 'Task not found' });
                }

                // Check if task is still pending
                if (task.status !== 'pending') {
                    return res.status(400).json({
                        success: false,
                        error: `Cannot cancel task with status "${task.status}"`
                    });
                }

                // Remove from cache
                taskScheduler.removeTaskFromCache(taskId);

                // Update status
                await scheduleManager.updateTaskStatus(taskId, 'cancelled', {
                    cancelledAt: Date.now()
                });

                this.addLog('success', `Cancelled scheduled task: ${taskId}`);
                res.json({ success: true, message: 'Task cancelled successfully' });
            } catch (error) {
                this.addLog('error', `Failed to cancel task: ${error.message}`);
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // API: Get scheduler status
        this.app.get('/api/scheduler-status', this.requireAuth.bind(this), async (req, res) => {
            try {
                const taskScheduler = require('./taskScheduler');
                const status = taskScheduler.getStatus();
                const pendingTasks = taskScheduler.getPendingTasksFromCache();

                res.json({
                    success: true,
                    status: {
                        ...status,
                        pendingTasks: pendingTasks.map(t => ({
                            taskId: t.taskId,
                            instruction: t.instruction.substring(0, 100),
                            scheduledTime: t.scheduledTime,
                            timeUntil: t.scheduledTime - Date.now()
                        }))
                    }
                });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });
    }
    
    setupSocketIO() {
        this.io.on('connection', (socket) => {
            console.log('[DASHBOARD] Terminal client connected');

            const isAuthenticated = socket.request.session && socket.request.session.authenticated === true;

            // Send existing logs (censored if not authenticated)
            const logsToSend = isAuthenticated ? this.logs : this.logs.map(log => this.censorLog(log));

            socket.emit('init', {
                logs: logsToSend,
                status: this.botStatus,
                hasPhone: this.phoneNumber !== null,
                authenticated: isAuthenticated
            });

            // Re-emit phone request if still waiting for input
            if (this.awaitingPhoneInput && isAuthenticated) {
                socket.emit('request-phone');
            }

            // Handle phone number submission (auth required)
            socket.on('phone-submit', (phone) => {
                if (!isAuthenticated) {
                    socket.emit('log', {
                        timestamp: new Date().toISOString(),
                        type: 'error',
                        message: 'Authentication required'
                    });
                    return;
                }

                if (phone && /^\d+$/.test(phone)) {
                    this.phoneNumber = phone;
                    this.awaitingPhoneInput = false;
                    socket.emit('phone-accepted', { phone });

                    // Resolve promise if waiting
                    if (this.phoneResolve) {
                        this.phoneResolve(phone);
                        this.phoneResolve = null;
                    }
                } else {
                    socket.emit('log', {
                        timestamp: new Date().toISOString(),
                        type: 'error',
                        message: 'Invalid phone number format'
                    });
                }
            });

            socket.on('disconnect', () => {
                console.log('[DASHBOARD] Terminal client disconnected');
            });
        });
    }

    // Censor sensitive information in logs for non-authenticated users
    censorLog(log) {
        const censoredLog = { ...log };

        // Pattern 1: [COMMAND] Username: .command text
        const commandMatch = log.message.match(/^(\[COMMAND\]\s+)([^:]+):\s*(.*)$/);
        if (commandMatch) {
            censoredLog.message = commandMatch[1] + '[USER]: [COMMAND HIDDEN]';
            return censoredLog;
        }

        // Pattern 2: [Username]: message (but exclude system brackets like [DASHBOARD], [EPHEMERAL], [INFO])
        const messageMatch = log.message.match(/^(\[(?!DASHBOARD|EPHEMERAL|INFO|COMMAND)[^\]]+\]):\s*(.*)$/);
        if (messageMatch) {
            censoredLog.message = messageMatch[1] + ': [MESSAGE HIDDEN]';
            return censoredLog;
        }

        // Censor phone numbers (10-15 digits)
        censoredLog.message = censoredLog.message.replace(/\b\d{10,15}\b/g, '[PHONE CENSORED]');

        // Censor pairing codes
        censoredLog.message = censoredLog.message.replace(/PAIRING CODE:\s*[A-Z0-9-]+/gi, 'PAIRING CODE: [CENSORED]');

        return censoredLog;
    }
    
    addLog(type, message, data = {}) {
        const log = {
            timestamp: new Date().toISOString(),
            type, // info, command, message, error, success
            message,
            data
        };

        this.logs.push(log);

        // Limit logs
        if (this.logs.length > this.maxLogs) {
            this.logs.shift();
        }

        // Broadcast to clients (censored for non-authenticated)
        this.io.sockets.sockets.forEach((socket) => {
            try {
                const isAuthenticated = socket.request.session && socket.request.session.authenticated === true;
                const logToSend = isAuthenticated ? log : this.censorLog(log);

                // Ensure log is JSON-serializable before emitting
                JSON.stringify(logToSend); // Test if serializable

                socket.emit('log', logToSend);
            } catch (error) {
                // Log failed to emit (non-serializable data)
                console.error('[DASHBOARD] Failed to emit log:', error.message);
                // Try sending error log instead
                try {
                    socket.emit('log', {
                        timestamp: new Date().toISOString(),
                        type: 'error',
                        message: '[Log Error] Data not serializable',
                        data: {}
                    });
                } catch (e) {
                    // Even error log failed, give up for this socket
                    console.error('[DASHBOARD] Socket emit completely failed');
                }
            }
        });
    }
    
    setStatus(status) {
        this.botStatus = status;
        this.io.emit('status-change', {
            status,
            hasPhone: this.phoneNumber !== null
        });
    }
    
    requestPhoneNumber() {
        return new Promise((resolve) => {
            if (this.phoneNumber) {
                resolve(this.phoneNumber);
            } else {
                this.phoneResolve = resolve;
                this.awaitingPhoneInput = true;
                this.io.emit('request-phone');
            }
        });
    }
    
    onStartBot(callback) {
        this.startBotCallback = callback;
    }

    onStopBot(callback) {
        this.stopBotCallback = callback;
    }

    setCommandsModule(commandsModule) {
        this.commandsModule = commandsModule;
    }

    evalCommandCode(code) {
        try {
            const module = { exports: {} };
            const exports = module.exports;
            eval(code);
            return module.exports;
        } catch (error) {
            throw new Error(`Eval error: ${error.message}`);
        }
    }

    // Wait for message from specific sender
    waitForMessageFrom(sender, timeoutMs, wachan) {
        return new Promise((resolve, reject) => {
            let timeoutHandle;
            let receiver;

            // Register this sender as having an active wait session
            this.activeWaitSessions.add(sender);

            // Cleanup function
            const cleanup = () => {
                if (timeoutHandle) clearTimeout(timeoutHandle);
                if (receiver && typeof receiver.remove === 'function') {
                    receiver.remove();
                }
                // Remove from active sessions
                this.activeWaitSessions.delete(sender);
            };

            // Set timeout
            timeoutHandle = setTimeout(() => {
                cleanup();
                reject(new Error('TIMEOUT'));
            }, timeoutMs);

            // Register message listener
            receiver = wachan.onReceive(wachan.messageType.any, async (context, next) => {
                const { message } = context;

                // Check if message is from target sender
                if (message.sender?.id === sender || message.from === sender) {
                    cleanup();
                    resolve({
                        text: message.text || null,
                        media: message.media || null,
                        timestamp: new Date().toISOString()
                    });
                    return; // Don't call next - we consumed this
                }

                next(); // Pass to other handlers
            });
        });
    }

    // Check if sender has an active wait-for-reply session
    hasActiveWaitSession(sender) {
        return this.activeWaitSessions.has(sender);
    }
    
    start(port = 3000) {
        return new Promise((resolve) => {
            this.server.listen(port, () => {
                console.log(`[DASHBOARD] Terminal running on http://localhost:${port}`);
                resolve();
            });
        });
    }
}

module.exports = BotDashboard;
