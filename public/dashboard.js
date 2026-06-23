const socket = io();
const term = new Terminal({
    cursorBlink: true,
    fontSize: 14,
    fontFamily: 'Courier New, monospace',
    theme: {
        background: '#000000',
        foreground: '#00ff00',
        cursor: '#00ff00',
        selection: '#ffffff33',
        black: '#000000',
        red: '#ff0000',
        green: '#00ff00',
        yellow: '#ffff00',
        blue: '#0000ff',
        magenta: '#ff00ff',
        cyan: '#00ffff',
        white: '#ffffff',
        brightBlack: '#808080',
        brightRed: '#ff8080',
        brightGreen: '#80ff80',
        brightYellow: '#ffff80',
        brightBlue: '#8080ff',
        brightMagenta: '#ff80ff',
        brightCyan: '#80ffff',
        brightWhite: '#ffffff'
    }
});

const fitAddon = new FitAddon.FitAddon();
term.loadAddon(fitAddon);

term.open(document.getElementById('terminal'));
fitAddon.fit();

// Auto resize
window.addEventListener('resize', () => {
    fitAddon.fit();
});

let inputBuffer = '';
let cursorPos = 0;
let awaitingPhoneInput = false;
let currentStatus = 'disconnected';
let isAuthenticated = false;

// Terminal input handling with cursor support
term.onData(data => {
    if (awaitingPhoneInput && isAuthenticated) {
        if (data === '\r') { // Enter
            term.write('\r\n');
            socket.emit('phone-submit', inputBuffer.trim());
            inputBuffer = '';
            cursorPos = 0;
            awaitingPhoneInput = false;
        } else if (data === '\x7F') { // Backspace
            if (cursorPos > 0) {
                inputBuffer = inputBuffer.slice(0, cursorPos - 1) + inputBuffer.slice(cursorPos);
                cursorPos--;
                redrawInput();
            }
        } else if (data === '\x1b[D') { // Left arrow
            if (cursorPos > 0) {
                cursorPos--;
                term.write('\x1b[D');
            }
        } else if (data === '\x1b[C') { // Right arrow
            if (cursorPos < inputBuffer.length) {
                cursorPos++;
                term.write('\x1b[C');
            }
        } else if (data === '\x1b[H') { // Home
            while (cursorPos > 0) {
                term.write('\x1b[D');
                cursorPos--;
            }
        } else if (data === '\x1b[F') { // End
            while (cursorPos < inputBuffer.length) {
                term.write('\x1b[C');
                cursorPos++;
            }
        } else if (data >= ' ' && data <= '~') { // Printable chars
            inputBuffer = inputBuffer.slice(0, cursorPos) + data + inputBuffer.slice(cursorPos);
            cursorPos++;
            redrawInput();
        }
    }
});

function redrawInput() {
    // Clear line and redraw
    term.write('\r\x1b[K');
    term.write('\x1b[1;33m> Enter phone number (e.g., 6212345678910): \x1b[0m' + inputBuffer);
    // Move cursor to correct position
    const diff = inputBuffer.length - cursorPos;
    if (diff > 0) {
        term.write('\x1b[' + diff + 'D');
    }
}

// Update button UI based on status and auth
function updateButtons(status, hasPhone = false, authenticated = false) {
    currentStatus = status;
    isAuthenticated = authenticated;
    const controls = document.getElementById('controls');

    // Non-authenticated users: only show login button
    if (!authenticated) {
        controls.innerHTML = `
            <button class="btn" onclick="showLoginModal()">🔐 Login</button>
        `;
        return;
    }

    // Authenticated users: show full controls
    if (status === 'restarting') {
        controls.innerHTML = `
            <button class="btn loading" disabled>⟳ Restarting...</button>
            <button class="btn danger" onclick="logout()">🚪 Logout</button>
        `;
    } else if (status === 'stopped') {
        controls.innerHTML = `
            <button class="btn" onclick="startBot()">▶ Start</button>
            <button class="btn danger" onclick="logout()">🚪 Logout</button>
        `;
    } else if (status === 'connected') {
        controls.innerHTML = `
            <button class="btn" onclick="restartBot()">🔄 Restart</button>
            <button class="btn danger" onclick="shutdownBot()">⏻ Shutdown</button>
            <button class="btn danger" onclick="logout()">🚪 Logout</button>
        `;
    } else if (status === 'connecting') {
        const changePhoneBtn = hasPhone ? '<button class="btn" onclick="changePhone()">📱 Change Phone</button>' : '';
        controls.innerHTML = `
            <button class="btn danger" onclick="stopBot()">⏹ Stop</button>
            ${changePhoneBtn}
            <button class="btn danger" onclick="logout()">🚪 Logout</button>
        `;
    } else {
        controls.innerHTML = `
            <button class="btn" disabled>⏳ Loading...</button>
            <button class="btn danger" onclick="logout()">🚪 Logout</button>
        `;
    }
}

