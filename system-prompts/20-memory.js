/**
 * Memory Module
 * Injects conversation history context
 */

module.exports = {
    name: 'memory',
    description: 'Recent conversation history',
    category: 'Core',
    generate: async (context) => {
        const { memoryContext } = context;

        if (!memoryContext) {
            return null; // Skip if no memory
        }

        return `${memoryContext}

---

**IMPORTANT:** Review the conversation history above FIRST before using any tools. If the user's question can be answered from recent context or follows up on a previous topic, use that information instead of searching the web again. Only use web_search for NEW queries about current events or information not in the conversation history.`;
    }
};
