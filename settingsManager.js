const fs = require('fs');
const path = require('path');
const storageHelper = require('./storageHelper');

/**
 * AI Default Settings Manager
 * Manages default AI configuration (model, quota, resetPeriod)
 */

class SettingsManager {
    constructor() {
        this.settingsFile = './settings/ai-defaults.json';
        this.settings = null;
        this.initialized = false;

        // Default settings
        this.defaultSettings = {
            defaultModel: 'qwen3-coder-next',
            defaultQuota: 100,
            defaultResetPeriod: 'perDay',
            defaultVisionModel: 'claude-sonnet-4.5', // Fallback model for vision requests
            supportedModels: [
                {
                    id: 'qwen3-coder-next',
                    displayName: 'Qwen3 Coder Next',
                    supportsVision: false,
                    enabled: true
                },
                {
                    id: 'claude-sonnet-4.5',
                    displayName: 'Claude Sonnet 4.5',
                    supportsVision: true,
                    enabled: true
                }
            ],
            // API Configuration (null = use .env fallback)
            apiEndpoint: null, // If set, overrides AI_API_ENDPOINT env var
            apiKey: null       // If set, overrides AI_API_KEY env var
        };
    }

    async initialize() {
        if (this.initialized) return;

        const storageType = storageHelper.getStorageType(storageHelper.STORAGE_COMPONENTS.AI_SETTINGS);

        if (storageType === 'mongodb') {
            await this.loadFromMongoDB();
        } else {
            await this.loadFromFile();
        }

        this.initialized = true;
    }

    async loadFromFile() {
        try {
            // Ensure settings directory exists
            const settingsDir = path.dirname(this.settingsFile);
            if (!fs.existsSync(settingsDir)) {
                fs.mkdirSync(settingsDir, { recursive: true });
            }

            if (fs.existsSync(this.settingsFile)) {
                const data = JSON.parse(fs.readFileSync(this.settingsFile, 'utf-8'));
                this.settings = { ...this.defaultSettings, ...data };
            } else {
                // Create default settings file
                this.settings = { ...this.defaultSettings };
                await this.saveToFile();
            }

            console.log(`[AI Settings] Loaded from file: model=${this.settings.defaultModel}, quota=${this.settings.defaultQuota}, reset=${this.settings.defaultResetPeriod}`);
        } catch (error) {
            console.error('[AI Settings] Failed to load from file:', error.message);
            this.settings = { ...this.defaultSettings };
        }
    }

    async saveToFile() {
        try {
            const settingsDir = path.dirname(this.settingsFile);
            if (!fs.existsSync(settingsDir)) {
                fs.mkdirSync(settingsDir, { recursive: true });
            }

            fs.writeFileSync(this.settingsFile, JSON.stringify(this.settings, null, 2));
        } catch (error) {
            console.error('[AI Settings] Failed to save to file:', error.message);
        }
    }

    async loadFromMongoDB() {
        try {
            const mongoClient = await storageHelper.getMongoClient();
            const db = mongoClient.db();
            const collection = db.collection('ai_settings');

            const doc = await collection.findOne({ _id: 'defaults' });

            if (doc && doc.settings) {
                this.settings = { ...this.defaultSettings, ...doc.settings };
            } else {
                this.settings = { ...this.defaultSettings };
                await this.saveToMongoDB();
            }

            console.log(`[AI Settings] Loaded from MongoDB: model=${this.settings.defaultModel}, quota=${this.settings.defaultQuota}, reset=${this.settings.defaultResetPeriod}`);
        } catch (error) {
            console.error('[AI Settings] Failed to load from MongoDB:', error.message);
            this.settings = { ...this.defaultSettings };
        }
    }

    async saveToMongoDB() {
        try {
            const mongoClient = await storageHelper.getMongoClient();
            const db = mongoClient.db();
            const collection = db.collection('ai_settings');

            await collection.updateOne(
                { _id: 'defaults' },
                {
                    $set: {
                        settings: this.settings,
                        lastUpdated: new Date()
                    }
                },
                { upsert: true }
            );
        } catch (error) {
            console.error('[AI Settings] Failed to save to MongoDB:', error.message);
            throw error;
        }
    }

    async save() {
        const storageType = storageHelper.getStorageType(storageHelper.STORAGE_COMPONENTS.AI_SETTINGS);

        if (storageType === 'mongodb') {
            await this.saveToMongoDB();
        } else {
            await this.saveToFile();
        }
    }

    async getDefaultModel() {
        await this.initialize();
        return this.settings.defaultModel;
    }

    async getDefaultQuota() {
        await this.initialize();
        return this.settings.defaultQuota;
    }

    async getDefaultResetPeriod() {
        await this.initialize();
        return this.settings.defaultResetPeriod;
    }

    async getDefaultVisionModel() {
        await this.initialize();
        return this.settings.defaultVisionModel || 'claude-sonnet-4.5';
    }

    async getApiEndpoint() {
        await this.initialize();
        // Priority: settings → env var → default
        return this.settings.apiEndpoint || process.env.AI_API_ENDPOINT || 'ai2.adevdev.com';
    }

    async getApiKey() {
        await this.initialize();
        // Priority: settings → env var
        return this.settings.apiKey || process.env.AI_API_KEY || null;
    }

    async getSupportedModels() {
        await this.initialize();
        return this.settings.supportedModels || this.defaultSettings.supportedModels;
    }

