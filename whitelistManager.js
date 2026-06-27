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
        this.syncInProgress = false; // Prevent concurrent syncs
    }

    async initialize() {
        if (this.initialized) return;

        // Ensure settings directory exists
        const settingsDir = path.dirname(this.cacheFile);
        if (!fs.existsSync(settingsDir)) {
            fs.mkdirSync(settingsDir, { recursive: true });
        }

        const storageType = storageHelper.getStorageType(storageHelper.STORAGE_COMPONENTS.WHITELIST);

        if (storageType === 'mongodb') {
            // MongoDB is source of truth - sync first (blocking), fallback to cache on error
            try {
                await this.syncFromMongoDB();
                console.log('[Whitelist] Initialized from MongoDB');
            } catch (err) {
                console.error('[Whitelist] MongoDB sync failed, falling back to cache:', err.message);
                await this.loadFromCache();
            }
        } else {
            // File storage - just load from cache
            await this.loadFromCache();
            console.log('[Whitelist] Initialized from file cache');
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

                // Convert array format to Map
                if (data.users && Array.isArray(data.users)) {
                    this.whitelist = new Map(data.users.map(u => [
                        u.number,
                        {
                            model: u.model, // Keep user's specific model (don't replace with default)
                            pushName: u.pushName || null,
                            jid: u.jid || u.number,
                            quota: u.quota || 100,
                            usageCount: u.usageCount || 0,
                            resetPeriod: u.resetPeriod || 'perDay',
                            lastReset: u.lastReset || Date.now(),
                            enabledTools: u.enabledTools || [], // Empty = all tools enabled
                            maxToolIterations: u.maxToolIterations || null // null = use default
                        }
                    ]));
                } else if (data.numbers && Array.isArray(data.numbers)) {
                    // Legacy format - convert to new format with null model (will use default when retrieved)
                    this.whitelist = new Map(data.numbers.map(n => [
                        n,
                        {
                            model: null, // No model stored in legacy format - getModel() will return default
                            pushName: null,
                            jid: n,
                            quota: 100,
                            usageCount: 0,
                            resetPeriod: 'perDay',
                            lastReset: Date.now(),
                            enabledTools: [], // Empty = all tools enabled
                            maxToolIterations: null // null = use default
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
                    lastReset: info.lastReset || Date.now(),
                    enabledTools: info.enabledTools || [] // Empty = all tools enabled
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

        // Skip if sync already in progress to prevent race condition
        if (this.syncInProgress) {
            console.log('[Whitelist] Sync already in progress, skipping syncFromMongoDB');
            return;
        }

        this.syncInProgress = true;

        try {
            const mongoClient = await storageHelper.getMongoClient();
            const db = mongoClient.db();
            const collection = db.collection('whitelist');

            const doc = await collection.findOne({ _id: 'users' });

            if (doc && doc.users) {
                this.whitelist = new Map(doc.users.map(u => [
                    u.number,
                    {
                        model: u.model, // Keep user's specific model (don't replace with default)
                        pushName: u.pushName || null,
                        jid: u.jid || u.number,
                        quota: u.quota || 100,
                        usageCount: u.usageCount || 0,
                        resetPeriod: u.resetPeriod || 'perDay',
                        lastReset: u.lastReset || Date.now(),
                        enabledTools: u.enabledTools || [] // Empty = all tools enabled
                    }
                ]));
                await this.saveToCache();
                this.lastSyncTime = Date.now(); // Update sync time after successful sync
                console.log(`Synced ${this.whitelist.size} whitelisted numbers from MongoDB`);
            }
        } catch (error) {
            console.error('Failed to sync from MongoDB:', error.message);
        } finally {
            this.syncInProgress = false;
        }
    }

    async syncToMongoDB() {
        const storageType = this.getStorageType();

        if (storageType !== 'mongodb') {
            // Not using MongoDB, only update cache
            await this.saveToCache();
            return;
        }

        // Wait if sync from MongoDB is in progress
        while (this.syncInProgress) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        this.syncInProgress = true;

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
                lastReset: info.lastReset || Date.now(),
                enabledTools: info.enabledTools || [] // Empty = all tools enabled
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

            // Update lastSyncTime to prevent race condition with syncFromMongoDB
            this.lastSyncTime = Date.now();

        } catch (error) {
            console.error('Failed to sync to MongoDB:', error.message);
            throw error;
        } finally {
            this.syncInProgress = false;
        }
    }

    async addNumber(number, model = null, pushName = null, quota = null, resetPeriod = null, maxToolIterations = null) {
        await this.initialize();

        // Normalize format: ensure @s.whatsapp.net suffix
        const normalized = number.includes('@') ? number : `${number}@s.whatsapp.net`;

        // Check if user already exists
        const existingInfo = this.whitelist.get(normalized);

        // Get defaults only for null values
        if (model === null) {
            model = existingInfo?.model || await settingsManager.getDefaultModel();
        }
        if (quota === null) {
            quota = existingInfo?.quota || await settingsManager.getDefaultQuota();
        }
        if (resetPeriod === null) {
            resetPeriod = existingInfo?.resetPeriod || await settingsManager.getDefaultResetPeriod();
        }
        if (maxToolIterations === null) {
            maxToolIterations = existingInfo?.maxToolIterations || null; // null = use default
        }

        // Preserve existing fields when updating
        const usageCount = existingInfo?.usageCount || 0;
        const lastReset = existingInfo?.lastReset || Date.now();
        const enabledTools = existingInfo?.enabledTools || await settingsManager.getDefaultEnabledTools();

        this.whitelist.set(normalized, {
            model,
            pushName,
            jid: normalized,
            quota,
            usageCount,
            resetPeriod,
            lastReset,
            enabledTools: enabledTools || [],
            maxToolIterations: maxToolIterations
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

        // User not found - return null (caller will try another identifier or use default)
        if (!info) {
            return null;
        }

        // Support both old string format and new object format
        if (typeof info === 'string') {
            return info;
        }

        // Return user's model, or null if not set (caller handles default)
        return info.model || null;
    }

    async getEnabledTools(number) {
        await this.initialize();

        const normalized = number.includes('@') ? number : `${number}@s.whatsapp.net`;
        const info = this.whitelist.get(normalized);

        if (!info) {
            return []; // Not whitelisted, return empty (all tools disabled)
        }

        // Support both old string format and new object format
        if (typeof info === 'string') {
            return []; // Legacy format, return empty (all tools enabled by default)
        }

        // Return user's enabled tools (empty array = all tools enabled)
        return info.enabledTools || [];
    }

    async getMaxToolIterations(number) {
        await this.initialize();

        const normalized = number.includes('@') ? number : `${number}@s.whatsapp.net`;
        const info = this.whitelist.get(normalized);

        if (!info) {
            return null; // Not whitelisted, return null (use global default)
        }

        // Support both old string format and new object format
        if (typeof info === 'string') {
            return null; // Legacy format, use global default
        }

        // Return user's maxToolIterations (null = use global default)
        return info.maxToolIterations || null;
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
                    lastReset: Date.now(),
                    enabledTools: [], // Empty = all tools enabled
                    maxToolIterations: null // null = use default
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
                lastReset: info.lastReset || Date.now(),
                enabledTools: info.enabledTools || [], // Empty = all tools enabled
                maxToolIterations: info.maxToolIterations || null // null = use default
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

    async updateEnabledTools(number, enabledTools) {
        await this.initialize();

        const normalized = number.includes('@') ? number : `${number}@s.whatsapp.net`;
        const info = this.whitelist.get(normalized);

        if (!info) {
            return false;
        }

        // Convert legacy string format to object
        if (typeof info === 'string') {
            const settingsManager = require('./settingsManager');
            const defaultModel = await settingsManager.getDefaultModel();
            const defaultQuota = await settingsManager.getDefaultQuota();
            const defaultResetPeriod = await settingsManager.getDefaultResetPeriod();

            this.whitelist.set(normalized, {
                model: info,
                pushName: null,
                jid: normalized,
                quota: defaultQuota,
                usageCount: 0,
                resetPeriod: defaultResetPeriod,
                lastReset: Date.now(),
                enabledTools: enabledTools || []
            });
        } else {
            info.enabledTools = enabledTools || [];
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
