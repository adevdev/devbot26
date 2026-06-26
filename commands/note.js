/**
 * Note Command - Save and manage notes per room
 * Storage: File-based (./data/notes/) or MongoDB
 */

const fs = require('fs/promises');
const path = require('path');

// Storage configuration - change this to switch between 'file' or 'mongodb'
const STORAGE_TYPE = 'mongodb'; // Options: 'file' or 'mongodb'

// MongoDB helper functions
let notesCollection = null;

async function initMongoDB() {
    if (notesCollection) return;
    const { MongoClient } = require('mongodb');
    const uri = process.env.MONGO_URI; // Fixed: was MONGODB_URI, .env has MONGO_URI
    if (!uri) throw new Error('MONGO_URI not configured in .env');
    const client = new MongoClient(uri);
    await client.connect();
    const db = client.db('devbot');
    notesCollection = db.collection('notes');
    console.log('[Note] Connected to MongoDB');
}

async function saveToMongoDB(roomId, noteId, content) {
    await initMongoDB();
    await notesCollection.updateOne(
        { roomId, noteId },
        { $set: { roomId, noteId, content, updatedAt: new Date() } },
        { upsert: true }
    );
}

async function listFromMongoDB(roomId) {
    await initMongoDB();
    return await notesCollection.find({ roomId }).sort({ noteId: 1 }).toArray();
}

async function getFromMongoDB(roomId, noteId) {
    await initMongoDB();
    const doc = await notesCollection.findOne({ roomId, noteId });
    return doc ? doc.content : null;
}

async function deleteFromMongoDB(roomId, noteId) {
    await initMongoDB();
    await notesCollection.deleteOne({ roomId, noteId });
}

async function appendToMongoDB(roomId, noteId, content) {
    await initMongoDB();
    const doc = await notesCollection.findOne({ roomId, noteId });
    if (!doc) throw new Error('Note not found');
    await notesCollection.updateOne(
        { roomId, noteId },
        { $set: { content: doc.content + '\n' + content, updatedAt: new Date() } }
    );
}

