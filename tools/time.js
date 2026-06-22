/**
 * Get Time Tool - Returns current time in various formats
 */

function getCurrentTime() {
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

module.exports = getCurrentTime;
