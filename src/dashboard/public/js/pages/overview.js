/**
 * Overview Page — System status cards, mode toggle, and useful recent activity.
 */

const OverviewPage = {
    // Map audit action types to human-readable descriptions with icons
    actionMap: {
        'command_executed': { icon: '⌨️', label: 'Command', format: (d) => d.command ? `Executed <strong>/${d.command}</strong>${d.source ? ` via ${d.source}` : ''}` : 'Executed a command' },
        'ai_response': { icon: '🤖', label: 'AI Response', format: (d) => d.intent ? `Handled <strong>${d.intent}</strong> intent${d.query ? ` — "${d.query.substring(0, 60)}"` : ''}` : 'Generated a response' },
        'memory_saved': { icon: '🧠', label: 'Memory', format: (d) => d.text ? `Saved: "${d.text.substring(0, 60)}..."` : 'Saved a memory' },
        'memory_added': { icon: '🧠', label: 'Memory', format: (d) => `Added memory [${d.category || 'note'}]${d.text ? `: "${d.text.substring(0, 50)}..."` : ''}` },
        'skill_learned': { icon: '📚', label: 'Skill', format: (d) => d.name ? `Learned new skill: <strong>${d.name}</strong>` : 'Learned a skill' },
        'skill_created': { icon: '📚', label: 'Skill', format: (d) => d.name ? `Created skill: <strong>${d.name}</strong> (${d.stepCount || '?'} steps)` : 'Created a skill' },
        'skill_executed': { icon: '⚡', label: 'Execution', format: (d) => d.name ? `Executed skill: <strong>${d.name}</strong>` : 'Executed a skill' },
        'feedback_positive': { icon: '👍', label: 'Feedback', format: (d) => d.query ? `Positive on: "${d.query.substring(0, 50)}..."` : 'Positive feedback received' },
        'feedback_negative': { icon: '👎', label: 'Feedback', format: (d) => d.query ? `Negative on: "${d.query.substring(0, 50)}..."` : 'Negative feedback received' },
        'mode_changed': { icon: '🔐', label: 'Mode', format: (d) => `Mode changed to <strong>${d.mode || '?'}</strong>` },
        'reminder_created': { icon: '⏰', label: 'Reminder', format: (d) => d.message ? `Reminder set: "${d.message.substring(0, 50)}"` : 'Reminder created' },
        'reminder_fired': { icon: '🔔', label: 'Reminder', format: (d) => d.message ? `Reminder fired: "${d.message.substring(0, 50)}"` : 'Reminder fired' },
        'tracker_collection': { icon: '📊', label: 'Tracker', format: (d) => d.memberCount ? `Collected stats for <strong>${d.memberCount}</strong> staff` : 'Staff stats collected' },
        'profile_force_check': { icon: '🔍', label: 'Profile', format: (d) => d.player ? `Force-checked <strong>${d.player}</strong>` : 'Profile checked' },
        'profile_chatlog_cycle': { icon: '💬', label: 'Profiler', format: (d) => d.playerCount ? `Chatlog cycle for ${d.playerCount} players` : 'Chatlog cycle ran' },
    },

    formatAction(entry) {
        const map = OverviewPage.actionMap[entry.action];
        if (map) {
            return {
                icon: map.icon,
                desc: map.format(entry.details || {}),
            };
        }
        // Fallback for unknown action types
        const detail = entry.details?.command || entry.details?.text || entry.details?.query || entry.details?.intent || entry.details?.mode || '';
        return {
            icon: '📋',
            desc: `<strong>${entry.action}</strong>${detail ? ` — ${App.escapeHtml(String(detail).substring(0, 60))}` : ''}`,
        };
    },

    async render(container) {
        container.innerHTML = `
            <div class="page-header">
                <h1>📊 Overview</h1>
                <p>System status at a glance</p>
            </div>
            <div class="stats-grid" id="stats-grid">
                <div class="stat-card"><div class="stat-label">Loading...</div><div class="stat-value">—</div></div>
            </div>
            <div class="card mb-24" id="activity-chart-card">
                <div class="card-header">
                    <span class="card-title">📈 Activity (Last 7 Days)</span>
                </div>
                <div id="activity-chart"><p class="text-muted">Loading...</p></div>
            </div>
            <div class="card">
                <div class="card-header">
                    <span class="card-title">📋 Recent Activity</span>
                </div>
                <div id="recent-activity"><p class="text-muted">Loading...</p></div>
            </div>
        `;

        try {
            const [status, audit] = await Promise.all([
                API.status(),
                API.auditRecent(15),
            ]);

            document.getElementById('stats-grid').innerHTML = `
                <div class="stat-card">
                    <div class="stat-label">🎮 Minecraft</div>
                    <div class="stat-value ${status.minecraft ? 'success' : 'error'}">${status.minecraft ? 'Online' : 'Offline'}</div>
                </div>
                <div class="stat-card">
                    <div class="stat-label">💬 Discord</div>
                    <div class="stat-value ${status.discord ? 'success' : 'error'}">${status.discord ? 'Online' : 'Offline'}</div>
                </div>
                <div class="stat-card">
                    <div class="stat-label">🔐 Mode</div>
                    <div class="stat-value accent">${status.mode === 'private' ? '🔒 Private' : '🌐 Public'}</div>
                </div>
                <div class="stat-card">
                    <div class="stat-label">🧠 Memories</div>
                    <div class="stat-value info">${status.memories.toLocaleString()}</div>
                </div>
                <div class="stat-card">
                    <div class="stat-label">📚 Skills</div>
                    <div class="stat-value accent">${status.skills}</div>
                </div>
                <div class="stat-card">
                    <div class="stat-label">⏰ Reminders</div>
                    <div class="stat-value warning">${status.reminders}</div>
                </div>
                <div class="stat-card">
                    <div class="stat-label">📊 Staff Tracked</div>
                    <div class="stat-value info">${status.staffTracked}</div>
                </div>
                <div class="stat-card">
                    <div class="stat-label">🔍 Players Watched</div>
                    <div class="stat-value accent">${status.playersWatched}</div>
                </div>
                <div class="stat-card">
                    <div class="stat-label">👍 Feedback</div>
                    <div class="stat-value success">${status.feedbackPositive}👍 / ${status.feedbackNegative}👎</div>
                </div>
                <div class="stat-card">
                    <div class="stat-label">📝 Actions Today</div>
                    <div class="stat-value info">${status.auditToday}</div>
                </div>
                <div class="stat-card">
                    <div class="stat-label">⏱️ Uptime</div>
                    <div class="stat-value accent">${App.formatUptime(status.uptime)}</div>
                </div>
                <div class="stat-card">
                    <div class="stat-label">💬 Chat Buffer</div>
                    <div class="stat-value info">${status.chatBuffer}</div>
                </div>
            `;

            // Recent activity — with descriptive entries
            const activityEl = document.getElementById('recent-activity');
            if (!audit || audit.length === 0) {
                activityEl.innerHTML = '<div class="empty-state"><p>No recent activity</p></div>';
            } else {
                activityEl.innerHTML = audit.map(entry => {
                    const { icon, desc } = OverviewPage.formatAction(entry);
                    return `
                        <div class="activity-item">
                            <div class="activity-left">
                                <span class="activity-icon">${icon}</span>
                                <span class="activity-desc">${desc}</span>
                            </div>
                            <span class="activity-time">${App.timeAgo(entry.timestamp)}</span>
                        </div>
                    `;
                }).join('');
            }

            // Activity chart — group audit entries by day for last 7 days
            OverviewPage.renderActivityChart(audit);
        } catch (err) {
            container.innerHTML += `<p class="text-muted">Failed to load: ${App.escapeHtml(err.message)}</p>`;
        }
    },

    renderActivityChart(auditEntries) {
        const chartEl = document.getElementById('activity-chart');
        if (!chartEl) return;

        // Build 7-day map
        const dayMap = {};
        for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const key = d.toISOString().slice(0, 10);
            dayMap[key] = 0;
        }

        // Count entries per day
        if (auditEntries && auditEntries.length > 0) {
            for (const entry of auditEntries) {
                if (!entry.timestamp) continue;
                const day = new Date(entry.timestamp).toISOString().slice(0, 10);
                if (dayMap.hasOwnProperty(day)) {
                    dayMap[day]++;
                }
            }
        }

        const days = Object.entries(dayMap);
        const maxCount = Math.max(...days.map(([, c]) => c), 1);

        if (maxCount === 0) {
            chartEl.innerHTML = '<div class="empty-state"><p>No activity data for the last 7 days.</p></div>';
            return;
        }

        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

        chartEl.innerHTML = `
            <div class="bar-chart" style="min-height:100px">
                ${days.map(([date, count]) => {
            const pct = Math.max(3, (count / maxCount) * 100);
            const dayName = dayNames[new Date(date).getDay()];
            return `
                        <div class="graph-bar-col">
                            <div class="graph-bar-value">${count}</div>
                            <div class="graph-bar-track">
                                <div class="graph-bar-fill gradient" style="height:${pct}%"></div>
                            </div>
                            <div class="graph-bar-label">${dayName}<br>${date.slice(5)}</div>
                        </div>
                    `;
        }).join('')}
            </div>
            <p class="text-muted text-sm mt-8">Actions per day (from audit log)</p>
        `;
    },
};
