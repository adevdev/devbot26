const fs = require('fs');
const path = require('path');

class WhitelistManager {
    constructor() {
        this.cacheFile = './data/whitelist.json';
        this.whitelist = new Map(); // Map<number, model>
        this.initialized = false;
        this.lastSyncTime = 0;
        this.CACHE_TTL = 5 * 60 * 1000; // 5 minutes cache

        // Use same MongoDB client from credentialsManager
        this.credentialsManager = require('./credentialsManager');
    }

    async initialize() {
        if (this.initialized) return;

        // Ensure data directory exists
        const dataDir = path.dirname(this.cacheFile);
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }

        // Load from cache file first (fast)
        await this.loadFromCache();

        // Sync from MongoDB in background
        this.syncFromMongoDB().catch(err => {
            console.error('Failed to sync whitelist from MongoDB:', err.message);
        });

        this.initialized = true;
    }

    async loadFromCache() {
        try {
            if (fs.existsSync(this.cacheFile)) {
                const data = JSON.parse(fs.readFileSync(this.cacheFile, 'utf-8'));
                // Convert array format to Map
                if (data.users && Array.isArray(data.users)) {
                    this.whitelist = new Map(data.users.map(u => [
                        u.number,
                        {
                            model: u.model || 'qwen3-coder-next',
                            pushName: u.pushName || null,
                            jid: u.jid || u.number
                        }
                    ]));
                } else if (data.numbers && Array.isArray(data.numbers)) {
                    // Legacy format - convert to new format
                    this.whitelist = new Map(data.numbers.map(n => [
                        n,
                        { model: 'qwen3-coder-next', pushName: null, jid: n }
                    ]));
                }
                console.log(`Loaded ${this.whitelist.size} whitelisted numbers from cache`);
                this.lastSyncTime = Date.now();
            }
        } catch (error) {
            console.error('Failed to load whitelist cache:', error.message);
        }
    }

    async saveToCache() {
        try {
            // Ensure directory exists before writing
            const dataDir = path.dirname(this.cacheFile);
            if (!fs.existsSync(dataDir)) {
                fs.mkdirSync(dataDir, { recursive: true });
            }

            const data = {
                users: Array.from(this.whitelist.entries()).map(([number, info]) => ({
                    number,
                    model: info.model || info, // Support legacy string format
                    pushName: info.pushName || null,
                    jid: info.jid || number
                })),
                lastUpdated: new Date().toISOString()
            };
            fs.writeFileSync(this.cacheFile, JSON.stringify(data, null, 2));
            this.lastSyncTime = Date.now();
        } catch (error) {
            console.error('Failed to save whitelist cache:', error.message);
            // Cache is optional - continue without it if write fails
        }
    }

    async syncFromMongoDB() {
        const storageType = this.credentialsManager.getStorageType();

        if (storageType !== 'mongodb') {
            // Not using MongoDB, cache file is source of truth
            return;
        }

        try {
            const mongoClient = await this.credentialsManager.getMongoClient();
            const db = mongoClient.db();
            const collection = db.collection('devbot26');

            const doc = await collection.findOne({ _id: 'ai_whitelist' });

            if (doc && doc.users) {
                this.whitelist = new Map(doc.users.map(u => [
                    u.number,
                    {
                        model: u.model || 'qwen3-coder-next',
                        pushName: u.pushName || null,
                        jid: u.jid || u.number
                    }
                ]));
                await this.saveToCache();
                console.log(`Synced ${this.whitelist.size} whitelisted numbers from MongoDB`);
            }
        } catch (error) {
            console.error('Failed to sync from MongoDB:', error.message);
        }
    }

    async syncToMongoDB() {
        const storageType = this.credentialsManager.getStorageType();

        if (storageType !== 'mongodb') {
            // Not using MongoDB, only update cache
            await this.saveToCache();
            return;
        }

        try {
            const mongoClient = await this.credentialsManager.getMongoClient();
            const db = mongoClient.db();
            const collection = db.collection('devbot26');

            const users = Array.from(this.whitelist.entries()).map(([number, info]) => ({
                number,
                model: info.model || info, // Support legacy string format
                pushName: info.pushName || null,
                jid: info.jid || number
            }));

            await collection.updateOne(
                { _id: 'ai_whitelist' },
                {
                    $set: {
                        users: users,
                        lastUpdated: new Date()
                    }
                },
                { upsert: true }
            );

            await this.saveToCache();
        } catch (error) {
            console.error('Failed to sync to MongoDB:', error.message);
            throw error;
        }
    }

    async addNumber(number, model = 'qwen3-coder-next', pushName = null) {
        await this.initialize();

        // Normalize format: ensure @s.whatsapp.net suffix
        const normalized = number.includes('@') ? number : `${number}@s.whatsapp.net`;

        this.whitelist.set(normalized, {
            model,
            pushName,
            jid: normalized
        });
        await this.syncToMongoDB();

        return normalized;
    }

    async removeNumber(number) {
        await this.initialize();

        const normalized = number.includes('@') ? number : `${number}@s.whatsapp.net`;
        const existed = this.whitelist.delete(normalized);

        if (existed) {
            await this.syncToMongoDB();
        }

        return existed;
    }

    async isWhitelisted(number) {
        await this.initialize();

        // Auto-refresh cache if TTL expired
        if (Date.now() - this.lastSyncTime > this.CACHE_TTL) {
            this.syncFromMongoDB().catch(err => {
                console.error('Background whitelist sync failed:', err.message);
            });
        }

        const normalized = number.includes('@') ? number : `${number}@s.whatsapp.net`;
        return this.whitelist.has(normalized);
    }

    async getModel(number) {
        await this.initialize();

        const normalized = number.includes('@') ? number : `${number}@s.whatsapp.net`;
        const info = this.whitelist.get(normalized);

        // Support both old string format and new object format
        if (typeof info === 'string') {
            return info;
        }
        return info?.model || 'qwen3-coder-next';
    }

    async getAll() {
        await this.initialize();
        return Array.from(this.whitelist.entries()).map(([number, info]) => {
            // Support both old string format and new object format
            if (typeof info === 'string') {
                return { number, model: info, pushName: null, jid: number };
            }
            return {
                number,
                model: info.model,
                pushName: info.pushName || null,
                jid: info.jid || number
            };
        });
    }

    async clear() {
        await this.initialize();
        this.whitelist.clear();
        await this.syncToMongoDB();
    }
}

module.exports = new WhitelistManager();