module.exports = {
    response: async (context, next) => {
        const { message, command } = context;
        const roomId = message.room;
        const [cmd] = command.parameters;

        const instructions =
            `*📝 Notes*\n` +
            `Available commands:\n` +
            `${command.prefix}${command.usedName} save - Save a note\n` +
            `${command.prefix}${command.usedName} update - Update a note\n` +
            `${command.prefix}${command.usedName} append - Append to note (new line)\n` +
            `${command.prefix}${command.usedName} list - List all notes\n` +
            `${command.prefix}${command.usedName} get - Get a note\n` +
            `${command.prefix}${command.usedName} del - Delete a note\n` +
            `\nNote: Each room has separate notes`;

        if (!cmd) return instructions;

        try {
            const folder = path.join('./data/notes', roomId);

            switch (cmd.toLowerCase()) {
                case 'save': {
                    const saveInstructions =
                        `*To save a note:*\n` +
                        `${command.prefix}${command.usedName} save [note content]\n\n` +
                        `Or reply to a message containing the note content, while using the command\n` +
                        `${command.prefix}${command.usedName} save`;

                    let noteContent = command.parameters.slice(1).join(' ');
                    if (!noteContent) {
                        const quoted = await message.getQuoted();
                        if (quoted && quoted.text) noteContent = quoted.text;
                    }

                    if (!noteContent) return saveInstructions;

                    if (STORAGE_TYPE === 'mongodb') {
                        const noteId = Date.now().toString();
                        await saveToMongoDB(roomId, noteId, noteContent);
                    } else {
                        await fs.mkdir(folder, { recursive: true });
                        const filename = Date.now().toString() + '.txt';
                        await fs.writeFile(path.join(folder, filename), noteContent);
                    }

                    return 'Note saved!';
                }

                case 'update': {
                    const id = parseInt(command.parameters[1]);
                    const updateInstructions =
                        `*To update a note:*\n` +
                        `${command.prefix}${command.usedName} update [number] [note content]\n\n` +
                        `Or reply to a message containing the note content, while using the command\n` +
                        `${command.prefix}${command.usedName} update [number]`;

                    if (!id || isNaN(id)) return updateInstructions;

                    let noteContent = command.parameters.slice(2).join(' ');
                    if (!noteContent) {
                        const quoted = await message.getQuoted();
                        if (quoted && quoted.text) noteContent = quoted.text;
                    }

                    if (!noteContent) return updateInstructions;

                    if (STORAGE_TYPE === 'mongodb') {
                        const notes = await listFromMongoDB(roomId);
                        if (!notes[id - 1]) return 'Note number not found';
                        await saveToMongoDB(roomId, notes[id - 1].noteId, noteContent);
                    } else {
                        const files = await fs.readdir(folder);
                        const file = files[id - 1];
                        if (!file) return 'Note number not found';
                        await fs.writeFile(path.join(folder, file), noteContent);
                    }

                    return 'Note updated!';
                }

                case 'append': {
                    const id = parseInt(command.parameters[1]);
                    const appendInstructions =
                        `*To append to a note:*\n` +
                        `${command.prefix}${command.usedName} append [number] [text to add]\n\n` +
                        `Or reply to a message containing the text to add, while using the command\n` +
                        `${command.prefix}${command.usedName} append [number]`;

                    if (!id || isNaN(id)) return appendInstructions;

                    let noteContent = command.parameters.slice(2).join(' ');
                    if (!noteContent) {
                        const quoted = await message.getQuoted();
                        if (quoted && quoted.text) noteContent = quoted.text;
                    }

                    if (!noteContent) return appendInstructions;

                    if (STORAGE_TYPE === 'mongodb') {
                        const notes = await listFromMongoDB(roomId);
                        if (!notes[id - 1]) return 'Note number not found';
                        await appendToMongoDB(roomId, notes[id - 1].noteId, noteContent);
                    } else {
                        const files = await fs.readdir(folder);
                        const file = files[id - 1];
                        if (!file) return 'Note number not found';
                        await fs.appendFile(path.join(folder, file), '\n' + noteContent);
                    }

                    return 'Note updated!';
                }

                case 'list': {
                    let notes, previews;

                    if (STORAGE_TYPE === 'mongodb') {
                        notes = await listFromMongoDB(roomId);
                        if (!notes.length) {
                            return `This room has no notes. Create a new note with\n${command.prefix}${command.usedName} save`;
                        }
                        previews = notes.map(n => {
                            const preview = n.content.slice(0, 40).replace(/\n/g, ' ');
                            return n.content.length > 40 ? preview + '...' : preview;
                        });
                    } else {
                        try {
                            const files = await fs.readdir(folder);
                            if (!files.length) {
                                return `This room has no notes. Create a new note with\n${command.prefix}${command.usedName} save`;
                            }
                            previews = await Promise.all(files.map(async f => {
                                const data = await fs.readFile(path.join(folder, f), 'utf8');
                                const preview = data.slice(0, 40).replace(/\n/g, ' ');
                                return data.length > 40 ? preview + '...' : preview;
                            }));
                        } catch (error) {
                            if (error.code === 'ENOENT') {
                                return `This room has no notes. Create a new note with\n${command.prefix}${command.usedName} save`;
                            }
                            throw error;
                        }
                    }

                    const display = previews.map((p, i) => `${i + 1}) ${p}`).join('\n') +
                        `\n\n*${command.prefix}${command.usedName} get [number]* - to get a note\n` +
                        `*${command.prefix}${command.usedName} del [number]* - to delete a note`;

                    return display;
                }

                case 'get': {
                    const id = parseInt(command.parameters[1]);
                    const getInstructions =
                        `*To get a note:*\n` +
                        `${command.prefix}${command.usedName} get [note_number]\n` +
                        `\nIf you don't know the number, see the list with:\n` +
                        `${command.prefix}${command.usedName} list`;

                    if (!id || isNaN(id)) return getInstructions;

                    let content;

                    if (STORAGE_TYPE === 'mongodb') {
                        const notes = await listFromMongoDB(roomId);
                        if (!notes[id - 1]) return 'Note number not found';
                        content = await getFromMongoDB(roomId, notes[id - 1].noteId);
                    } else {
                        const files = await fs.readdir(folder);
                        const file = files[id - 1];
                        if (!file) return 'Note number not found';
                        content = await fs.readFile(path.join(folder, file), 'utf8');
                    }

                    return content;
                }

                case 'del': {
                    const id = parseInt(command.parameters[1]);
                    const delInstructions =
                        `*To delete a note:*\n` +
                        `${command.prefix}${command.usedName} del [note_number]\n` +
                        `\nIf you don't know the number, see the list with:\n` +
                        `${command.prefix}${command.usedName} list`;

                    if (!id || isNaN(id)) return delInstructions;

                    if (STORAGE_TYPE === 'mongodb') {
                        const notes = await listFromMongoDB(roomId);
                        if (!notes[id - 1]) return 'Note number not found';
                        await deleteFromMongoDB(roomId, notes[id - 1].noteId);
                    } else {
                        const files = await fs.readdir(folder);
                        const file = files[id - 1];
                        if (!file) return 'Note number not found';
                        await fs.unlink(path.join(folder, file));
                    }

                    return 'Note deleted';
                }

                default:
                    return instructions;
            }
        } catch (error) {
            console.error('[Note] Error:', error);
            return `*Error:* ${error.message}`;
        }
    },
    options: {
        description: 'Save and manage notes per room',
        sectionName: 'Tools'
    }
};
