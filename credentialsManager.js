const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Storage hierarchy: CREDENTIALS_STORAGE -> GLOBAL_STORAGE -> 'file'
function getStorageType() {
    const credentialsStorage = process.env.CREDENTIALS_STORAGE;
    if (credentialsStorage && (credentialsStorage === 'file' || credentialsStorage === 'mongodb')) {
        return credentialsStorage;
    }

    const globalStorage = process.env.GLOBAL_STORAGE;
    if (globalStorage && (globalStorage === 'file' || globalStorage === 'mongodb')) {
        return globalStorage;
    }

    return 'file';
}

const CREDS_STORAGE = getStorageType();
const MONGO_URI = process.env.MONGO_URI;
const CREDS_FILE_PATH = './wachan/state/creds.json';

let mongoClient = null;
let db = null;

async function getMongoClient() {
    if (mongoClient && mongoClient.topology && mongoClient.topology.isConnected()) {
        return mongoClient;
    }

    try {
        const { MongoClient } = require('mongodb');
        mongoClient = new MongoClient(MONGO_URI);
        await mongoClient.connect();
        db = mongoClient.db();
        console.log('[MongoDB] Connected successfully');
        return mongoClient;
    } catch (error) {
        console.error('[MongoDB] Connection failed:', error.message);
        throw error;
    }
}

function getMongoDbName() {
    if (!MONGO_URI) return null;

    try {
        // Extract DB name from URI (last segment of path)
        const url = new URL(MONGO_URI);
        const dbName = url.pathname.split('/').pop();
        return dbName || 'whatsapp-bot';
    } catch (error) {
        return 'whatsapp-bot';
    }
}

async function saveCredsToMongo(data) {
    try {
        await getMongoClient();
        const collection = db.collection('credentials');

        await collection.replaceOne(
            { _id: 'bot_credentials' },
            { _id: 'bot_credentials', data, updatedAt: new Date() },
            { upsert: true }
        );

        console.log('Credentials saved to MongoDB');
    } catch (error) {
        console.error('Failed to save credentials to MongoDB:', error.message);
        throw error;
    }
}

async function loadCredsFromMongo() {
    try {
        await getMongoClient();
        const collection = db.collection('credentials');
        const doc = await collection.findOne({ _id: 'bot_credentials' });

        if (doc && doc.data) {
            console.log('Credentials loaded from MongoDB');
            return doc.data;
        }

        return null;
    } catch (error) {
        console.error('Failed to load credentials from MongoDB:', error.message);
        throw error;
    }
}

async function credsExistInMongo() {
    try {
        await getMongoClient();
        const collection = db.collection('credentials');
        const count = await collection.countDocuments({ _id: 'bot_credentials' });
        return count > 0;
    } catch (error) {
        console.error('Failed to check credentials in MongoDB:', error.message);
        return false;
    }
}

async function deleteCredsFromMongo() {
    try {
        await getMongoClient();
        const collection = db.collection('credentials');
        await collection.deleteOne({ _id: 'bot_credentials' });
        console.log('Credentials deleted from MongoDB');
    } catch (error) {
        console.error('Failed to delete credentials from MongoDB:', error.message);
        throw error;
    }
}

function saveCredsToFile(data) {
    const dir = path.dirname(CREDS_FILE_PATH);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(CREDS_FILE_PATH, JSON.stringify(data, null, 2));
    console.log('Credentials saved to file');
}

function loadCredsFromFile() {
    if (fs.existsSync(CREDS_FILE_PATH)) {
        const data = fs.readFileSync(CREDS_FILE_PATH, 'utf-8');
        console.log('Credentials loaded from file');
        return JSON.parse(data);
    }
    return null;
}

function credsExistInFile() {
    return fs.existsSync(CREDS_FILE_PATH);
}

function deleteCredsFromFile() {
    if (fs.existsSync(CREDS_FILE_PATH)) {
        fs.unlinkSync(CREDS_FILE_PATH);
        console.log('Credentials deleted from file');
    }
}

async function saveCreds(data) {
    if (CREDS_STORAGE === 'mongodb') {
        return await saveCredsToMongo(data);
    } else {
        return saveCredsToFile(data);
    }
}

async function loadCreds() {
    if (CREDS_STORAGE === 'mongodb') {
        return await loadCredsFromMongo();
    } else {
        return loadCredsFromFile();
    }
}

async function credentialsExist() {
    if (CREDS_STORAGE === 'mongodb') {
        return await credsExistInMongo();
    } else {
        return credsExistInFile();
    }
}

async function deleteCreds() {
    if (CREDS_STORAGE === 'mongodb') {
        return await deleteCredsFromMongo();
    } else {
        return deleteCredsFromFile();
    }
}

async function closeConnection() {
    if (mongoClient) {
        await mongoClient.close();
        mongoClient = null;
        db = null;
        console.log('MongoDB connection closed');
    }
}

module.exports = {
    saveCreds,
    loadCreds,
    credentialsExist,
    deleteCreds,
    closeConnection,
    getStorageType: () => CREDS_STORAGE,
    getMongoClient: getMongoClient,
    getMongoDbName: getMongoDbName
};