    async getEnabledModels() {
        await this.initialize();
        const models = this.settings.supportedModels || this.defaultSettings.supportedModels;
        return models.filter(m => m.enabled);
    }

    async getVisionCapableModels() {
        await this.initialize();
        const models = this.settings.supportedModels || this.defaultSettings.supportedModels;
        return models.filter(m => m.enabled && m.supportsVision);
    }

    async getModelById(modelId) {
        await this.initialize();
        const models = this.settings.supportedModels || this.defaultSettings.supportedModels;
        return models.find(m => m.id === modelId);
    }

    async addModel(model) {
        await this.initialize();

        // Validate required fields
        if (!model.id || !model.displayName) {
            throw new Error('Model must have id and displayName');
        }

        // Check if model already exists
        const existing = await this.getModelById(model.id);
        if (existing) {
            throw new Error('Model with this ID already exists');
        }

        // Add model with defaults
        const newModel = {
            id: model.id,
            displayName: model.displayName,
            supportsVision: model.supportsVision || false,
            enabled: model.enabled !== undefined ? model.enabled : true
        };

        if (!this.settings.supportedModels) {
            this.settings.supportedModels = [...this.defaultSettings.supportedModels];
        }

        this.settings.supportedModels.push(newModel);
        await this.save();

        console.log(`[AI Settings] Added model: ${newModel.id} (${newModel.displayName})`);
        return newModel;
    }

    async updateModel(modelId, updates) {
        await this.initialize();

        if (!this.settings.supportedModels) {
            this.settings.supportedModels = [...this.defaultSettings.supportedModels];
        }

        const index = this.settings.supportedModels.findIndex(m => m.id === modelId);
        if (index === -1) {
            throw new Error('Model not found');
        }

        // Update allowed fields
        if (updates.displayName !== undefined) {
            this.settings.supportedModels[index].displayName = updates.displayName;
        }
        if (updates.supportsVision !== undefined) {
            this.settings.supportedModels[index].supportsVision = updates.supportsVision;
        }
        if (updates.enabled !== undefined) {
            this.settings.supportedModels[index].enabled = updates.enabled;
        }

        await this.save();
        console.log(`[AI Settings] Updated model: ${modelId}`);
        return this.settings.supportedModels[index];
    }

    async removeModel(modelId) {
        await this.initialize();

        if (!this.settings.supportedModels) {
            this.settings.supportedModels = [...this.defaultSettings.supportedModels];
        }

        // Prevent removing if it's the default model or vision model
        if (this.settings.defaultModel === modelId) {
            throw new Error('Cannot remove default model. Change default model first.');
        }
        if (this.settings.defaultVisionModel === modelId) {
            throw new Error('Cannot remove default vision model. Change vision model first.');
        }

        const index = this.settings.supportedModels.findIndex(m => m.id === modelId);
        if (index === -1) {
            throw new Error('Model not found');
        }

        this.settings.supportedModels.splice(index, 1);
        await this.save();

        console.log(`[AI Settings] Removed model: ${modelId}`);
        return true;
    }

    async getAll() {
        await this.initialize();
        return { ...this.settings };
    }

    async updateSettings(updates) {
        await this.initialize();

        if (updates.defaultModel !== undefined) {
            const validModels = ['claude-sonnet-4.5', 'qwen3-coder-next'];
            if (!validModels.includes(updates.defaultModel)) {
                throw new Error('Invalid model');
            }
            this.settings.defaultModel = updates.defaultModel;
        }

        if (updates.defaultQuota !== undefined) {
            const quota = parseInt(updates.defaultQuota);
            if (isNaN(quota) || quota < 1 || quota > 10000) {
                throw new Error('Quota must be between 1 and 10000');
            }
            this.settings.defaultQuota = quota;
        }

        if (updates.defaultResetPeriod !== undefined) {
            const validPeriods = ['per5Hours', 'perDay', 'perMonth'];
            if (!validPeriods.includes(updates.defaultResetPeriod)) {
                throw new Error('Invalid reset period');
            }
            this.settings.defaultResetPeriod = updates.defaultResetPeriod;
        }

        if (updates.defaultVisionModel !== undefined) {
            const validVisionModels = ['claude-sonnet-4.5']; // Only vision-capable models
            if (!validVisionModels.includes(updates.defaultVisionModel)) {
                throw new Error('Invalid vision model');
            }
            this.settings.defaultVisionModel = updates.defaultVisionModel;
        }

        if (updates.apiEndpoint !== undefined) {
            // null = revert to env var, string = override
            if (updates.apiEndpoint !== null && typeof updates.apiEndpoint !== 'string') {
                throw new Error('API endpoint must be a string or null');
            }
            this.settings.apiEndpoint = updates.apiEndpoint;
        }

        if (updates.apiKey !== undefined) {
            // null = revert to env var, string = override
            if (updates.apiKey !== null && typeof updates.apiKey !== 'string') {
                throw new Error('API key must be a string or null');
            }
            this.settings.apiKey = updates.apiKey;
        }

        await this.save();
        console.log(`[AI Settings] Updated: model=${this.settings.defaultModel}, quota=${this.settings.defaultQuota}, reset=${this.settings.defaultResetPeriod}, vision=${this.settings.defaultVisionModel}, apiOverride=${!!this.settings.apiEndpoint || !!this.settings.apiKey}`);
    }
}

module.exports = new SettingsManager();
