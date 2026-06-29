/**
 * Task List Command
 * List all scheduled tasks (owner only)
 */

const scheduleManager = require('../scheduleManager');

module.exports = {
    response: async (context, next) => {
        const { message, command } = context;

        // Owner-only check
        const OWNER_ID = process.env.OWNER_ID;
        if (!OWNER_ID) {
            return '*Error:* OWNER_ID not configured.';
        }

        if (message.sender.id !== OWNER_ID) {
            // Silent ignore for non-owner
            return;
        }

        try {
            // Get filter from parameters (pending, completed, failed, all)
            const filter = command.parameters[0]?.toLowerCase() || 'pending';

            let tasks;
            if (filter === 'all') {
                tasks = await scheduleManager.getAllTasks();
            } else {
                tasks = await scheduleManager.getAllTasks(filter);
            }

            if (tasks.length === 0) {
                return `📋 *Scheduled Tasks*\n\nNo ${filter === 'all' ? '' : filter + ' '}tasks found.`;
            }

            // Sort tasks
            if (filter === 'pending') {
                tasks.sort((a, b) => a.scheduledTime - b.scheduledTime);
            } else {
                tasks.sort((a, b) => b.createdAt - a.createdAt);
            }

            // Format tasks for display
            let response = `📋 *Scheduled Tasks* (${filter})\n\n`;
            response += `Total: ${tasks.length} task(s)\n\n`;

            tasks.forEach((task, index) => {
                const num = index + 1;

                // Status badge
                let statusEmoji = '';
                if (task.status === 'pending') statusEmoji = '⏳';
                else if (task.status === 'completed') statusEmoji = '✅';
                else if (task.status === 'failed') statusEmoji = '❌';
                else if (task.status === 'cancelled') statusEmoji = '🚫';

                response += `${num}. ${statusEmoji} *${task.taskId}*\n`;

                // Instruction (truncate if too long)
                const instruction = task.instruction.length > 60
                    ? task.instruction.substring(0, 60) + '...'
                    : task.instruction;
                response += `   📝 ${instruction}\n`;

                // Scheduled time
                const scheduledDate = new Date(task.scheduledTime);
                response += `   🕐 ${scheduledDate.toLocaleString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                })}\n`;

                // Time until (for pending)
                if (task.status === 'pending') {
                    const timeUntil = task.scheduledTime - Date.now();
                    if (timeUntil > 0) {
                        const minutes = Math.floor(timeUntil / 60000);
                        const hours = Math.floor(timeUntil / 3600000);
                        const days = Math.floor(timeUntil / 86400000);

                        let timeStr;
                        if (minutes < 60) timeStr = `${minutes}m`;
                        else if (hours < 48) timeStr = `${hours}h`;
                        else timeStr = `${days}d`;

                        response += `   ⏱️ in ${timeStr}\n`;
                    } else {
                        response += `   ⏱️ DUE NOW\n`;
                    }
                }

                // Call from
                response += `   📍 ${task.callFrom}\n`;

                response += `\n`;
            });

            response += `\n💡 *Usage:*\n`;
            response += `.tasklist [pending|completed|failed|all]\n`;
            response += `.taskcancel <taskId>`;

            return response;

        } catch (error) {
            console.error('[TaskList] Error:', error.message);
            return `❌ *Error:* ${error.message}`;
        }
    },
    options: {
        aliases: ['schedules', 'tasks'],
        description: 'List scheduled tasks (owner only)',
        sectionName: 'Owner',
        ownerOnly: true,
        hidden: true
    }
};
