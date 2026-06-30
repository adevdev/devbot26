/**
 * Contact Add Command - Add contact from mention or quoted message
 * Owner-only command
 */

const contactManager = require('../contactManager');

// Helper to extract mentions from baileys message
function getMentions(message) {
    const baileys = message.toBaileys();
    const mentionedJid = baileys?.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
    return mentionedJid;
}

module.exports = {
    response: async (context, next) => {
        const { message, command } = context;

        // Owner check
        const OWNER_ID = process.env.OWNER_ID;
        if (!OWNER_ID) {
            return '*Error:* OWNER_ID not configured';
        }

        if (message.sender.id !== OWNER_ID) {
            return '*Error:* This command is owner-only';
        }

        let targetJid = null;
        let targetName = null;
        let targetType = null;

        // Extract mentions from baileys message
        const mentions = getMentions(message);

        // Check for mentioned users
        if (mentions.length > 0) {
            // Get first mentioned user
            let mentionedJid = mentions[0];

            // Validate mentionedJid is a string
            if (!mentionedJid || typeof mentionedJid !== 'string') {
                return `*Error:* Invalid mention data. Please try again.`;
            }

            // If it's a LID, convert to actual JID using getUserData
            if (mentionedJid.includes('@lid')) {
                try {
                    const bot = require('wachan');
                    const userData = await bot.getUserData(mentionedJid);
                    // getUserData returns { id, pushName, lid }
                    targetJid = userData.id || mentionedJid;
                    targetName = userData?.pushName || userData?.notify || targetJid.split('@')[0];
                    console.log(`[ContactAdd] Converted LID ${mentionedJid} to JID ${targetJid}`);
                } catch (e) {
                    console.error('[ContactAdd] Failed to convert LID:', e);
                    return `*Error:* Failed to get user data. Please try again.`;
                }
            } else {
                targetJid = mentionedJid;
                // Try to get name from wachan
                try {
                    const bot = require('wachan');
                    const userData = await bot.getUserData(targetJid);
                    targetName = userData?.pushName || userData?.notify || targetJid.split('@')[0];
                } catch (e) {
                    targetName = targetJid.split('@')[0];
                }
            }

            targetType = 'user';
        }
        // Check for quoted message
        else {
            const quoted = await message.getQuoted();
            if (quoted && quoted.sender) {
                let quotedJid = quoted.sender.id;

                // Validate quotedJid is a string
                if (!quotedJid || typeof quotedJid !== 'string') {
                    return `*Error:* Invalid quoted message data. Please try again.`;
                }

                // Convert LID to actual JID if needed
                if (quotedJid.includes('@lid')) {
                    try {
                        const bot = require('wachan');
                        const userData = await bot.getUserData(quotedJid);
                        // getUserData returns { id, pushName, lid }
                        targetJid = userData.id || quotedJid;
                        console.log(`[ContactAdd] Converted LID ${quotedJid} to JID ${targetJid}`);
                    } catch (e) {
                        console.error('[ContactAdd] Failed to convert LID:', e);
                        return `*Error:* Failed to get user data. Please try again.`;
                    }
                } else {
                    targetJid = quotedJid;
                }

                // Validate targetJid before using includes
                if (!targetJid || typeof targetJid !== 'string') {
                    return `*Error:* Failed to determine user/group ID. Please try again.`;
                }

                // Detect type from JID
                if (targetJid.includes('@g.us')) {
                    targetType = 'group';
                } else {
                    targetType = 'user';
                }

                // Try to get name
                if (targetType === 'group') {
                    // Get group name
                    try {
                        const bot = require('wachan');
                        const groupMetadata = await bot.getSocket().groupMetadata(targetJid);
                        targetName = groupMetadata.subject || targetJid.split('@')[0];
                    } catch (e) {
                        targetName = targetJid.split('@')[0];
                    }
                } else {
                    // Get user name
                    try {
                        const bot = require('wachan');
                        const userData = await bot.getUserData(targetJid);
                        targetName = userData?.pushName || userData?.notify || targetJid.split('@')[0];
                    } catch (e) {
                        targetName = targetJid.split('@')[0];
                    }
                }
            }
        }

        // No target found
        if (!targetJid) {
            return `*Add Contact*\n\n` +
                   `Usage:\n` +
                   `1. Mention a user: ${command.prefix}${command.usedName} @user\n` +
                   `2. Reply to a message: ${command.prefix}${command.usedName}\n\n` +
                   `This will save the contact to AI tools context.`;
        }

        try {
            // Check if already exists
            const existing = await contactManager.getContact(targetJid);
            if (existing) {
                return `*Contact already exists:*\n\n` +
                       `Name: ${existing.name}\n` +
                       `Type: ${existing.type}\n` +
                       `JID: ${existing.jid}\n` +
                       `Added: ${new Date(existing.addedAt).toLocaleString()}`;
            }

            // Add contact
            await contactManager.addContact(targetJid, targetName, targetType, message.sender.id);

            return `✅ *Contact Added*\n\n` +
                   `Name: ${targetName}\n` +
                   `Type: ${targetType}\n` +
                   `JID: ${targetJid}`;

        } catch (error) {
            console.error('[ContactAdd] Error:', error);
            return `*Error:* ${error.message}`;
        }
    },
    options: {
        aliases: ['caddcontact', 'addcontact'],
        description: 'Add contact from mention or quoted message (owner-only)',
        sectionName: 'Owner',
        ownerOnly: true,
        hidden: true
    }
};
