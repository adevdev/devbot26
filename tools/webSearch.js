/**
 * Web Search Tool - Uses EXA API
 */

async function webSearch(query) {
    try {
        const response = await fetch('https://mcp.exa.ai/mcp', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json, text/event-stream'
            },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: 1,
                method: 'tools/call',
                params: {
                    name: 'web_search_exa',
                    arguments: {
                        query: query,
                        type: 'auto',
                        numResults: 5,
                        livecrawl: 'fallback'
                    }
                }
            }),
            signal: AbortSignal.timeout(25000) // 25s timeout
        });

        if (!response.ok) {
            console.error('[WebSearch] EXA returned HTTP', response.status);
            return 'Search unavailable. Please answer based on your training data.';
        }

        const body = await response.text();

        // Parse response - can be direct JSON or SSE format
        const result = parseExaResponse(body);

        if (!result) {
            console.error('[WebSearch] No usable results from EXA');
            return 'No search results found. Please answer based on your training data.';
        }

        console.log('[WebSearch] Using EXA - results retrieved');
        return result;

    } catch (error) {
        console.error('[WebSearch] EXA error:', error.message);
        return 'Search unavailable. Please answer based on your training data.';
    }
}

// Parse EXA response (handles both JSON and SSE formats)
function parseExaResponse(body) {
    const trimmed = body.trim();

    // Try direct JSON parse first
    if (trimmed.startsWith('{')) {
        try {
            const parsed = JSON.parse(trimmed);
            if (parsed.result && parsed.result.content) {
                const textContent = parsed.result.content.find(item => item.text);
                return textContent ? textContent.text : null;
            }
        } catch (e) {
            // Not valid JSON, continue to SSE parsing
        }
    }

    // Try SSE format (event: message\ndata: {...})
    for (const line of body.split('\n')) {
        if (!line.startsWith('data: ')) continue;

        try {
            const data = line.substring(6).trim();
            const parsed = JSON.parse(data);
            if (parsed.result && parsed.result.content) {
                const textContent = parsed.result.content.find(item => item.text);
                return textContent ? textContent.text : null;
            }
        } catch (e) {
            // Invalid JSON in this line, continue
        }
    }

    return null;
}

module.exports = webSearch;
