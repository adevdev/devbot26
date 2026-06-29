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

// Utility function to escape HTML
function escapeHtml(unsafe) {
    if (!unsafe) return '';
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

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
    // Check authentication for commands, rooms, contacts, scheduled-tasks, and ai-settings tabs
    if ((tabName === 'commands' || tabName === 'rooms' || tabName === 'contacts' || tabName === 'scheduled-tasks' || tabName === 'ai-settings') && !isAuthenticated) {
        showAlert('Authentication Required', 'This feature is only available for authenticated users. Please login first.');
        return;
    }

    // Update URL hash
    if (tabName === 'ai-settings') {
        window.location.hash = 'ai-settings/defaults';
    } else {
        window.location.hash = tabName;
    }

    // Update tab buttons
    document.querySelectorAll('.header .tab-btn').forEach(btn => btn.classList.remove('active'));
    buttonElement.classList.add('active');

    // Update tab content
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    document.getElementById(`tab-${tabName}`).classList.add('active');

    // Load data based on tab
    if (tabName === 'commands') {
        loadCommands();
    } else if (tabName === 'rooms') {
        loadRooms();
    } else if (tabName === 'contacts') {
        loadContacts();
    } else if (tabName === 'scheduled-tasks') {
        loadScheduledTasks();
    } else if (tabName === 'ai-settings') {
        // Initialize first sub-tab as active
        document.querySelectorAll('#tab-ai-settings .tab-btn').forEach(btn => btn.classList.remove('active'));
        const firstSubTabBtn = document.querySelector('#tab-ai-settings .tab-btn');
        if (firstSubTabBtn) firstSubTabBtn.classList.add('active');

        document.querySelectorAll('.ai-subtab-content').forEach(content => content.style.display = 'none');
        const firstSubTab = document.getElementById('ai-subtab-defaults');
        if (firstSubTab) firstSubTab.style.display = 'block';

        loadAIDefaults();
        loadApiConfig();
        loadModels();
        loadMemory();
        loadWhitelist();
        loadTools();
    }
}

// Switch AI Settings sub-tabs
function switchAiSubTab(subTabName, buttonElement) {
    // Update URL hash
    window.location.hash = `ai-settings/${subTabName}`;

    // Update sub-tab buttons
    document.querySelectorAll('#tab-ai-settings .tab-btn').forEach(btn => btn.classList.remove('active'));
    buttonElement.classList.add('active');

    // Update sub-tab content
    document.querySelectorAll('.ai-subtab-content').forEach(content => {
        content.style.display = 'none';
    });
    const targetTab = document.getElementById(`ai-subtab-${subTabName}`);
    targetTab.style.display = 'block';

    // Force reflow before loading data
    void targetTab.offsetHeight;

    // Load data for specific subtabs
    if (subTabName === 'tools') {
        loadTools();
    } else if (subTabName === 'prompts') {
        loadSystemPrompts();
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
        // Load models first to ensure cache is populated
        if (!window.cachedModels) {
            const modelsResponse = await fetch('/api/ai-settings/models', {
                credentials: 'same-origin'
            });
            const modelsData = await modelsResponse.json();
            if (modelsData.success) {
                window.cachedModels = modelsData.models;
            }
        }

        const response = await fetch('/api/ai-settings/defaults', {
            credentials: 'same-origin'
        });
        const data = await response.json();

        if (data.success) {
            const { defaultModel, defaultQuota, defaultResetPeriod, defaultVisionModel, whitelistMode, aiIdentity, maxMemoryMessages, maxToolIterations, defaultEnabledTools } = data.defaults;

            // Store default model ID globally for use in other functions
            window.defaultModelId = defaultModel;

            // Format display - dynamic model lookup
            let modelDisplay = defaultModel;
            let visionDisplay = defaultVisionModel;

            if (window.cachedModels) {
                const modelInfo = window.cachedModels.find(m => m.id === defaultModel);
                if (modelInfo) {
                    modelDisplay = modelInfo.displayName || modelInfo.name;
                }

                const visionInfo = window.cachedModels.find(m => m.id === defaultVisionModel);
                if (visionInfo) {
                    visionDisplay = visionInfo.displayName || visionInfo.name;
                }
            }

            const resetDisplay = defaultResetPeriod === 'per5Hours' ? 'Every 5 Hours' :
                                defaultResetPeriod === 'perDay' ? 'Every Day' : 'Every Month';

            // Format enabled tools display
            const enabledTools = defaultEnabledTools || [];
            let toolsDisplay;
            if (enabledTools.length === 0) {
                toolsDisplay = '<span style="opacity: 0.5; color: #f00;">No tools</span>';
            } else {
                const toolsList = enabledTools.slice(0, 5).join(', ');
                const moreCount = enabledTools.length > 5 ? ` +${enabledTools.length - 5} more` : '';
                toolsDisplay = `${toolsList}${moreCount}`;
            }

            // Update UI
            document.getElementById('defaultModel').textContent = modelDisplay;
            document.getElementById('defaultQuota').textContent = defaultQuota + ' requests';
            document.getElementById('defaultReset').textContent = resetDisplay;
            document.getElementById('defaultVisionModel').textContent = visionDisplay;
            document.getElementById('maxToolIterations').textContent = (maxToolIterations || 10) + ' iterations';
            document.getElementById('defaultEnabledTools').innerHTML = toolsDisplay;
            document.getElementById('aiIdentityDisplay').textContent = aiIdentity || 'You are DevBot26, an AI assistant responding via WhatsApp.';

            // Update max memory
            const maxMemory = maxMemoryMessages || 100;
            if (document.getElementById('maxMemoryMessages')) {
                document.getElementById('maxMemoryMessages').value = maxMemory;
            }
            if (document.getElementById('currentMaxMemory')) {
                document.getElementById('currentMaxMemory').textContent = maxMemory;
            }

            // Update whitelist mode
            const mode = whitelistMode || 'strict';
            document.getElementById('whitelistModeSelect').value = mode;
            const modeDisplay = mode === 'strict' ?
                '🔒 Strict Mode (Whitelist Only)' :
                '🤖 Auto Mode (New Users Added)';
            document.getElementById('whitelistModeDisplay').innerHTML = modeDisplay;
        } else {
            document.getElementById('defaultModel').textContent = 'Error loading';
            document.getElementById('defaultQuota').textContent = 'Error loading';
            document.getElementById('defaultReset').textContent = 'Error loading';
            document.getElementById('defaultVisionModel').textContent = 'Error loading';
            document.getElementById('whitelistModeDisplay').textContent = 'Error loading';
        }
    } catch (error) {
        console.error('Error loading AI defaults:', error);
        document.getElementById('defaultModel').textContent = 'Error loading';
        document.getElementById('defaultQuota').textContent = 'Error loading';
        document.getElementById('defaultReset').textContent = 'Error loading';
        document.getElementById('defaultVisionModel').textContent = 'Error loading';
        document.getElementById('whitelistModeDisplay').textContent = 'Error loading';
    }
}

