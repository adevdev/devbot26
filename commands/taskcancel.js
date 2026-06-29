/**
 * Task Cancel Command
 * Cancel a scheduled task (owner only)
 */

const scheduleManager = require('../scheduleManager');
const taskScheduler = require('../taskScheduler');

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
            // Get taskId from parameters
            const taskId = command.parameters[0];

            if (!taskId) {
                return `❌ *Usage:* .taskcancel <taskId>\n\n` +
                       `Example: .taskcancel task_1234567890_abc123\n\n` +
                       `Get task ID from .tasklist command`;
            }

            // Validate taskId format
            if (!taskId.startsWith('task_')) {
                return `❌ Invalid task ID format. Task ID should start with "task_"`;
            }

            // Check if task exists
            const task = await scheduleManager.getTask(taskId);
            if (!task) {
                return `❌ Task not found: ${taskId}\n\n` +
                       `Use .tasklist to see available tasks`;
            }

            // Check if task is still pending
            if (task.status !== 'pending') {
                return `❌ Cannot cancel task with status "${task.status}"\n\n` +
                       `Only pending tasks can be cancelled.\n\n` +
                       `*Task Info:*\n` +
                       `ID: ${task.taskId}\n` +
                       `Status: ${task.status}\n` +
                       `Instruction: ${task.instruction.substring(0, 100)}`;
            }

            // Remove from scheduler cache (cancel timer)
            taskScheduler.removeTaskFromCache(taskId);

            // Update status to cancelled in storage
            await scheduleManager.updateTaskStatus(taskId, 'cancelled', {
                cancelledAt: Date.now(),
                cancelledBy: message.sender.id
            });

            console.log(`[TaskCancel] Cancelled task ${taskId} by ${message.sender.id}`);

            // Format response
            const scheduledDate = new Date(task.scheduledTime);
            const scheduledStr = scheduledDate.toLocaleString('en-US', {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });

            return `✅ *Task Cancelled*\n\n` +
                   `*ID:* ${taskId}\n` +
                   `*Instruction:* ${task.instruction}\n` +
                   `*Was scheduled for:* ${scheduledStr}\n` +
                   `*Target:* ${task.callFrom}`;

        } catch (error) {
            console.error('[TaskCancel] Error:', error.message);
            return `❌ *Error:* ${error.message}`;
        }
    },
    options: {
        aliases: ['cancelschedule', 'canceltask'],
        description: 'Cancel a scheduled task (owner only)',
        sectionName: 'Owner',
        ownerOnly: true,
        hidden: true
    }
};