// Socket events
socket.on('init', (data) => {
    updateButtons(data.status, data.hasPhone, data.authenticated);
    if (data.logs && data.logs.length > 0) {
        data.logs.forEach(log => {
            writeLine(formatLog(log));
        });
    }
});

socket.on('log', (log) => {
    writeLine(formatLog(log));

    // Re-display phone prompt if waiting for input
    if (awaitingPhoneInput) {
        redrawInput();
    }
});

socket.on('status-change', (data) => {
    updateButtons(data.status, data.hasPhone, isAuthenticated);
});

socket.on('request-phone', () => {
    if (isAuthenticated) {
        term.write('\r\n\x1b[1;33m> Enter phone number (e.g., 6212345678910): \x1b[0m');
        awaitingPhoneInput = true;
        cursorPos = 0;
    }
});

socket.on('phone-accepted', (data) => {
    writeLine(`\x1b[1;32m✓ Phone number accepted: ${data.phone}\x1b[0m`);
});

socket.on('clear', () => {
    term.clear();
});

function writeLine(text) {
    term.write(text + '\r\n');
}

function formatLog(log) {
    const timestamp = new Date(log.timestamp).toLocaleTimeString();
    const colors = {
        info: '\x1b[1;36m',      // Cyan
        success: '\x1b[1;32m',   // Green
        command: '\x1b[1;35m',   // Magenta
        message: '\x1b[1;33m',   // Yellow
        error: '\x1b[1;31m',     // Red
        reset: '\x1b[0m'
    };

    const color = colors[log.type] || colors.info;
    const prefix = {
        info: 'INFO',
        success: 'OK',
        command: 'CMD',
        message: 'MSG',
        error: 'ERR'
    }[log.type] || 'LOG';

    return `${color}[${timestamp}] [${prefix}] ${log.message}${colors.reset}`;
}

// Modal helper function
const modal = document.getElementById('confirmModal');
const modalTitle = document.getElementById('modalTitle');
const modalMessage = document.getElementById('modalMessage');
const modalConfirm = document.getElementById('modalConfirm');
const modalCancel = document.getElementById('modalCancel');

function showConfirm(title, message) {
    return new Promise((resolve) => {
        modalTitle.textContent = title;
        modalMessage.textContent = message;
        modal.showModal();

        const handleConfirm = () => {
            cleanup();
            resolve(true);
        };

        const handleCancel = () => {
            cleanup();
            resolve(false);
        };

        const handleEscape = (e) => {
            if (e.key === 'Escape') {
                cleanup();
                resolve(false);
            }
        };

        const cleanup = () => {
            modal.close();
            modalConfirm.removeEventListener('click', handleConfirm);
            modalCancel.removeEventListener('click', handleCancel);
            modal.removeEventListener('keydown', handleEscape);
        };

        modalConfirm.addEventListener('click', handleConfirm);
        modalCancel.addEventListener('click', handleCancel);
        modal.addEventListener('keydown', handleEscape);
    });
}

function showAlert(title, message) {
    return new Promise((resolve) => {
        modalTitle.textContent = title;
        modalMessage.textContent = message;

        // Hide cancel button for alerts
        modalCancel.style.display = 'none';
        modalConfirm.textContent = 'OK';

        modal.showModal();

        const handleOk = () => {
            cleanup();
            resolve(true);
        };

        const handleEscape = (e) => {
            if (e.key === 'Escape') {
                cleanup();
                resolve(true);
            }
        };

        const cleanup = () => {
            modal.close();
            // Restore original state
            modalCancel.style.display = '';
            modalConfirm.textContent = 'Confirm';
            modalConfirm.removeEventListener('click', handleOk);
            modal.removeEventListener('keydown', handleEscape);
        };

        modalConfirm.addEventListener('click', handleOk);
        modal.addEventListener('keydown', handleEscape);
    });
}

async function startBot() {
    const response = await fetch('/api/start', {
        method: 'POST',
        credentials: 'same-origin'
    });
    if (!response.ok) {
        await showAlert('Error', 'Failed to start bot. Please try again.');
    }
}

async function stopBot() {
    const confirmed = await showConfirm('Stop Bot', 'Stop bot connection?');
    if (confirmed) {
        const response = await fetch('/api/stop', {
            method: 'POST',
            credentials: 'same-origin'
        });
        if (!response.ok) {
            await showAlert('Error', 'Failed to stop bot. Please try again.');
        }
    }
}

async function changePhone() {
    const confirmed = await showConfirm('Change Phone', 'Change phone number? This will stop the current connection.');
    if (confirmed) {
        const response = await fetch('/api/change-phone', {
            method: 'POST',
            credentials: 'same-origin'
        });
        if (!response.ok) {
            await showAlert('Error', 'Failed to change phone. Please try again.');
        }
    }
}

async function restartBot() {
    const confirmed = await showConfirm('Restart Bot', 'Restart bot instance? This will reload all connections.');
    if (confirmed) {
        const response = await fetch('/api/restart', {
            method: 'POST',
            credentials: 'same-origin'
        });
        if (!response.ok) {
            await showAlert('Error', 'Failed to restart bot. Please try again.');
        }
    }
}

