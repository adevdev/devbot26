/**
 * Cancel Scheduled Task Tool
 * Cancel a pending scheduled task
 */

const scheduleManager = require('../scheduleManager');
const taskScheduler = require('../taskScheduler');

module.exports = {
    // Tool definition (sent to AI)
    definition: {
        name: 'cancel_scheduled_task',
        description: 'Cancel a scheduled task that is still pending (not yet executed). Once cancelled, the task will not be executed and will be removed from the system. You need the task ID which can be obtained from list_scheduled_tasks or from the response when creating the task.',
        input_schema: {
            type: 'object',
            properties: {
                taskId: {
                    type: 'string',
                    description: 'The unique ID of the task to cancel. Format: "task_1234567890_abc123". Get this from list_scheduled_tasks.'
                }
            },
            required: ['taskId']
        }
    },

    // Metadata for UI/UX
    metadata: {
        icon: '❌',
        progressMessage: (input) => `Cancelling task ${input.taskId}...`
    },

    // Execution logic
    execute: async function(input) {
        const { taskId } = input;

        try {
            // Validate taskId format
            if (!taskId || !taskId.startsWith('task_')) {
                return JSON.stringify({
                    error: 'Invalid task ID format. Task ID should start with "task_"'
                });
            }

            // Check if task exists
            const task = await scheduleManager.getTask(taskId);
            if (!task) {
                return JSON.stringify({
                    error: `Task not found: ${taskId}`
                });
            }

            // Check if task is still pending
            if (task.status !== 'pending') {
                return JSON.stringify({
                    error: `Cannot cancel task with status "${task.status}". Only pending tasks can be cancelled.`,
                    task: {
                        taskId: task.taskId,
                        status: task.status,
                        instruction: task.instruction
                    }
                });
            }

            // Remove from scheduler cache
            taskScheduler.removeTaskFromCache(taskId);

            // Update status to cancelled in storage
            await scheduleManager.updateTaskStatus(taskId, 'cancelled', {
                cancelledAt: Date.now()
            });

            console.log(`[CancelTask] Cancelled task ${taskId}`);

            return JSON.stringify({
                success: true,
                message: 'Task cancelled successfully',
                taskId: taskId,
                instruction: task.instruction
            });

        } catch (error) {
            console.error('[CancelTask] Error:', error.message);
            return JSON.stringify({
                error: error.message
            });
        }
    }
};
