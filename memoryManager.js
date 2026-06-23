const fs = require('fs').promises;
const path = require('path');
const storageHelper = require('./storageHelper');
const settingsManager = require('./settingsManager');

const MEMORY_DIR = path.join(__dirname, 'memory');

class MemoryManager {
    constructor() {
        this.ensureMemoryDir();
    }

    async getMaxMessages() {
        try {
            return await settingsManager.getMaxMemoryMessages();
        } catch (error) {
            console.warn('[Memory] Failed to get max messages setting, using default 100');
            return 100;
        }
    }

    getStorageType() {
        return storageHelper.getStorageType(storageHelper.STORAGE_COMPONENTS.MEMORY);
    }

    async ensureMemoryDir() {
        try {
            await fs.mkdir(MEMORY_DIR, { recursive: true });
        } catch (error) {
            console.error('[Memory] Failed to create memory directory:', error.message);
        }
    }

    getMemoryPath(roomId) {
        // Sanitize roomId for filename (replace @ and : with _)
        const sanitized = roomId.replace(/[@:]/g, '_');
        return path.join(MEMORY_DIR, `${sanitized}.json`);
    }

    async loadMemory(roomId) {
        const storageType = this.getStorageType();

        if (storageType === 'mongodb') {
            return this.loadMemoryFromMongoDB(roomId);
        } else {
            return this.loadMemoryFromFile(roomId);
        }
    }

    async loadMemoryFromFile(roomId) {
        try {
            const memoryPath = this.getMemoryPath(roomId);
            const data = await fs.readFile(memoryPath, 'utf8');
            const memory = JSON.parse(data);
            return memory.messages || [];
        } catch (error) {
            if (error.code === 'ENOENT') {
                // File doesn't exist yet, return empty array
                return [];
            }
            console.error('[Memory] Failed to load memory from file:', error.message);
            return [];
        }
    }

    async loadMemoryFromMongoDB(roomId) {
        try {
            const mongoClient = await storageHelper.getMongoClient();
            const db = mongoClient.db();
            const collection = db.collection('memories');

            const doc = await collection.findOne({ _id: roomId });

            if (doc && doc.messages) {
                return doc.messages;
            }
            return [];
        } catch (error) {
            console.error('[Memory] Failed to load memory from MongoDB:', error.message);
            return [];
        }
    }

    async saveMessage(roomId, role, content, metadata = {}) {
        const storageType = this.getStorageType();

        if (storageType === 'mongodb') {
            return this.saveMessageToMongoDB(roomId, role, content, metadata);
        } else {
            return this.saveMessageToFile(roomId, role, content, metadata);
        }
    }

    async saveMessageToFile(roomId, role, content, metadata = {}) {
        try {
            const MAX_MESSAGES = await this.getMaxMessages();
            const messages = await this.loadMemoryFromFile(roomId);

            // Add new message
            messages.push({
                timestamp: new Date().toISOString(),
                role: role, // 'user' or 'assistant'
                content: content,
                ...metadata // sender, model, etc.
            });

            // Trim to MAX_MESSAGES (keep most recent)
            const trimmed = messages.slice(-MAX_MESSAGES);

            // Save back to file
            const memoryPath = this.getMemoryPath(roomId);
            await fs.writeFile(memoryPath, JSON.stringify({
                roomId: roomId,
                messages: trimmed,
                lastUpdated: new Date().toISOString()
            }, null, 2));

            console.log(`[Memory] Saved message to ${roomId} (${trimmed.length} total)`);
        } catch (error) {
            console.error('[Memory] Failed to save message to file:', error.message);
        }
    }

    async saveMessageToMongoDB(roomId, role, content, metadata = {}) {
        try {
            const MAX_MESSAGES = await this.getMaxMessages();
            const mongoClient = await storageHelper.getMongoClient();
            const db = mongoClient.db();
            const collection = db.collection('memories');

            const newMessage = {
                timestamp: new Date().toISOString(),
                role: role,
                content: content,
                ...metadata
            };

            // Push new message and trim to MAX_MESSAGES
            await collection.updateOne(
                { _id: roomId },
                {
                    $push: {
                        messages: {
                            $each: [newMessage],
                            $slice: -MAX_MESSAGES // Keep last MAX_MESSAGES only
                        }
                    },
                    $set: {
                        lastUpdated: new Date().toISOString()
                    }
                },
                { upsert: true }
            );

            console.log(`[Memory] Saved message to ${roomId} (MongoDB)`);
        } catch (error) {
            console.error('[Memory] Failed to save message to MongoDB:', error.message);
        }
    }

