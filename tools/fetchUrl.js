/**
 * Fetch URL Tool - Downloads and returns webpage content
 * Self-contained modular tool
 */

module.exports = {
    // Tool definition for AI API
    definition: {
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

    // Metadata for UI/UX
    metadata: {
        icon: '📄',
        progressMessage: (input) => `Fetching URL: _${input.url}_`,
        resultType: 'text'
    },

    // Execution logic
    execute: async function(input) {
        const url = input.url;

        try {
            console.log('[FetchURL] Fetching:', url);
            const response = await fetch(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                },
                signal: AbortSignal.timeout(15000) // 15s timeout
            });

            if (!response.ok) {
                return JSON.stringify({
                    error: `HTTP ${response.status}`,
                    url: url
                });
            }

            const text = await response.text();

            // Limit response size (max 50KB)
            const MAX_SIZE = 50000;
            const trimmed = text.length > MAX_SIZE ? text.slice(0, MAX_SIZE) + '\n... (truncated)' : text;

            console.log('[FetchURL] Fetched', trimmed.length, 'bytes');
            return trimmed;

        } catch (error) {
            console.error('[FetchURL] Error:', error.message);
            return JSON.stringify({
                error: error.message,
                url: url
            });
        }
    }
};
