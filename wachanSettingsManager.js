const fs = require('fs');
const path = require('path');
const storageHelper = require('./storageHelper');

/**
 * Wachan Settings Manager
 * Manages wachan bot settings (settings.json) with dual storage support
 */

class WachanSettingsManager {
    constructor() {
        this.settingsFile = './wachan/settings.json';
        this.settings = {};
        this.initialized = false;
    }

    getStorageType() {
        return storageHelper.getStorageType(storageHelper.STORAGE_COMPONENTS.WACHAN_SETTINGS);
    }

    async initialize() {
        if (this.initialized) return;

        // Ensure wachan directory exists
        const wachanDir = path.dirname(this.settingsFile);
        if (!fs.existsSync(wachanDir)) {
            fs.mkdirSync(wachanDir, { recursive: true });
        }

        // Load from file first (fast)
        await this.loadFromFile();

        // Sync from MongoDB if needed
        const storageType = this.getStorageType();
        if (storageType === 'mongodb') {
            this.syncFromMongoDB().catch(err => {
                console.error('[WachanSettings] Failed to sync from MongoDB:', err.message);
            });
        }

        this.initialized = true;
    }

    async loadFromFile() {
        try {
            if (fs.existsSync(this.settingsFile)) {
                const data = JSON.parse(fs.readFileSync(this.settingsFile, 'utf-8'));
                this.settings = data || {};
                console.log('[WachanSettings] Loaded settings from file');
            } else {
                this.settings = {};
            }
        } catch (error) {
            console.error('[WachanSettings] Failed to load from file:', error.message);
            this.settings = {};
        }
    }

    async saveToFile() {
        try {
            const wachanDir = path.dirname(this.settingsFile);
            if (!fs.existsSync(wachanDir)) {
                fs.mkdirSync(wachanDir, { recursive: true });
            }

            fs.writeFileSync(this.settingsFile, JSON.stringify(this.settings, null, 2));
        } catch (error) {
            console.error('[WachanSettings] Failed to save to file:', error.message);
        }
    }

    async syncFromMongoDB() {
        const storageType = this.getStorageType();
        if (storageType !== 'mongodb') return;

        try {
            const mongoClient = await storageHelper.getMongoClient();
            const db = mongoClient.db();
            const collection = db.collection('wachan_settings');

            const doc = await collection.findOne({ _id: 'bot_settings' });

            if (doc && doc.settings) {
                this.settings = doc.settings;
                await this.saveToFile(); // Sync to file for wachan
                console.log('[WachanSettings] Synced settings from MongoDB');
            }
        } catch (error) {
            console.error('[WachanSettings] Failed to sync from MongoDB:', error.message);
        }
    }

    async syncToMongoDB() {
        const storageType = this.getStorageType();

        if (storageType !== 'mongodb') {
            // Just save to file
            await this.saveToFile();
            return;
        }

        try {
            const mongoClient = await storageHelper.getMongoClient();
            const db = mongoClient.db();
            const collection = db.collection('wachan_settings');

            await collection.updateOne(
                { _id: 'bot_settings' },
                {
                    $set: {
                        settings: this.settings,
                        lastUpdated: new Date()
                    }
                },
                { upsert: true }
            );

            await this.saveToFile(); // Always keep file in sync for wachan
        } catch (error) {
            console.error('[WachanSettings] Failed to sync to MongoDB:', error.message);
            throw error;
        }
    }

    async updateSettings(settings) {
        await this.initialize();
        this.settings = settings;
        await this.syncToMongoDB();
    }

    async getSettings() {
        await this.initialize();
        return this.settings;
    }

    async setSetting(key, value) {
        await this.initialize();
        this.settings[key] = value;
        await this.syncToMongoDB();
    }

    async getSetting(key, defaultValue = null) {
        await this.initialize();
        return this.settings[key] !== undefined ? this.settings[key] : defaultValue;
    }

    async deleteSetting(key) {
        await this.initialize();
        delete this.settings[key];
        await this.syncToMongoDB();
    }

    async clear() {
        await this.initialize();
        this.settings = {};
        await this.syncToMongoDB();
    }
}

module.exports = new WachanSettingsManager();
