/**
 * List Scheduled Tasks Tool
 * View all scheduled tasks
 */

const scheduleManager = require('../scheduleManager');

/**
 * Format timestamp to readable string
 */
function formatTime(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZoneName: 'short'
    });
}

module.exports = {
    // Tool definition (sent to AI)
    definition: {
        name: 'list_scheduled_tasks',
        description: 'List all scheduled tasks. You can filter by status: pending (waiting to execute), completed (already executed), failed (execution failed), or all tasks. Returns task details including ID, instruction, scheduled time, and status.',
        input_schema: {
            type: 'object',
            properties: {
                status: {
                    type: 'string',
                    description: 'Optional filter by status. Options: "pending" (default - shows only upcoming tasks), "completed" (shows executed tasks), "failed" (shows failed tasks), "all" (shows all tasks regardless of status)',
                    enum: ['pending', 'completed', 'failed', 'all']
                }
            },
            required: []
        }
    },

    // Metadata for UI/UX
    metadata: {
        icon: '📋',
        progressMessage: () => 'Loading scheduled tasks...'
    },

    // Execution logic
    execute: async function(input) {
        const { status = 'pending' } = input;

        try {
            // Get tasks from storage
            let tasks;
            if (status === 'all') {
                tasks = await scheduleManager.getAllTasks();
            } else {
                tasks = await scheduleManager.getAllTasks(status);
            }

            if (tasks.length === 0) {
                return JSON.stringify({
                    success: true,
                    message: `No ${status === 'all' ? '' : status + ' '}tasks found`,
                    tasks: [],
                    count: 0
                });
            }

            // Sort by scheduled time (nearest first for pending, newest first for others)
            if (status === 'pending') {
                tasks.sort((a, b) => a.scheduledTime - b.scheduledTime);
            } else {
                tasks.sort((a, b) => b.createdAt - a.createdAt);
            }

            // Format tasks for display
            const formattedTasks = tasks.map(task => {
                const baseInfo = {
                    taskId: task.taskId,
                    instruction: task.instruction,
                    scheduledTime: formatTime(task.scheduledTime),
                    scheduledTimestamp: task.scheduledTime,
                    targetJid: task.targetJid,
                    status: task.status,
                    createdAt: formatTime(task.createdAt)
                };

                // Add execution details if completed or failed
                if (task.executedAt) {
                    baseInfo.executedAt = formatTime(task.executedAt);
                }

                if (task.result) {
                    baseInfo.result = task.result;
                }

                // Add time until execution for pending tasks
                if (task.status === 'pending') {
                    const timeUntil = task.scheduledTime - Date.now();
                    if (timeUntil > 0) {
                        const minutes = Math.floor(timeUntil / 60000);
                        const hours = Math.floor(timeUntil / 3600000);
                        const days = Math.floor(timeUntil / 86400000);

                        if (minutes < 60) {
                            baseInfo.timeUntil = `${minutes}m`;
                        } else if (hours < 48) {
                            baseInfo.timeUntil = `${hours}h`;
                        } else {
                            baseInfo.timeUntil = `${days}d`;
                        }
                    } else {
                        baseInfo.timeUntil = 'due now';
                    }
                }

                return baseInfo;
            });

            return JSON.stringify({
                success: true,
                tasks: formattedTasks,
                count: tasks.length,
                filter: status
            });

        } catch (error) {
            console.error('[ListScheduledTasks] Error:', error.message);
            return JSON.stringify({
                error: error.message
            });
        }
    }
};
