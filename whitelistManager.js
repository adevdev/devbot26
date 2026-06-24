const fs = require('fs');
const path = require('path');
const storageHelper = require('./storageHelper');
const settingsManager = require('./settingsManager');

class WhitelistManager {
    constructor() {
        this.cacheFile = './settings/whitelist.json';
        this.whitelist = new Map(); // Map<number, model>
        this.initialized = false;
        this.lastSyncTime = 0;
        this.CACHE_TTL = 5 * 60 * 1000; // 5 minutes cache
    }

    async initialize() {
        if (this.initialized) return;

        // Ensure settings directory exists
        const settingsDir = path.dirname(this.cacheFile);
        if (!fs.existsSync(settingsDir)) {
            fs.mkdirSync(settingsDir, { recursive: true });
        }

        // Load from cache file first (fast)
        await this.loadFromCache();

        // Sync from MongoDB in background if needed
        const storageType = storageHelper.getStorageType(storageHelper.STORAGE_COMPONENTS.WHITELIST);
        if (storageType === 'mongodb') {
            this.syncFromMongoDB().catch(err => {
                console.error('Failed to sync whitelist from MongoDB:', err.message);
            });
        }

        this.initialized = true;
    }

    getStorageType() {
        return storageHelper.getStorageType(storageHelper.STORAGE_COMPONENTS.WHITELIST);
    }