// Update whitelist mode
async function updateWhitelistMode() {
    const mode = document.getElementById('whitelistModeSelect').value;

    try {
        const response = await fetch('/api/ai-settings/defaults', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({
                whitelistMode: mode
            })
        });

        const data = await response.json();

        if (data.success) {
            const modeDisplay = mode === 'strict' ?
                '🔒 Strict Mode (Whitelist Only)' :
                '🤖 Auto Mode (New Users Added)';
            document.getElementById('whitelistModeDisplay').innerHTML = modeDisplay;

            const modeLabel = mode === 'strict' ? 'Strict (Whitelist Only)' : 'Auto (Add New Users)';
            await showAlert('Success', `Whitelist mode changed to: ${modeLabel}`);
        } else {
            await showAlert('Error', 'Failed to update whitelist mode: ' + data.error);
            // Revert select
            loadAIDefaults();
        }
    } catch (error) {
        await showAlert('Error', 'Error updating whitelist mode: ' + error.message);
        // Revert select
        loadAIDefaults();
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
            const { defaultModel, defaultQuota, defaultResetPeriod, defaultVisionModel, aiIdentity, maxToolIterations, defaultEnabledTools } = data.defaults;

            // Populate model dropdowns dynamically
            await populateModelDropdown('editDefaultModel', { selectedValue: defaultModel });
            await populateModelDropdown('editDefaultVisionModel', {
                onlyVisionCapable: true,
                selectedValue: defaultVisionModel
            });

            document.getElementById('editDefaultQuota').value = defaultQuota;
            document.getElementById('editDefaultResetPeriod').value = defaultResetPeriod;
            document.getElementById('editAiIdentity').value = aiIdentity || 'You are DevBot26, an AI assistant responding via WhatsApp.';
            document.getElementById('editMaxToolIterations').value = maxToolIterations || 10;

            // Load and populate tools
            const enabledTools = defaultEnabledTools || [];
            try {
                const toolsResponse = await fetch('/api/tools', { credentials: 'same-origin' });
                const toolsData = await toolsResponse.json();

                if (toolsData.success && toolsData.tools) {
                    const toolsContainer = document.getElementById('editDefaultTools');
                    if (toolsData.tools.length === 0) {
                        toolsContainer.innerHTML = '<small style="opacity: 0.6;">No tools available</small>';
                    } else {
                        let html = '<small style="color: #0f0; opacity: 0.7; display: block; margin-bottom: 0.5rem;">Select which tools new users will have enabled by default.</small>';
                        toolsData.tools.forEach(tool => {
                            const checked = enabledTools.includes(tool.name) ? 'checked' : '';
                            const badge = tool.temporary ? ' <span class="badge temp" style="font-size: 0.65rem;">TEMP</span>' : '';
                            html += `
                                <label style="display: flex; align-items: center; margin-bottom: 0.5rem; cursor: pointer;">
                                    <input type="checkbox" name="defaultEnabledTool" value="${tool.name}" ${checked}
                                           style="margin-right: 0.75rem; cursor: pointer; width: 16px; height: 16px;
                                                  accent-color: #0f0; background: #000; border: 1px solid #0f0;">
                                    <span style="flex: 1;">${tool.name}${badge}</span>
                                </label>
                            `;
                        });
                        toolsContainer.innerHTML = html;
                    }
                }
            } catch (toolsError) {
                console.error('Failed to load tools:', toolsError);
                document.getElementById('editDefaultTools').innerHTML = '<small style="color: #f00;">Failed to load tools</small>';
            }

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
                const providerBadge = model.provider === 'openai' ?
                    '<span style="color: #0ff;">OpenAI</span>' :
                    '<span style="color: #f0f;">Anthropic</span>';
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
                        <td>${providerBadge}</td>
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
            tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; opacity: 0.6;">No models configured</td></tr>';
        }
    } catch (error) {
        console.error('Error loading models:', error);
        document.getElementById('modelsTableBody').innerHTML =
            '<tr><td colspan="6" style="text-align: center; color: #f00;">Error loading models</td></tr>';
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
            const { apiEndpoint, apiKey, apiTimeout, isOverridden } = data.config;

            // Display endpoint
            document.getElementById('apiEndpoint').textContent = apiEndpoint || 'Not configured';

            // Display masked API key
            if (apiKey) {
                const masked = apiKey.substring(0, 8) + '...' + apiKey.substring(apiKey.length - 4);
                document.getElementById('apiKey').textContent = masked;
            } else {
                document.getElementById('apiKey').textContent = 'Not configured';
            }

            // Display timeout in seconds
            const timeoutSeconds = Math.round(apiTimeout / 1000);
            document.getElementById('apiTimeout').textContent = `${timeoutSeconds}s`;

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
            document.getElementById('apiTimeout').textContent = 'Error loading';
        }
    } catch (error) {
        console.error('Error loading API config:', error);
        document.getElementById('apiEndpoint').textContent = 'Error loading';
        document.getElementById('apiKey').textContent = 'Error loading';
        document.getElementById('apiTimeout').textContent = 'Error loading';
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

            // Populate timeout in seconds
            const timeoutSeconds = Math.round(data.config.apiTimeout / 1000);
            document.getElementById('editApiTimeout').value = timeoutSeconds;

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
    document.getElementById('addModelProvider').value = 'anthropic';
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
                document.getElementById('editModelProvider').value = model.provider || 'anthropic';
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
        // Load models first to cache them
        if (!window.cachedModels) {
            const modelsResponse = await fetch('/api/ai-settings/models', {
                credentials: 'same-origin'
            });
            const modelsData = await modelsResponse.json();
            if (modelsData.success) {
                window.cachedModels = modelsData.models;
            }
        }

        // Then load whitelist
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

// Load rooms list
async function loadRooms() {
    try {
        const response = await fetch('/api/rooms', {
            credentials: 'same-origin'
        });
        const data = await response.json();

        if (data.success) {
            renderRooms(data.rooms);
        } else {
            renderRoomsError('Failed to load rooms');
        }
    } catch (error) {
        renderRoomsError('Error loading rooms: ' + error.message);
    }
}

// Render rooms table
function renderRooms(rooms) {
    const tbody = document.getElementById('roomsTableBody');

    if (!rooms || rooms.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" style="text-align: center; opacity: 0.6;">No rooms configured</td></tr>';
        return;
    }

    tbody.innerHTML = rooms.map(room => {
        const isGroup = room.roomId.includes('@g.us');
        const roomType = isGroup ? '<span style="color: #0ff;">Group</span>' : '<span style="color: #ff0;">Private</span>';

        const aiCmdStatus = isGroup
            ? (room.allowAiCommand !== false ? '<span style="color: #0f0;">✓ On</span>' : '<span style="color: #f00;">✗ Off</span>')
            : '<span style="opacity: 0.5;">N/A</span>';

        // Commands status with better labeling
        const allowedCommands = room.allowedCommands || [];
        let cmdStatus, allowedCmdsDisplay;

        if (room.allowCommands === false) {
            // Whitelist mode
            if (allowedCommands.length > 0) {
                cmdStatus = '<span style="color: #ff0;">⚡ Selective</span>';
                const cmdsList = allowedCommands.slice(0, 3).join(', ');
                const moreCount = allowedCommands.length > 3 ? ` +${allowedCommands.length - 3}` : '';
                allowedCmdsDisplay = `<span style="color: #0f0; font-size: 0.85rem;">${cmdsList}${moreCount}</span>`;
            } else {
                cmdStatus = '<span style="color: #f00;">✗ All Off</span>';
                allowedCmdsDisplay = '<span style="opacity: 0.5; color: #f00;">None</span>';
            }
        } else {
            // All enabled mode
            cmdStatus = '<span style="color: #0f0;">✓ All On</span>';
            allowedCmdsDisplay = '<span style="opacity: 0.5;">—</span>';
        }

        const aiFallbackStatus = isGroup
            ? (room.allowAI !== false ? '<span style="color: #0f0;">✓ On</span>' : '<span style="color: #f00;">✗ Off</span>')
            : '<span style="opacity: 0.5;">N/A</span>';

        const ignoreStatus = room.ignoreAll ? '<span style="color: #f00;">✓ On</span>' : '<span style="color: #0f0;">✗ Off</span>';

        return `
            <tr>
                <td style="font-family: monospace; font-size: 0.85rem;">${room.roomId}</td>
                <td>${room.name || '<span style="opacity: 0.5;">—</span>'}</td>
                <td>${roomType}</td>
                <td>${aiCmdStatus}</td>
                <td>${cmdStatus}</td>
                <td>${allowedCmdsDisplay}</td>
                <td>${aiFallbackStatus}</td>
                <td>${ignoreStatus}</td>
                <td>
                    <button class="btn btn-small" onclick="showEditRoomModal('${room.roomId}')">Edit</button>
                </td>
            </tr>
        `;
    }).join('');
}

function renderRoomsError(message) {
    const tbody = document.getElementById('roomsTableBody');
    tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; color: #f00;">${message}</td></tr>`;
}

// Show add room modal
function showAddRoomModal() {
    document.getElementById('roomId').value = '';
    document.getElementById('roomName').value = '';
    document.getElementById('roomAllowAiCommand').checked = true;
    document.getElementById('roomAllowAI').checked = true;
    document.getElementById('roomAllowCommands').checked = true;
    document.getElementById('roomIgnoreAll').checked = false;

    // Show AI options by default (will hide if private detected on submit)
    document.getElementById('roomAllowAIGroup').style.display = 'block';
    document.getElementById('roomAllowAIFallbackGroup').style.display = 'block';

    document.getElementById('addRoomModal').showModal();
}

// Show edit room modal
async function showEditRoomModal(roomId) {
    try {
        const response = await fetch('/api/rooms', {
            credentials: 'same-origin'
        });
        const data = await response.json();

        if (data.success) {
            const room = data.rooms.find(r => r.roomId === roomId);
            if (room) {
                const isGroup = room.roomId.includes('@g.us');

                document.getElementById('editRoomId').value = room.roomId;
                document.getElementById('editRoomName').value = room.name || '';
                document.getElementById('editRoomAllowAiCommand').checked = room.allowAiCommand !== false;
                document.getElementById('editRoomAllowAI').checked = room.allowAI !== false;
                document.getElementById('editRoomIgnoreAll').checked = room.ignoreAll === true;

                // Hide AI options for private chats
                if (isGroup) {
                    document.getElementById('editRoomAllowAiCmdGroup').style.display = 'block';
                    document.getElementById('editRoomAllowAIGroup').style.display = 'block';
                } else {
                    document.getElementById('editRoomAllowAiCmdGroup').style.display = 'none';
                    document.getElementById('editRoomAllowAIGroup').style.display = 'none';
                }

                // Determine current mode
                const allowCommands = room.allowCommands !== false;
                const allowedCommands = room.allowedCommands || [];

                // Load command list
                await loadRoomCommands(allowedCommands);

                // If all-enabled mode (allowCommands: true), manually check all boxes
                // because loadRoomCommands received empty array
                if (allowCommands) {
                    const checkboxes = document.querySelectorAll('input[name="allowedCommand"]');
                    checkboxes.forEach(cb => cb.checked = true);
                }
                // If whitelist mode (allowCommands: false), loadRoomCommands already set correct state

                // Always show command list
                document.getElementById('editRoomCommandsGroup').style.display = 'block';

                // Set master checkbox as informational indicator
                document.getElementById('editRoomAllowCommands').checked = allowCommands;

                document.getElementById('editRoomModal').showModal();
            }
        }
    } catch (error) {
        await showAlert('Error', 'Failed to load room data: ' + error.message);
    }
}

// Load and render command list for room
async function loadRoomCommands(allowedCommands = []) {
    try {
        const response = await fetch('/api/commands', {
            credentials: 'same-origin'
        });
        const data = await response.json();

        const container = document.getElementById('editRoomCommandsList');

        if (data.success && data.commands && data.commands.length > 0) {
            let html = '<small style="color: #0f0; opacity: 0.7; display: block; margin-bottom: 0.5rem;">Check commands you want to allow. Uncheck to block specific commands.</small>';

            data.commands.forEach(cmd => {
                const checked = allowedCommands.includes(cmd.name) ? 'checked' : '';
                const badge = cmd.temporary ? ' <span class="badge temp" style="font-size: 0.65rem;">TEMP</span>' : '';
                html += `
                    <label style="display: flex; align-items: center; margin-bottom: 0.5rem; cursor: pointer;">
                        <input type="checkbox" name="allowedCommand" value="${cmd.name}" ${checked}
                               style="margin-right: 0.75rem; cursor: pointer; width: 16px; height: 16px;
                                      accent-color: #0f0; background: #000; border: 1px solid #0f0;">
                        <span style="flex: 1;">${cmd.name}${badge}</span>
                    </label>
                `;
            });
            container.innerHTML = html;
        } else {
            container.innerHTML = '<small style="opacity: 0.6;">No commands available</small>';
        }
    } catch (error) {
        console.error('Failed to load commands:', error);
        document.getElementById('editRoomCommandsList').innerHTML = '<small style="color: #f00;">Failed to load commands</small>';
    }
}

// Delete room
async function deleteRoom(roomId) {
    const confirmed = await showConfirm('Remove Room', `Remove room configuration for ${roomId}?`);
    if (!confirmed) return;

    try {
        const response = await fetch(`/api/rooms/${encodeURIComponent(roomId)}`, {
            method: 'DELETE',
            credentials: 'same-origin'
        });
        const data = await response.json();

        if (data.success) {
            await showAlert('Success', 'Room removed');
            loadRooms();
        } else {
            await showAlert('Error', 'Failed to remove room');
        }
    } catch (error) {
        await showAlert('Error', 'Error removing room: ' + error.message);
    }
}
async function loadMemory() {
    try {
        const response = await fetch('/api/memory', {
            credentials: 'same-origin'
        });
        const data = await response.json();

        if (data.success) {
            renderMemory(data.memories);
        } else {
            renderMemoryError('Failed to load memory');
        }
    } catch (error) {
        renderMemoryError('Error loading memory: ' + error.message);
    }
}

// Render memory table
function renderMemory(memories) {
    const tbody = document.getElementById('memoryTableBody');

    if (!memories || memories.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; opacity: 0.6;">No conversation memory stored</td></tr>';
        return;
    }

    tbody.innerHTML = memories.map(mem => {
        const lastUpdated = new Date(mem.lastUpdated).toLocaleString();

        // Determine display name
        let displayName = 'Unknown';
        let chatType = '';

        if (mem.groupTitle) {
            // Group chat
            displayName = mem.groupTitle;
            chatType = '👥 ';
        } else if (mem.pushName) {
            // Private chat
            displayName = mem.pushName;
            chatType = '👤 ';
        } else {
            // No name available
            displayName = mem.roomId.includes('@g.us') ? 'Group Chat' : 'Private Chat';
            chatType = mem.roomId.includes('@g.us') ? '👥 ' : '👤 ';
        }

        // Extract clean ID (remove domain)
        const cleanId = mem.roomId.split('@')[0];

        return `
            <tr>
                <td style="font-family: monospace; font-size: 0.85rem;">${cleanId}</td>
                <td>${chatType}<strong>${displayName}</strong></td>
                <td>${mem.messageCount} messages</td>
                <td style="opacity: 0.8;">${lastUpdated}</td>
                <td>
                    <button class="btn btn-small" onclick="viewMemory('${mem.roomId}')">View</button>
                    <button class="btn btn-small danger" onclick="clearMemory('${mem.roomId}')">Clear</button>
                </td>
            </tr>
        `;
    }).join('');
}

function renderMemoryError(message) {
    const tbody = document.getElementById('memoryTableBody');
    tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: #f00;">${message}</td></tr>`;
}

// View specific memory
async function viewMemory(roomId) {
    try {
        const response = await fetch(`/api/memory/${encodeURIComponent(roomId)}`, {
            credentials: 'same-origin'
        });
        const data = await response.json();

        if (data.success) {
            const messages = data.messages || [];
            const messageText = messages.map((msg, i) =>
                `[${i + 1}] ${msg.role}: ${msg.content.substring(0, 100)}${msg.content.length > 100 ? '...' : ''}`
            ).join('\n');

            await showAlert('Memory: ' + roomId, messageText || 'No messages');
        } else {
            await showAlert('Error', 'Failed to load memory details');
        }
    } catch (error) {
        await showAlert('Error', 'Error loading memory: ' + error.message);
    }
}

// Clear specific memory
async function clearMemory(roomId) {
    const confirmed = await showConfirm('Clear Memory', `Clear conversation memory for ${roomId}?`);
    if (!confirmed) return;

    try {
        const response = await fetch(`/api/memory/${encodeURIComponent(roomId)}`, {
            method: 'DELETE',
            credentials: 'same-origin'
        });
        const data = await response.json();

        if (data.success) {
            await showAlert('Success', 'Memory cleared');
            loadMemory();
        } else {
            await showAlert('Error', 'Failed to clear memory');
        }
    } catch (error) {
        await showAlert('Error', 'Error clearing memory: ' + error.message);
    }
}

// Clear all memory
async function clearAllMemory() {
    const confirmed = await showConfirm('Clear All Memory', 'This will clear ALL conversation memory. Continue?');
    if (!confirmed) return;

    try {
        const response = await fetch('/api/memory', {
            credentials: 'same-origin'
        });
        const data = await response.json();

        if (data.success && data.memories) {
            let cleared = 0;
            for (const mem of data.memories) {
                const res = await fetch(`/api/memory/${encodeURIComponent(mem.roomId)}`, {
                    method: 'DELETE',
                    credentials: 'same-origin'
                });
                if (res.ok) cleared++;
            }
            await showAlert('Success', `Cleared ${cleared} conversation memories`);
            loadMemory();
        } else {
            await showAlert('Error', 'Failed to fetch memory list');
        }
    } catch (error) {
        await showAlert('Error', 'Error clearing all memory: ' + error.message);
    }
}

// Update max memory messages setting
async function updateMaxMemory() {
    const maxMemory = parseInt(document.getElementById('maxMemoryMessages').value);

    if (isNaN(maxMemory) || maxMemory < 10 || maxMemory > 500) {
        await showAlert('Error', 'Max memory must be between 10 and 500');
        return;
    }

    try {
        const response = await fetch('/api/ai-settings/defaults', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ maxMemoryMessages: maxMemory })
        });

        const data = await response.json();

        if (data.success) {
            document.getElementById('currentMaxMemory').textContent = maxMemory;
            await showAlert('Success', `Max memory updated to ${maxMemory} messages`);
        } else {
            await showAlert('Error', 'Failed to update max memory');
        }
    } catch (error) {
        await showAlert('Error', 'Error updating max memory: ' + error.message);
    }
}

