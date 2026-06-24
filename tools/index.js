/**
 * Tools Module - Central export for all AI tools
 */

const webSearch = require('./webSearch');
const fetchUrl = require('./fetchUrl');
const getCurrentTime = require('./time');
const imageSearch = require('./imageSearch');
const toolDefinitions = require('./definitions');
const temporaryToolsManager = require('../temporaryToolsManager');

/**
 * Get all tool definitions (static + temporary)
 * @returns {Array} - Merged array of tool definitions
 */
function getAllDefinitions() {
    const staticTools = toolDefinitions;
    const tempTools = temporaryToolsManager.getDefinitions();

    // Merge, with temporary tools overriding static if same name
    const merged = [...staticTools];

    for (const tempTool of tempTools) {
        const existingIndex = merged.findIndex(t => t.name === tempTool.name);
        if (existingIndex !== -1) {
            // Replace static with temporary
            merged[existingIndex] = tempTool;
        } else {
            // Add new temporary tool
            merged.push(tempTool);
        }
    }

    return merged;
}

/**
 * Execute a tool (static or temporary)
 * @param {string} name - Tool name
 * @param {object} input - Tool input parameters
 * @returns {Promise<string>} - Tool result
 */
async function executeTool(name, input) {
    // Check if it's a temporary tool first
    if (temporaryToolsManager.has(name)) {
        return await temporaryToolsManager.execute(name, input);
    }

    // Execute static tools
    switch (name) {
        case 'web_search':
            return await webSearch(input.query);
        case 'fetch_url':
            return await fetchUrl(input.url);
        case 'get_time':
            return getCurrentTime();
        case 'image_search':
            return await imageSearch(input.query);
        default:
            throw new Error(`Unknown tool: ${name}`);
    }
}

module.exports = {
    webSearch,
    fetchUrl,
    getCurrentTime,
    imageSearch,
    toolDefinitions,
    temporaryToolsManager,
    getAllDefinitions,
    executeTool
};

