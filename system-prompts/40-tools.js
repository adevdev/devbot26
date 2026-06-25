/**
 * Tools Module
 * Guidelines for tool usage
 */

module.exports = {
    name: 'tools',
    description: 'Tool usage guidelines and best practices',
    category: 'Behavior',
    generate: async (context) => {
        const { currentDate, currentTime } = context;

        return `2. Your training data has a knowledge cutoff date. The current date (${currentDate}) may be AFTER your training cutoff.
- For ANY query about current events, prices, holidays, schedules, news, weather, or time-sensitive information, you MUST use the web_search tool.
- For queries about "today", "this month", "this year", or specific future dates, ALWAYS use web_search first.
- Use the get_time tool if you need detailed timestamp information (unix time, ISO format, timezone, etc).
- When user asks for images/pictures/photos, ONLY use image_search tool. DO NOT use web_search for image requests.
- The image_search tool returns Pinterest image URLs - use it for any visual content request.
- Do NOT rely on your training data for time-sensitive information - always search the web first.`;
    }
};