async function shutdownBot() {
    const confirmed = await showConfirm('Shutdown Bot', 'Shutdown bot instance? You can start it again later.');
    if (confirmed) {
        const response = await fetch('/api/shutdown', {
            method: 'POST',
            credentials: 'same-origin'
        });
        if (!response.ok) {
            await showAlert('Error', 'Failed to shutdown bot. Please try again.');
        }
    }
}

// Login/Logout functions
const loginModal = document.getElementById('loginModal');
const loginUsername = document.getElementById('loginUsername');
const loginPassword = document.getElementById('loginPassword');
const loginSubmit = document.getElementById('loginSubmit');
const loginCancel = document.getElementById('loginCancel');

function showLoginModal() {
    loginUsername.value = '';
    loginPassword.value = '';
    loginModal.showModal();
    loginUsername.focus();
}

loginCancel.addEventListener('click', () => {
    loginModal.close();
});

loginSubmit.addEventListener('click', async () => {
    const username = loginUsername.value.trim();
    const password = loginPassword.value;

    if (!username || !password) {
        await showAlert('Error', 'Please enter username and password');
        return;
    }

    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ username, password })
        });

        const data = await response.json();

        if (response.ok && data.success) {
            loginModal.close();
            isAuthenticated = true;
            // Reload page to refresh socket with authenticated session
            window.location.reload();
        } else {
            await showAlert('Error', 'Invalid username or password');
            loginPassword.value = '';
            loginPassword.focus();
        }
    } catch (error) {
        await showAlert('Error', 'Login failed. Please try again.');
    }
});

// Handle Enter key in login form
loginPassword.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        loginSubmit.click();
    }
});

async function logout() {
    const confirmed = await showConfirm('Logout', 'Are you sure you want to logout?');
    if (confirmed) {
        try {
            const response = await fetch('/api/logout', {
                method: 'POST',
                credentials: 'same-origin'
            });
            if (response.ok) {
                isAuthenticated = false;
                window.location.reload();
            } else {
                await showAlert('Error', 'Logout failed. Please try again.');
            }
        } catch (error) {
            await showAlert('Error', 'Logout failed. Please try again.');
        }
    }
}

// Tab switching
function switchTab(tabName, buttonElement) {
    // Check authentication for commands and ai-settings tabs
    if ((tabName === 'commands' || tabName === 'ai-settings') && !isAuthenticated) {
        showAlert('Authentication Required', 'This feature is only available for authenticated users. Please login first.');
        return;
    }

    // Update tab buttons
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    buttonElement.classList.add('active');

    // Update tab content
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    document.getElementById(`tab-${tabName}`).classList.add('active');

    // Load data based on tab
    if (tabName === 'commands') {
        loadCommands();
    } else if (tabName === 'ai-settings') {
        loadAIDefaults();
        loadApiConfig();
        loadModels();
        loadWhitelist();
    }
}

// Load commands list
async function loadCommands() {
    try {
        const response = await fetch('/api/commands', {
            credentials: 'same-origin'
        });
        const data = await response.json();

        if (data.success) {
            renderCommands(data.commands);
        } else {
            renderCommandsError('Failed to load commands');
        }
    } catch (error) {
        renderCommandsError('Error loading commands: ' + error.message);
    }
}

// Render commands table
function renderCommands(commands) {
    const tbody = document.getElementById('commandsTableBody');

    if (commands.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; opacity: 0.6;">No commands loaded</td></tr>';
        return;
    }

    tbody.innerHTML = commands.map(cmd => {
        const badges = [];
        if (cmd.temporary) badges.push('<span class="badge temp">TEMP</span>');
        if (cmd.ownerOnly) badges.push('<span class="badge owner">OWNER</span>');
        if (cmd.adminOnly) badges.push('<span class="badge">ADMIN</span>');

        const actions = cmd.temporary
            ? `<button class="btn btn-small danger" onclick="removeCommand('${cmd.name}')">Remove</button>`
            : '<span style="opacity: 0.5;">Permanent</span>';

        return `
            <tr>
                <td><strong>${cmd.name}</strong></td>
                <td>${cmd.description}</td>
                <td>${cmd.sectionName}</td>
                <td>${cmd.aliases.join(', ') || '-'}</td>
                <td>${badges.join(' ')}<br><small style="opacity: 0.6;">${cmd.source}</small></td>
                <td>${actions}</td>
            </tr>
        `;
    }).join('');
}

// Render commands error
function renderCommandsError(message) {
    const tbody = document.getElementById('commandsTableBody');
    tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: #f00;">${message}</td></tr>`;
}

// Show add command modal
function showAddCommandModal() {
    const modal = document.getElementById('addCommandModal');
    document.getElementById('cmdName').value = '';
    document.getElementById('cmdCode').value = '';
    modal.showModal();
}

// Add command modal handlers
document.getElementById('addCommandCancel').addEventListener('click', () => {
    document.getElementById('addCommandModal').close();
});

