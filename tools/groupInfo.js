/**
 * Group Info Tool - Get WhatsApp group metadata via wachan
 * Self-contained modular tool
 */

module.exports = {
    // Tool definition for AI API
    definition: {
        name: 'get_group_info',
        description: 'Get WhatsApp group information including name, description, participants count, admins, and creation date. Use this when user asks about group details, members, admins, or group settings. Requires a group JID.',
        input_schema: {
            type: 'object',
            properties: {
                groupJid: {
                    type: 'string',
                    description: 'WhatsApp group JID (e.g., "120363012345678901@g.us"). Usually ends with @g.us for groups.'
                }
            },
            required: ['groupJid']
        }
    },

    // Metadata for UI/UX
    metadata: {
        icon: '👥',
        progressMessage: (input) => `Getting group info...`,
        resultType: 'text'
    },

    // Execution logic
    execute: async function(input) {
        const { groupJid } = input;

        try {
            const wachan = require('wachan');

            // Validate group JID format
            if (!groupJid.includes('@g.us')) {
                return JSON.stringify({
                    success: false,
                    error: 'Invalid group JID format. Group JID must end with @g.us'
                });
            }

            console.log(`[GroupInfo] Fetching metadata for: ${groupJid}`);

            // Get socket to access Baileys methods
            const sock = wachan.getSocket();
            if (!sock) {
                return JSON.stringify({
                    success: false,
                    error: 'Bot socket not available'
                });
            }

            // Get group metadata from Baileys
            const groupMetadata = await sock.groupMetadata(groupJid);

            if (!groupMetadata) {
                return JSON.stringify({
                    success: false,
                    error: 'Group not found or bot is not a member',
                    groupJid: groupJid
                });
            }

            // Extract participants info
            const participants = groupMetadata.participants || [];
            const admins = participants.filter(p => p.admin === 'admin' || p.admin === 'superadmin');
            const superAdmins = participants.filter(p => p.admin === 'superadmin');
            const regularMembers = participants.filter(p => !p.admin);

            // Build result
            const result = {
                success: true,
                data: {
                    id: groupMetadata.id,
                    name: groupMetadata.subject || 'Unknown Group',
                    description: groupMetadata.desc || 'No description',
                    owner: groupMetadata.owner || null,
                    creation: groupMetadata.creation ? new Date(groupMetadata.creation * 1000).toISOString() : null,
                    participantsCount: participants.length,
                    adminsCount: admins.length,
                    superAdminsCount: superAdmins.length,
                    membersCount: regularMembers.length,
                    // Settings
                    announce: groupMetadata.announce || false, // Only admins can send
                    restrict: groupMetadata.restrict || false, // Only admins can edit group info
                    // Additional info
                    inviteCode: groupMetadata.inviteCode || null,
                    size: groupMetadata.size || participants.length
                }
            };

            console.log(`[GroupInfo] Found: ${result.data.name} (${result.data.participantsCount} members)`);

            return JSON.stringify(result);

        } catch (error) {
            console.error('[GroupInfo] Error:', error.message);

            return JSON.stringify({
                success: false,
                error: error.message,
                groupJid: groupJid
            });
        }
    }
};
