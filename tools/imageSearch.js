/**
 * Image Search Tool - Searches Pinterest and returns image URLs
 * Self-contained modular tool
 */

module.exports = {
    // Tool definition for AI API
    definition: {
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
