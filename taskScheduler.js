/**
 * Task Scheduler Service
 * Executes scheduled tasks at their exact due time using setTimeout
 */

const scheduleManager = require('./scheduleManager');

// In-memory cache of pending tasks with their timers
const pendingTasks = new Map(); // Map<taskId, { task, timerId }>

/**
 * Schedule a timer for a specific task
 */
function scheduleTaskTimer(task) {
    const now = Date.now();
    const delay = task.scheduledTime - now;

    if (delay <= 0) {
        // Task is already due, execute immediately
        console.log(`[TaskScheduler] Task ${task.taskId} is overdue, executing immediately`);
        executeTask(task).catch(error => {
            console.error(`[TaskScheduler] Immediate execution failed for ${task.taskId}:`, error);
        });
        return null;
    }

    // Schedule timer
    const timerId = setTimeout(() => {
        console.log(`[TaskScheduler] Timer fired for task ${task.taskId}`);
        executeTask(task).catch(error => {
            console.error(`[TaskScheduler] Execution failed for ${task.taskId}:`, error);
        });
    }, delay);

    console.log(`[TaskScheduler] Scheduled timer for task ${task.taskId} (fires in ${Math.round(delay / 1000)}s)`);

    return timerId;
}

/**
 * Load all pending tasks from storage into cache and schedule timers
 */
async function loadPendingTasks() {
    try {
        const tasks = await scheduleManager.getAllTasks('pending');

        pendingTasks.clear();

        for (const task of tasks) {
            const timerId = scheduleTaskTimer(task);
            if (timerId) {
                pendingTasks.set(task.taskId, { task, timerId });
            }
        }

        console.log(`[TaskScheduler] Loaded ${tasks.length} pending task(s) with timers`);
        return tasks.length;
    } catch (error) {
        console.error('[TaskScheduler] Failed to load pending tasks:', error.message);
        return 0;
    }
}

/**
 * Add task to cache and schedule timer
 */
function addTaskToCache(task) {
    const timerId = scheduleTaskTimer(task);
    if (timerId) {
        pendingTasks.set(task.taskId, { task, timerId });
        console.log(`[TaskScheduler] Added task ${task.taskId} to cache with timer`);
    }
}

/**
 * Remove task from cache and cancel timer
 */
function removeTaskFromCache(taskId) {
    const entry = pendingTasks.get(taskId);
    if (entry && entry.timerId) {
        clearTimeout(entry.timerId);
        console.log(`[TaskScheduler] Cleared timer for task ${taskId}`);
    }
    pendingTasks.delete(taskId);
    console.log(`[TaskScheduler] Removed task ${taskId} from cache`);
}

/**
 * Execute a scheduled task
 */
async function executeTask(task) {
    console.log(`[TaskScheduler] Executing task ${task.taskId}: ${task.instruction}`);

    try {
        // Get wachan instance
        const wachan = require('wachan');

        // Execute AI command with minimal context
        const aiCommand = require('./commands/ai.js');

        // Create Baileys-compatible message object
        const baileysMockMessage = {
            key: {
                remoteJid: task.callFrom,
                fromMe: false,
                id: `SCHEDULED_${task.taskId}`
            },
            message: {
                conversation: task.instruction
            },
            messageTimestamp: Math.floor(Date.now() / 1000)
        };

        // Create minimal message object with all required methods
        const minimalMessage = {
            text: task.instruction,
            room: task.callFrom, // Group JID or user JID
            from: task.callFrom,
            sender: {
                id: task.createdBy,
                name: 'Scheduled Task'
            },
            key: {
                id: `SCHEDULED_${task.taskId}`,
                remoteJid: task.callFrom,
                fromMe: false
            },
            // Required methods
            toBaileys: () => baileysMockMessage,
            getQuoted: () => null,
            reply: async () => null,
            download: async () => null,
            react: async () => null,
            delete: async () => null
        };

        // Create minimal context for AI execution
        const context = {
            message: minimalMessage,
            command: {
                prefix: '',
                name: 'ai',
                usedName: 'ai',
                parameters: [task.instruction],
                description: 'Scheduled task execution',
                aliases: [],
                skipWhitelistCheck: true
            },
            group: null,
            reply: async (text) => {
                // AI reply goes to the target room (group or private)
                await wachan.sendMessage(task.callFrom, { text });
            }
        };

        // Execute AI
        const response = await aiCommand.response(context, () => {});

        // If AI returned text (not already sent via tools/reply), send it
        if (response) {
            await wachan.sendMessage(task.callFrom, {
                text: `📅 *Scheduled Task Result*\n\n${response}`
            });
        }

        // Update task status
        await scheduleManager.updateTaskStatus(task.taskId, 'completed', {
            success: true,
            response: response ? response.substring(0, 500) : null
        });

        // Remove from cache
        removeTaskFromCache(task.taskId);

        console.log(`[TaskScheduler] Task ${task.taskId} completed successfully`);

    } catch (error) {
        console.error(`[TaskScheduler] Task ${task.taskId} failed:`, error.message);

        // Update task status as failed
        await scheduleManager.updateTaskStatus(task.taskId, 'failed', {
            success: false,
            error: error.message
        });

        // Remove from cache
        removeTaskFromCache(task.taskId);

        // Notify target about failure
        try {
            const wachan = require('wachan');
            await wachan.sendMessage(task.callFrom, {
                text: `❌ *Scheduled Task Failed*\n\n${task.instruction}\n\nError: ${error.message}`
            });
        } catch (notifyError) {
            console.error('[TaskScheduler] Failed to send error notification:', notifyError.message);
        }
    }
}

/**
 * Start the scheduler
 */
async function start() {
    console.log('[TaskScheduler] Starting scheduler...');

    // Load pending tasks and schedule timers
    await loadPendingTasks();

    console.log('[TaskScheduler] Scheduler started (timer-based execution)');
}

/**
 * Stop the scheduler
 */
function stop() {
    console.log('[TaskScheduler] Stopping scheduler...');

    // Cancel all active timers
    for (const [taskId, entry] of pendingTasks) {
        if (entry.timerId) {
            clearTimeout(entry.timerId);
        }
    }

    pendingTasks.clear();
    console.log('[TaskScheduler] Scheduler stopped, all timers cleared');
}

/**
 * Get scheduler status
 */
function getStatus() {
    return {
        running: true, // Always running with timer-based approach
        pendingTasksCount: pendingTasks.size,
        method: 'setTimeout'
    };
}

/**
 * Get all pending tasks from cache
 */
function getPendingTasksFromCache() {
    return Array.from(pendingTasks.values()).map(entry => entry.task);
}

module.exports = {
    start,
    stop,
    loadPendingTasks,
    addTaskToCache,
    removeTaskFromCache,
    getStatus,
    getPendingTasksFromCache
};
