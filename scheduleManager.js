/**
 * Schedule Manager
 * Manages scheduled tasks with MongoDB or file storage
 */

const fs = require('fs');
const path = require('path');

// Storage type from env (mongodb or file)
const STORAGE_TYPE = process.env.GLOBAL_STORAGE || 'file';

// File storage path
const TASKS_FILE = path.join(__dirname, 'data', 'scheduled_tasks.json');

// MongoDB connection (lazy init)
let db = null;
let tasksCollection = null;

// Initialize MongoDB connection
async function initMongoDB() {
    if (db) return;

    const { MongoClient } = require('mongodb');
    const mongoUri = process.env.MONGO_URI;

    if (!mongoUri) {
        throw new Error('MONGO_URI not set in environment');
    }

    const client = new MongoClient(mongoUri);
    await client.connect();
    db = client.db();
    tasksCollection = db.collection('scheduled_tasks');

    console.log('[ScheduleManager] Connected to MongoDB');

    // Create index on scheduledTime for efficient queries
    await tasksCollection.createIndex({ scheduledTime: 1 });
    await tasksCollection.createIndex({ status: 1 });
}

// Initialize file storage
function initFileStorage() {
    const dir = path.dirname(TASKS_FILE);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    if (!fs.existsSync(TASKS_FILE)) {
        fs.writeFileSync(TASKS_FILE, JSON.stringify([], null, 2));
    }
}

// Generate task ID
function generateTaskId() {
    return `task_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Add a new scheduled task
 * @param {object} task - Task object
 * @returns {Promise<object>} - Created task with ID
 */
async function addTask(task) {
    const taskId = generateTaskId();
    const newTask = {
        taskId,
        instruction: task.instruction,
        scheduledTime: task.scheduledTime, // timestamp
        callFrom: task.callFrom,
        createdBy: task.createdBy,
        status: 'pending',
        createdAt: Date.now()
    };

    if (STORAGE_TYPE === 'mongodb') {
        await initMongoDB();
        await tasksCollection.insertOne(newTask);
        console.log(`[ScheduleManager] Added task ${taskId} to MongoDB`);
    } else {
        initFileStorage();
        const tasks = JSON.parse(fs.readFileSync(TASKS_FILE, 'utf-8'));
        tasks.push(newTask);
        fs.writeFileSync(TASKS_FILE, JSON.stringify(tasks, null, 2));
        console.log(`[ScheduleManager] Added task ${taskId} to file`);
    }

    return newTask;
}

/**
 * Get all tasks (optionally filter by status)
 * @param {string} status - Optional status filter (pending, completed, failed)
 * @returns {Promise<Array>} - Array of tasks
 */
async function getAllTasks(status = null) {
    if (STORAGE_TYPE === 'mongodb') {
        await initMongoDB();
        const query = status ? { status } : {};
        return await tasksCollection.find(query).toArray();
    } else {
        initFileStorage();
        const tasks = JSON.parse(fs.readFileSync(TASKS_FILE, 'utf-8'));
        return status ? tasks.filter(t => t.status === status) : tasks;
    }
}

/**
 * Get task by ID
 * @param {string} taskId - Task ID
 * @returns {Promise<object|null>} - Task object or null
 */
async function getTask(taskId) {
    if (STORAGE_TYPE === 'mongodb') {
        await initMongoDB();
        return await tasksCollection.findOne({ taskId });
    } else {
        initFileStorage();
        const tasks = JSON.parse(fs.readFileSync(TASKS_FILE, 'utf-8'));
        return tasks.find(t => t.taskId === taskId) || null;
    }
}

/**
 * Update task status
 * @param {string} taskId - Task ID
 * @param {string} status - New status (completed, failed, cancelled)
 * @param {object} result - Optional execution result
 * @returns {Promise<boolean>} - Success status
 */
async function updateTaskStatus(taskId, status, result = null) {
    const update = {
        status,
        executedAt: Date.now()
    };

    if (result) {
        update.result = result;
    }

    if (STORAGE_TYPE === 'mongodb') {
        await initMongoDB();
        const updateResult = await tasksCollection.updateOne(
            { taskId },
            { $set: update }
        );
        return updateResult.modifiedCount > 0;
    } else {
        initFileStorage();
        const tasks = JSON.parse(fs.readFileSync(TASKS_FILE, 'utf-8'));
        const taskIndex = tasks.findIndex(t => t.taskId === taskId);

        if (taskIndex === -1) return false;

        tasks[taskIndex] = { ...tasks[taskIndex], ...update };
        fs.writeFileSync(TASKS_FILE, JSON.stringify(tasks, null, 2));
        return true;
    }
}

/**
 * Delete task
 * @param {string} taskId - Task ID
 * @returns {Promise<boolean>} - Success status
 */
async function deleteTask(taskId) {
    if (STORAGE_TYPE === 'mongodb') {
        await initMongoDB();
        const deleteResult = await tasksCollection.deleteOne({ taskId });
        return deleteResult.deletedCount > 0;
    } else {
        initFileStorage();
        const tasks = JSON.parse(fs.readFileSync(TASKS_FILE, 'utf-8'));
        const filteredTasks = tasks.filter(t => t.taskId !== taskId);

        if (filteredTasks.length === tasks.length) return false;

        fs.writeFileSync(TASKS_FILE, JSON.stringify(filteredTasks, null, 2));
        return true;
    }
}

/**
 * Get storage type
 * @returns {string} - Storage type (mongodb or file)
 */
function getStorageType() {
    return STORAGE_TYPE;
}

module.exports = {
    addTask,
    getAllTasks,
    getTask,
    updateTaskStatus,
    deleteTask,
    getStorageType
};
