/**
 * Fetch URL Tool - Downloads and returns webpage content
 */

async function fetchUrl(url) {
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

module.exports = fetchUrl;
