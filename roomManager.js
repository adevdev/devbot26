const fs = require('fs').promises;
const path = require('path');
const storageHelper = require('./storageHelper');

/**
 * Room/Group Management
 * Controls bot behavior per room (AI access, commands, etc.)
 */

class RoomManager {
    constructor() {
        this.roomsFile = './data/rooms.json';
        this.rooms = new Map();
        this.initialized = false;
        this.cacheExpiry = 5 * 60 * 1000; // 5 min cache
        this.lastSync = 0;
    }

    getStorageType() {
        return storageHelper.getStorageType(storageHelper.STORAGE_COMPONENTS.GLOBAL);
    }

    async initialize() {
        if (this.initialized && Date.now() - this.lastSync < this.cacheExpiry) {
            return;
        }

        const storageType = this.getStorageType();

        if (storageType === 'mongodb') {
            await this.loadFromMongoDB();
        } else {
            await this.loadFromFile();
        }

        this.initialized = true;
        this.lastSync = Date.now();
    }

    async loadFromFile() {
        try {
            const dataDir = path.dirname(this.roomsFile);
            await fs.mkdir(dataDir, { recursive: true });

            const data = await fs.readFile(this.roomsFile, 'utf-8');
            const rooms = JSON.parse(data);

            this.rooms.clear();
            for (const room of rooms) {
                this.rooms.set(room.roomId, room);
            }

            console.log(`[Room Manager] Loaded ${this.rooms.size} rooms from file`);
        } catch (error) {
            if (error.code === 'ENOENT') {
                this.rooms.clear();
                await this.saveToFile();
            } else {
                console.error('[Room Manager] Failed to load from file:', error.message);
            }
        }
    }

    async saveToFile() {
        try {
            const dataDir = path.dirname(this.roomsFile);
            await fs.mkdir(dataDir, { recursive: true });

            const rooms = Array.from(this.rooms.values());
            await fs.writeFile(this.roomsFile, JSON.stringify(rooms, null, 2));
        } catch (error) {
            console.error('[Room Manager] Failed to save to file:', error.message);
        }
    }

    async loadFromMongoDB() {
        try {
            const mongoClient = await storageHelper.getMongoClient();
            const db = mongoClient.db();
            const collection = db.collection('rooms');

            const docs = await collection.find({}).toArray();

            this.rooms.clear();
            for (const doc of docs) {
                this.rooms.set(doc._id, {
                    roomId: doc._id,
                    name: doc.name,
                    allowAI: doc.allowAI,
                    allowAiCommand: doc.allowAiCommand,
                    allowCommands: doc.allowCommands,
                    ignoreAll: doc.ignoreAll,
                    allowedCommands: doc.allowedCommands || [],
                    addedAt: doc.addedAt
                });
            }

            console.log(`[Room Manager] Loaded ${this.rooms.size} rooms from MongoDB`);
        } catch (error) {
            console.error('[Room Manager] Failed to load from MongoDB:', error.message);
        }
    }

    async saveToMongoDB(room) {
        try {
            const mongoClient = await storageHelper.getMongoClient();
            const db = mongoClient.db();
            const collection = db.collection('rooms');

            await collection.updateOne(
                { _id: room.roomId },
                {
                    $set: {
                        name: room.name,
                        allowAI: room.allowAI,
                        allowAiCommand: room.allowAiCommand,
                        allowCommands: room.allowCommands,
                        ignoreAll: room.ignoreAll,
                        allowedCommands: room.allowedCommands || [],
                        addedAt: room.addedAt
                    }
                },
                { upsert: true }
            );
        } catch (error) {
            console.error('[Room Manager] Failed to save to MongoDB:', error.message);
            throw error;
        }
    }

    async getRoomSettings(roomId) {
        await this.initialize();
        return this.rooms.get(roomId) || null;
    }

