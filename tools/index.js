/**
 * Tools Module - Auto-loading registry for all AI tools
 * Automatically discovers and loads tools from the tools/ directory
 */

const fs = require('fs');
const path = require('path');
const temporaryToolsManager = require('../temporaryToolsManager');

// Auto-load all tool modules from this directory
const staticTools = {};
const toolSources = {}; // Track which file each tool came from

// Scan directory and load all .js files (except index.js)
const toolFiles = fs.readdirSync(__dirname)
    .filter(file => file !== 'index.js' && file !== 'definitions.js' && file.endsWith('.js'));

for (const file of toolFiles) {
    try {
        const tool = require(`./${file}`);

        // Validate tool structure
        if (!tool.definition || !tool.definition.name || !tool.execute) {
            console.warn(`[Tools] Skipping ${file}: Invalid tool structure (missing definition or execute)`);
            continue;
        }

        // Register tool by name
        staticTools[tool.definition.name] = tool;
        toolSources[tool.definition.name] = `tools/${file}`; // Track source file
        console.log(`[Tools] Loaded: ${tool.definition.name} from ${file}`);
    } catch (error) {
        console.error(`[Tools] Failed to load ${file}:`, error.message);
    }
}

/**
 * Get all tool definitions (static + temporary)
 * @returns {Array} - Merged array of tool definitions
 */
function getAllDefinitions() {
    const staticDefs = Object.values(staticTools).map(tool => tool.definition);
    const tempDefs = temporaryToolsManager.getDefinitions();

    // Merge, with temporary tools overriding static if same name
    const merged = [...staticDefs];

    for (const tempDef of tempDefs) {
        const existingIndex = merged.findIndex(t => t.name === tempDef.name);
        if (existingIndex !== -1) {
            // Replace static with temporary
            merged[existingIndex] = tempDef;
        } else {
            // Add new temporary tool
            merged.push(tempDef);
        }
    }

    return merged;
}

/**
 * Execute a tool (temporary or static)
 * @param {string} name - Tool name
 * @param {object} input - Tool input parameters
 * @returns {Promise<string>} - Tool result
 */
async function executeTool(name, input) {
    // Check if it's a temporary tool first (priority)
    if (temporaryToolsManager.has(name)) {
        return await temporaryToolsManager.execute(name, input);
    }

    // Execute static tool
    const tool = staticTools[name];
    if (!tool) {
        throw new Error(`Unknown tool: ${name}`);
    }

    return await tool.execute(input);
}

/**
 * Get tool metadata (for progress messages, icons, etc.)
 * @param {string} name - Tool name
 * @returns {object|null} - Tool metadata or null if not found
 */
function getMetadata(name) {
    const tool = staticTools[name];
    return tool ? tool.metadata : null;
}

/**
 * Get all registered tool names
 * @returns {Array<string>} - Array of tool names
 */
function getToolNames() {
    return Object.keys(staticTools);
}

/**
 * Get tool source file path
 * @param {string} name - Tool name
 * @returns {string|null} - Source file path or null if not found
 */
function getToolSource(name) {
    return toolSources[name] || null;
}

// Backward compatibility exports (for code that directly imports specific tools)
// These now return the execute function for compatibility
const webSearch = staticTools['web_search'] ? (query) => staticTools['web_search'].execute({ query }) : null;
const fetchUrl = staticTools['fetch_url'] ? (url) => staticTools['fetch_url'].execute({ url }) : null;
const getCurrentTime = staticTools['get_time'] ? () => staticTools['get_time'].execute({}) : null;
const imageSearch = staticTools['image_search'] ? (query) => staticTools['image_search'].execute({ query }) : null;

module.exports = {
    // Primary API
    getAllDefinitions,
    executeTool,
    getMetadata,
    getToolNames,
    getToolSource,

    // Backward compatibility
    webSearch,
    fetchUrl,
    getCurrentTime,
    imageSearch,
    temporaryToolsManager,

    // Legacy export (kept for backward compatibility)
    toolDefinitions: getAllDefinitions() // This will be stale if temp tools change, but kept for compat
};

