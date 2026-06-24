/**
 * Temporary Tools Manager
 * Manages AI tools loaded dynamically at runtime (stored in memory only)
 */

class TemporaryToolsManager {
    constructor() {
        // Store temporary tools in memory
        this.tools = new Map();
    }

    /**
     * Add a temporary tool
     * @param {string} name - Tool name (snake_case)
     * @param {string} description - Tool description
     * @param {object} inputSchema - JSON Schema for tool parameters
     * @param {function} implementation - Function that executes the tool
     * @param {string} source - Source of the tool (URL, manual, etc)
     */
    add(name, description, inputSchema, implementation, source = 'Manual') {
        // Validate name format
        if (!/^[a-z][a-z0-9_]*$/.test(name)) {
            throw new Error('Tool name must be snake_case (lowercase letters, numbers, underscores)');
        }

        // Store tool definition and implementation
        this.tools.set(name, {
            name,
            description,
            input_schema: inputSchema,
            implementation,
            source,
            temporary: true,
            addedAt: new Date().toISOString()
        });

        console.log(`[TemporaryTools] Added: ${name} (source: ${source})`);
    }

    /**
     * Remove a temporary tool
     * @param {string} name - Tool name
     * @returns {boolean} - True if removed, false if not found
     */
    remove(name) {
        const removed = this.tools.delete(name);
        if (removed) {
            console.log(`[TemporaryTools] Removed: ${name}`);
        }
        return removed;
    }

    /**
     * Get a temporary tool by name
     * @param {string} name - Tool name
     * @returns {object|null} - Tool object or null if not found
     */
    get(name) {
        return this.tools.get(name) || null;
    }

    /**
     * Get all temporary tool definitions (for AI API)
     * @returns {Array} - Array of tool definitions
     */
    getDefinitions() {
        const definitions = [];
        for (const tool of this.tools.values()) {
            definitions.push({
                name: tool.name,
                description: tool.description,
                input_schema: tool.input_schema
            });
        }
        return definitions;
    }

    /**
     * Get all temporary tools with metadata (for dashboard)
     * @returns {Array} - Array of tools with metadata
     */
    getAll() {
        return Array.from(this.tools.values());
    }

    /**
     * Execute a temporary tool
     * @param {string} name - Tool name
     * @param {object} input - Tool input parameters
     * @returns {Promise<string>} - Tool result
     */
    async execute(name, input) {
        const tool = this.tools.get(name);
        if (!tool) {
            throw new Error(`Tool "${name}" not found`);
        }

        if (!tool.implementation) {
            throw new Error(`Tool "${name}" has no implementation`);
        }

        try {
            const result = await tool.implementation(input);
            return typeof result === 'string' ? result : JSON.stringify(result);
        } catch (error) {
            console.error(`[TemporaryTools] Execution error for ${name}:`, error);
            throw new Error(`Tool execution failed: ${error.message}`);
        }
    }

    /**
     * Check if a tool exists
     * @param {string} name - Tool name
     * @returns {boolean} - True if exists
     */
    has(name) {
        return this.tools.has(name);
    }

    /**
     * Clear all temporary tools
     */
    clear() {
        const count = this.tools.size;
        this.tools.clear();
        console.log(`[TemporaryTools] Cleared ${count} tools`);
    }

    /**
     * Get count of temporary tools
     * @returns {number} - Number of tools
     */
    count() {
        return this.tools.size;
    }
}

// Export singleton instance
module.exports = new TemporaryToolsManager();
