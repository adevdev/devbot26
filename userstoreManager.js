const fs = require('fs');
const path = require('path');
const storageHelper = require('./storageHelper');

/**
 * User Store Manager for Wachan
 * Manages contact cache (user-store.json) with dual storage support
 */

class UserstoreManager {
    constructor() {
        this.storeFile = './wachan/user-store.json';
        this.userStore = {};
        this.initialized = false;
    }

    getStorageType() {
        return storageHelper.getStorageType(storageHelper.STORAGE_COMPONENTS.USERSTORE);
    }

    async initialize() {
        if (this.initialized) return;

        // Ensure wachan directory exists
        const wachanDir = path.dirname(this.storeFile);
        if (!fs.existsSync(wachanDir)) {
            fs.mkdirSync(wachanDir, { recursive: true });
        }

        // Load from file first (fast)
        await this.loadFromFile();

        // Sync from MongoDB if needed
        const storageType = this.getStorageType();
        if (storageType === 'mongodb') {
            this.syncFromMongoDB().catch(err => {
                console.error('[UserStore] Failed to sync from MongoDB:', err.message);
            });
        }

        this.initialized = true;
    }

    async loadFromFile() {
        try {
            if (fs.existsSync(this.storeFile)) {
                const data = JSON.parse(fs.readFileSync(this.storeFile, 'utf-8'));
                this.userStore = data || {};
                console.log(`[UserStore] Loaded ${Object.keys(this.userStore).length} contacts from file`);
            } else {
                this.userStore = {};
            }
        } catch (error) {
            console.error('[UserStore] Failed to load from file:', error.message);
            this.userStore = {};
        }
    }

    async saveToFile() {
        try {
            const wachanDir = path.dirname(this.storeFile);
            if (!fs.existsSync(wachanDir)) {
                fs.mkdirSync(wachanDir, { recursive: true });
            }

            fs.writeFileSync(this.storeFile, JSON.stringify(this.userStore, null, 2));
        } catch (error) {
            console.error('[UserStore] Failed to save to file:', error.message);
        }
    }

    async syncFromMongoDB() {
        const storageType = this.getStorageType();
        if (storageType !== 'mongodb') return;

        try {
            const mongoClient = await storageHelper.getMongoClient();
            const db = mongoClient.db();
            const collection = db.collection('userstore');

            const doc = await collection.findOne({ _id: 'contacts' });

            if (doc && doc.store) {
                this.userStore = doc.store;
                await this.saveToFile(); // Sync to file for wachan
                console.log(`[UserStore] Synced ${Object.keys(this.userStore).length} contacts from MongoDB`);
            }
        } catch (error) {
            console.error('[UserStore] Failed to sync from MongoDB:', error.message);
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
            const collection = db.collection('userstore');

            await collection.updateOne(
                { _id: 'contacts' },
                {
                    $set: {
                        store: this.userStore,
                        lastUpdated: new Date()
                    }
                },
                { upsert: true }
            );

            await this.saveToFile(); // Always keep file in sync for wachan
        } catch (error) {
            console.error('[UserStore] Failed to sync to MongoDB:', error.message);
            throw error;
        }
    }

    async updateStore(store) {
        await this.initialize();
        this.userStore = store;
        await this.syncToMongoDB();
    }

    async getStore() {
        await this.initialize();
        return this.userStore;
    }

    async addContact(jid, contactData) {
        await this.initialize();
        this.userStore[jid] = contactData;
        await this.syncToMongoDB();
    }

    async getContact(jid) {
        await this.initialize();
        return this.userStore[jid] || null;
    }

    async removeContact(jid) {
        await this.initialize();
        delete this.userStore[jid];
        await this.syncToMongoDB();
    }

    async clear() {
        await this.initialize();
        this.userStore = {};
        await this.syncToMongoDB();
    }
}

module.exports = new UserstoreManager();