// Render whitelist table
function renderWhitelist(users) {
    const tbody = document.getElementById('whitelistTableBody');

    if (users.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; opacity: 0.6;">No users in AI whitelist</td></tr>';
        return;
    }

    tbody.innerHTML = users.map((user, index) => {
        // Handle both old format (string) and new format (object)
        const number = typeof user === 'string' ? user : user.number;
        const model = typeof user === 'string' ? (window.defaultModelId || 'unknown') : user.model;
        const pushName = typeof user === 'object' && user.pushName ? user.pushName : 'Unknown';
        const jid = typeof user === 'object' && user.jid ? user.jid : number;
        const quota = typeof user === 'object' && user.quota ? user.quota : 100;
        const usageCount = typeof user === 'object' && user.usageCount ? user.usageCount : 0;
        const resetPeriod = typeof user === 'object' && user.resetPeriod ? user.resetPeriod : 'perDay';
        const enabledTools = typeof user === 'object' && user.enabledTools ? user.enabledTools : [];
        const maxToolIterations = typeof user === 'object' && user.maxToolIterations !== undefined ? user.maxToolIterations : null;

        // Store in global array for easy access
        if (!window.whitelistUserData) window.whitelistUserData = {};
        window.whitelistUserData[number] = { enabledTools, model, quota, resetPeriod, usageCount, pushName, maxToolIterations };

        // Extract JID number (before @ symbol)
        const jidNumber = jid.split('@')[0];
        const encodedNumber = encodeURIComponent(number);
        const encodedModel = encodeURIComponent(model);
        const encodedPushName = encodeURIComponent(pushName);
        const encodedQuota = quota;
        const encodedResetPeriod = resetPeriod;

        // Format model name for display - use cached models list
        let modelDisplay = model; // Fallback to model ID if not found
        if (window.cachedModels && window.cachedModels.length > 0) {
            const modelInfo = window.cachedModels.find(m => m.id === model);
            if (modelInfo) {
                modelDisplay = modelInfo.displayName || modelInfo.name;
            }
        }

        // Format reset period
        const resetDisplay = resetPeriod === 'per5Hours' ? 'Every 5h' :
                            resetPeriod === 'perDay' ? 'Daily' : 'Monthly';

        // Usage percentage for color coding
        const usagePercent = (usageCount / quota) * 100;
        const usageColor = usagePercent >= 90 ? '#f00' : usagePercent >= 70 ? '#ff0' : '#0f0';

        // Format enabled tools display
        let toolsDisplay;
        if (enabledTools.length === 0) {
            toolsDisplay = '<span style="opacity: 0.5; color: #f00;">No tools</span>';
        } else {
            const toolsList = enabledTools.slice(0, 3).join(', ');
            const moreCount = enabledTools.length > 3 ? ` +${enabledTools.length - 3}` : '';
            toolsDisplay = `<span style="font-size: 0.85rem;">${toolsList}${moreCount}</span>`;
        }

        return `
            <tr>
                <td style="text-align: center;">
                    <input type="checkbox" class="user-checkbox" data-number="${encodedNumber}" onchange="updateBatchToolbar()"
                           style="cursor: pointer; width: 16px; height: 16px; accent-color: #0f0; background: #000; border: 1px solid #0f0;">
                </td>
                <td style="font-family: monospace; font-size: 0.85rem;">${jidNumber}</td>
                <td><strong>${pushName}</strong></td>
                <td><span class="badge">${modelDisplay}</span></td>
                <td style="text-align: center; color: ${usageColor};">${usageCount}/${quota}</td>
                <td style="text-align: center;"><small>${resetDisplay}</small></td>
                <td style="font-size: 0.85rem;">${toolsDisplay}</td>
                <td>
                    <button class="btn btn-small" onclick="showEditWhitelistModalFromNumber('${encodedNumber}', '${encodedModel}', '${encodedPushName}', ${encodedQuota}, '${encodedResetPeriod}', ${user.usageCount || 0})" style="margin-right: 0.5rem;">Edit</button>
                    <button class="btn btn-small danger" onclick="removeWhitelistNumber('${encodedNumber}')">Remove</button>
                </td>
            </tr>
        `;
    }).join('');
}

