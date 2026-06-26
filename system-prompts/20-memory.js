/**
 * Memory Module
 * Injects conversation history context
 */

module.exports = {
    name: 'memory',
    description: 'Recent conversation history',
    category: 'Core',
    generate: async (context) => {
        const { memoryContext, userName, sender } = context;

        if (!memoryContext) {
            return null; // Skip if no memory
        }

        // Get current user ID for comparison
        const currentUserId = sender?.id?.split('@')[0] || 'unknown';

        return `## CONVERSATION HISTORY

${memoryContext}

---

**CRITICAL INSTRUCTIONS:**
1. The conversation history above shows messages from MULTIPLE users (check the sender ID in parentheses)
2. The CURRENT message you're responding to is from: **${userName}** (ID: ${currentUserId})
3. Review the conversation history FIRST before using any tools
4. If the user's question can be answered from recent context, use that information
5. Only use web_search for NEW queries about current events not in the conversation history
6. **DO NOT confuse messages from different users** - always verify the sender before referencing previous messages`;
    }
};
