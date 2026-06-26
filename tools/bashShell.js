/**
 * Bash Shell Tool - Execute shell commands
 * SECURITY: Owner-only, with timeout and output limits
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

module.exports = {
    // Tool definition for AI API
    definition: {
        name: 'bash_shell',
        description: 'Execute bash/shell commands on the server. Use this to run system commands, check files, manage processes, or perform system operations. Returns command output (stdout/stderr). Owner-only feature.',
        input_schema: {
            type: 'object',
            properties: {
                command: {
                    type: 'string',
                    description: 'The shell command to execute. Be careful with destructive commands.'
                }
            },
            required: ['command']
        }
    },

    // Metadata for UI/UX
    metadata: {
        icon: '💻',
        progressMessage: (input) => `Executing: \`${input.command.slice(0, 50)}${input.command.length > 50 ? '...' : ''}\``,
        resultType: 'text'
    },

    // Execution logic
    execute: async function(input, context) {
        const command = input.command;

        // SECURITY CHECK: Owner-only
        const OWNER_ID = process.env.OWNER_ID;
        if (!OWNER_ID) {
            return 'Error: OWNER_ID not configured. This tool is disabled for security.';
        }

        // Check if context has sender info
        if (!context || !context.message || !context.message.sender) {
            return 'Error: Unable to verify user identity. Command blocked for security.';
        }

        const senderId = context.message.sender.id;
        if (senderId !== OWNER_ID) {
            return 'Error: This tool is owner-only. Command blocked for security.';
        }

        // Validate command
        if (!command || typeof command !== 'string' || command.trim().length === 0) {
            return 'Error: Invalid command. Please provide a valid shell command.';
        }

        try {
            console.log(`[BashShell] Owner ${senderId} executing: ${command}`);

            // Execute with timeout (30 seconds)
            // Use platform-appropriate shell (bash on Linux/Mac, cmd on Windows)
            const shell = process.platform === 'win32' ? 'cmd.exe' : '/bin/bash';
            const { stdout, stderr } = await execAsync(command, {
                timeout: 30000,
                maxBuffer: 1024 * 1024, // 1MB buffer
                shell: shell
            });

            // Format output
            let output = '';

            if (stdout && stdout.trim().length > 0) {
                output += '**STDOUT:**\n```\n' + stdout.trim() + '\n```\n\n';
            }

            if (stderr && stderr.trim().length > 0) {
                output += '**STDERR:**\n```\n' + stderr.trim() + '\n```\n\n';
            }

            if (!output) {
                output = '✓ Command executed successfully (no output)';
            }

            // Truncate if too long (WhatsApp limit ~4096 chars per message)
            if (output.length > 3500) {
                output = output.slice(0, 3500) + '\n\n... (output truncated)';
            }

            console.log(`[BashShell] Command completed successfully`);
            return output;

        } catch (error) {
            console.error('[BashShell] Execution error:', error.message);

            // Format error output
            let errorOutput = '**Error executing command:**\n';

            if (error.killed) {
                errorOutput += '```\nCommand timed out after 30 seconds\n```';
            } else if (error.code) {
                errorOutput += `\`\`\`\nExit code: ${error.code}\n`;
                if (error.stdout) errorOutput += '\n' + error.stdout.trim();
                if (error.stderr) errorOutput += '\n' + error.stderr.trim();
                errorOutput += '\n```';
            } else {
                errorOutput += '```\n' + error.message + '\n```';
            }

            // Truncate error if too long
            if (errorOutput.length > 3500) {
                errorOutput = errorOutput.slice(0, 3500) + '\n\n... (error truncated)';
            }

            return errorOutput;
        }
    }
};