document.getElementById('addCommandSubmit').addEventListener('click', async () => {
    const name = document.getElementById('cmdName').value.trim();
    const code = document.getElementById('cmdCode').value.trim();

    if (!name || !code) {
        await showAlert('Error', 'Name and code are required');
        return;
    }

    try {
        const response = await fetch('/api/commands', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ name, code, source: 'Dashboard' })
        });

        const data = await response.json();

        if (data.success) {
            document.getElementById('addCommandModal').close();
            loadCommands();
            await showAlert('Success', 'Command added successfully!');
        } else {
            await showAlert('Error', 'Failed to add command: ' + data.error);
        }
    } catch (error) {
        await showAlert('Error', 'Error adding command: ' + error.message);
    }
});

// Remove command
async function removeCommand(name) {
    const confirmed = await showConfirm('Remove Command', `Remove command "${name}"?`);
    if (confirmed) {
        try {
            const response = await fetch(`/api/commands/${name}`, {
                method: 'DELETE',
                credentials: 'same-origin'
            });
            const data = await response.json();

            if (data.success) {
                loadCommands();
            } else {
                await showAlert('Error', 'Failed to remove command: ' + data.error);
            }
        } catch (error) {
            await showAlert('Error', 'Error removing command: ' + error.message);
        }
    }
}

// Load whitelist
// Load AI default settings
async function loadAIDefaults() {
    try {
        const response = await fetch('/api/ai-settings/defaults', {
            credentials: 'same-origin'
        });
        const data = await response.json();

        if (data.success) {
            const { defaultModel, defaultQuota, defaultResetPeriod, defaultVisionModel } = data.defaults;

            // Format display
            const modelDisplay = defaultModel === 'claude-sonnet-4.5' ? 'Claude Sonnet 4.5' : 'Qwen3 Coder Next';
            const resetDisplay = defaultResetPeriod === 'per5Hours' ? 'Every 5 Hours' :
                                defaultResetPeriod === 'perDay' ? 'Every Day' : 'Every Month';
            const visionDisplay = defaultVisionModel === 'claude-sonnet-4.5' ? 'Claude Sonnet 4.5' : 'Claude Sonnet 4.5';

            // Update UI
            document.getElementById('defaultModel').textContent = modelDisplay;
            document.getElementById('defaultQuota').textContent = defaultQuota + ' requests';
            document.getElementById('defaultReset').textContent = resetDisplay;
            document.getElementById('defaultVisionModel').textContent = visionDisplay;
        } else {
            document.getElementById('defaultModel').textContent = 'Error loading';
            document.getElementById('defaultQuota').textContent = 'Error loading';
            document.getElementById('defaultReset').textContent = 'Error loading';
            document.getElementById('defaultVisionModel').textContent = 'Error loading';
        }
    } catch (error) {
        console.error('Error loading AI defaults:', error);
        document.getElementById('defaultModel').textContent = 'Error loading';
        document.getElementById('defaultQuota').textContent = 'Error loading';
        document.getElementById('defaultReset').textContent = 'Error loading';
        document.getElementById('defaultVisionModel').textContent = 'Error loading';
    }
}

// Show edit defaults modal
async function showEditDefaultsModal() {
    try {
        const response = await fetch('/api/ai-settings/defaults', {
            credentials: 'same-origin'
        });
        const data = await response.json();

        if (data.success) {
            const { defaultModel, defaultQuota, defaultResetPeriod, defaultVisionModel } = data.defaults;

            // Populate model dropdowns dynamically
            await populateModelDropdown('editDefaultModel', { selectedValue: defaultModel });
            await populateModelDropdown('editDefaultVisionModel', {
                onlyVisionCapable: true,
                selectedValue: defaultVisionModel
            });

            document.getElementById('editDefaultQuota').value = defaultQuota;
            document.getElementById('editDefaultResetPeriod').value = defaultResetPeriod;

            document.getElementById('editDefaultsModal').showModal();
        } else {
            await showAlert('Error', 'Failed to load current defaults');
        }
    } catch (error) {
        await showAlert('Error', 'Error loading defaults: ' + error.message);
    }
}

// Load supported AI models
async function loadModels() {
    try {
        const response = await fetch('/api/ai-settings/models', {
            credentials: 'same-origin'
        });
        const data = await response.json();

        const tbody = document.getElementById('modelsTableBody');

        if (data.success && data.models.length > 0) {
            tbody.innerHTML = data.models.map(model => {
                const visionBadge = model.supportsVision ?
                    '<span style="color: #0f0;">✓ Yes</span>' :
                    '<span style="opacity: 0.5;">✗ No</span>';
                const statusBadge = model.enabled ?
                    '<span style="color: #0f0;">● Enabled</span>' :
                    '<span style="color: #ff0; opacity: 0.7;">○ Disabled</span>';

                return `
                    <tr>
                        <td><code>${model.id}</code></td>
                        <td>${model.displayName}</td>
                        <td>${visionBadge}</td>
                        <td>${statusBadge}</td>
                        <td>
                            <button class="btn btn-small" onclick="showEditModelModal('${model.id}')">Edit</button>
                            <button class="btn btn-small danger" onclick="removeModel('${model.id}')">Remove</button>
                        </td>
                    </tr>
                `;
            }).join('');
        } else {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; opacity: 0.6;">No models configured</td></tr>';
        }
    } catch (error) {
        console.error('Error loading models:', error);
        document.getElementById('modelsTableBody').innerHTML =
            '<tr><td colspan="5" style="text-align: center; color: #f00;">Error loading models</td></tr>';
    }
}

