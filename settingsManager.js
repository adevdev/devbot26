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

        // Default settings (minimal bootstrap - user must configure models via UI)
        this.defaultSettings = {
            defaultModel: null, // Must be set by user
            defaultQuota: 30,
            defaultResetPeriod: 'perDay',
            defaultVisionModel: null, // Must be set by user
            whitelistMode: 'strict', // 'strict' = only whitelisted, 'auto' = auto-add new users
            aiIdentity: 'You are DevBot26, an AI assistant responding via WhatsApp.', // Customizable AI identity/personality
            maxMemoryMessages: 100, // Max messages stored per chat for AI context
            supportedModels: [], // User must add models via UI
            // Provider configurations (API paths, versions, etc.)
            providerConfigs: {
                openai: {
                    path: '/v1/chat/completions',
                    description: 'OpenAI-compatible API format'
                },
                anthropic: {
                    path: '/v1/messages',
                    version: '2023-06-01',
                    description: 'Anthropic Claude API format'
                }
            },
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
        const model = this.settings.defaultModel;

        // If no default set, return first enabled model
        if (!model) {
            const enabledModels = this.settings.supportedModels.filter(m => m.enabled);
            return enabledModels.length > 0 ? enabledModels[0].id : null;
        }

        return model;
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

        // If user has set a vision model, return it
        if (this.settings.defaultVisionModel) {
            return this.settings.defaultVisionModel;
        }

        // Otherwise, return first vision-capable model from supported models
        const visionModels = this.settings.supportedModels.filter(m => m.supportsVision && m.enabled);
        if (visionModels.length > 0) {
            return visionModels[0].id;
        }

        // No vision models available
        return null;
    }

    async getWhitelistMode() {
        await this.initialize();
        return this.settings.whitelistMode || 'strict';
    }

    async getAiIdentity() {
        await this.initialize();
        return this.settings.aiIdentity || this.defaultSettings.aiIdentity;
    }

    async setAiIdentity(identity) {
        await this.initialize();
        this.settings.aiIdentity = identity;
        await this.save();
        console.log('[AI Settings] Updated AI identity');
    }

    async getMaxMemoryMessages() {
        await this.initialize();
        return this.settings.maxMemoryMessages || this.defaultSettings.maxMemoryMessages;
    }

    async setMaxMemoryMessages(maxMessages) {
        await this.initialize();
        this.settings.maxMemoryMessages = maxMessages;
        await this.save();
        console.log('[AI Settings] Updated max memory messages:', maxMessages);
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

    async getProviderConfigs() {
        await this.initialize();
        return this.settings.providerConfigs || this.defaultSettings.providerConfigs;
    }

    async getProviderConfig(provider) {
        await this.initialize();
        const configs = this.settings.providerConfigs || this.defaultSettings.providerConfigs;
        return configs[provider] || null;
    }

    async updateProviderConfig(provider, config) {
        await this.initialize();

        if (!this.settings.providerConfigs) {
            this.settings.providerConfigs = { ...this.defaultSettings.providerConfigs };
        }

        // Validate provider exists
        const validProviders = ['openai', 'anthropic'];
        if (!validProviders.includes(provider)) {
            throw new Error('Invalid provider. Must be "openai" or "anthropic"');
        }

        // Update config
        this.settings.providerConfigs[provider] = {
            ...this.settings.providerConfigs[provider],
            ...config
        };

        await this.save();
        console.log(`[AI Settings] Updated provider config: ${provider}`);
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
        const model = models.find(m => m.id === modelId);

        // Add provider fallback for legacy models without provider field
        if (model && !model.provider) {
            model.provider = 'anthropic'; // Default to anthropic for legacy models
        }

        return model;
    }

    async addModel(model) {
        await this.initialize();

        // Validate required fields
        if (!model.id || !model.displayName) {
            throw new Error('Model must have id and displayName');
        }

        // Validate provider
        const validProviders = ['openai', 'anthropic'];
        if (model.provider && !validProviders.includes(model.provider)) {
            throw new Error('Provider must be "openai" or "anthropic"');
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
            enabled: model.enabled !== undefined ? model.enabled : true,
            provider: model.provider || 'anthropic' // Default to anthropic format
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
        if (updates.provider !== undefined) {
            const validProviders = ['openai', 'anthropic'];
            if (!validProviders.includes(updates.provider)) {
                throw new Error('Provider must be "openai" or "anthropic"');
            }
            this.settings.supportedModels[index].provider = updates.provider;
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
            // Validate against supported models list (dynamic)
            const supportedModels = await this.getSupportedModels();
            const validModelIds = supportedModels.map(m => m.id);

            if (!validModelIds.includes(updates.defaultModel)) {
                throw new Error(`Invalid model. Available: ${validModelIds.join(', ')}`);
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
            // Validate against vision-capable models (dynamic)
            const supportedModels = await this.getSupportedModels();
            const visionModels = supportedModels.filter(m => m.supportsVision === true);
            const validVisionModelIds = visionModels.map(m => m.id);

            if (!validVisionModelIds.includes(updates.defaultVisionModel)) {
                throw new Error(`Invalid vision model. Available: ${validVisionModelIds.join(', ')}`);
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

        if (updates.whitelistMode !== undefined) {
            const validModes = ['strict', 'auto'];
            if (!validModes.includes(updates.whitelistMode)) {
                throw new Error('Whitelist mode must be "strict" or "auto"');
            }
            this.settings.whitelistMode = updates.whitelistMode;
        }

        await this.save();
        console.log(`[AI Settings] Updated: model=${this.settings.defaultModel}, quota=${this.settings.defaultQuota}, reset=${this.settings.defaultResetPeriod}, vision=${this.settings.defaultVisionModel}, whitelistMode=${this.settings.whitelistMode}, apiOverride=${!!this.settings.apiEndpoint || !!this.settings.apiKey}`);
    }
}

module.exports = new SettingsManager();
