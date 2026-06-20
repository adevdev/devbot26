module.exports = {
    response: async (context, next) => {
        const OWNER_ID = process.env.OWNER_ID;

        if (!OWNER_ID) {
            return '*Error:* OWNER_ID not set in .env file.';
        }

        // Extract phone number from ID format (e.g., "6212345678910@s.whatsapp.net")
        const phoneNumber = OWNER_ID.split('@')[0];

        return {
            contacts: [
                {
                    name: 'Bot Owner',
                    number: phoneNumber
                }
            ]
        };
    },
    options: {
        aliases: ['pemilik', 'creator'],
        description: 'Get bot owner contact information',
        sectionName: 'Info'
    }
};
