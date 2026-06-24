/**
 * Get Time Tool - Returns current time in various formats
 * Self-contained modular tool
 */

module.exports = {
    // Tool definition for AI API
    definition: {
        name: 'get_time',
        description: 'Get the current date and time in multiple formats (ISO, UTC, local, unix timestamp). Use this when you need precise timestamp information.',
        input_schema: {
            type: 'object',
            properties: {},
            required: []
        }
    },

    // Metadata for UI/UX
    metadata: {
        icon: '🕐',
        progressMessage: (input) => `Getting current time...`,
        resultType: 'text'
    },

    // Execution logic
    execute: async function(input) {
        const now = new Date();
        return JSON.stringify({
            iso: now.toISOString(),
            utc: now.toUTCString(),
            local: now.toLocaleString('en-US', {
                dateStyle: 'full',
                timeStyle: 'long'
            }),
            unix: Math.floor(now.getTime() / 1000),
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            day: now.toLocaleDateString('en-US', { weekday: 'long' })
        }, null, 2);
    }
};