// Load API configuration
async function loadApiConfig() {
    try {
        const response = await fetch('/api/ai-settings/api-config', {
            credentials: 'same-origin'
        });
        const data = await response.json();

        if (data.success) {
            const { apiEndpoint, apiKey, isOverridden } = data.config;

            // Display endpoint
            document.getElementById('apiEndpoint').textContent = apiEndpoint || 'Not configured';

            // Display masked API key
            if (apiKey) {
                const masked = apiKey.substring(0, 8) + '...' + apiKey.substring(apiKey.length - 4);
                document.getElementById('apiKey').textContent = masked;
            } else {
                document.getElementById('apiKey').textContent = 'Not configured';
            }

            // Show source and revert button
            const sourceEl = document.getElementById('apiConfigSource');
            const revertBtn = document.getElementById('revertApiBtn');

            if (isOverridden) {
                sourceEl.textContent = '✓ Using dashboard override';
                sourceEl.style.color = '#0f0';
                revertBtn.style.display = 'inline-block';
            } else {
                sourceEl.textContent = 'Using .env fallback values';
                sourceEl.style.color = '#888';
                revertBtn.style.display = 'none';
            }
        } else {
            document.getElementById('apiEndpoint').textContent = 'Error loading';
            document.getElementById('apiKey').textContent = 'Error loading';
        }
    } catch (error) {
        console.error('Error loading API config:', error);
        document.getElementById('apiEndpoint').textContent = 'Error loading';
        document.getElementById('apiKey').textContent = 'Error loading';
    }
}

// Show edit API config modal
async function showEditApiConfigModal() {
    try {
        const response = await fetch('/api/ai-settings/api-config', {
            credentials: 'same-origin'
        });
        const data = await response.json();

        if (data.success) {
            // Only show stored override values, not .env fallback
            document.getElementById('editApiEndpoint').value = data.config.storedEndpoint || '';
            document.getElementById('editApiKey').value = data.config.storedKey || '';

            document.getElementById('editApiConfigModal').showModal();
        } else {
            await showAlert('Error', 'Failed to load current API config');
        }
    } catch (error) {
        await showAlert('Error', 'Error loading API config: ' + error.message);
    }
}

// Revert API config to .env values
async function revertApiConfig() {
    const confirmed = await showConfirm(
        'Revert to .env',
        'This will clear dashboard overrides and use .env values. Continue?'
    );
    if (!confirmed) return;

    try {
        const response = await fetch('/api/ai-settings/api-config', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({
                apiEndpoint: null,
                apiKey: null
            })
        });

        const data = await response.json();

        if (data.success) {
            loadApiConfig();
            await showAlert('Success', 'Reverted to .env configuration');
        } else {
            await showAlert('Error', 'Failed to revert: ' + data.error);
        }
    } catch (error) {
        await showAlert('Error', 'Error reverting config: ' + error.message);
    }
}

// Populate model dropdown dynamically
async function populateModelDropdown(selectElementId, options = {}) {
    const { onlyVisionCapable = false, onlyEnabled = true, selectedValue = null } = options;

    try {
        const response = await fetch('/api/ai-settings/models', {
            credentials: 'same-origin'
        });
        const data = await response.json();

        if (data.success) {
            let models = data.models;

            // Apply filters
            if (onlyEnabled) {
                models = models.filter(m => m.enabled);
            }
            if (onlyVisionCapable) {
                models = models.filter(m => m.supportsVision);
            }

            const select = document.getElementById(selectElementId);
            select.innerHTML = models.map(model =>
                `<option value="${model.id}" ${selectedValue === model.id ? 'selected' : ''}>${model.displayName}</option>`
            ).join('');

            return models;
        }
    } catch (error) {
        console.error('Error populating model dropdown:', error);
        return [];
    }
}

// Show add model modal
function showAddModelModal() {
    document.getElementById('addModelId').value = '';
    document.getElementById('addModelDisplayName').value = '';
    document.getElementById('addModelSupportsVision').checked = false;
    document.getElementById('addModelEnabled').checked = true;
    document.getElementById('addModelModal').showModal();
}

// Show edit model modal
async function showEditModelModal(modelId) {
    try {
        const response = await fetch('/api/ai-settings/models', {
            credentials: 'same-origin'
        });
        const data = await response.json();

        if (data.success) {
            const model = data.models.find(m => m.id === modelId);
            if (model) {
                document.getElementById('editModelId').value = model.id;
                document.getElementById('editModelDisplayName').value = model.displayName;
                document.getElementById('editModelSupportsVision').checked = model.supportsVision;
                document.getElementById('editModelEnabled').checked = model.enabled;
                document.getElementById('editModelModal').showModal();
            }
        }
    } catch (error) {
        await showAlert('Error', 'Error loading model: ' + error.message);
    }
}

