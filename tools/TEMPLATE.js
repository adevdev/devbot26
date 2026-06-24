/**
 * TOOL TEMPLATE
 *
 * Copy this file and rename it to create a new tool.
 * Example: tools/myNewTool.js
 *
 * NO NEED TO EDIT ANY OTHER FILES!
 * Just create this file and restart the bot - it will auto-load.
 */

module.exports = {
    /**
     * Tool Definition (required)
     * This is sent to the AI API to describe your tool
     */
    definition: {
        // Unique tool name (use snake_case)
        name: 'my_tool_name',

        // Description for AI to understand when to use this tool
        description: 'Clear description of what this tool does and when to use it. Be specific about the use cases.',

        // Input schema (OpenAPI 3.0 format)
        input_schema: {
            type: 'object',
            properties: {
                // Define input parameters here
                param1: {
                    type: 'string',
                    description: 'Description of this parameter'
                },
                param2: {
                    type: 'number',
                    description: 'Another parameter (optional)'
                }
            },
            required: ['param1'] // List required parameters
        }
    },

    /**
     * Tool Metadata (optional but recommended)
     * Used for UI/UX elements like progress messages
     */
    metadata: {
        // Icon shown in progress messages (emoji or text)
        icon: '⚙️',

        // Function that generates progress message
        // Takes tool input and returns string to display to user
        progressMessage: (input) => {
            return `Processing: _${input.param1}_`;
        },

        // Result type: 'text' (default), 'image', 'file', etc.
        // 'image' will trigger special image download and send logic
        resultType: 'text'
    },

    /**
     * Execution Logic (required)
     * This is called when AI uses your tool
     *
     * @param {object} input - Input parameters from AI
     * @returns {Promise<string>} - Result as JSON string or plain text
     */
    execute: async function(input) {
        try {
            // Your tool logic here
            const param1 = input.param1;
            const param2 = input.param2 || 'default_value';

            console.log(`[MyTool] Executing with: ${param1}, ${param2}`);

            // Example: Call external API
            // const response = await fetch('https://api.example.com/...');
            // const data = await response.json();

            // Example: Return success result as JSON
            return JSON.stringify({
                success: true,
                result: 'Your result data here',
                message: 'Operation completed successfully'
            });

        } catch (error) {
            console.error('[MyTool] Error:', error.message);

            // Return error as JSON
            return JSON.stringify({
                error: error.message,
                success: false
            });
        }
    }
};

/**
 * EXAMPLES
 */

// Example 1: Simple tool with no parameters
/*
module.exports = {
    definition: {
        name: 'get_server_status',
        description: 'Get current bot server status and uptime',
        input_schema: {
            type: 'object',
            properties: {},
            required: []
        }
    },

    metadata: {
        icon: '🖥️',
        progressMessage: () => 'Checking server status...',
        resultType: 'text'
    },

    execute: async function(input) {
        const uptime = process.uptime();
        const memory = process.memoryUsage();

        return JSON.stringify({
            uptime: `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m`,
            memory: `${Math.round(memory.heapUsed / 1024 / 1024)}MB`,
            status: 'online'
        });
    }
};
*/

// Example 2: Tool with external API call
/*
module.exports = {
    definition: {
        name: 'get_weather',
        description: 'Get current weather for a city',
        input_schema: {
            type: 'object',
            properties: {
                city: {
                    type: 'string',
                    description: 'City name (e.g., Jakarta, Tokyo)'
                }
            },
            required: ['city']
        }
    },

    metadata: {
        icon: '🌤️',
        progressMessage: (input) => `Getting weather for _${input.city}_`,
        resultType: 'text'
    },

    execute: async function(input) {
        try {
            const response = await fetch(`https://api.weather.com/...?city=${input.city}`);
            const data = await response.json();

            return JSON.stringify({
                city: input.city,
                temperature: data.temp,
                condition: data.condition,
                humidity: data.humidity
            });
        } catch (error) {
            return JSON.stringify({ error: error.message });
        }
    }
};
*/

// Example 3: Tool returning image (resultType: 'image')
/*
module.exports = {
    definition: {
        name: 'generate_qr',
        description: 'Generate QR code for a URL or text',
        input_schema: {
            type: 'object',
            properties: {
                text: {
                    type: 'string',
                    description: 'Text or URL to encode in QR code'
                }
            },
            required: ['text']
        }
    },

    metadata: {
        icon: '⬛',
        progressMessage: (input) => 'Generating QR code...',
        resultType: 'image'  // This triggers image handling
    },

    execute: async function(input) {
        // Must return JSON with 'images' array for resultType: 'image'
        return JSON.stringify({
            success: true,
            images: ['https://api.qrserver.com/v1/create-qr-code/?data=' + encodeURIComponent(input.text)],
            query: input.text
        });
    }
};
*/