// Wrapper function to get enabledTools from global storage
async function showEditWhitelistModalFromNumber(encodedNumber, encodedModel, encodedPushName, quota, resetPeriod, usageCount) {
    const number = decodeURIComponent(encodedNumber);
    const userData = window.whitelistUserData && window.whitelistUserData[number];
    const enabledTools = userData ? userData.enabledTools : [];
    const maxToolIterations = userData ? userData.maxToolIterations : null;
    await showEditWhitelistModal(encodedNumber, encodedModel, encodedPushName, quota, resetPeriod, usageCount, enabledTools, maxToolIterations);
}

// Render whitelist error
function renderWhitelistError(message) {
    const tbody = document.getElementById('whitelistTableBody');
    tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: #f00;">${message}</td></tr>`;
}

// ============================================
// Batch Operations for Whitelist
// ============================================

// Show batch operation progress
function showBatchProgress(message, current = 0, total = 0) {
    let progressDiv = document.getElementById('batchProgress');

    if (!progressDiv) {
        // Create progress indicator
        progressDiv = document.createElement('div');
        progressDiv.id = 'batchProgress';
        progressDiv.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: #000;
            border: 2px solid #0f0;
            padding: 2rem;
            border-radius: 8px;
            z-index: 10000;
            min-width: 300px;
            text-align: center;
            box-shadow: 0 0 20px rgba(0, 255, 0, 0.3);
            display: block;
        `;
        document.body.appendChild(progressDiv);
    }

    const progressText = total > 0 ? `${current}/${total}` : '';
    progressDiv.innerHTML = `
        <div style="color: #0f0; font-size: 1.2rem; margin-bottom: 1rem;">
            ⟳ ${message}
        </div>
        ${progressText ? `<div style="color: #0f0; font-size: 1.5rem; font-weight: bold;">${progressText}</div>` : ''}
        ${total > 0 ? `
            <div style="margin-top: 1rem; background: #001a00; border: 1px solid #0f0; height: 20px; border-radius: 10px; overflow: hidden;">
                <div style="background: #0f0; height: 100%; width: ${(current/total)*100}%; transition: width 0.3s;"></div>
            </div>
        ` : `<div style="margin-top: 1rem; color: #0f0;">⏳</div>`}
    `;
}

// Hide batch operation progress
function hideBatchProgress() {
    const progressDiv = document.getElementById('batchProgress');
    if (progressDiv) {
        progressDiv.remove();
    }
}

// Toggle select all checkboxes
function toggleSelectAll(checkbox) {
    const checkboxes = document.querySelectorAll('.user-checkbox');
    checkboxes.forEach(cb => cb.checked = checkbox.checked);
    updateBatchToolbar();
}

// Update batch toolbar visibility and count
function updateBatchToolbar() {
    const checkboxes = document.querySelectorAll('.user-checkbox:checked');
    const count = checkboxes.length;
    const toolbar = document.getElementById('batchOpsToolbar');
    const countSpan = document.getElementById('selectedCount');
    const selectAll = document.getElementById('selectAllWhitelist');

    if (count > 0) {
        toolbar.style.display = 'block';
        countSpan.textContent = count;
    } else {
        toolbar.style.display = 'none';
        selectAll.checked = false;
    }
}

// Clear all selections
function clearSelection() {
    document.querySelectorAll('.user-checkbox').forEach(cb => cb.checked = false);
    document.getElementById('selectAllWhitelist').checked = false;
    updateBatchToolbar();
}

// Get selected user numbers
function getSelectedUsers() {
    const checkboxes = document.querySelectorAll('.user-checkbox:checked');
    return Array.from(checkboxes).map(cb => decodeURIComponent(cb.dataset.number));
}

// Batch delete users
async function batchDelete() {
    const users = getSelectedUsers();
    if (users.length === 0) return;

    const confirmed = await showConfirm(
        'Delete Users',
        `Are you sure you want to delete ${users.length} user(s) from whitelist?\n\nThis cannot be undone.`
    );

    if (!confirmed) return;

    try {
        showBatchProgress('Deleting users...', 0, users.length);

        let successCount = 0;
        let failCount = 0;

        for (let i = 0; i < users.length; i++) {
            const number = users[i];
            showBatchProgress('Deleting users...', i + 1, users.length);

            try {
                const response = await fetch(`/api/whitelist/${encodeURIComponent(number)}`, {
                    method: 'DELETE'
                });

                if (response.ok) {
                    successCount++;
                } else {
                    failCount++;
                }
            } catch (error) {
                failCount++;
            }
        }

        hideBatchProgress();

        if (successCount > 0) {
            await showAlert('Success', `Deleted ${successCount} user(s) successfully${failCount > 0 ? `, ${failCount} failed` : ''}`);
            await loadWhitelist(); // Reload whitelist
            clearSelection();
        } else {
            await showAlert('Error', 'Failed to delete users');
        }
    } catch (error) {
        hideBatchProgress();
        await showAlert('Error', 'Error during batch delete: ' + error.message);
    }
}

// Show batch model change modal
async function showBatchModelModal() {
    const users = getSelectedUsers();
    if (users.length === 0) return;

    const models = window.cachedModels || [];
    if (models.length === 0) {
        await showAlert('Error', 'No models available');
        return;
    }

    const modelOptions = models.filter(m => m.enabled).map(m =>
        `<option value="${m.id}">${m.displayName || m.name}</option>`
    ).join('');

    const modal = document.createElement('dialog');
    modal.innerHTML = `
        <div class="modal-content">
            <h3 class="modal-title">Change Model (${users.length} users)</h3>
            <div class="modal-body">
                <label style="display: block; margin-bottom: 0.5rem; color: #0f0;">Select Model:</label>
                <select id="batchModelSelect" style="width: 100%; background: #000; color: #0f0; border: 1px solid #0f0; padding: 0.5rem; font-family: 'Courier New', monospace; font-size: 0.9rem;">
                    ${modelOptions}
                </select>
            </div>
            <div class="modal-buttons">
                <button class="btn" id="batchModelCancel">Cancel</button>
                <button class="btn" id="batchModelSubmit">Update</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
    modal.showModal();

    modal.querySelector('#batchModelCancel').onclick = () => {
        modal.close();
        modal.remove();
    };

    modal.querySelector('#batchModelSubmit').onclick = async () => {
        const selectedModel = document.getElementById('batchModelSelect').value;

        // Close modal first
        modal.close();
        modal.remove();

        // Let browser render before showing loading
        await new Promise(resolve => setTimeout(resolve, 100));

        await executeBatchUpdate(users, { model: selectedModel }, 'model');
    };
}

// Show batch quota update modal
async function showBatchQuotaModal() {
    const users = getSelectedUsers();
    if (users.length === 0) return;

    const modal = document.createElement('dialog');
    modal.innerHTML = `
        <div class="modal-content">
            <h3 class="modal-title">Update Quota (${users.length} users)</h3>
            <div class="modal-body">
                <label style="display: block; margin-bottom: 0.5rem; color: #0f0;">New Quota:</label>
                <input type="number" id="batchQuotaInput" min="1" max="10000" value="30" style="width: 100%; background: #000; color: #0f0; border: 1px solid #0f0; padding: 0.5rem; font-family: 'Courier New', monospace; font-size: 0.9rem;">
            </div>
            <div class="modal-buttons">
                <button class="btn" id="batchQuotaCancel">Cancel</button>
                <button class="btn" id="batchQuotaSubmit">Update</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
    modal.showModal();

    modal.querySelector('#batchQuotaCancel').onclick = () => {
        modal.close();
        modal.remove();
    };

    modal.querySelector('#batchQuotaSubmit').onclick = async () => {
        const quota = parseInt(document.getElementById('batchQuotaInput').value);
        if (quota < 1 || quota > 10000) {
            await showAlert('Error', 'Quota must be between 1 and 10000');
            return;
        }

        // Close modal first
        modal.close();
        modal.remove();

        // Let browser render before showing loading
        await new Promise(resolve => setTimeout(resolve, 100));

        await executeBatchUpdate(users, { quota }, 'quota');
    };
}

// Show batch reset period modal
async function showBatchResetModal() {
    const users = getSelectedUsers();
    if (users.length === 0) return;

    const modal = document.createElement('dialog');
    modal.innerHTML = `
        <div class="modal-content">
            <h3 class="modal-title">Change Reset Period (${users.length} users)</h3>
            <div class="modal-body">
                <label style="display: block; margin-bottom: 0.5rem; color: #0f0;">Reset Period:</label>
                <select id="batchResetSelect" style="width: 100%; background: #000; color: #0f0; border: 1px solid #0f0; padding: 0.5rem; font-family: 'Courier New', monospace; font-size: 0.9rem;">
                    <option value="per5Hours">Every 5 Hours</option>
                    <option value="perDay" selected>Daily</option>
                    <option value="perMonth">Monthly</option>
                </select>
            </div>
            <div class="modal-buttons">
                <button class="btn" id="batchResetCancel">Cancel</button>
                <button class="btn" id="batchResetSubmit">Update</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
    modal.showModal();

    modal.querySelector('#batchResetCancel').onclick = () => {
        modal.close();
        modal.remove();
    };

    modal.querySelector('#batchResetSubmit').onclick = async () => {
        const resetPeriod = document.getElementById('batchResetSelect').value;

        // Close modal first
        modal.close();
        modal.remove();

        // Let browser render before showing loading
        await new Promise(resolve => setTimeout(resolve, 100));

        await executeBatchUpdate(users, { resetPeriod }, 'reset period');
    };
}

// Show batch tools update modal
async function showBatchToolsModal() {
    const users = getSelectedUsers();
    if (users.length === 0) return;

    // Get available tools
    const availableTools = window.availableAiTools || [];
    if (availableTools.length === 0) {
        await showAlert('Error', 'No tools available');
        return;
    }

    const toolCheckboxes = availableTools.map(tool => `
        <label style="display: flex; align-items: center; margin-bottom: 0.5rem; cursor: pointer;">
            <input type="checkbox" class="batch-tool-checkbox" value="${tool.name}"
                   style="margin-right: 0.75rem; cursor: pointer; width: 16px; height: 16px;
                          accent-color: #0f0; background: #000; border: 1px solid #0f0;">
            <span style="flex: 1; color: #0f0; font-family: 'Courier New', monospace;">${tool.name}</span>
            <span style="opacity: 0.7; font-size: 0.85rem; margin-left: 0.5rem;">${tool.description}</span>
        </label>
    `).join('');

    const modal = document.createElement('dialog');
    modal.innerHTML = `
        <div class="modal-content">
            <h3 class="modal-title">Update Tools (${users.length} users)</h3>
            <div class="modal-body">
                <div style="margin-bottom: 1rem;">
                    <button class="btn btn-small" onclick="document.querySelectorAll('.batch-tool-checkbox').forEach(cb => cb.checked = true)" style="margin-right: 0.5rem;">Select All</button>
                    <button class="btn btn-small" onclick="document.querySelectorAll('.batch-tool-checkbox').forEach(cb => cb.checked = false)">Clear All</button>
                </div>
                <div style="max-height: 300px; overflow-y: auto; border: 1px solid #0f0; padding: 0.5rem; background: #001a00;">
                    ${toolCheckboxes}
                </div>
            </div>
            <div class="modal-buttons">
                <button class="btn" id="batchToolsCancel">Cancel</button>
                <button class="btn" id="batchToolsSubmit">Update</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
    modal.showModal();

    modal.querySelector('#batchToolsCancel').onclick = () => {
        modal.close();
        modal.remove();
    };

    modal.querySelector('#batchToolsSubmit').onclick = async () => {
        const selectedTools = Array.from(document.querySelectorAll('.batch-tool-checkbox:checked'))
            .map(cb => cb.value);

        // Close modal first
        modal.close();
        modal.remove();

        // Let browser render before showing loading
        await new Promise(resolve => setTimeout(resolve, 100));

        await executeBatchUpdate(users, { enabledTools: selectedTools }, 'tools');
    };
}

// Execute batch update
async function executeBatchUpdate(users, updateData, fieldName) {
    try {
        showBatchProgress(`Updating ${fieldName}...`, 0, users.length);

        let successCount = 0;
        let failCount = 0;

        for (let i = 0; i < users.length; i++) {
            const number = users[i];
            showBatchProgress(`Updating ${fieldName}...`, i + 1, users.length);

            try {
                // Get current user data
                const userData = window.whitelistUserData[number];
                if (!userData) {
                    failCount++;
                    continue;
                }

                // Merge update with current data
                const payload = {
                    model: updateData.model || userData.model,
                    pushName: userData.pushName,
                    quota: updateData.quota !== undefined ? updateData.quota : userData.quota,
                    usageCount: userData.usageCount,
                    resetPeriod: updateData.resetPeriod || userData.resetPeriod,
                    enabledTools: updateData.enabledTools !== undefined ? updateData.enabledTools : userData.enabledTools
                };

                const response = await fetch(`/api/whitelist/${encodeURIComponent(number)}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                if (response.ok) {
                    successCount++;
                } else {
                    failCount++;
                }
            } catch (error) {
                failCount++;
            }
        }

        hideBatchProgress();

        if (successCount > 0) {
            await showAlert('Success', `Updated ${fieldName} for ${successCount} user(s)${failCount > 0 ? `, ${failCount} failed` : ''}`);
            await loadWhitelist(); // Reload whitelist
            clearSelection();
        } else {
            await showAlert('Error', `Failed to update ${fieldName}`);
        }
    } catch (error) {
        hideBatchProgress();
        await showAlert('Error', 'Error during batch update: ' + error.message);
    }
}

