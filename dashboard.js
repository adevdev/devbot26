const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

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
        
        this.setupRoutes();
        this.setupSocketIO();
    }
    
    setupRoutes() {
        // Serve static files
        this.app.use(express.static(path.join(__dirname, 'public')));
        this.app.use(express.json());
        
        // Main dashboard
        this.app.get('/', (req, res) => {
            res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
        });
        
        // API: Restart bot instance
        this.app.post('/api/restart', async (req, res) => {
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
        this.app.post('/api/shutdown', async (req, res) => {
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
        this.app.post('/api/start', async (req, res) => {
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
        this.app.post('/api/stop', async (req, res) => {
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
        this.app.post('/api/change-phone', async (req, res) => {
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

            // Send existing logs
            socket.emit('init', {
                logs: this.logs,
                status: this.botStatus,
                hasPhone: this.phoneNumber !== null
            });

            // Handle phone number submission
            socket.on('phone-submit', (phone) => {
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
        
        // Broadcast to clients
        this.io.emit('log', log);
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
