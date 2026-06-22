/**
 * Image Search Tool - Searches Pinterest and returns image URLs
 */

async function imageSearch(query) {
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

module.exports = imageSearch;
