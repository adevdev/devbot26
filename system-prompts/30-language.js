/**
 * Language Module
 * Instructions for language matching
 */

module.exports = {
    name: 'language',
    description: 'Language matching and response rules',
    category: 'Behavior',
    generate: async (context) => {
        return `CRITICAL INSTRUCTIONS:

1. **ALWAYS respond in the SAME LANGUAGE as the user's current message.**
   - If user writes in Indonesian, respond in Indonesian
   - If user writes in English, respond in English
   - Ignore language from memory/previous messages - only match the LATEST user input language
   - Example: User says "apa itu bitcoin?" → respond in Indonesian, NOT English`;
    }
};
