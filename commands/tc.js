/**
 * Transcribe Command - Convert audio/voice to text
 * Uses apied26 transcribe API (proxies to Speechmatics)
 */

const axios = require('axios');

const languages = [
    { name: 'English', code: 'en' },
    { name: 'Japanese', code: 'ja' },
    { name: 'German', code: 'de' },
    { name: 'Spanish', code: 'es' },
    { name: 'Arabic', code: 'ar' },
    { name: 'Korean', code: 'ko' },
    { name: 'Indonesian', code: 'id' }
];

module.exports = {
    response: async (context, next) => {
        const { message, command } = context;

        const languageCode = command.parameters[0] ? command.parameters[0].toLowerCase() : 'id';

        // Get quoted audio message
        const quoted = await message.getQuoted();

        if (!quoted || !quoted.isMedia || quoted.type !== 'audio') {
            return `*Audio Transcription*\n\n` +
                `Reply to an audio/voice message and type: ${command.prefix}${command.usedName} [language_code]\n\n` +
                `*Example:* (for English audio)\n` +
                `${command.prefix}${command.usedName} en\n\n` +
                `If no language code is provided, defaults to [id]/Indonesian\n\n` +
                `*Available codes:*\n${wrapLanguageCodes()}`;
        }

        // Validate language code
        const validLanguage = languages.find(l => l.code === languageCode);
        if (!validLanguage) {
            return `Language code *${languageCode}* not found\n\n` +
                `Just type: *${command.prefix}${command.usedName}*\nFor Indonesian\n\n` +
                `*Available codes:*\n${wrapLanguageCodes()}`;
        }

        try {
            await message.react("♻️");

            // Download audio
            console.log('[TC] Downloading audio...');
            const audioBuffer = await quoted.downloadMedia();
            console.log(`[TC] Audio downloaded: ${audioBuffer.length} bytes`);

            // Call apied26 transcribe API
            console.log(`[TC] Calling transcribe API (language: ${languageCode})...`);
            const apiUrl = `https://apied26.adevdev.com/transcribe?language=${languageCode}`;

            const response = await axios.post(apiUrl, audioBuffer, {
                headers: {
                    'Content-Type': quoted.mimetype || 'audio/mpeg'
                },
                timeout: 90000, // 90 seconds (transcription can take time)
                maxBodyLength: Infinity,
                maxContentLength: Infinity
            });

            const data = response.data;

            if (!data.status || !data.result) {
                await message.react("❌");
                return `*Error:* ${data.error || 'Failed to transcribe audio'}`;
            }

            await message.react("✅");
            return data.result; // Pure transcription result, no formatting

        } catch (error) {
            console.error('[TC] Error:', error.message);
            await message.react("❌");

            if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
                return '*Error:* Request timeout. The audio might be too long.';
            }

            if (error.response?.data?.error) {
                return `*Error:* ${error.response.data.error}`;
            }

            return `*Error:* ${error.message}`;
        }
    },
    options: {
        aliases: ['transcribe'],
        description: 'Transcribe audio/voice to text',
        sectionName: 'Tools'
    }
};

function wrapLanguageCodes() {
    return languages.map(l => `${l.name} (${l.code})`).join(', ');
}