// Remove model
async function removeModel(modelId) {
    const confirmed = await showConfirm('Remove Model', `Remove model "${modelId}"? This cannot be undone.`);
    if (!confirmed) return;

    try {
        const response = await fetch(`/api/ai-settings/models/${encodeURIComponent(modelId)}`, {
            method: 'DELETE',
            credentials: 'same-origin'
        });

        const data = await response.json();

        if (data.success) {
            loadModels();
            loadAIDefaults(); // Refresh in case this was a default
            await showAlert('Success', 'Model removed successfully!');
        } else {
            await showAlert('Error', 'Failed to remove model: ' + data.error);
        }
    } catch (error) {
        await showAlert('Error', 'Error removing model: ' + error.message);
    }
}

async function loadWhitelist() {
    try {
        const response = await fetch('/api/whitelist', {
            credentials: 'same-origin'
        });
        const data = await response.json();

        if (data.success) {
            renderWhitelist(data.numbers);
        } else {
            renderWhitelistError('Failed to load whitelist');
        }
    } catch (error) {
        renderWhitelistError('Error loading whitelist: ' + error.message);
    }
}

// Render whitelist table
function renderWhitelist(users) {
    const tbody = document.getElementById('whitelistTableBody');

    if (users.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; opacity: 0.6;">No users in AI whitelist</td></tr>';
        return;
    }

    tbody.innerHTML = users.map(user => {
        // Handle both old format (string) and new format (object)
        const number = typeof user === 'string' ? user : user.number;
        const model = typeof user === 'string' ? 'qwen3-coder-next' : user.model;
        const pushName = typeof user === 'object' && user.pushName ? user.pushName : 'Unknown';
        const jid = typeof user === 'object' && user.jid ? user.jid : number;
        const quota = typeof user === 'object' && user.quota ? user.quota : 100;
        const usageCount = typeof user === 'object' && user.usageCount ? user.usageCount : 0;
        const resetPeriod = typeof user === 'object' && user.resetPeriod ? user.resetPeriod : 'perDay';

        // Extract JID number (before @ symbol)
        const jidNumber = jid.split('@')[0];
        const encodedNumber = encodeURIComponent(number);
        const encodedModel = encodeURIComponent(model);
        const encodedPushName = encodeURIComponent(pushName);
        const encodedQuota = quota;
        const encodedResetPeriod = resetPeriod;

        // Format model name for display
        const modelDisplay = model === 'claude-sonnet-4.5' ? 'Claude Sonnet 4.5' : 'Qwen3 Coder Next';

        // Format reset period
        const resetDisplay = resetPeriod === 'per5Hours' ? 'Every 5h' :
                            resetPeriod === 'perDay' ? 'Daily' : 'Monthly';

        // Usage percentage for color coding
        const usagePercent = (usageCount / quota) * 100;
        const usageColor = usagePercent >= 90 ? '#f00' : usagePercent >= 70 ? '#ff0' : '#0f0';

        return `
            <tr>
                <td><strong>${pushName}</strong><br><small style="opacity: 0.6;">${jidNumber}</small></td>
                <td><span class="badge">${modelDisplay}</span></td>
                <td style="text-align: center;">${quota}</td>
                <td style="text-align: center; color: ${usageColor};">${usageCount}/${quota}</td>
                <td style="text-align: center;"><small>${resetDisplay}</small></td>
                <td>
                    <button class="btn btn-small" onclick="showEditWhitelistModal('${encodedNumber}', '${encodedModel}', '${encodedPushName}', ${encodedQuota}, '${encodedResetPeriod}')" style="margin-right: 0.5rem;">Edit</button>
                    <button class="btn btn-small danger" onclick="removeWhitelistNumber('${encodedNumber}')">Remove</button>
                </td>
            </tr>
        `;
    }).join('');
}

// Render whitelist error
function renderWhitelistError(message) {
    const tbody = document.getElementById('whitelistTableBody');
    tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: #f00;">${message}</td></tr>`;
}

// Show add whitelist modal
async function showAddWhitelistModal() {
    const modal = document.getElementById('addWhitelistModal');
    document.getElementById('whitelistNumber').value = '';
    document.getElementById('whitelistPushName').value = '';
    document.getElementById('whitelistQuota').value = '100';
    document.getElementById('whitelistResetPeriod').value = 'perDay';

    // Load defaults and populate model dropdown
    try {
        const response = await fetch('/api/ai-settings/defaults', {
            credentials: 'same-origin'
        });
        const data = await response.json();

        if (data.success) {
            await populateModelDropdown('whitelistModel', {
                selectedValue: data.defaults.defaultModel
            });
            document.getElementById('whitelistQuota').value = data.defaults.defaultQuota;
            document.getElementById('whitelistResetPeriod').value = data.defaults.defaultResetPeriod;
        } else {
            // Fallback to populating without defaults
            await populateModelDropdown('whitelistModel');
        }
    } catch (error) {
        console.error('Error loading defaults:', error);
        await populateModelDropdown('whitelistModel');
    }

    modal.showModal();
}

