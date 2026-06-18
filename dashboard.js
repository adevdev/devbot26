const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const session = require('express-session');
const bcrypt = require('bcrypt');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
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
        this.startBotCallback = null;
        this.stopBotCallback = null;

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

                // Clear saved phone
                this.phoneNumber = null;

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
            const isAuthenticated = socket.request.session && socket.request.session.authenticated === true;
            const logToSend = isAuthenticated ? log : this.censorLog(log);
            socket.emit('log', logToSend);
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
