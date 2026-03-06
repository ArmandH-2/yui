/**
 * Audit & Feedback Page — Search, expandable details, feedback with context.
 */

const AuditPage = {
    expandedRow: null,

    // Same action map as overview for consistent labeling
    actionIcons: {
        'command_executed': '⌨️',
        'ai_response': '🤖',
        'memory_saved': '🧠',
        'memory_added': '🧠',
        'skill_learned': '📚',
        'skill_created': '📚',
        'skill_executed': '⚡',
        'feedback_positive': '👍',
        'feedback_negative': '👎',
        'mode_changed': '🔐',
        'reminder_created': '⏰',
        'reminder_fired': '🔔',
        'tracker_collection': '📊',
        'profile_force_check': '🔍',
        'profile_chatlog_cycle': '💬',
    },

    async render(container) {
        container.innerHTML = `
            <div class="page-header">
                <h1>📋 Audit & Feedback</h1>
                <p>Action logs, search, and response feedback</p>
            </div>

            <div class="stats-grid mb-24" id="feedback-stats">
                <div class="stat-card"><div class="stat-label">Loading...</div></div>
            </div>

            <div class="card mb-24" id="feedback-details-card">
                <div class="card-header">
                    <span class="card-title">💬 Recent Feedback Context</span>
                </div>
                <div id="feedback-details"><p class="text-muted">Loading...</p></div>
            </div>

            <div class="card">
                <div class="card-header flex-between">
                    <span class="card-title">📝 Audit Log</span>
                    <select id="audit-count" style="width:120px">
                        <option value="10">Last 10</option>
                        <option value="25" selected>Last 25</option>
                        <option value="50">Last 50</option>
                        <option value="100">Last 100</option>
                    </select>
                </div>
                <div class="search-input-wrap">
                    <input type="text" id="audit-search" placeholder="Search actions, users, details...">
                </div>
                <div id="audit-entries"><p class="text-muted">Loading...</p></div>
            </div>
        `;

        document.getElementById('audit-count').addEventListener('change', () => AuditPage.loadEntries());
        document.getElementById('audit-search').addEventListener('input', AuditPage.debounce(() => AuditPage.loadEntries(), 300));

        await Promise.all([AuditPage.loadFeedback(), AuditPage.loadFeedbackDetails(), AuditPage.loadEntries()]);
    },

    debounce(fn, delay) {
        let timer;
        return () => {
            clearTimeout(timer);
            timer = setTimeout(fn, delay);
        };
    },

    async loadFeedback() {
        try {
            const fb = await API.feedback();
            document.getElementById('feedback-stats').innerHTML = `
                <div class="stat-card">
                    <div class="stat-label">👍 Positive</div>
                    <div class="stat-value success">${fb.positive || 0}</div>
                </div>
                <div class="stat-card">
                    <div class="stat-label">👎 Negative</div>
                    <div class="stat-value error">${fb.negative || 0}</div>
                </div>
                <div class="stat-card">
                    <div class="stat-label">📊 Approval Rate</div>
                    <div class="stat-value accent">${fb.ratio || 'N/A'}</div>
                </div>
                <div class="stat-card">
                    <div class="stat-label">📈 Total</div>
                    <div class="stat-value info">${fb.total || 0}</div>
                </div>
            `;
        } catch (err) {
            console.error('Feedback load failed:', err);
        }
    },

    async loadFeedbackDetails() {
        try {
            const fb = await API.feedbackDetails();
            const el = document.getElementById('feedback-details');

            if (!fb.recentNegative || fb.recentNegative.length === 0) {
                el.innerHTML = '<p class="text-muted">No negative feedback entries yet. Responses that receive 👎 reactions will appear here with context.</p>';
                return;
            }

            el.innerHTML = fb.recentNegative.map(n => `
                <div class="brain-item" style="border-left-color: var(--error)">
                    <div class="brain-item-header">
                        <span class="brain-item-title">👎 ${App.escapeHtml(n.username || 'unknown')}</span>
                        <span class="brain-item-meta">${n.timestamp ? new Date(n.timestamp).toLocaleString() : 'unknown time'}</span>
                    </div>
                    <div class="brain-item-body">
                        <p><strong>Query:</strong> ${App.escapeHtml((n.query || 'unknown').substring(0, 200))}</p>
                        <p class="mt-8"><strong>Response:</strong> ${App.escapeHtml((n.response || 'unknown').substring(0, 200))}</p>
                        ${n.intent ? `<p class="mt-8 text-muted"><strong>Intent:</strong> ${App.escapeHtml(n.intent)}</p>` : ''}
                    </div>
                </div>
            `).join('');
        } catch (err) {
            console.error('Feedback details load failed:', err);
        }
    },

    async loadEntries() {
        const count = parseInt(document.getElementById('audit-count')?.value) || 25;
        const searchQuery = (document.getElementById('audit-search')?.value || '').trim();
        const el = document.getElementById('audit-entries');
        if (!el) return;
        el.innerHTML = '<p class="text-muted">Loading...</p>';

        try {
            let entries;
            if (searchQuery) {
                entries = await API.auditSearch(searchQuery, '', count);
            } else {
                entries = await API.auditRecent(count);
            }

            if (!entries || entries.length === 0) {
                el.innerHTML = '<div class="empty-state"><p>No audit entries found.</p></div>';
                return;
            }

            el.innerHTML = `
                <table>
                    <thead><tr>
                        <th style="width:40px"></th>
                        <th>Time</th>
                        <th>Action</th>
                        <th>User</th>
                        <th>Summary</th>
                    </tr></thead>
                    <tbody>
                        ${entries.map((e, i) => `
                            <tr class="audit-row" onclick="AuditPage.toggleDetail(${i})">
                                <td>${AuditPage.actionIcons[e.action] || '📋'}</td>
                                <td class="text-muted text-sm">${App.timeAgo(e.timestamp)}</td>
                                <td><span class="badge badge-info">${e.action || 'unknown'}</span></td>
                                <td>${App.escapeHtml(e.username || 'system')}</td>
                                <td class="text-muted text-sm">${AuditPage.formatSummary(e.details)}</td>
                            </tr>
                            <tr><td colspan="5" style="padding:0"><div class="audit-detail" id="audit-detail-${i}">${AuditPage.formatFullDetails(e)}</div></td></tr>
                        `).join('')}
                    </tbody>
                </table>
            `;
        } catch (err) {
            el.innerHTML = `<p class="text-muted">Failed to load: ${App.escapeHtml(err.message)}</p>`;
        }
    },

    toggleDetail(index) {
        const el = document.getElementById(`audit-detail-${index}`);
        if (!el) return;

        // Close previously opened
        if (AuditPage.expandedRow !== null && AuditPage.expandedRow !== index) {
            const prev = document.getElementById(`audit-detail-${AuditPage.expandedRow}`);
            if (prev) prev.classList.remove('open');
        }

        el.classList.toggle('open');
        AuditPage.expandedRow = el.classList.contains('open') ? index : null;
    },

    formatSummary(details) {
        if (!details) return '—';
        const parts = [];
        if (details.command) parts.push(`/${details.command}`);
        if (details.query) parts.push(`"${details.query.substring(0, 60)}"`);
        if (details.text) parts.push(details.text.substring(0, 60));
        if (details.name) parts.push(details.name);
        if (details.player) parts.push(details.player);
        if (details.mode) parts.push(details.mode);
        if (details.memberCount) parts.push(`${details.memberCount} members`);
        return parts.join(' · ') || '—';
    },

    formatFullDetails(entry) {
        let html = `<p><span class="audit-detail-key">Timestamp:</span> <span class="audit-detail-value">${entry.timestamp ? new Date(entry.timestamp).toLocaleString() : 'unknown'}</span></p>`;
        html += `<p><span class="audit-detail-key">Action:</span> <span class="audit-detail-value">${entry.action || 'unknown'}</span></p>`;
        html += `<p><span class="audit-detail-key">User:</span> <span class="audit-detail-value">${App.escapeHtml(entry.username || 'system')} (${entry.userId || 'N/A'})</span></p>`;

        if (entry.details && typeof entry.details === 'object') {
            for (const [key, value] of Object.entries(entry.details)) {
                const displayValue = typeof value === 'object' ? JSON.stringify(value) : String(value);
                html += `<p><span class="audit-detail-key">${App.escapeHtml(key)}:</span> <span class="audit-detail-value">${App.escapeHtml(displayValue.substring(0, 500))}</span></p>`;
            }
        }

        return html;
    },
};