// Show edit whitelist modal
async function showEditWhitelistModal(encodedNumber, encodedModel, encodedPushName = '', quota = 100, resetPeriod = 'perDay') {
    const number = decodeURIComponent(encodedNumber);
    const model = decodeURIComponent(encodedModel);
    const pushName = encodedPushName ? decodeURIComponent(encodedPushName) : '';

    const modal = document.getElementById('editWhitelistModal');
    document.getElementById('editWhitelistNumber').value = number;
    document.getElementById('editWhitelistPushName').value = pushName;
    document.getElementById('editWhitelistQuota').value = quota;
    document.getElementById('editWhitelistResetPeriod').value = resetPeriod;

    // Populate model dropdown dynamically
    await populateModelDropdown('editWhitelistModel', { selectedValue: model });

    // Store original number for API call
    modal.dataset.number = number;

    modal.showModal();
}

// Add whitelist modal handlers
document.getElementById('addWhitelistCancel').addEventListener('click', () => {
    document.getElementById('addWhitelistModal').close();
});

document.getElementById('addWhitelistSubmit').addEventListener('click', async () => {
    const number = document.getElementById('whitelistNumber').value.trim();
    const pushName = document.getElementById('whitelistPushName').value.trim();
    const model = document.getElementById('whitelistModel').value;
    const quota = parseInt(document.getElementById('whitelistQuota').value);
    const resetPeriod = document.getElementById('whitelistResetPeriod').value;

    if (!number) {
        await showAlert('Error', 'Phone number is required');
        return;
    }

    // Basic validation
    if (!/^\d+(@s\.whatsapp\.net|@lid)?$/.test(number)) {
        await showAlert('Error', 'Invalid phone number format. Use digits only or with @s.whatsapp.net/@lid suffix.');
        return;
    }

    // Validate quota
    if (isNaN(quota) || quota < 1 || quota > 10000) {
        await showAlert('Error', 'Quota must be between 1 and 10000');
        return;
    }

    try {
        const response = await fetch('/api/whitelist', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({
                number,
                model,
                pushName: pushName || null,
                quota,
                resetPeriod
            })
        });

        const data = await response.json();

        if (data.success) {
            document.getElementById('addWhitelistModal').close();
            document.getElementById('whitelistNumber').value = '';
            document.getElementById('whitelistPushName').value = '';
            document.getElementById('whitelistModel').value = 'qwen3-coder-next';
            document.getElementById('whitelistQuota').value = '100';
            document.getElementById('whitelistResetPeriod').value = 'perDay';
            loadWhitelist();
            await showAlert('Success', 'User added to AI whitelist successfully!');
        } else {
            await showAlert('Error', 'Failed to add user: ' + data.error);
        }
    } catch (error) {
        await showAlert('Error', 'Error adding user: ' + error.message);
    }
});

// Edit whitelist modal handlers
document.getElementById('editWhitelistCancel').addEventListener('click', () => {
    document.getElementById('editWhitelistModal').close();
});

