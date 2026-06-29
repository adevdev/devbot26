/**
 * Schedule Task Tool
 * Schedule an instruction to be executed at a specific time
 */

const scheduleManager = require('../scheduleManager');
const taskScheduler = require('../taskScheduler');

/**
 * Parse time string to timestamp
 * Supports: relative ("in 30 minutes", "in 2 hours") and absolute ISO ("2024-12-25T10:00:00")
 */
function parseScheduledTime(timeString) {
    const now = Date.now();

    // Try absolute ISO format first
    const isoDate = new Date(timeString);
    if (!isNaN(isoDate.getTime())) {
        return isoDate.getTime();
    }

    // Parse relative time: "in X minutes/hours/days"
    const relativeMatch = timeString.match(/^in\s+(\d+)\s+(minute|minutes|hour|hours|day|days)$/i);
    if (relativeMatch) {
        const amount = parseInt(relativeMatch[1]);
        const unit = relativeMatch[2].toLowerCase();

        const multipliers = {
            'minute': 60 * 1000,
            'minutes': 60 * 1000,
            'hour': 60 * 60 * 1000,
            'hours': 60 * 60 * 1000,
            'day': 24 * 60 * 60 * 1000,
            'days': 24 * 60 * 60 * 1000
        };

        const multiplier = multipliers[unit];
        if (multiplier) {
            return now + (amount * multiplier);
        }
    }

    // If can't parse, throw error
    throw new Error(`Unable to parse time: "${timeString}". Use format like "in 30 minutes" or ISO date "2024-12-25T10:00:00"`);
}

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
        name: 'schedule_task',
        description: 'Schedule an instruction or task to be executed automatically at a specific time in the future. The instruction will be processed by AI at the scheduled time and the result will be sent to the specified chat. Perfect for: reminders, delayed messages, recurring checks, scheduled reports, time-based automations. The task persists across bot restarts.',
        input_schema: {
            type: 'object',
            properties: {
                instruction: {
                    type: 'string',
                    description: 'The instruction or prompt to execute at the scheduled time. This will be processed by AI just like a normal user message. Be specific and clear. Example: "Send a reminder to check the server status", "Generate and send daily report"'
                },
                scheduledTime: {
                    type: 'string',
                    description: 'When to execute the task. Supports two formats: 1) Relative time: "in 30 minutes", "in 2 hours", "in 1 day" 2) Absolute ISO date: "2024-12-25T10:00:00" or "2024-12-25T10:00:00+07:00" (with timezone)'
                }
            },
            required: ['instruction', 'scheduledTime']
        }
    },

    // Metadata for UI/UX
    metadata: {
        icon: '⏰',
        progressMessage: (input) => `Scheduling task...`
    },

    // Execution logic
    execute: async function(input, context) {
        const { instruction, scheduledTime } = input;

        try {
            // Parse scheduled time
            let scheduledTimestamp;
            try {
                scheduledTimestamp = parseScheduledTime(scheduledTime);
            } catch (parseError) {
                return JSON.stringify({
                    error: parseError.message
                });
            }

            // Validate scheduled time is in the future
            if (scheduledTimestamp <= Date.now()) {
                return JSON.stringify({
                    error: 'Scheduled time must be in the future'
                });
            }

            // Auto-detect target room from context
            // Priority: context.room (group/chat room) > context.message.room > context.message.from (sender)
            const callFrom = context?.room || context?.message?.room || context?.message?.from;

            if (!callFrom) {
                return JSON.stringify({
                    error: 'Cannot determine target chat from context'
                });
            }

            console.log(`[ScheduleTask] Auto-detected callFrom: ${callFrom} (context.room: ${context?.room}, message.room: ${context?.message?.room}, message.from: ${context?.message?.from})`);

            // Get creator JID
            const createdBy = context?.message?.sender?.id || context?.message?.from || 'unknown';

            // Create task
            const task = {
                instruction,
                scheduledTime: scheduledTimestamp,
                callFrom: callFrom,
                createdBy
            };

            // Save to storage
            const savedTask = await scheduleManager.addTask(task);

            // Add to scheduler cache
            taskScheduler.addTaskToCache(savedTask);

            console.log(`[ScheduleTask] Created task ${savedTask.taskId} for ${formatTime(scheduledTimestamp)}`);

            // Calculate time until execution
            const timeUntil = scheduledTimestamp - Date.now();
            const minutesUntil = Math.round(timeUntil / 60000);
            const hoursUntil = Math.round(timeUntil / 3600000);

            let timeUntilStr;
            if (minutesUntil < 60) {
                timeUntilStr = `${minutesUntil} minute${minutesUntil !== 1 ? 's' : ''}`;
            } else if (hoursUntil < 48) {
                timeUntilStr = `${hoursUntil} hour${hoursUntil !== 1 ? 's' : ''}`;
            } else {
                const daysUntil = Math.round(timeUntil / 86400000);
                timeUntilStr = `${daysUntil} day${daysUntil !== 1 ? 's' : ''}`;
            }

            return JSON.stringify({
                success: true,
                taskId: savedTask.taskId,
                instruction: instruction,
                scheduledTime: formatTime(scheduledTimestamp),
                timeUntil: timeUntilStr,
                callFrom: callFrom
            });

        } catch (error) {
            console.error('[ScheduleTask] Error:', error.message);
            return JSON.stringify({
                error: error.message
            });
        }
    }
};
