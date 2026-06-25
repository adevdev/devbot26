const { startContinuousTyping } = require('../utils/typing');

const languages = [
    { name: 'Auto Detect', code: 'auto' },
    { name: 'Afrikaans', code: 'af' },
    { name: 'Albanian', code: 'sq' },
    { name: 'Arabic', code: 'ar' },
    { name: 'Azerbaijani', code: 'az' },
    { name: 'Basque', code: 'eu' },
    { name: 'Bengali', code: 'bn' },
    { name: 'Belarusian', code: 'be' },
    { name: 'Bulgarian', code: 'bg' },
    { name: 'Catalan', code: 'ca' },
    { name: 'Chinese Simplified', code: 'zh-CN' },
    { name: 'Chinese Traditional', code: 'zh-TW' },
    { name: 'Croatian', code: 'hr' },
    { name: 'Czech', code: 'cs' },
    { name: 'Danish', code: 'da' },
    { name: 'Dutch', code: 'nl' },
    { name: 'English', code: 'en' },
    { name: 'Esperanto', code: 'eo' },
    { name: 'Estonian', code: 'et' },
    { name: 'Filipino', code: 'tl' },
    { name: 'Finnish', code: 'fi' },
    { name: 'French', code: 'fr' },
    { name: 'Galician', code: 'gl' },
    { name: 'Georgian', code: 'ka' },
    { name: 'German', code: 'de' },
    { name: 'Greek', code: 'el' },
    { name: 'Gujarati', code: 'gu' },
    { name: 'Haitian Creole', code: 'ht' },
    { name: 'Hebrew', code: 'iw' },
    { name: 'Hindi', code: 'hi' },
    { name: 'Hungarian', code: 'hu' },
    { name: 'Icelandic', code: 'is' },
    { name: 'Indonesian', code: 'id' },
    { name: 'Irish', code: 'ga' },
    { name: 'Italian', code: 'it' },
    { name: 'Japanese', code: 'ja' },
    { name: 'Javanese', code: 'jw' },
    { name: 'Kannada', code: 'kn' },
    { name: 'Kazakh', code: 'kk' },
    { name: 'Korean', code: 'ko' },
    { name: 'Latin', code: 'la' },
    { name: 'Latvian', code: 'lv' },
    { name: 'Lithuanian', code: 'lt' },
    { name: 'Macedonian', code: 'mk' },
    { name: 'Malay', code: 'ms' },
    { name: 'Maltese', code: 'mt' },
    { name: 'Norwegian', code: 'no' },
    { name: 'Pashto', code: 'ps' },
    { name: 'Persian', code: 'fa' },
    { name: 'Polish', code: 'pl' },
    { name: 'Portuguese', code: 'pt' },
    { name: 'Romanian', code: 'ro' },
    { name: 'Russian', code: 'ru' },
    { name: 'Serbian', code: 'sr' },
    { name: 'Slovak', code: 'sk' },
    { name: 'Slovenian', code: 'sl' },
    { name: 'Spanish', code: 'es' },
    { name: 'Sundanese', code: 'su' },
    { name: 'Swahili', code: 'sw' },
    { name: 'Swedish', code: 'sv' },
    { name: 'Tamil', code: 'ta' },
    { name: 'Telugu', code: 'te' },
    { name: 'Thai', code: 'th' },
    { name: 'Turkish', code: 'tr' },
    { name: 'Ukrainian', code: 'uk' },
    { name: 'Urdu', code: 'ur' },
    { name: 'Vietnamese', code: 'vi' },
    { name: 'Welsh', code: 'cy' },
    { name: 'Yiddish', code: 'yi' }
];

module.exports = {
    response: async (context, next) => {
        const { message, command } = context;
        const bot = require('wachan');
        const params = command.parameters;

        // Get quoted message if exists
        const quotedMsg = await message.getQuoted();
        const quotedBody = quotedMsg?.text || '';

        // Parse language codes and text
        let from = params[0];
        let to = params[1];
        let text = params.slice(2)?.join(' ');

        if (!languages.find(l => l.code === from) && !languages.find(l => l.code === to)) {
            from = 'auto';
            to = 'id';
            text = params.join(' ');
        } else if (languages.find(l => l.code === from) && !languages.find(l => l.code === to)) {
            to = from;
            from = 'auto';
            text = params.slice(1).join(' ');
        }

        // Get query from text or quoted message
        let query = text || quotedBody;

        const more = String.fromCharCode(8206);
        const readMore = more.repeat(600);

        const instructions = `Type: ${command.prefix}${command.usedName} This is Budi\n` +
            'To translate text from any language (Auto Detect) to Indonesian\n\n' +
            `Type: ${command.prefix}${command.usedName} en Ini Budi\n` +
            'To translate Indonesian text to English\n\n' +
            `Or reply to a message with ${command.prefix}${command.usedName}\n` +
            'To translate the quoted/replied message to Indonesian.\n\n' +
            `To specify source language, type: ${command.prefix}${command.usedName} en id hello there\n\n` +
            'Available language codes:\n\n' + readMore +
            languages.map(l => l.code + ': ' + l.name).join('\n');

        if (!query) {
            return instructions;
        }

        // Start typing indicator
        const stopTyping = startContinuousTyping(bot, message.room);

        try {
            await message.react('⏳');

            // Call API endpoint
            const response = await fetch('https://apied26.adevdev.com/translate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    from: from,
                    to: to,
                    text: query
                })
            });

            const result = await response.json();

            stopTyping();

            if (!result.success) {
                await message.react('❌');
                return '❌ Translation error: ' + (result.error || 'Unknown error');
            }

            await message.react('✅');

            const finalResult = result.translation +
                (to != 'id' && from == 'auto' ? '\n\n' + more.repeat(5) + 'Translated to ' +
                    result.targetLanguage + ': *' + to + '*' : '');

            return finalResult;

        } catch (error) {
            stopTyping();
            await message.react('❌');
            console.error('[Translate] Error:', error);
            return '❌ Translation error: ' + error.message;
        }
    },
    options: {
        aliases: ['trans', 'translate', 'gt', 'tr'],
        description: 'Translator Google',
        sectionName: 'Tools'
    }
};
