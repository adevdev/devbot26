const fs = require('fs');
const path = require('path');

/**
 * System Prompt Loader
 * Loads and composes modular system prompts from system-prompts/ folder
 */

const PROMPTS_DIR = path.join(__dirname, 'system-prompts');

class SystemPromptLoader {
    constructor() {
        this.modules = null;
    }

    /**
     * Load all system prompt modules from folder
     */
    loadModules() {
        if (this.modules) return this.modules;

        try {
            // Ensure directory exists
            if (!fs.existsSync(PROMPTS_DIR)) {
                console.warn('[SystemPrompt] Directory not found, creating:', PROMPTS_DIR);
                fs.mkdirSync(PROMPTS_DIR, { recursive: true });
                this.modules = [];
                return this.modules;
            }

            // Read all .js files (excluding .example, .disabled) and sort by filename
            const files = fs.readdirSync(PROMPTS_DIR)
                .filter(f => f.endsWith('.js') && !f.endsWith('.example') && !f.endsWith('.disabled'))
                .sort();

            this.modules = files.map(file => {
                const filePath = path.join(PROMPTS_DIR, file);
                const moduleName = path.basename(file, '.js');

                // Clear require cache to allow hot-reload
                delete require.cache[require.resolve(filePath)];

                const moduleExport = require(filePath);

                // Support both formats:
                // 1. Object format: { name, description, category, generate }
                // 2. Legacy function format: async (context) => {}
                let module;
                if (typeof moduleExport === 'function') {
                    // Legacy format
                    module = {
                        name: moduleName,
                        description: 'Custom module',
                        category: 'Custom',
                        file: file,
                        generate: moduleExport
                    };
                } else if (moduleExport && typeof moduleExport.generate === 'function') {
                    // New object format
                    module = {
                        name: moduleExport.name || moduleName,
                        description: moduleExport.description || 'No description',
                        category: moduleExport.category || 'Custom',
                        file: file,
                        generate: moduleExport.generate
                    };
                } else {
                    console.error(`[SystemPrompt] Invalid module format: ${file}`);
                    return null;
                }

                return module;
            }).filter(Boolean);

            console.log(`[SystemPrompt] Loaded ${this.modules.length} modules:`, files.join(', '));
            return this.modules;
        } catch (error) {
            console.error('[SystemPrompt] Failed to load modules:', error.message);
            this.modules = [];
            return this.modules;
        }
    }

    /**
     * Get list of all available modules with metadata
     */
    async getAvailableModules() {
        const modules = this.loadModules();
        return modules.map(m => ({
            name: m.name,
            description: m.description,
            category: m.category,
            file: m.file
        }));
    }

    /**
     * Generate final system prompt by composing all modules
     * @param {Object} context - Context object passed to each module
     * @returns {Promise<string>} - Composed system prompt
     */
    async generate(context) {
        const modules = this.loadModules();

        if (modules.length === 0) {
            console.warn('[SystemPrompt] No modules loaded, using fallback');
            return 'You are DevBot26, an AI assistant responding via WhatsApp.';
        }

        // Get enabled modules from settings
        let enabledModules;
        try {
            const settingsManager = require('./settingsManager');
            const enabledList = await settingsManager.getEnabledSystemPrompts();

            // Filter modules by enabled list
            if (enabledList && enabledList.length > 0) {
                enabledModules = modules.filter(m => enabledList.includes(m.name));
            } else {
                // If no setting exists, all modules are enabled by default
                enabledModules = modules;
            }
        } catch (error) {
            console.error('[SystemPrompt] Failed to get enabled modules:', error.message);
            // Fallback: all modules enabled
            enabledModules = modules;
        }

        const parts = [];

        for (const module of enabledModules) {
            try {
                const content = await module.generate(context);

                // Skip null/undefined/empty results
                if (content && content.trim()) {
                    parts.push(content.trim());
                }
            } catch (error) {
                console.error(`[SystemPrompt] Error in module ${module.name}:`, error.message);
                // Continue with other modules
            }
        }

        const finalPrompt = parts.join('\n\n');
        console.log(`[SystemPrompt] Generated prompt: ${finalPrompt.length} chars from ${parts.length}/${modules.length} modules`);

        return finalPrompt;
    }

    /**
     * Reload modules (useful for development/testing)
     */
    reload() {
        this.modules = null;
        console.log('[SystemPrompt] Modules cache cleared, will reload on next generate()');
    }

    /**
     * Get list of loaded module names
     */
    getModuleList() {
        const modules = this.loadModules();
        return modules.map(m => m.name);
    }
}

module.exports = new SystemPromptLoader();
