/**
 * Image Search Tool - Searches Pinterest and returns image URLs
 * Self-contained modular tool
 */

module.exports = {
    // Tool definition for AI API
    definition: {
        name: 'image_search',
        description: 'Search for EXISTING images on Pinterest and returns high-quality image URLs. Use this tool when user wants to FIND/SEARCH for images (keywords: "cari", "search", "find", "tampilkan", "show me"). Do NOT use this if user wants to CREATE/GENERATE images (keywords: "bikin", "buat", "generate", "create") - use connectAilab instead for generation.',
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
    },

    // Metadata for UI/UX
    metadata: {
        icon: '🖼️',
        progressMessage: (input) => `Searching images: _${input.query}_`,
        resultType: 'image' // Special type for image handling
    },

    // Execution logic
    execute: async function(input) {
        const query = input.query;

        try {
            console.log('[ImageSearch] Searching Pinterest:', query);

            const apiUrl = `https://apied26.adevdev.com/pinterest?q=${encodeURIComponent(query)}`;
            const response = await fetch(apiUrl);
            const data = await response.json();

            if (data.success && data.images && data.images.length > 0) {
                // Return image URLs as JSON
                return JSON.stringify({
                    success: true,
                    images: data.images,
                    query: query
                });
            } else {
                return JSON.stringify({
                    error: data.error || 'No images found',
                    query: query
                });
            }

        } catch (error) {
            console.error('[ImageSearch] Error:', error.message);
            return JSON.stringify({
                error: error.message,
                query: query
            });
        }
    }
};