document.getElementById('editWhitelistSubmit').addEventListener('click', async () => {
    const modal = document.getElementById('editWhitelistModal');
    const oldNumber = modal.dataset.number;
    const newNumber = document.getElementById('editWhitelistNumber').value.trim();
    const pushName = document.getElementById('editWhitelistPushName').value.trim();
    const model = document.getElementById('editWhitelistModel').value;
    const quota = parseInt(document.getElementById('editWhitelistQuota').value);
    const resetPeriod = document.getElementById('editWhitelistResetPeriod').value;

    if (!newNumber) {
        await showAlert('Error', 'Phone number is required');
        return;
    }

    // Basic validation
    if (!/^\d+(@s\.whatsapp\.net|@lid)?$/.test(newNumber)) {
        await showAlert('Error', 'Invalid phone number format. Use digits only or with @s.whatsapp.net/@lid suffix.');
        return;
    }

    // Validate quota
    if (isNaN(quota) || quota < 1 || quota > 10000) {
        await showAlert('Error', 'Quota must be between 1 and 10000');
        return;
    }

    try {
        const response = await fetch(`/api/whitelist/${encodeURIComponent(oldNumber)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({
                newNumber,
                model,
                pushName: pushName || null,
                quota,
                resetPeriod
            })
        });

        const data = await response.json();

        if (data.success) {
            document.getElementById('editWhitelistModal').close();
            loadWhitelist();
            await showAlert('Success', 'AI settings updated successfully!');
        } else {
            await showAlert('Error', 'Failed to update settings: ' + data.error);
        }
    } catch (error) {
        await showAlert('Error', 'Error updating settings: ' + error.message);
    }
});

// Edit Defaults modal handlers
document.getElementById('editDefaultsCancel').addEventListener('click', () => {
    document.getElementById('editDefaultsModal').close();
});

document.getElementById('editDefaultsSubmit').addEventListener('click', async () => {
    const defaultModel = document.getElementById('editDefaultModel').value;
    const defaultQuota = parseInt(document.getElementById('editDefaultQuota').value);
    const defaultResetPeriod = document.getElementById('editDefaultResetPeriod').value;
    const defaultVisionModel = document.getElementById('editDefaultVisionModel').value;

    // Validate quota
    if (isNaN(defaultQuota) || defaultQuota < 1 || defaultQuota > 10000) {
        await showAlert('Error', 'Quota must be between 1 and 10000');
        return;
    }

    try {
        const response = await fetch('/api/ai-settings/defaults', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({
                defaultModel,
                defaultQuota,
                defaultResetPeriod,
                defaultVisionModel
            })
        });

        const data = await response.json();

        if (data.success) {
            document.getElementById('editDefaultsModal').close();
            loadAIDefaults();
            await showAlert('Success', 'Default AI settings updated successfully!');
        } else {
            await showAlert('Error', 'Failed to update defaults: ' + data.error);
        }
    } catch (error) {
        await showAlert('Error', 'Error updating defaults: ' + error.message);
    }
});

// Add Model modal handlers
document.getElementById('addModelCancel').addEventListener('click', () => {
    document.getElementById('addModelModal').close();
});

document.getElementById('addModelSubmit').addEventListener('click', async () => {
    const id = document.getElementById('addModelId').value.trim();
    const displayName = document.getElementById('addModelDisplayName').value.trim();
    const supportsVision = document.getElementById('addModelSupportsVision').checked;
    const enabled = document.getElementById('addModelEnabled').checked;

    if (!id || !displayName) {
        await showAlert('Error', 'Model ID and Display Name are required');
        return;
    }

    try {
        const response = await fetch('/api/ai-settings/models', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({
                id,
                displayName,
                supportsVision,
                enabled
            })
        });

        const data = await response.json();

        if (data.success) {
            document.getElementById('addModelModal').close();
            loadModels();
            await showAlert('Success', 'Model added successfully!');
        } else {
            await showAlert('Error', 'Failed to add model: ' + data.error);
        }
    } catch (error) {
        await showAlert('Error', 'Error adding model: ' + error.message);
    }
});

// Edit Model modal handlers
document.getElementById('editModelCancel').addEventListener('click', () => {
    document.getElementById('editModelModal').close();
});

document.getElementById('editModelSubmit').addEventListener('click', async () => {
    const id = document.getElementById('editModelId').value;
    const displayName = document.getElementById('editModelDisplayName').value.trim();
    const supportsVision = document.getElementById('editModelSupportsVision').checked;
    const enabled = document.getElementById('editModelEnabled').checked;

    if (!displayName) {
        await showAlert('Error', 'Display Name is required');
        return;
    }

    try {
        const response = await fetch(`/api/ai-settings/models/${encodeURIComponent(id)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({
                displayName,
                supportsVision,
                enabled
            })
        });

        const data = await response.json();

        if (data.success) {
            document.getElementById('editModelModal').close();
            loadModels();
            loadAIDefaults(); // Refresh in case this was a default
            await showAlert('Success', 'Model updated successfully!');
        } else {
            await showAlert('Error', 'Failed to update model: ' + data.error);
        }
    } catch (error) {
        await showAlert('Error', 'Error updating model: ' + error.message);
    }
});

// Edit API Config modal handlers
document.getElementById('editApiConfigCancel').addEventListener('click', () => {
    document.getElementById('editApiConfigModal').close();
});

document.getElementById('editApiConfigSubmit').addEventListener('click', async () => {
    const apiEndpoint = document.getElementById('editApiEndpoint').value.trim();
    const apiKey = document.getElementById('editApiKey').value.trim();

    try {
        const response = await fetch('/api/ai-settings/api-config', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({
                apiEndpoint: apiEndpoint || null,
                apiKey: apiKey || null
            })
        });

        const data = await response.json();

        if (data.success) {
            document.getElementById('editApiConfigModal').close();
            loadApiConfig();
            await showAlert('Success', 'API configuration updated successfully!');
        } else {
            await showAlert('Error', 'Failed to update API config: ' + data.error);
        }
    } catch (error) {
        await showAlert('Error', 'Error updating API config: ' + error.message);
    }
});

// Remove whitelist number
async function removeWhitelistNumber(encodedNumber) {
    const number = decodeURIComponent(encodedNumber);
    const displayNumber = number.replace('@s.whatsapp.net', '');

    const confirmed = await showConfirm('Remove Number', `Remove ${displayNumber} from whitelist?`);
    if (confirmed) {
        try {
            const response = await fetch(`/api/whitelist/${encodedNumber}`, {
                method: 'DELETE',
                credentials: 'same-origin'
            });
            const data = await response.json();

            if (data.success) {
                loadWhitelist();
            } else {
                await showAlert('Error', 'Failed to remove number: ' + data.error);
            }
        } catch (error) {
            await showAlert('Error', 'Error removing number: ' + error.message);
        }
    }
}