    async getRecentContext(roomId, limit = 10) {
        try {
            const messages = await this.loadMemory(roomId);
            // Get last N messages
            const recent = messages.slice(-limit);

            if (recent.length === 0) {
                return null;
            }

            // Format as context string
            let context = '## Conversation History\n\n';
            for (const msg of recent) {
                const timestamp = new Date(msg.timestamp).toLocaleString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                });

                if (msg.role === 'user') {
                    const sender = msg.sender ? ` (${msg.sender.split('@')[0]})` : '';
                    context += `**User${sender}** [${timestamp}]:\n${msg.content}\n\n`;
                } else if (msg.role === 'assistant') {
                    const model = msg.model ? ` (${msg.model})` : '';
                    context += `**Assistant${model}** [${timestamp}]:\n${msg.content}\n\n`;
                }
            }

            return context.trim();
        } catch (error) {
            console.error('[Memory] Failed to get recent context:', error.message);
            return null;
        }
    }

    async clearMemory(roomId) {
        const storageType = this.getStorageType();

        if (storageType === 'mongodb') {
            return this.clearMemoryFromMongoDB(roomId);
        } else {
            return this.clearMemoryFromFile(roomId);
        }
    }

    async clearMemoryFromFile(roomId) {
        try {
            const memoryPath = this.getMemoryPath(roomId);
            await fs.unlink(memoryPath);
            console.log(`[Memory] Cleared memory for ${roomId} (file)`);
            return true;
        } catch (error) {
            if (error.code === 'ENOENT') {
                return true; // Already doesn't exist
            }
            console.error('[Memory] Failed to clear memory from file:', error.message);
            return false;
        }
    }

    async clearMemoryFromMongoDB(roomId) {
        try {
            const mongoClient = await storageHelper.getMongoClient();
            const db = mongoClient.db();
            const collection = db.collection('memories');

            await collection.deleteOne({ _id: roomId });
            console.log(`[Memory] Cleared memory for ${roomId} (MongoDB)`);
            return true;
        } catch (error) {
            console.error('[Memory] Failed to clear memory from MongoDB:', error.message);
            return false;
        }
    }

    async getAllRooms() {
        const storageType = this.getStorageType();

        if (storageType === 'mongodb') {
            return this.getAllRoomsFromMongoDB();
        } else {
            return this.getAllRoomsFromFile();
        }
    }

    async getAllRoomsFromFile() {
        try {
            const files = await fs.readdir(MEMORY_DIR);
            const rooms = [];

            for (const file of files) {
                if (file.endsWith('.json')) {
                    const filePath = path.join(MEMORY_DIR, file);
                    const data = await fs.readFile(filePath, 'utf8');
                    const memory = JSON.parse(data);
                    rooms.push({
                        roomId: memory.roomId,
                        messageCount: memory.messages?.length || 0,
                        lastUpdated: memory.lastUpdated,
                        file: file
                    });
                }
            }

            return rooms;
        } catch (error) {
            console.error('[Memory] Failed to get all rooms from file:', error.message);
            return [];
        }
    }

    async getAllRoomsFromMongoDB() {
        try {
            const mongoClient = await storageHelper.getMongoClient();
            const db = mongoClient.db();
            const collection = db.collection('memories');

            const docs = await collection.find({}).toArray();
            const rooms = docs.map(doc => ({
                roomId: doc._id,
                messageCount: doc.messages?.length || 0,
                lastUpdated: doc.lastUpdated,
                file: null // No file in MongoDB
            }));

            return rooms;
        } catch (error) {
            console.error('[Memory] Failed to get all rooms from MongoDB:', error.message);
            return [];
        }
    }

    async getMemoryStats(roomId) {
        try {
            const messages = await this.loadMemory(roomId);
            const userMessages = messages.filter(m => m.role === 'user');
            const assistantMessages = messages.filter(m => m.role === 'assistant');

            return {
                total: messages.length,
                user: userMessages.length,
                assistant: assistantMessages.length,
                oldestMessage: messages[0]?.timestamp || null,
                newestMessage: messages[messages.length - 1]?.timestamp || null
            };
        } catch (error) {
            console.error('[Memory] Failed to get stats:', error.message);
            return null;
        }
    }
}

module.exports = new MemoryManager();