    async getOrCreateRoom(roomId, name = null, isGroup = true) {
        await this.initialize();

        let room = this.rooms.get(roomId);
        if (room) {
            return room;
        }

        // Auto-create with defaults
        // For groups: AI and Commands enabled by default
        // For private: only Commands setting (AI always enabled in private)
        room = {
            roomId: roomId,
            name: name || roomId,
            allowAI: isGroup ? true : null, // null for private = N/A (controls fallback for unknown commands)
            allowAiCommand: isGroup ? true : null, // null for private = N/A (controls explicit .ai command)
            allowCommands: true, // Default: allow commands
            ignoreAll: false, // Default: don't ignore
            allowedCommands: [],
            addedAt: new Date().toISOString()
        };

        this.rooms.set(roomId, room);

        const storageType = this.getStorageType();
        if (storageType === 'mongodb') {
            await this.saveToMongoDB(room);
        } else {
            await this.saveToFile();
        }

        const roomType = isGroup ? 'group' : 'private';
        console.log(`[Room Manager] Auto-created ${roomType}: ${roomId} (Commands: enabled)`);
        return room;
    }

    async isAIAllowed(roomId) {
        const settings = await this.getRoomSettings(roomId);
        if (!settings) return true; // Default: allow if not configured
        return settings.allowAI !== false;
    }

    async areCommandsAllowed(roomId) {
        const settings = await this.getRoomSettings(roomId);
        if (!settings) return true;
        return settings.allowCommands !== false;
    }

    async isCommandAllowed(roomId, commandName) {
        const settings = await this.getRoomSettings(roomId);
        if (!settings) return true;
        if (settings.allowCommands !== false) return true;
        // If commands disabled, check allowlist
        return settings.allowedCommands?.includes(commandName) || false;
    }

    async shouldIgnore(roomId) {
        const settings = await this.getRoomSettings(roomId);
        if (!settings) return false;
        return settings.ignoreAll === true;
    }

    async addRoom(roomId, name, options = {}) {
        await this.initialize();

        const room = {
            roomId: roomId,
            name: name || roomId,
            allowAI: options.allowAI !== undefined ? options.allowAI : true,
            allowAiCommand: options.allowAiCommand !== undefined ? options.allowAiCommand : true,
            allowCommands: options.allowCommands !== undefined ? options.allowCommands : true,
            ignoreAll: options.ignoreAll !== undefined ? options.ignoreAll : false,
            allowedCommands: options.allowedCommands || [],
            addedAt: new Date().toISOString()
        };

        this.rooms.set(roomId, room);

        const storageType = this.getStorageType();
        if (storageType === 'mongodb') {
            await this.saveToMongoDB(room);
        } else {
            await this.saveToFile();
        }

        console.log(`[Room Manager] Added room: ${roomId} (AI: ${room.allowAI}, AI Cmd: ${room.allowAiCommand}, Commands: ${room.allowCommands}, Ignore: ${room.ignoreAll})`);
        return room;
    }

    async updateRoom(roomId, updates) {
        await this.initialize();

        const room = this.rooms.get(roomId);
        if (!room) {
            throw new Error('Room not found');
        }

        // Update fields
        if (updates.name !== undefined) room.name = updates.name;
        if (updates.allowAI !== undefined) room.allowAI = updates.allowAI;
        if (updates.allowAiCommand !== undefined) room.allowAiCommand = updates.allowAiCommand;
        if (updates.allowCommands !== undefined) room.allowCommands = updates.allowCommands;
        if (updates.ignoreAll !== undefined) room.ignoreAll = updates.ignoreAll;
        if (updates.allowedCommands !== undefined) room.allowedCommands = updates.allowedCommands;

        this.rooms.set(roomId, room);

        const storageType = this.getStorageType();
        if (storageType === 'mongodb') {
            await this.saveToMongoDB(room);
        } else {
            await this.saveToFile();
        }

        console.log(`[Room Manager] Updated room: ${roomId}`);
        return room;
    }

    async removeRoom(roomId) {
        await this.initialize();

        if (!this.rooms.has(roomId)) {
            return false;
        }

        this.rooms.delete(roomId);

        const storageType = this.getStorageType();
        if (storageType === 'mongodb') {
            try {
                const mongoClient = await storageHelper.getMongoClient();
                const db = mongoClient.db();
                const collection = db.collection('rooms');
                await collection.deleteOne({ _id: roomId });
            } catch (error) {
                console.error('[Room Manager] Failed to delete from MongoDB:', error.message);
            }
        } else {
            await this.saveToFile();
        }

        console.log(`[Room Manager] Removed room: ${roomId}`);
        return true;
    }

    async getAllRooms() {
        await this.initialize();
        return Array.from(this.rooms.values());
    }
}

module.exports = new RoomManager();