// ============================================
// End Batch Operations
// ============================================

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
async function showEditWhitelistModal(encodedNumber, encodedModel, encodedPushName = '', quota = 100, resetPeriod = 'perDay', usageCount = 0, enabledTools = [], maxToolIterations = null) {
    const number = decodeURIComponent(encodedNumber);
    const model = decodeURIComponent(encodedModel);
    const pushName = encodedPushName ? decodeURIComponent(encodedPushName) : '';

    const modal = document.getElementById('editWhitelistModal');
    document.getElementById('editWhitelistNumber').value = number;
    document.getElementById('editWhitelistPushName').value = pushName;
    document.getElementById('editWhitelistQuota').value = quota;
    document.getElementById('editWhitelistUsage').value = usageCount;
    document.getElementById('editWhitelistResetPeriod').value = resetPeriod;
    document.getElementById('editWhitelistMaxToolIterations').value = maxToolIterations !== null ? maxToolIterations : '';

    // Populate model dropdown dynamically
    await populateModelDropdown('editWhitelistModel', { selectedValue: model });

    // Load and populate tools
    try {
        const response = await fetch('/api/tools', { credentials: 'same-origin' });
        const data = await response.json();

        if (data.success && data.tools) {
            const toolsContainer = document.getElementById('editWhitelistTools');
            if (data.tools.length === 0) {
                toolsContainer.innerHTML = '<small style="opacity: 0.6;">No tools available</small>';
            } else {
                let html = '<small style="color: #0f0; opacity: 0.7; display: block; margin-bottom: 0.5rem;">Select which tools this user can use. Uncheck all to disable tools.</small>';
                data.tools.forEach(tool => {
                    const checked = enabledTools.includes(tool.name) ? 'checked' : '';
                    const badge = tool.temporary ? ' <span class="badge temp" style="font-size: 0.65rem;">TEMP</span>' : '';
                    html += `
                        <label style="display: flex; align-items: center; margin-bottom: 0.5rem; cursor: pointer;">
                            <input type="checkbox" name="enabledTool" value="${tool.name}" ${checked}
                                   style="margin-right: 0.75rem; cursor: pointer; width: 16px; height: 16px;
                                          accent-color: #0f0; background: #000; border: 1px solid #0f0;">
                            <span style="flex: 1;">${tool.name}${badge}</span>
                        </label>
                    `;
                });
                toolsContainer.innerHTML = html;
            }
        }
    } catch (error) {
        console.error('Failed to load tools:', error);
        document.getElementById('editWhitelistTools').innerHTML = '<small style="color: #f00;">Failed to load tools</small>';
    }

    // Store original number for API call
    modal.dataset.number = number;

    modal.showModal();
}

