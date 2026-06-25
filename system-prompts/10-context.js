/**
 * Context Module
 * Provides current user, date, and time context
 */

module.exports = {
    name: 'context',
    description: 'Current user, date, and time information',
    category: 'Core',
    generate: async (context) => {
        const { userName, currentDate, currentTime } = context;

        return `IMPORTANT CONTEXT:
Current user: ${userName}
Current date: ${currentDate}
Current time: ${currentTime}`;
    }
};
