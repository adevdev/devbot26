module.exports = {
    response: async (context, next) => {
        const { message, command } = context;
        const bot = require('wachan');

        const languages = {
            'jp': 'ja-JP',
            'br': 'en-GB',
            'us': 'en-US',
            'kr': 'ko-KR',
            'ru': 'ru-RU',
            'ar': 'ar-AE',
            'fr': 'fr-FR',
            'cn': 'cmn-Hant-TW',
            'id': 'id-ID'
        };

        const extendedLanguages = `af-ZA: Afrikaans, sq: Albanian, hy: Armenian, bn-BD: Bengali (Bangladesh), bn-IN: Bengali (India), bs: Bosnian, my: Burmese, ca-ES: Catalan, hr-HR: Croatian, cs-CZ: Czech, da-DK: Danish, nl-NL: Dutch, en-AU: English (Australia), eo: Esperanto, et: Estonian, fil-PH: Filipino, fi-FI: Finnish, fr-CA: French (Canada), de-DE: German, el-GR: Greek, gu: Gujarati, hi-IN: Hindi, hu-HU: Hungarian, is-IS: Icelandic, it-IT: Italian, kn: Kannada, km: Khmer, la: Latin, lv: Latvian, mk: Macedonian, ml: Malayalam, mr: Marathi, ne: Nepali, nb-NO: Norwegian, pl-PL: Polish, pt-BR: Portuguese, ro-RO: Romanian, sr-RS: Serbian, si: Sinhala, sk-SK: Slovak, es-MX: Spanish (Mexico), es-ES: Spanish (Spain), sw: Swahili, sv-SE: Swedish, ta: Tamil, te: Telugu, th-TH: Thai, tr-TR: Turkish, uk-UA: Ukrainian, ur: Urdu, vi-VN: Vietnamese, cy: Welsh`;

        let voice = 'id-ID'; // Default Indonesian
        let textToRead = '';

        // Check if first param is language code
        const firstParam = command.parameters[0]?.toLowerCase();

        if (firstParam === 'list') {
            return `*Text-to-Speech - Available Languages*\n\n` +
                `Common codes:\n` +
                `us: United States\n` +
                `br: British (UK)\n` +
                `jp: Japanese\n` +
                `kr: Korean\n` +
                `ru: Russian\n` +
                `ar: Arabic\n` +
                `cn: Chinese\n` +
                `fr: French\n` +
                `id: Indonesian (default)\n\n` +
                `To use custom language code, prefix with ! (e.g., ${command.prefix}${command.usedName} !af-ZA hello)\n\n` +
                `*Extended codes:*\n${extendedLanguages}`;
        }

        // Check for custom language code (starts with !)
        if (firstParam?.startsWith('!')) {
            voice = firstParam.slice(1);
            textToRead = command.parameters.slice(1).join(' ');
        } else if (firstParam && languages[firstParam]) {
            voice = languages[firstParam];
            textToRead = command.parameters.slice(1).join(' ');
        } else {
            // No language code, use all params as text
            textToRead = command.parameters.join(' ');
        }

        // Try quoted message if no text provided
        if (!textToRead) {
            const quoted = await message.getQuoted();
            if (quoted && quoted.text) {
                textToRead = quoted.text;
            }
        }

        // Validate text
        if (!textToRead) {
            return `*Text-to-Speech*\n\n` +
                `Usage: ${command.prefix}${command.usedName} [text]\n` +
                `To read in Indonesian accent\n\n` +
                `Usage: ${command.prefix}${command.usedName} us I am Budi\n` +
                `To read in American accent\n\n` +
                `Or reply to a message with ${command.prefix}${command.usedName}\n` +
                `To read the quoted message\n\n` +
                `Common language codes:\n` +
                `us: American, br: British, jp: Japanese, kr: Korean, ru: Russian, ar: Arabic, cn: Chinese, fr: French\n\n` +
                `Type: ${command.prefix}${command.usedName} list\n` +
                `To see all available languages`;
        }

        if (textToRead.length > 100) {
            return 'Text too long, maximum 100 characters';
        }

        try {
            await message.react("♻️");

            // Request audio generation
            const data = {
                engine: "Google",
                data: {
                    text: textToRead,
                    voice: voice
                }
            };

            const response = await fetch('https://api.soundoftext.com/sounds', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });

            const json = await response.json();
            const { id } = json;

            if (!id) {
                return `Invalid language code. Type: ${command.prefix}${command.usedName} list\nTo see available language codes`;
            }

            // Poll for completion
            let audioUrl = null;
            let retries = 10;

            while (retries > 0) {
                const statusResponse = await fetch(`https://api.soundoftext.com/sounds/${id}`);
                const statusJson = await statusResponse.json();

                if (statusJson.status === 'Done') {
                    audioUrl = statusJson.location;
                    break;
                }

                await new Promise(resolve => setTimeout(resolve, 1000));
                retries--;
            }

            if (!audioUrl) {
                await message.react("❌");
                return 'Server is currently unavailable, please try again later';
            }

            await message.react("✅");

            // Send audio directly via socket (as regular audio, not PTT)
            // MP3 format works for regular audio on both Web and Android
            const sock = bot.getSocket();
            await sock.sendMessage(message.room, {
                audio: { url: audioUrl },
                mimetype: 'audio/mpeg'
                // Removed ptt: true - send as regular audio file
            }, {
                quoted: message.toBaileys()
            });

            // Prevent wachan from sending duplicate
            return null;

        } catch (error) {
            await message.react("❌");
            return `*Error:* ${error.message}`;
        }
    },
    options: {
        aliases: ['baca'],
        description: 'Convert text to speech',
        sectionName: 'Tools'
    }
};