// Add room modal handlers
document.getElementById('addRoomCancel').addEventListener('click', () => {
    document.getElementById('addRoomModal').close();
});

document.getElementById('addRoomSubmit').addEventListener('click', async () => {
    const roomId = document.getElementById('roomId').value.trim();
    const name = document.getElementById('roomName').value.trim();
    const allowAiCommand = document.getElementById('roomAllowAiCommand').checked;
    const allowAI = document.getElementById('roomAllowAI').checked;
    const allowCommands = document.getElementById('roomAllowCommands').checked;
    const ignoreAll = document.getElementById('roomIgnoreAll').checked;

    if (!roomId) {
        await showAlert('Error', 'Room ID is required');
        return;
    }

    // Detect if group or private
    const isGroup = roomId.includes('@g.us');

    try {
        const response = await fetch('/api/rooms', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({
                roomId,
                name: name || null,
                allowAiCommand: isGroup ? allowAiCommand : null,
                allowAI: isGroup ? allowAI : null, // null for private = N/A
                allowCommands,
                ignoreAll
            })
        });

        const data = await response.json();

        if (data.success) {
            document.getElementById('addRoomModal').close();
            await showAlert('Success', 'Room added successfully!');
            loadRooms();
        } else {
            await showAlert('Error', data.error || 'Failed to add room');
        }
    } catch (error) {
        await showAlert('Error', 'Error adding room: ' + error.message);
    }
});

// Edit room modal handlers
document.getElementById('editRoomCancel').addEventListener('click', () => {
    document.getElementById('editRoomModal').close();
});

// Master checkbox is now informational only - doesn't control individual checkboxes
// Individual checkboxes are the source of truth

document.getElementById('editRoomDelete').addEventListener('click', async () => {
    const roomId = document.getElementById('editRoomId').value.trim();
    document.getElementById('editRoomModal').close();
    await deleteRoom(roomId);
});

