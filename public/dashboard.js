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
    // Check authentication for commands and whitelist tabs
    if ((tabName === 'commands' || tabName === 'whitelist') && !isAuthenticated) {
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
    } else if (tabName === 'whitelist') {
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
        tbody.innerHTML = '<tr><td colspan="3" style="text-align: center; opacity: 0.6;">No numbers in whitelist</td></tr>';
        return;
    }

    tbody.innerHTML = users.map(user => {
        // Handle both old format (string) and new format (object)
        const number = typeof user === 'string' ? user : user.number;
        const model = typeof user === 'string' ? 'qwen3-coder-next' : user.model;
        const pushName = typeof user === 'object' && user.pushName ? user.pushName : 'Unknown';
        const jid = typeof user === 'object' && user.jid ? user.jid : number;

        // Extract JID number (before @ symbol)
        const jidNumber = jid.split('@')[0];
        const encodedNumber = encodeURIComponent(number);
        const encodedModel = encodeURIComponent(model);
        const encodedPushName = encodeURIComponent(pushName);

        // Format model name for display
        const modelDisplay = model === 'claude-sonnet-4.5' ? 'Claude Sonnet 4.5' : 'Qwen3 Coder Next';

        return `
            <tr>
                <td><strong>${pushName}</strong><br><small style="opacity: 0.6;">${jidNumber}</small></td>
                <td><span class="badge">${modelDisplay}</span></td>
                <td>
                    <button class="btn btn-small" onclick="showEditWhitelistModal('${encodedNumber}', '${encodedModel}', '${encodedPushName}')" style="margin-right: 0.5rem;">Edit</button>
                    <button class="btn btn-small danger" onclick="removeWhitelistNumber('${encodedNumber}')">Remove</button>
                </td>
            </tr>
        `;
    }).join('');
}

// Render whitelist error
function renderWhitelistError(message) {
    const tbody = document.getElementById('whitelistTableBody');
    tbody.innerHTML = `<tr><td colspan="3" style="text-align: center; color: #f00;">${message}</td></tr>`;
}

// Show add whitelist modal
function showAddWhitelistModal() {
    const modal = document.getElementById('addWhitelistModal');
    document.getElementById('whitelistNumber').value = '';
    document.getElementById('whitelistPushName').value = '';
    document.getElementById('whitelistModel').value = 'qwen3-coder-next';
    modal.showModal();
}

// Show edit whitelist modal
function showEditWhitelistModal(encodedNumber, encodedModel, encodedPushName = '') {
    const number = decodeURIComponent(encodedNumber);
    const model = decodeURIComponent(encodedModel);
    const pushName = encodedPushName ? decodeURIComponent(encodedPushName) : '';

    const modal = document.getElementById('editWhitelistModal');
    document.getElementById('editWhitelistNumber').value = number;
    document.getElementById('editWhitelistPushName').value = pushName;
    document.getElementById('editWhitelistModel').value = model;

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

    if (!number) {
        await showAlert('Error', 'Phone number is required');
        return;
    }

    // Basic validation
    if (!/^\d+(@s\.whatsapp\.net|@lid)?$/.test(number)) {
        await showAlert('Error', 'Invalid phone number format. Use digits only or with @s.whatsapp.net/@lid suffix.');
        return;
    }

    try {
        const response = await fetch('/api/whitelist', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ number, model, pushName: pushName || null })
        });

        const data = await response.json();

        if (data.success) {
            document.getElementById('addWhitelistModal').close();
            document.getElementById('whitelistNumber').value = '';
            document.getElementById('whitelistPushName').value = '';
            document.getElementById('whitelistModel').value = 'qwen3-coder-next';
            loadWhitelist();
            await showAlert('Success', 'Number added to whitelist successfully!');
        } else {
            await showAlert('Error', 'Failed to add number: ' + data.error);
        }
    } catch (error) {
        await showAlert('Error', 'Error adding number: ' + error.message);
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

    if (!newNumber) {
        await showAlert('Error', 'Phone number is required');
        return;
    }

    // Basic validation
    if (!/^\d+(@s\.whatsapp\.net|@lid)?$/.test(newNumber)) {
        await showAlert('Error', 'Invalid phone number format. Use digits only or with @s.whatsapp.net/@lid suffix.');
        return;
    }

    try {
        const response = await fetch(`/api/whitelist/${encodeURIComponent(oldNumber)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ newNumber, model, pushName: pushName || null })
        });

        const data = await response.json();

        if (data.success) {
            document.getElementById('editWhitelistModal').close();
            loadWhitelist();
            await showAlert('Success', 'Whitelist entry updated successfully!');
        } else {
            await showAlert('Error', 'Failed to update entry: ' + data.error);
        }
    } catch (error) {
        await showAlert('Error', 'Error updating entry: ' + error.message);
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
