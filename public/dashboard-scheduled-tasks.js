
// ===== SCHEDULED TASKS FUNCTIONS =====

let currentScheduledTasksFilter = 'pending';
let scheduledTasksRefreshInterval = null;

async function loadScheduledTasks() {
    try {
        const status = currentScheduledTasksFilter === 'all' ? '' : currentScheduledTasksFilter;
        const response = await fetch(`/api/scheduled-tasks?status=${status}`);
        const data = await response.json();

        if (data.success) {
            renderScheduledTasksTable(data.tasks);
        } else {
            await showAlert('Error', data.error || 'Failed to load scheduled tasks');
        }
    } catch (error) {
        await showAlert('Error', 'Error loading scheduled tasks: ' + error.message);
    }
}

function filterScheduledTasks(status) {
    currentScheduledTasksFilter = status;

    // Update active button
    ['pending', 'completed', 'failed', 'all'].forEach(s => {
        const btn = document.getElementById(`filter-${s}`);
        if (btn) {
            if (s === status) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        }
    });

    loadScheduledTasks();
}

function renderScheduledTasksTable(tasks) {
    const tbody = document.getElementById('scheduledTasksTableBody');

    if (!tasks || tasks.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" style="text-align: center; padding: 2rem; opacity: 0.5;">
                    No ${currentScheduledTasksFilter === 'all' ? '' : currentScheduledTasksFilter + ' '}tasks found
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = tasks.map(task => {
        // Status badge
        let statusBadge = '';
        if (task.status === 'pending') {
            statusBadge = '<span style="background: #ff6600; color: #000; padding: 0.2rem 0.5rem; border-radius: 3px; font-size: 0.75rem;">PENDING</span>';
        } else if (task.status === 'completed') {
            statusBadge = '<span style="background: #0f0; color: #000; padding: 0.2rem 0.5rem; border-radius: 3px; font-size: 0.75rem;">DONE</span>';
        } else if (task.status === 'failed') {
            statusBadge = '<span style="background: #ff0000; color: #fff; padding: 0.2rem 0.5rem; border-radius: 3px; font-size: 0.75rem;">FAILED</span>';
        } else if (task.status === 'cancelled') {
            statusBadge = '<span style="background: #666; color: #fff; padding: 0.2rem 0.5rem; border-radius: 3px; font-size: 0.75rem;">CANCELLED</span>';
        }

        // Format time
        const scheduledDate = new Date(task.scheduledTime);
        const scheduledStr = scheduledDate.toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });

        // Time until (for pending)
        let timeUntilStr = '-';
        if (task.status === 'pending') {
            const timeUntil = task.scheduledTime - Date.now();
            if (timeUntil > 0) {
                timeUntilStr = formatTimeUntil(timeUntil);
            } else {
                timeUntilStr = '<span style="color: #ff6600;">DUE NOW</span>';
            }
        }

        // Truncate instruction
        const instruction = escapeHtml(task.instruction.length > 80
            ? task.instruction.substring(0, 80) + '...'
            : task.instruction);

        // Actions
        let actions = '';
        if (task.status === 'pending') {
            actions = `<button class="btn btn-small danger" onclick="cancelScheduledTask('${escapeHtml(task.taskId)}')">Cancel</button>`;
        } else {
            actions = '<span style="opacity: 0.3;">-</span>';
        }

        return `
            <tr style="border-bottom: 1px solid rgba(0, 255, 0, 0.2);">
                <td style="padding: 0.5rem;">
                    ${statusBadge}
                </td>
                <td style="padding: 0.5rem;">
                    ${instruction}
                </td>
                <td style="padding: 0.5rem; font-size: 0.8rem;">
                    ${scheduledStr}
                </td>
                <td style="padding: 0.5rem; font-size: 0.8rem;">
                    ${timeUntilStr}
                </td>
                <td style="padding: 0.5rem; text-align: center;">
                    ${actions}
                </td>
            </tr>
        `;
    }).join('');
}

function formatTimeUntil(ms) {
    const minutes = Math.floor(ms / 60000);
    const hours = Math.floor(ms / 3600000);
    const days = Math.floor(ms / 86400000);

    if (minutes < 1) {
        return '<1m';
    } else if (minutes < 60) {
        return `${minutes}m`;
    } else if (hours < 48) {
        return `${hours}h`;
    } else {
        return `${days}d`;
    }
}

async function cancelScheduledTask(taskId) {
    const confirmed = await showConfirm('Cancel Scheduled Task', 'Cancel this scheduled task?');
    if (!confirmed) {
        return;
    }

    try {
        const response = await fetch(`/api/scheduled-tasks/${encodeURIComponent(taskId)}`, {
            method: 'DELETE'
        });

        const data = await response.json();

        if (data.success) {
            await showAlert('Success', 'Task cancelled successfully');
            loadScheduledTasks();
        } else {
            await showAlert('Error', data.error || 'Failed to cancel task');
        }
    } catch (error) {
        await showAlert('Error', 'Error cancelling task: ' + error.message);
    }
}

// Auto-refresh scheduled tasks when tab is active
function startScheduledTasksAutoRefresh() {
    if (scheduledTasksRefreshInterval) {
        clearInterval(scheduledTasksRefreshInterval);
    }

    // Refresh every 30 seconds
    scheduledTasksRefreshInterval = setInterval(() => {
        const tab = document.getElementById('tab-scheduled-tasks');
        if (tab && tab.classList.contains('active')) {
            loadScheduledTasks();
        }
    }, 30000);
}

// Initialize scheduled tasks when page loads
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        startScheduledTasksAutoRefresh();
    });
} else {
    startScheduledTasksAutoRefresh();
}
