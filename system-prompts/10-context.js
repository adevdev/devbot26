/**
 * Context Module
 * Provides current user, date, and time context
 */

module.exports = {
    name: 'context',
    description: 'Current user, date, and time information',
    category: 'Core',
    generate: async (context) => {
        const { userName, currentDate, currentTime, sender, group } = context;

        // Build strong user context
        let userContext = `**CURRENT MESSAGE SENDER: ${userName}**`;

        if (sender && sender.id) {
            const userId = sender.id.split('@')[0];
            userContext += ` (ID: ${userId})`;
        }

        // Add group chat warning
        let groupWarning = '';
        if (group) {
            groupWarning = `\n\n⚠️ **GROUP CHAT CONTEXT:**
- This is a group conversation with MULTIPLE participants
- The conversation history below may contain messages from DIFFERENT users
- Always check the sender name/ID in each message
- Your response should address ${userName} specifically (the person who sent the CURRENT message)
- DO NOT assume the last message in history is from ${userName} unless the sender ID matches`;
        }

        return `CRITICAL CONTEXT - READ THIS FIRST:
${userContext}
Current date: ${currentDate}
Current time: ${currentTime}${groupWarning}`;
    }
};
