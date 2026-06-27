const fs = require('fs');
const path = require('path');
const storageHelper = require('./storageHelper');

class ContactManager {
    constructor() {
        this.cacheFile = './settings/contacts.json';
        this.contacts = new Map(); // Map<jid, contactInfo>
        this.initialized = false;
    }

    async initialize() {
        if (this.initialized) return;

        // Ensure settings directory exists
        const settingsDir = path.dirname(this.cacheFile);
        if (!fs.existsSync(settingsDir)) {
            fs.mkdirSync(settingsDir, { recursive: true });
        }

        const storageType = this.getStorageType();

        if (storageType === 'mongodb') {
            // MongoDB is source of truth
            try {
                await this.syncFromMongoDB();
                console.log('[Contacts] Initialized from MongoDB');
            } catch (err) {
                console.error('[Contacts] MongoDB sync failed, falling back to cache:', err.message);
                await this.loadFromCache();
            }
        } else {
            // File storage
            await this.loadFromCache();
            console.log('[Contacts] Initialized from file cache');
        }

        this.initialized = true;
    }

    getStorageType() {
        return storageHelper.getStorageType(storageHelper.STORAGE_COMPONENTS.CONTACT);
    }

    async loadFromCache() {
        try {
            if (fs.existsSync(this.cacheFile)) {
                const data = JSON.parse(fs.readFileSync(this.cacheFile, 'utf-8'));

                if (data.contacts && Array.isArray(data.contacts)) {
                    this.contacts = new Map(data.contacts.map(c => [
                        c.jid,
                        {
                            jid: c.jid,
                            name: c.name,
                            type: c.type, // 'user' or 'group'
                            addedAt: c.addedAt || Date.now(),
                            addedBy: c.addedBy || null
                        }
                    ]));
                    console.log(`[Contacts] Loaded ${this.contacts.size} contacts from cache`);
                }
            }
        } catch (error) {
            console.error('[Contacts] Failed to load cache:', error.message);
        }
    }

    async saveToCache() {
        try {
            const contacts = Array.from(this.contacts.values());
            fs.writeFileSync(this.cacheFile, JSON.stringify({ contacts }, null, 2));
        } catch (error) {
            console.error('[Contacts] Failed to save cache:', error.message);
        }
    }

    async syncFromMongoDB() {
        const storageType = this.getStorageType();

        if (storageType !== 'mongodb') {
            return;
        }

        try {
            const mongoClient = await storageHelper.getMongoClient();
            const db = mongoClient.db();
            const collection = db.collection('contacts');

            const doc = await collection.findOne({ _id: 'contacts' });

            if (doc && doc.contacts) {
                this.contacts = new Map(doc.contacts.map(c => [
                    c.jid,
                    {
                        jid: c.jid,
                        name: c.name,
                        type: c.type,
                        addedAt: c.addedAt || Date.now(),
                        addedBy: c.addedBy || null
                    }
                ]));
                await this.saveToCache();
                console.log(`[Contacts] Synced ${this.contacts.size} contacts from MongoDB`);
            }
        } catch (error) {
            console.error('[Contacts] Failed to sync from MongoDB:', error.message);
        }
    }

    async syncToMongoDB() {
        const storageType = this.getStorageType();

        if (storageType !== 'mongodb') {
            await this.saveToCache();
            return;
        }

        try {
            const mongoClient = await storageHelper.getMongoClient();
            const db = mongoClient.db();
            const collection = db.collection('contacts');

            const contacts = Array.from(this.contacts.values());

            await collection.updateOne(
                { _id: 'contacts' },
                {
                    $set: {
                        contacts: contacts,
                        lastUpdated: new Date()
                    }
                },
                { upsert: true }
            );

            await this.saveToCache();
            console.log(`[Contacts] Synced ${contacts.length} contacts to MongoDB`);
        } catch (error) {
            console.error('[Contacts] Failed to sync to MongoDB:', error.message);
            throw error;
        }
    }

    async addContact(jid, name, type, addedBy) {
        await this.initialize();

        this.contacts.set(jid, {
            jid,
            name,
            type, // 'user' or 'group'
            addedAt: Date.now(),
            addedBy
        });

        await this.syncToMongoDB();
        return jid;
    }

    async removeContact(jid) {
        await this.initialize();

        const existed = this.contacts.delete(jid);

        if (existed) {
            await this.syncToMongoDB();
        }

        return existed;
    }

    async getContact(jid) {
        await this.initialize();
        return this.contacts.get(jid) || null;
    }

    async getAllContacts() {
        await this.initialize();
        return Array.from(this.contacts.values());
    }

    async clear() {
        await this.initialize();
        this.contacts.clear();
        await this.syncToMongoDB();
    }
}

module.exports = new ContactManager();
