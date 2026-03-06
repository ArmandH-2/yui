/**
 * Reminders Page — List, add, and cancel reminders.
 */

const RemindersPage = {
    async render(container) {
        container.innerHTML = `
            <div class="page-header">
                <h1>⏰ Reminders</h1>
                <p>Manage scheduled reminders</p>
            </div>

            <div class="form-section mb-24">
                <div class="card-title mb-16">➕ New Reminder</div>
                <div class="form-row">
                    <div>
                        <label class="form-label">Who to remind</label>
                        <input type="text" id="reminder-target" placeholder="e.g. @ItsB2_ or staff-team">
                    </div>
                    <div>
                        <label class="form-label">When</label>
                        <input type="text" id="reminder-when" placeholder="e.g. in 30 minutes, at 15:00, tomorrow">
                    </div>
                </div>
                <div class="form-row">
                    <div>
                        <label class="form-label">Message</label>
                        <input type="text" id="reminder-message" placeholder="What should I remind about?">
                    </div>
                </div>
                <button class="btn btn-gradient" id="reminder-add-btn">⏰ Set Reminder</button>
            </div>

            <div class="card">
                <div class="card-header">
                    <span class="card-title">📋 Active Reminders</span>
                </div>
                <div id="reminders-list"><p class="text-muted">Loading...</p></div>
            </div>
        `;

        document.getElementById('reminder-add-btn').addEventListener('click', () => RemindersPage.addReminder());
        document.getElementById('reminder-message').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') RemindersPage.addReminder();
        });

        await RemindersPage.loadList();
    },

    async loadList() {
        try {
            const reminders = await API.reminders();
            const el = document.getElementById('reminders-list');

            if (!reminders || reminders.length === 0) {
                el.innerHTML = '<div class="empty-state"><div class="empty-icon">⏰</div><p>No active reminders. Create one above!</p></div>';
                return;
            }

            el.innerHTML = reminders.map(r => `
                <div class="reminder-item">
                    <div class="reminder-info">
                        <div class="reminder-target">📌 ${App.escapeHtml(r.target || 'unknown')}</div>
                        <div class="reminder-message">${App.escapeHtml(r.message || 'No message')}</div>
                        <div class="reminder-when">${r.scheduledFor || r.when || 'unknown schedule'} · Status: ${r.status || 'active'}</div>
                    </div>
                    <button class="btn btn-danger btn-sm" onclick="RemindersPage.cancel('${App.escapeHtml(r.id)}')">Cancel</button>
                </div>
            `).join('');
        } catch (err) {
            App.toast('Failed to load reminders: ' + err.message, 'error');
        }
    },

    async addReminder() {
        const target = document.getElementById('reminder-target').value.trim();
        const message = document.getElementById('reminder-message').value.trim();
        const when = document.getElementById('reminder-when').value.trim();

        if (!target || !message || !when) {
            App.toast('Please fill in all fields.', 'error');
            return;
        }

        try {
            const result = await API.reminderAdd(target, message, when);
            App.toast(`Reminder set! Scheduled for: ${result.scheduledFor || 'soon'}`, 'success');
            document.getElementById('reminder-target').value = '';
            document.getElementById('reminder-message').value = '';
            document.getElementById('reminder-when').value = '';
            await RemindersPage.loadList();
        } catch (err) {
            App.toast('Failed: ' + err.message, 'error');
        }
    },

    async cancel(id) {
        try {
            const result = await API.reminderCancel(id);
            App.toast(result.message, result.success ? 'success' : 'info');
            await RemindersPage.loadList();
        } catch (err) {
            App.toast('Failed: ' + err.message, 'error');
        }
    },
};