document.getElementById('editRoomSubmit').addEventListener('click', async () => {
    const roomId = document.getElementById('editRoomId').value.trim();
    const name = document.getElementById('editRoomName').value.trim();
    const allowAiCommand = document.getElementById('editRoomAllowAiCommand').checked;
    const allowAI = document.getElementById('editRoomAllowAI').checked;
    const ignoreAll = document.getElementById('editRoomIgnoreAll').checked;

    // Collect checked commands
    const allowedCommandsCheckboxes = document.querySelectorAll('input[name="allowedCommand"]:checked');
    const checkedCommands = Array.from(allowedCommandsCheckboxes).map(cb => cb.value);

    // Count total available commands
    const totalCommands = document.querySelectorAll('input[name="allowedCommand"]').length;

    // Detect if group or private
    const isGroup = roomId.includes('@g.us');

    // Auto-detect allowCommands based on individual checkboxes:
    // - If ALL commands are checked → allowCommands = true, allowedCommands = []
    // - If SOME are unchecked → allowCommands = false, allowedCommands = [checked list]
    let allowCommands, allowedCommands;

    if (checkedCommands.length === totalCommands) {
        // All checked → enable all commands mode
        allowCommands = true;
        allowedCommands = [];
    } else {
        // Some unchecked → whitelist mode
        allowCommands = false;
        allowedCommands = checkedCommands;
    }

    try {
        const response = await fetch(`/api/rooms/${encodeURIComponent(roomId)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({
                name: name || null,
                allowAiCommand: isGroup ? allowAiCommand : null,
                allowAI: isGroup ? allowAI : null,
                allowCommands,
                ignoreAll,
                allowedCommands
            })
        });

        const data = await response.json();

        if (data.success) {
            document.getElementById('editRoomModal').close();
            await showAlert('Success', 'Room settings updated!');
            loadRooms();
        } else {
            await showAlert('Error', data.error || 'Failed to update room');
        }
    } catch (error) {
        await showAlert('Error', 'Error updating room: ' + error.message);
    }
});

// Restore tab state from URL hash on page load
function restoreTabFromURL() {
    const hash = window.location.hash.slice(1); // Remove '#'

    if (!hash) {
        // Default to terminal tab
        return;
    }

    const parts = hash.split('/');
    const mainTab = parts[0];
    const subTab = parts[1];

    // Find and click the appropriate main tab button
    const tabButtons = document.querySelectorAll('.header .tab-btn');
    let targetButton = null;

    tabButtons.forEach(btn => {
        const onclickAttr = btn.getAttribute('onclick');
        if (onclickAttr && onclickAttr.includes(`'${mainTab}'`)) {
            targetButton = btn;
        }
    });

    if (targetButton) {
        // Simulate tab click
        if (mainTab === 'commands' || mainTab === 'rooms' || mainTab === 'contacts' || mainTab === 'scheduled-tasks' || mainTab === 'ai-settings') {
            // Check auth first
            if (!isAuthenticated) {
                console.log('[Tab Restore] Authentication required for', mainTab);
                return;
            }
        }

        // Manually switch tab without using onclick
        document.querySelectorAll('.header .tab-btn').forEach(btn => btn.classList.remove('active'));
        targetButton.classList.add('active');

        document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
        document.getElementById(`tab-${mainTab}`).classList.add('active');

        // Load data
        if (mainTab === 'commands') {
            loadCommands();
        } else if (mainTab === 'rooms') {
            loadRooms();
        } else if (mainTab === 'contacts') {
            loadContacts();
        } else if (mainTab === 'scheduled-tasks') {
            loadScheduledTasks();
        } else if (mainTab === 'ai-settings') {
            loadAIDefaults();
            loadApiConfig();
            loadModels();
            loadMemory();
            loadWhitelist();

            // Handle subtab
            if (subTab) {
                const subTabButtons = document.querySelectorAll('#tab-ai-settings .tab-btn');
                let targetSubButton = null;

                subTabButtons.forEach(btn => {
                    const onclickAttr = btn.getAttribute('onclick');
                    if (onclickAttr && onclickAttr.includes(`'${subTab}'`)) {
                        targetSubButton = btn;
                    }
                });

                if (targetSubButton) {
                    document.querySelectorAll('#tab-ai-settings .tab-btn').forEach(btn => btn.classList.remove('active'));
                    targetSubButton.classList.add('active');

                    document.querySelectorAll('.ai-subtab-content').forEach(content => content.style.display = 'none');
                    const targetSubTab = document.getElementById(`ai-subtab-${subTab}`);
                    if (targetSubTab) {
                        targetSubTab.style.display = 'block';

                        // Force reflow
                        void targetSubTab.offsetHeight;

                        // Load data for specific subtabs
                        if (subTab === 'tools') {
                            loadTools();
                        } else if (subTab === 'prompts') {
                            loadSystemPrompts();
                        }
                    }
                }
            } else {
                // Default to first subtab
                document.querySelectorAll('#tab-ai-settings .tab-btn').forEach(btn => btn.classList.remove('active'));
                const firstBtn = document.querySelector('#tab-ai-settings .tab-btn');
                if (firstBtn) firstBtn.classList.add('active');

                document.querySelectorAll('.ai-subtab-content').forEach(content => content.style.display = 'none');
                const firstSubTab = document.getElementById('ai-subtab-defaults');
                if (firstSubTab) firstSubTab.style.display = 'block';
            }
        }
    }
}

// Call restore on page load (after login check)
window.addEventListener('load', () => {
    // Wait a bit for auth check to complete
    setTimeout(() => {
        restoreTabFromURL();
    }, 100);
});
document.getElementById('addWhitelistCancel').addEventListener('click', () => {
    document.getElementById('addWhitelistModal').close();
});

document.getElementById('addWhitelistSubmit').addEventListener('click', async () => {
    const number = document.getElementById('whitelistNumber').value.trim();
    const pushName = document.getElementById('whitelistPushName').value.trim();
    const model = document.getElementById('whitelistModel').value;
    const quota = parseInt(document.getElementById('whitelistQuota').value);
    const resetPeriod = document.getElementById('whitelistResetPeriod').value;
    const maxToolIterationsValue = document.getElementById('whitelistMaxToolIterations').value.trim();
    const maxToolIterations = maxToolIterationsValue ? parseInt(maxToolIterationsValue) : null;

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

    // Validate maxToolIterations if provided
    if (maxToolIterations !== null && (isNaN(maxToolIterations) || maxToolIterations < 1 || maxToolIterations > 50)) {
        await showAlert('Error', 'Max Tool Iterations must be between 1 and 50, or empty for default');
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
                resetPeriod,
                maxToolIterations
            })
        });

        const data = await response.json();

        if (data.success) {
            document.getElementById('addWhitelistModal').close();
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
    const usageCount = parseInt(document.getElementById('editWhitelistUsage').value);
    const resetPeriod = document.getElementById('editWhitelistResetPeriod').value;
    const maxToolIterationsValue = document.getElementById('editWhitelistMaxToolIterations').value.trim();
    const maxToolIterations = maxToolIterationsValue ? parseInt(maxToolIterationsValue) : null;

    // Collect enabled tools from checkboxes
    const enabledToolsCheckboxes = document.querySelectorAll('input[name="enabledTool"]:checked');
    const enabledTools = Array.from(enabledToolsCheckboxes).map(cb => cb.value);

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

    // Validate usage count
    if (isNaN(usageCount) || usageCount < 0 || usageCount > quota) {
        await showAlert('Error', `Usage count must be between 0 and ${quota}`);
        return;
    }

    // Validate maxToolIterations if provided
    if (maxToolIterations !== null && (isNaN(maxToolIterations) || maxToolIterations < 1 || maxToolIterations > 50)) {
        await showAlert('Error', 'Max Tool Iterations must be between 1 and 50, or empty for default');
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
                usageCount,
                resetPeriod,
                enabledTools,
                maxToolIterations
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
    const aiIdentity = document.getElementById('editAiIdentity').value.trim();
    const maxToolIterations = parseInt(document.getElementById('editMaxToolIterations').value);

    // Collect enabled tools from checkboxes
    const enabledToolsCheckboxes = document.querySelectorAll('input[name="defaultEnabledTool"]:checked');
    const defaultEnabledTools = Array.from(enabledToolsCheckboxes).map(cb => cb.value);

    // Validate quota
    if (isNaN(defaultQuota) || defaultQuota < 1 || defaultQuota > 10000) {
        await showAlert('Error', 'Quota must be between 1 and 10000');
        return;
    }

    // Validate maxToolIterations
    if (isNaN(maxToolIterations) || maxToolIterations < 1 || maxToolIterations > 50) {
        await showAlert('Error', 'Max Tool Iterations must be between 1 and 50');
        return;
    }

    // Validate AI identity
    if (!aiIdentity) {
        await showAlert('Error', 'AI Identity cannot be empty');
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
                defaultVisionModel,
                aiIdentity,
                maxToolIterations,
                defaultEnabledTools
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
    const provider = document.getElementById('addModelProvider').value;
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
                provider,
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
    const provider = document.getElementById('editModelProvider').value;
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
                provider,
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
    const apiTimeoutSeconds = parseInt(document.getElementById('editApiTimeout').value);

    // Validate timeout
    if (isNaN(apiTimeoutSeconds) || apiTimeoutSeconds < 10 || apiTimeoutSeconds > 600) {
        await showAlert('Error', 'Timeout must be between 10 and 600 seconds');
        return;
    }

    // Convert to milliseconds
    const apiTimeout = apiTimeoutSeconds * 1000;

    try {
        const response = await fetch('/api/ai-settings/api-config', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({
                apiEndpoint: apiEndpoint || null,
                apiKey: apiKey || null,
                apiTimeout: apiTimeout
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

// ============================================
// Tools Management
// ============================================

// Load tools
async function loadTools() {
    try {
        const response = await fetch('/api/tools', {
            credentials: 'same-origin'
        });
        const data = await response.json();

        if (data.success) {
            renderTools(data.tools);
        } else {
            renderToolsError('Failed to load tools');
        }
    } catch (error) {
        renderToolsError('Error loading tools: ' + error.message);
    }
}

// Render tools table
function renderTools(tools) {
    const tbody = document.getElementById('toolsTableBody');

    if (tools.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; opacity: 0.6;">No tools defined</td></tr>';
        return;
    }

    tbody.innerHTML = tools.map(tool => {
        // Extract parameter names from schema
        let params = '-';
        if (tool.input_schema && tool.input_schema.properties) {
            const props = Object.keys(tool.input_schema.properties);
            const required = tool.input_schema.required || [];
            params = props.map(p => required.includes(p) ? `<strong>${p}</strong>` : p).join(', ');
        }

        // Badge and actions for temporary tools
        const badge = tool.temporary ? '<span class="badge temp">TEMP</span>' : '';
        const source = tool.temporary ? `<small style="opacity: 0.6;">${tool.source}</small>` : '';
        const actions = tool.temporary
            ? `<button class="btn btn-small danger" onclick="removeTemporaryTool('${tool.name}')">Delete</button>`
            : '<span style="opacity: 0.5;">Static</span>';

        return `
            <tr>
                <td><strong>${tool.name}</strong>${badge ? '<br>' + badge : ''}</td>
                <td>${tool.description}${source ? '<br>' + source : ''}</td>
                <td style="font-size: 0.85rem;">${params}</td>
                <td>${actions}</td>
            </tr>
        `;
    }).join('');
}

// Render tools error
function renderToolsError(message) {
    const tbody = document.getElementById('toolsTableBody');
    tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: #f00;">${message}</td></tr>`;
}

// Remove temporary tool
async function removeTemporaryTool(name) {
    const confirmed = await showConfirm('Delete Temporary Tool', `Delete temporary tool "${name}"?`);
    if (confirmed) {
        try {
            const response = await fetch(`/api/tools/${encodeURIComponent(name)}`, {
                method: 'DELETE',
                credentials: 'same-origin'
            });
            const data = await response.json();

            if (data.success) {
                loadTools();
                await showAlert('Success', 'Temporary tool deleted successfully!');
            } else {
                await showAlert('Error', 'Failed to delete tool: ' + data.error);
            }
        } catch (error) {
            await showAlert('Error', 'Error deleting tool: ' + error.message);
        }
    }
}

// Show add tool modal
function showAddToolModal() {
    const modal = document.getElementById('addToolModal');
    document.getElementById('addToolName').value = '';
    document.getElementById('addToolDescription').value = '';
    document.getElementById('addToolSchema').value = '';
    document.getElementById('addToolImplementation').value = '';
    modal.showModal();
}

// Add tool modal handlers
document.getElementById('addToolCancel').addEventListener('click', () => {
    document.getElementById('addToolModal').close();
});

document.getElementById('addToolSubmit').addEventListener('click', async () => {
    const name = document.getElementById('addToolName').value.trim();
    const description = document.getElementById('addToolDescription').value.trim();
    const schemaText = document.getElementById('addToolSchema').value.trim();
    const implementationCode = document.getElementById('addToolImplementation').value.trim();

    if (!name || !description || !schemaText || !implementationCode) {
        await showAlert('Error', 'All fields are required');
        return;
    }

    // Validate JSON schema
    let schema;
    try {
        schema = JSON.parse(schemaText);
    } catch (e) {
        await showAlert('Error', 'Invalid JSON schema: ' + e.message);
        return;
    }

    try {
        const response = await fetch('/api/tools/temporary', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({
                name,
                description,
                input_schema: schema,
                implementation: implementationCode
            })
        });

        const data = await response.json();

        if (data.success) {
            document.getElementById('addToolModal').close();
            loadTools();
            await showAlert('Success', 'Temporary tool added successfully!');
        } else {
            await showAlert('Error', 'Failed to add tool: ' + data.error);
        }
    } catch (error) {
        await showAlert('Error', 'Error adding tool: ' + error.message);
    }
});

// ===== System Prompts Management =====

let systemPromptsData = [];

async function loadSystemPrompts() {
    try {
        const response = await fetch('/api/ai-settings/system-prompts', {
            credentials: 'same-origin'
        });
        const data = await response.json();

        if (data.success) {
            systemPromptsData = data.prompts;
            renderSystemPrompts();
        } else {
            await showAlert('Error', 'Failed to load system prompts: ' + data.error);
        }
    } catch (error) {
        await showAlert('Error', 'Error loading system prompts: ' + error.message);
    }
}

function renderSystemPrompts() {
    const grid = document.getElementById('systemPromptsGrid');
    const countEl = document.getElementById('enabledPromptsCount');

    if (systemPromptsData.length === 0) {
        grid.innerHTML = '<p style="opacity: 0.6; text-align: center; padding: 2rem;">No system prompts found</p>';
        countEl.textContent = '0 / 0';
        return;
    }

    const enabledCount = systemPromptsData.filter(p => p.enabled).length;
    countEl.textContent = `${enabledCount} / ${systemPromptsData.length}`;

    grid.innerHTML = systemPromptsData.map(prompt => {
        const categoryColors = {
            'Core': '#0f0',
            'Behavior': '#0af',
            'Format': '#f90',
            'Custom': '#f0f'
        };
        const categoryColor = categoryColors[prompt.category] || '#0f0';

        return `
            <div style="background: ${prompt.enabled ? '#001100' : '#110000'}; border: 1px solid ${prompt.enabled ? '#0f0' : '#333'}; padding: 1rem; border-radius: 4px;">
                <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 0.5rem;">
                    <div>
                        <div style="font-weight: bold; color: #0f0; margin-bottom: 0.25rem;">${prompt.name}</div>
                        <div style="font-size: 0.75rem; color: ${categoryColor}; opacity: 0.8;">${prompt.category}</div>
                    </div>
                    <label style="display: flex; align-items: center; cursor: pointer;">
                        <input type="checkbox"
                            data-prompt-name="${prompt.name}"
                            ${prompt.enabled ? 'checked' : ''}
                            onchange="togglePrompt('${prompt.name}', this.checked)"
                            style="margin: 0; width: 16px; height: 16px; cursor: pointer; accent-color: #0f0; background: #000; border: 1px solid #0f0;">
                    </label>
                </div>
                <div style="font-size: 0.85rem; opacity: 0.7; line-height: 1.4;">${prompt.description}</div>
                <div style="font-size: 0.7rem; opacity: 0.5; margin-top: 0.5rem;">File: ${prompt.file}</div>
            </div>
        `;
    }).join('');
}

function togglePrompt(name, enabled) {
    const prompt = systemPromptsData.find(p => p.name === name);
    if (prompt) {
        prompt.enabled = enabled;
        renderSystemPrompts();
    }
}

function toggleAllPrompts(enable) {
    systemPromptsData.forEach(p => p.enabled = enable);

    // Update checkboxes
    document.querySelectorAll('#systemPromptsGrid input[type="checkbox"]').forEach(cb => {
        cb.checked = enable;
    });

    renderSystemPrompts();
}

async function saveSystemPrompts() {
    try {
        const enabledPrompts = systemPromptsData
            .filter(p => p.enabled)
            .map(p => p.name);

        const response = await fetch('/api/ai-settings/system-prompts', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ enabledPrompts })
        });

        const data = await response.json();

        if (data.success) {
            await showAlert('Success', data.message || 'System prompts updated successfully');
            await loadSystemPrompts(); // Reload to confirm
        } else {
            await showAlert('Error', 'Failed to save: ' + data.error);
        }
    } catch (error) {
        await showAlert('Error', 'Error saving system prompts: ' + error.message);
    }
}

