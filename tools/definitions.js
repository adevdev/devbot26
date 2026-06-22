/**
 * Tool Definitions for Claude API
 * Schemas that describe available tools to the AI
 */

const toolDefinitions = [
    {
        name: 'web_search',
        description: 'Search the web for current information, news, events, prices, and real-time data. Use this tool for ANY query about current events or time-sensitive information. Returns search results with sources.',
        input_schema: {
            type: 'object',
            properties: {
                query: {
                    type: 'string',
                    description: 'The search query. Be specific and include relevant keywords, dates, or context.'
                }
            },
            required: ['query']
        }
    },
    {
        name: 'fetch_url',
        description: 'Fetch and read content from a specific URL. Use this to get detailed information from a webpage.',
        input_schema: {
            type: 'object',
            properties: {
                url: {
                    type: 'string',
                    description: 'The full URL to fetch (must include http:// or https://)'
                }
            },
            required: ['url']
        }
    },
    {
        name: 'get_time',
        description: 'Get the current date and time in multiple formats (ISO, UTC, local, unix timestamp). Use this when you need precise timestamp information.',
        input_schema: {
            type: 'object',
            properties: {},
            required: []
        }
    },
    {
        name: 'image_search',
        description: 'Search for images on Pinterest and returns high-quality image URLs. Use this tool EXCLUSIVELY when user asks for pictures, images, photos, or any visual content. Do NOT use web_search for image requests - this tool provides everything needed.',
        input_schema: {
            type: 'object',
            properties: {
                query: {
                    type: 'string',
                    description: 'The image search query (e.g., "cute cat", "sunset beach", "modern architecture")'
                }
            },
            required: ['query']
        }
    }
];

module.exports = toolDefinitions;
