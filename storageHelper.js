const credentialsManager = require('./credentialsManager');

/**
 * Central storage configuration helper
 *
 * Each component can have its own storage type, or fall back to GLOBAL_STORAGE.
 *
 * Storage hierarchy:
 * 1. Component-specific env var (e.g., WHITELIST_STORAGE)
 * 2. GLOBAL_STORAGE env var
 * 3. Default: 'file'
 */

const STORAGE_COMPONENTS = {
    CREDENTIALS: 'CREDENTIALS',
    WHITELIST: 'WHITELIST',
    MEMORY: 'MEMORY',
    USERSTORE: 'USERSTORE',
    WACHAN_SETTINGS: 'WACHAN_SETTINGS',
    AI_SETTINGS: 'AI_SETTINGS',
    CONTACT: 'CONTACT'
};

/**
 * Get storage type for a component
 * @param {string} component - Component name from STORAGE_COMPONENTS
 * @returns {string} - 'file' or 'mongodb'
 */
function getStorageType(component) {
    // 1. Check component-specific env var
    const componentVar = process.env[`${component}_STORAGE`];
    if (componentVar && (componentVar === 'file' || componentVar === 'mongodb')) {
        return componentVar;
    }

    // 2. Fall back to GLOBAL_STORAGE
    const globalStorage = process.env.GLOBAL_STORAGE;
    if (globalStorage && (globalStorage === 'file' || globalStorage === 'mongodb')) {
        return globalStorage;
    }

    // 3. Default to file
    return 'file';
}

/**
 * Get MongoDB client (shared across all components)
 * @returns {Promise<MongoClient>}
 */
async function getMongoClient() {
    return credentialsManager.getMongoClient();
}

/**
 * Get MongoDB database name
 * @returns {string}
 */
function getMongoDbName() {
    return credentialsManager.getMongoDbName();
}

/**
 * Check if MongoDB is available
 * @returns {boolean}
 */
function isMongoAvailable() {
    const globalStorage = process.env.GLOBAL_STORAGE;
    const mongoUri = process.env.MONGO_URI;

    // Check if any component uses mongodb or global is mongodb
    const anyMongo = Object.keys(STORAGE_COMPONENTS).some(comp => {
        const compStorage = process.env[`${comp}_STORAGE`];
        return compStorage === 'mongodb';
    }) || globalStorage === 'mongodb';

    return anyMongo && !!mongoUri;
}

module.exports = {
    STORAGE_COMPONENTS,
    getStorageType,
    getMongoClient,
    getMongoDbName,
    isMongoAvailable
};