// ============================================
// Contacts Management
// ============================================

async function loadContacts() {
    try {
        const response = await fetch('/api/contacts', {
            credentials: 'same-origin'
        });

        const data = await response.json();

        if (data.success) {
            renderContacts(data.contacts);
        } else {
            document.getElementById('contactsTableBody').innerHTML = `
                <tr>
                    <td colspan="5" style="text-align: center; padding: 2rem; color: #f00;">
                        Error: ${data.error}
                    </td>
                </tr>
            `;
        }
    } catch (error) {
        document.getElementById('contactsTableBody').innerHTML = `
            <tr>
                <td colspan="5" style="text-align: center; padding: 2rem; color: #f00;">
                    Error loading contacts: ${error.message}
                </td>
            </tr>
        `;
    }
}

function renderContacts(contacts) {
    const tbody = document.getElementById('contactsTableBody');

    if (contacts.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" style="text-align: center; padding: 2rem; opacity: 0.5;">
                    No contacts saved yet. Use "Add Contact" button or .contactadd command.
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = contacts.map(contact => {
        const typeIcon = contact.type === 'user' ? '👤' : '👥';
        const addedDate = new Date(contact.addedAt).toLocaleString();

        return `
            <tr>
                <td style="padding: 0.5rem;">
                    ${typeIcon} ${contact.type}
                </td>
                <td style="padding: 0.5rem;">
                    ${escapeHtml(contact.name)}
                </td>
                <td style="padding: 0.5rem; font-size: 0.75rem; opacity: 0.7;">
                    ${escapeHtml(contact.jid)}
                </td>
                <td style="padding: 0.5rem; font-size: 0.75rem; opacity: 0.7;">
                    ${addedDate}
                </td>
                <td style="padding: 0.5rem; text-align: center;">
                    <button class="btn btn-small danger" onclick="deleteContact('${escapeHtml(contact.jid)}')">
                        Delete
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

function showAddContactModal() {
    const modal = document.getElementById('addContactModal');
    document.getElementById('contactJid').value = '';
    document.getElementById('contactName').value = '';
    document.getElementById('contactType').value = 'user';
    modal.showModal();
}

function closeAddContactModal() {
    const modal = document.getElementById('addContactModal');
    modal.close();
}

async function submitAddContact() {
    const jid = document.getElementById('contactJid').value.trim();
    const name = document.getElementById('contactName').value.trim();
    const type = document.getElementById('contactType').value;

    if (!jid || !name) {
        await showAlert('Error', 'Please fill in all required fields');
        return;
    }

    // Basic JID validation
    if (!jid.includes('@')) {
        await showAlert('Error', 'Invalid JID format. Must include @ (e.g., number@s.whatsapp.net)');
        return;
    }

    try {
        const response = await fetch('/api/contacts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ jid, name, type })
        });

        const data = await response.json();

        if (data.success) {
            await showAlert('Success', 'Contact added successfully');
            closeAddContactModal();
            await loadContacts(); // Reload list
        } else {
            await showAlert('Error', data.error || 'Failed to add contact');
        }
    } catch (error) {
        await showAlert('Error', 'Error adding contact: ' + error.message);
    }
}

async function deleteContact(jid) {
    const confirmed = await showConfirm(
        'Delete Contact',
        `Are you sure you want to delete this contact?\n\n${jid}`
    );

    if (!confirmed) return;

    try {
        const response = await fetch(`/api/contacts/${encodeURIComponent(jid)}`, {
            method: 'DELETE',
            credentials: 'same-origin'
        });

        const data = await response.json();

        if (data.success) {
            await showAlert('Success', 'Contact deleted successfully');
            await loadContacts(); // Reload list
        } else {
            await showAlert('Error', data.error || 'Failed to delete contact');
        }
    } catch (error) {
        await showAlert('Error', 'Error deleting contact: ' + error.message);
    }
}