    async loadFromCache() {
        try {
            if (fs.existsSync(this.cacheFile)) {
                const data = JSON.parse(fs.readFileSync(this.cacheFile, 'utf-8'));

                // Get default model from settings
                const settingsManager = require('./settingsManager');
                const defaultModel = await settingsManager.getDefaultModel();

                // Convert array format to Map
                if (data.users && Array.isArray(data.users)) {
                    this.whitelist = new Map(data.users.map(u => [
                        u.number,
                        {
                            model: u.model || defaultModel,
                            pushName: u.pushName || null,
                            jid: u.jid || u.number,
                            quota: u.quota || 100,
                            usageCount: u.usageCount || 0,
                            resetPeriod: u.resetPeriod || 'perDay',
                            lastReset: u.lastReset || Date.now()
                        }
                    ]));
                } else if (data.numbers && Array.isArray(data.numbers)) {
                    // Legacy format - convert to new format
                    this.whitelist = new Map(data.numbers.map(n => [
                        n,
                        {
                            model: defaultModel,
                            pushName: null,
                            jid: n,
                            quota: 100,
                            usageCount: 0,
                            resetPeriod: 'perDay',
                            lastReset: Date.now()
                        }
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
                    jid: info.jid || number,
                    quota: info.quota || 100,
                    usageCount: info.usageCount || 0,
                    resetPeriod: info.resetPeriod || 'perDay',
                    lastReset: info.lastReset || Date.now()
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
        const storageType = this.getStorageType();

        if (storageType !== 'mongodb') {
            // Not using MongoDB, cache file is source of truth
            return;
        }

        try {
            const mongoClient = await storageHelper.getMongoClient();
            const db = mongoClient.db();
            const collection = db.collection('whitelist');

            const doc = await collection.findOne({ _id: 'users' });

            // Get default model from settings
            const settingsManager = require('./settingsManager');
            const defaultModel = await settingsManager.getDefaultModel();

            if (doc && doc.users) {
                this.whitelist = new Map(doc.users.map(u => [
                    u.number,
                    {
                        model: u.model || defaultModel,
                        pushName: u.pushName || null,
                        jid: u.jid || u.number,
                        quota: u.quota || 100,
                        usageCount: u.usageCount || 0,
                        resetPeriod: u.resetPeriod || 'perDay',
                        lastReset: u.lastReset || Date.now()
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
        const storageType = this.getStorageType();

        if (storageType !== 'mongodb') {
            // Not using MongoDB, only update cache
            await this.saveToCache();
            return;
        }

        try {
            const mongoClient = await storageHelper.getMongoClient();
            const db = mongoClient.db();
            const collection = db.collection('whitelist');

            const users = Array.from(this.whitelist.entries()).map(([number, info]) => ({
                number,
                model: info.model || info, // Support legacy string format
                pushName: info.pushName || null,
                jid: info.jid || number,
                quota: info.quota || 100,
                usageCount: info.usageCount || 0,
                resetPeriod: info.resetPeriod || 'perDay',
                lastReset: info.lastReset || Date.now()
            }));

            await collection.updateOne(
                { _id: 'users' },
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

    async addNumber(number, model = null, pushName = null, quota = null, resetPeriod = null) {
        await this.initialize();

        // Get defaults from settingsManager if not provided
        if (model === null) {
            model = await settingsManager.getDefaultModel();
        }
        if (quota === null) {
            quota = await settingsManager.getDefaultQuota();
        }
        if (resetPeriod === null) {
            resetPeriod = await settingsManager.getDefaultResetPeriod();
        }

        // Normalize format: ensure @s.whatsapp.net suffix
        const normalized = number.includes('@') ? number : `${number}@s.whatsapp.net`;

        this.whitelist.set(normalized, {
            model,
            pushName,
            jid: normalized,
            quota,
            usageCount: 0,
            resetPeriod,
            lastReset: Date.now()
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

        // Return user's model or fallback to system default
        if (info?.model) {
            return info.model;
        }

        const settingsManager = require('./settingsManager');
        return await settingsManager.getDefaultModel();
    }

    async getAll() {
        await this.initialize();
        return Array.from(this.whitelist.entries()).map(([number, info]) => {
            // Support both old string format and new object format
            if (typeof info === 'string') {
                return {
                    number,
                    model: info,
                    pushName: null,
                    jid: number,
                    quota: 100,
                    usageCount: 0,
                    resetPeriod: 'perDay',
                    lastReset: Date.now()
                };
            }
            return {
                number,
                model: info.model,
                pushName: info.pushName || null,
                jid: info.jid || number,
                quota: info.quota || 100,
                usageCount: info.usageCount || 0,
                resetPeriod: info.resetPeriod || 'perDay',
                lastReset: info.lastReset || Date.now()
            };
        });
    }

    // Check if quota needs reset based on resetPeriod
    shouldResetQuota(lastReset, resetPeriod) {
        const now = Date.now();
        const diff = now - lastReset;

        switch (resetPeriod) {
            case 'per5Hours':
                return diff >= 5 * 60 * 60 * 1000; // 5 hours
            case 'perDay':
                return diff >= 24 * 60 * 60 * 1000; // 24 hours
            case 'perMonth':
                return diff >= 30 * 24 * 60 * 60 * 1000; // 30 days
            default:
                return false;
        }
    }

    // Check quota and auto-reset if needed
    async checkQuota(number) {
        await this.initialize();

        const normalized = number.includes('@') ? number : `${number}@s.whatsapp.net`;
        const info = this.whitelist.get(normalized);

        if (!info) {
            return { allowed: false, reason: 'Not whitelisted' };
        }

        // Support legacy string format
        if (typeof info === 'string') {
            console.error(`[Quota] User ${normalized} has legacy string format - data corrupted`);
            return {
                allowed: false,
                reason: 'Data corrupted',
                error: 'User data is in old format. Please re-add user with .aiadd command.'
            };
        }

        // Strict validation - all quota fields must exist
        if (info.quota === undefined || info.usageCount === undefined ||
            info.resetPeriod === undefined || info.lastReset === undefined) {
            console.error(`[Quota] User ${normalized} missing quota fields:`, {
                quota: info.quota,
                usageCount: info.usageCount,
                resetPeriod: info.resetPeriod,
                lastReset: info.lastReset
            });
            return {
                allowed: false,
                reason: 'Data corrupted',
                error: 'User quota data is incomplete. Please contact admin to fix.'
            };
        }

        const { quota, usageCount, resetPeriod, lastReset } = info;

        // Check if quota needs reset
        if (this.shouldResetQuota(lastReset, resetPeriod)) {
            info.usageCount = 0;
            info.lastReset = Date.now();
            await this.syncToMongoDB();
            console.log(`[Quota] Reset quota for ${normalized}`);
        }

        const remaining = quota - usageCount;

        if (remaining <= 0) {
            return {
                allowed: false,
                reason: 'Quota exceeded',
                quota: quota,
                usageCount: usageCount,
                resetPeriod: resetPeriod
            };
        }

        return {
            allowed: true,
            remaining,
            quota: quota,
            usageCount: usageCount,
            resetPeriod: resetPeriod
        };
    }

    // Increment usage count
    async incrementUsage(number) {
        await this.initialize();

        const normalized = number.includes('@') ? number : `${number}@s.whatsapp.net`;
        const info = this.whitelist.get(normalized);

        if (!info || typeof info === 'string') {
            return;
        }

        info.usageCount = (info.usageCount || 0) + 1;
        await this.syncToMongoDB();
    }

    // Set usage count (for manual adjustment via dashboard)
    async setUsageCount(number, count) {
        await this.initialize();

        const normalized = number.includes('@') ? number : `${number}@s.whatsapp.net`;
        const info = this.whitelist.get(normalized);

        if (!info || typeof info === 'string') {
            console.warn(`[Quota] Cannot set usage for ${normalized}: not found or legacy format`);
            return;
        }

        // Validate count
        if (typeof count !== 'number' || count < 0) {
            console.warn(`[Quota] Invalid usage count: ${count}`);
            return;
        }

        info.usageCount = count;
        await this.syncToMongoDB();
        console.log(`[Quota] Set usage count for ${normalized}: ${count}`);
    }

    // Update quota settings for a user
    async updateQuotaSettings(number, quota, resetPeriod) {
        await this.initialize();

        const normalized = number.includes('@') ? number : `${number}@s.whatsapp.net`;
        const info = this.whitelist.get(normalized);

        if (!info) {
            return false;
        }

        // Convert legacy string format to object
        if (typeof info === 'string') {
            this.whitelist.set(normalized, {
                model: info,
                pushName: null,
                jid: normalized,
                quota,
                usageCount: 0,
                resetPeriod,
                lastReset: Date.now()
            });
        } else {
            info.quota = quota;
            info.resetPeriod = resetPeriod;
            // Reset usage when quota settings change
            info.usageCount = 0;
            info.lastReset = Date.now();
        }

        await this.syncToMongoDB();
        return true;
    }

    async clear() {
        await this.initialize();
        this.whitelist.clear();
        await this.syncToMongoDB();
    }
}

module.exports = new WhitelistManager();
