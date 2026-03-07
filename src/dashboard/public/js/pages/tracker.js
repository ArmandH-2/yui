/**
 * Staff Tracker Page — Roster, per-member update, stats with real graphs,
 * quick inactivity check, history visualization, monthly performance.
 */

const TrackerPage = {
    async render(container) {
        container.innerHTML = `
            <div class="page-header flex-between">
                <div>
                    <h1>👥 Staff Tracker</h1>
                    <p>Monitor staff activity, playtime, and statistics</p>
                </div>
                <div class="flex-center gap-8">
                    <button class="btn btn-accent" id="tracker-quick-inactivity">⚡ Quick Inactivity</button>
                    <button class="btn btn-primary" id="tracker-sync">📡 Sync Roster</button>
                    <button class="btn btn-gradient" id="tracker-force-check">🔄 Full Check All</button>
                </div>
            </div>

            <div class="input-group">
                <input type="text" id="tracker-add-input" placeholder="Enter staff name to add or ignore...">
                <button class="btn btn-success" id="tracker-add-btn">+ Track</button>
                <button class="btn btn-danger" id="tracker-exclude-btn">🚫 Ignore</button>
            </div>

            <div class="card mb-24">
                <div class="card-header">
                    <span class="card-title">📋 Staff Roster</span>
                </div>
                <div class="table-wrap" id="roster-table">
                    <p class="text-muted">Loading...</p>
                </div>
            </div>

            <div class="card mb-24" id="inactivity-card">
                <div class="card-header flex-between">
                    <span class="card-title">🚨 Inactivity Report</span>
                </div>
                <div id="inactivity-report"><p class="text-muted">Loading...</p></div>
            </div>

            <div class="card mb-24" id="monthly-card">
                <div class="card-header flex-between">
                    <span class="card-title">📅 Monthly Performance</span>
                    <div class="flex-center gap-8">
                        <button class="btn btn-accent btn-sm" onclick="TrackerPage.rollupMonth()">📑 Finalize Previous Month</button>
                        <button class="btn btn-ghost btn-sm" id="month-prev">◀ Prev</button>
                        <span id="month-label" style="min-width:110px;text-align:center;font-weight:600"></span>
                        <button class="btn btn-ghost btn-sm" id="month-next">Next ▶</button>
                    </div>
                </div>
                <div id="monthly-body"><p class="text-muted">Loading...</p></div>
            </div>

            <!-- Modal Overlay for Member Profiles -->
            <div id="member-profile-modal" class="modal-overlay" style="display:none;">
                <div class="card modal-content">
                    <button class="btn btn-ghost modal-close" onclick="document.getElementById('member-profile-modal').style.display='none'">✕</button>
                    <div id="member-profile-body"><p class="text-muted">Loading...</p></div>
                </div>
            </div>
        `;

        document.getElementById('tracker-add-btn').addEventListener('click', () => TrackerPage.addStaff());
        document.getElementById('tracker-exclude-btn').addEventListener('click', () => TrackerPage.excludeStaffFromInput());
        document.getElementById('tracker-add-input').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') TrackerPage.addStaff();
        });
        document.getElementById('tracker-force-check').addEventListener('click', () => TrackerPage.forceCheck());
        document.getElementById('tracker-sync').addEventListener('click', () => TrackerPage.syncRoster());
        document.getElementById('tracker-quick-inactivity').addEventListener('click', () => TrackerPage.quickInactivity());

        // Month navigation
        const now = new Date();
        TrackerPage._currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        document.getElementById('month-prev').addEventListener('click', () => TrackerPage.changeMonth(-1));
        document.getElementById('month-next').addEventListener('click', () => TrackerPage.changeMonth(1));

        await TrackerPage.loadRoster();
        await TrackerPage.loadInactivity();
        await TrackerPage.loadMonthly();
    },

    _rosterTab: 'active',
    setRosterTab(tab) {
        TrackerPage._rosterTab = tab;
        TrackerPage.loadRoster();
    },

    // ═══════════════════════════════════════
    // Roster
    // ═══════════════════════════════════════

    async loadRoster() {
        try {
            const roster = await API.trackerRoster();
            const tableEl = document.getElementById('roster-table');

            if (!roster.members || roster.members.length === 0) {
                tableEl.innerHTML = '<div class="empty-state"><div class="empty-icon">👥</div><p>No staff members being tracked. Add someone above!</p></div>';
                return;
            }

            // Rank Hierarchy Sorting
            const rankOrder = {
                'owner': 0,
                'chairman': 1,
                'chairwoman': 1,
                'vp': 2,
                'vice president': 2,
                'supervisor': 3,
                'support': 4,
                'senior staff': 4,
                'staff': 5,
                'trainee': 6,
                'builder': 7,
                'developer': 8
            };

            const getRankVal = (name) => {
                const rank = (roster.ranks && roster.ranks[name]) ? roster.ranks[name].toLowerCase() : 'unknown';
                return rankOrder[rank] || 99;
            };

            const sortedMembers = [...roster.members].sort((a, b) => {
                const rA = getRankVal(a);
                const rB = getRankVal(b);
                if (rA !== rB) return rA - rB;
                return a.localeCompare(b);
            });

            tableEl.innerHTML = `
                <div class="tab-bar mb-16" style="margin-bottom: 16px;">
                    <button class="tab-btn ${TrackerPage._rosterTab === 'active' ? 'active' : ''}" onclick="TrackerPage.setRosterTab('active')">🟢 Active (${roster.members.length})</button>
                    ${roster.excluded && roster.excluded.length > 0 ? `<button class="tab-btn ${TrackerPage._rosterTab === 'ignored' ? 'active' : ''}" onclick="TrackerPage.setRosterTab('ignored')">🚫 Ignored (${roster.excluded.length})</button>` : ''}
                </div>
            `;

            if (TrackerPage._rosterTab === 'active') {
                tableEl.innerHTML += `
                    <table class="roster-table" style="width:100%; border-collapse: collapse;">
                        <thead><tr>
                            <th style="text-align:left; padding: 12px;">Name & Rank</th>
                            <th style="text-align:right; padding: 12px;">Actions</th>
                        </tr></thead>
                        <tbody>
                            ${sortedMembers.map(name => {
                    const rank = roster.ranks?.[name] || 'Unknown';
                    return `
                                <tr class="roster-row">
                                    <td style="padding: 12px;">
                                        <div class="flex-center gap-8">
                                            <img src="https://mc-heads.net/avatar/${encodeURIComponent(name)}/24" width="24" height="24" style="border-radius:4px" onerror="this.style.display='none'">
                                            <div style="display:flex; flex-direction:column; line-height:1.2;">
                                                <strong style="font-size: 1.05rem;">${App.escapeHtml(name)}</strong>
                                                <span class="text-sm text-muted">${App.escapeHtml(rank)}</span>
                                            </div>
                                        </div>
                                    </td>
                                    <td style="padding: 12px; text-align:right;">
                                        <div class="dropdown" tabindex="0">
                                            <button class="dropdown-trigger" title="Options">
                                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1.5"></circle><circle cx="19" cy="12" r="1.5"></circle><circle cx="5" cy="12" r="1.5"></circle></svg>
                                            </button>
                                            <div class="dropdown-content">
                                                <button class="dropdown-item" onclick="TrackerPage.viewStats('${App.escapeHtml(name)}')">📝 View Details</button>
                                                <button class="dropdown-item" onclick="TrackerPage.updateSingle('${App.escapeHtml(name)}', this)">🔄 Refresh Stats</button>
                                                <button class="dropdown-item warning" onclick="TrackerPage.excludeStaff('${App.escapeHtml(name)}')">🚫 Ignore Member</button>
                                                <button class="dropdown-item danger" onclick="TrackerPage.removeStaff('${App.escapeHtml(name)}')">✕ Remove Track</button>
                                            </div>
                                        </div>
                                    </td>
                                </tr>
                            `}).join('')}
                        </tbody>
                    </table>
                `;
            } else {
                tableEl.innerHTML += `
                    <div style="padding: 16px;">
                        <h4 class="text-muted mb-16">🚫 Ignored from Tracking</h4>
                        <div class="flex-center gap-8" style="flex-wrap: wrap;">
                            ${roster.excluded.map(ex => `
                                <div class="badge" style="background: rgba(255,255,255,0.05); padding: 8px 16px; display:flex; align-items:center; gap:8px; font-size: 1rem;">
                                    <span>${App.escapeHtml(ex)}</span>
                                    <button class="btn btn-ghost btn-sm" style="padding:0 8px; color:var(--success)" onclick="TrackerPage.unexcludeStaff('${App.escapeHtml(ex)}')">↩ Un-ignore</button>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                `;
            }
        } catch (err) {
            App.toast('Failed to load roster: ' + err.message, 'error');
        }
    },

    // ═══════════════════════════════════════
    // Graph Rendering Engine
    // ═══════════════════════════════════════
    _renderLineGraph(title, dataPoints, color) {
        if (!dataPoints || dataPoints.length === 0) return '';

        const w = 600, h = 180, pad = { top: 20, right: 20, bottom: 40, left: 50 };
        const plotW = w - pad.left - pad.right;
        const plotH = h - pad.top - pad.bottom;

        const values = dataPoints.map(d => d.value);
        const minV = Math.min(...values);
        const maxV = Math.max(...values);
        const range = maxV - minV || 1;

        // Build SVG path
        const points = dataPoints.map((d, i) => {
            const x = pad.left + (i / (dataPoints.length - 1 || 1)) * plotW;
            const y = pad.top + plotH - ((d.value - minV) / range) * plotH;
            return { x, y, label: d.label, value: d.value };
        });

        const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');

        // Area fill path
        const areaD = pathD + ` L ${points[points.length - 1].x.toFixed(1)} ${(pad.top + plotH).toFixed(1)} L ${points[0].x.toFixed(1)} ${(pad.top + plotH).toFixed(1)} Z`;

        // Y-axis labels (5 ticks)
        const yTicks = [];
        for (let i = 0; i <= 4; i++) {
            const val = minV + (range * i / 4);
            const y = pad.top + plotH - (i / 4) * plotH;
            yTicks.push({ y, label: Math.round(val) });
        }

        // X-axis labels (show every Nth to avoid crowding)
        const step = Math.max(1, Math.floor(dataPoints.length / 8));
        const xLabels = dataPoints.filter((_, i) => i % step === 0 || i === dataPoints.length - 1).map((d, _, arr) => {
            const origIdx = dataPoints.indexOf(d);
            const x = pad.left + (origIdx / (dataPoints.length - 1 || 1)) * plotW;
            return { x, label: d.label };
        });

        return `
            <div class="graph-section mt-16">
                <h3 class="card-title mb-8">${title}</h3>
                <svg viewBox="0 0 ${w} ${h}" style="width:100%;max-width:${w}px;height:auto;font-family:var(--mono)">
                    <!-- Grid lines -->
                    ${yTicks.map(t => `<line x1="${pad.left}" y1="${t.y}" x2="${w - pad.right}" y2="${t.y}" stroke="rgba(255,255,255,0.05)" stroke-dasharray="4,4"/>`).join('')}

                    <!-- Area -->
                    <path d="${areaD}" fill="${color}" opacity="0.1"/>

                    <!-- Line -->
                    <path d="${pathD}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>

                    <!-- Dots -->
                    ${points.map(p => `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3" fill="${color}"><title>${p.label}: ${p.value}</title></circle>`).join('')}

                    <!-- Y axis -->
                    <line x1="${pad.left}" y1="${pad.top}" x2="${pad.left}" y2="${pad.top + plotH}" stroke="rgba(255,255,255,0.15)"/>
                    ${yTicks.map(t => `<text x="${pad.left - 6}" y="${t.y + 3}" text-anchor="end" fill="rgba(255,255,255,0.4)" font-size="9">${t.label}</text>`).join('')}

                    <!-- X axis -->
                    <line x1="${pad.left}" y1="${pad.top + plotH}" x2="${w - pad.right}" y2="${pad.top + plotH}" stroke="rgba(255,255,255,0.15)"/>
                    ${xLabels.map(l => `<text x="${l.x}" y="${pad.top + plotH + 16}" text-anchor="middle" fill="rgba(255,255,255,0.4)" font-size="8">${l.label}</text>`).join('')}
                </svg>
            </div>
        `;
    },

    // ═══════════════════════════════════════
    // Inactivity Report
    // ═══════════════════════════════════════

    async loadInactivity() {
        try {
            const report = await API.trackerInactivity();
            TrackerPage.renderInactivityReport(report);
        } catch (err) {
            console.error('Inactivity load failed:', err);
        }
    },

    renderInactivityReport(report) {
        const el = document.getElementById('inactivity-report');
        if (!report) {
            el.innerHTML = '<div class="empty-state"><p>Inactivity data unavailable.</p></div>';
            return;
        }

        let html = '';

        if (report.red && report.red.length > 0) {
            html += `<div class="inactivity-section"><h3>🔴 Inactive 3+ Days</h3>`;
            html += report.red.map(r => `
                <div class="inactivity-item">
                    <div class="flex-center gap-8">
                        <span class="status-dot red"></span>
                        <strong>${App.escapeHtml(r.name)}</strong>
                    </div>
                    <div class="flex-center gap-8">
                        <span class="badge badge-error">${r.inactiveDays}d — last: ${r.lastLogin || r.lastActiveDate || 'never'}</span>
                        <button class="btn btn-accent btn-sm" onclick="TrackerPage.forceCheckSingle('${App.escapeHtml(r.name)}', this)">🔄</button>
                    </div>
                </div>
            `).join('') + '</div>';
        }

        if (report.yellow && report.yellow.length > 0) {
            html += `<div class="inactivity-section"><h3>🟡 Approaching Limit (2 days)</h3>`;
            html += report.yellow.map(r => `
                <div class="inactivity-item">
                    <div class="flex-center gap-8">
                        <span class="status-dot yellow"></span>
                        <strong>${App.escapeHtml(r.name)}</strong>
                    </div>
                    <div class="flex-center gap-8">
                        <span class="badge badge-warning">2d — last: ${r.lastLogin || r.lastActiveDate || 'never'}</span>
                        <button class="btn btn-accent btn-sm" onclick="TrackerPage.forceCheckSingle('${App.escapeHtml(r.name)}', this)">🔄</button>
                    </div>
                </div>
            `).join('') + '</div>';
        }

        if (report.green && report.green.length > 0) {
            html += `<div class="inactivity-section"><h3>🟢 Active</h3>`;
            html += report.green.map(r => `
                <div class="inactivity-item">
                    <div class="flex-center gap-8">
                        <span class="status-dot green"></span>
                        <strong>${App.escapeHtml(r.name)}</strong>
                    </div>
                    <div class="flex-center gap-8">
                        <span class="badge badge-success">${r.online ? 'Online now' : `Last: ${r.lastLogin || r.lastActiveDate || 'recently'}`}</span>
                        <button class="btn btn-ghost btn-sm" onclick="TrackerPage.forceCheckSingle('${App.escapeHtml(r.name)}', this)">🔄</button>
                    </div>
                </div>
            `).join('') + '</div>';
        }

        if (!html) {
            html = '<div class="empty-state"><p>No roster data yet. Add staff and run a check.</p></div>';
        }

        el.innerHTML = html;
    },

    // ═══════════════════════════════════════
    // Monthly Performance
    // ═══════════════════════════════════════

    _currentMonth: null,

    changeMonth(delta) {
        const [y, m] = TrackerPage._currentMonth.split('-').map(Number);
        let newMonth = m + delta;
        let newYear = y;

        if (newMonth > 12) { newMonth = 1; newYear++; }
        else if (newMonth < 1) { newMonth = 12; newYear--; }

        const candidate = `${newYear}-${String(newMonth).padStart(2, '0')}`;
        const now = new Date();
        const currentMax = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

        if (candidate > currentMax) return; // Don't go into the future

        TrackerPage._currentMonth = candidate;
        TrackerPage.loadMonthly();
    },

    async loadMonthly() {
        const monthLabel = document.getElementById('month-label');
        const body = document.getElementById('monthly-body');
        const month = TrackerPage._currentMonth;

        const [y, m] = month.split('-');
        const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
        monthLabel.textContent = `${monthNames[parseInt(m) - 1]} ${y}`;
        body.innerHTML = '<p class="text-muted">Loading...</p>';

        try {
            const stats = await API.trackerMonthlyAll(month);

            if (!stats || stats.length === 0) {
                body.innerHTML = '<div class="empty-state"><p>No data for this month yet. Run a stats check first.</p></div>';
                return;
            }

            const isLive = stats.some(s => s.live);
            const maxReports = Math.max(...stats.map(s => s.reports_done), 1);
            const maxWarns = Math.max(...stats.map(s => s.warns_done), 1);
            const maxSupport = Math.max(...stats.map(s => s.support_done), 1);
            const maxPlaytime = Math.max(...stats.map(s => s.playtime_hours), 1);

            body.innerHTML = `
                ${isLive ? '<p class="text-muted text-sm mb-8">📍 Live data for the current month</p>' : ''}
                <div class="table-wrap">
                    <table>
                        <thead><tr>
                            <th>Member</th>
                            <th>📝 Reports</th>
                            <th>⚠️ Warns</th>
                            <th>📩 Support</th>
                            <th>⏱️ Playtime</th>
                            <th>Total</th>
                        </tr></thead>
                        <tbody>
                            ${stats.map(s => {
                const total = s.reports_done + s.warns_done + s.support_done;
                return `
                                <tr>
                                    <td>
                                        <div class="flex-center gap-8">
                                            <img src="https://mc-heads.net/avatar/${encodeURIComponent(s.member)}/20" width="20" height="20" style="border-radius:3px" onerror="this.style.display='none'">
                                            <strong>${App.escapeHtml(s.member)}</strong>
                                        </div>
                                    </td>
                                    <td>
                                        <div class="inline-bar-wrap">
                                            <div class="inline-bar-fill info" style="width:${(s.reports_done / maxReports * 100).toFixed(0)}%"></div>
                                            <span class="inline-bar-label">${s.reports_done}</span>
                                        </div>
                                    </td>
                                    <td>
                                        <div class="inline-bar-wrap">
                                            <div class="inline-bar-fill warning" style="width:${(s.warns_done / maxWarns * 100).toFixed(0)}%"></div>
                                            <span class="inline-bar-label">${s.warns_done}</span>
                                        </div>
                                    </td>
                                    <td>
                                        <div class="inline-bar-wrap">
                                            <div class="inline-bar-fill success" style="width:${(s.support_done / maxSupport * 100).toFixed(0)}%"></div>
                                            <span class="inline-bar-label">${s.support_done}</span>
                                        </div>
                                    </td>
                                    <td>
                                        <div class="inline-bar-wrap">
                                            <div class="inline-bar-fill accent" style="width:${(s.playtime_hours / maxPlaytime * 100).toFixed(0)}%"></div>
                                            <span class="inline-bar-label">${s.playtime_hours}h</span>
                                        </div>
                                    </td>
                                    <td><span class="badge badge-accent">${total}</span></td>
                                </tr>`;
            }).join('')}
                        </tbody>
                    </table>
                </div>
            `;
        } catch (err) {
            body.innerHTML = `<div class="empty-state"><p>Failed to load: ${App.escapeHtml(err.message)}</p></div>`;
        }
    },

    // ═══════════════════════════════════════
    // Actions
    // ═══════════════════════════════════════

    async addStaff() {
        const input = document.getElementById('tracker-add-input');
        const name = input.value.trim();
        if (!name) return;
        try {
            const result = await API.trackerAdd(name);
            input.value = '';
            App.toast(result.message, result.success ? 'success' : 'info');
            await TrackerPage.loadRoster();
        } catch (err) { App.toast('Failed: ' + err.message, 'error'); }
    },

    async removeStaff(name) {
        try {
            const result = await API.trackerRemove(name);
            App.toast(result.message, result.success ? 'success' : 'info');
            await TrackerPage.loadRoster();
        } catch (err) { App.toast('Failed: ' + err.message, 'error'); }
    },

    async updateSingle(name, btn) {
        if (btn) { btn.disabled = true; btn.textContent = '⏳'; }
        App.toast(`Updating ${name}...`, 'info');
        try {
            await API.trackerCheckSingle(name);
            App.toast(`${name} updated!`, 'success');
            const modal = document.getElementById('member-profile-modal');
            if (modal && modal.style.display === 'flex') {
                TrackerPage.viewStats(name);
            } else {
                await TrackerPage.loadRoster();
            }
        } catch (err) { App.toast('Failed: ' + err.message, 'error'); }
        if (btn) { btn.disabled = false; btn.textContent = '🔄'; }
    },

    async excludeStaffFromInput() {
        const input = document.getElementById('tracker-add-input');
        const name = input.value.trim();
        if (!name) return;
        try {
            const result = await API.trackerExclude(name);
            input.value = '';
            App.toast(result.message, result.success ? 'warning' : 'info');
            await TrackerPage.loadRoster();
        } catch (err) { App.toast('Failed: ' + err.message, 'error'); }
    },

    async excludeStaff(name) {
        try {
            const result = await API.trackerExclude(name);
            App.toast(result.message, result.success ? 'warning' : 'info');
            await TrackerPage.loadRoster();
        } catch (err) { App.toast('Failed: ' + err.message, 'error'); }
    },

    async unexcludeStaff(name) {
        try {
            const result = await API.trackerUnexclude(name);
            App.toast(result.message, result.success ? 'success' : 'info');
            await TrackerPage.loadRoster();
        } catch (err) { App.toast('Failed: ' + err.message, 'error'); }
    },

    async forceCheckSingle(name, btn) {
        if (btn) { btn.disabled = true; btn.textContent = '⏳'; }
        App.toast(`Checking ${name}...`, 'info');
        try {
            await API.trackerCheckSingle(name);
            App.toast(`${name} updated!`, 'success');
            await TrackerPage.loadInactivity();
        } catch (err) { App.toast('Check failed: ' + err.message, 'error'); }
        if (btn) { btn.disabled = false; btn.textContent = '🔄'; }
    },

    async syncRoster() {
        const btn = document.getElementById('tracker-sync');
        btn.disabled = true; btn.textContent = '⏳ Syncing...';
        App.toast('Syncing staff roster from server...', 'info');
        try {
            const res = await API.trackerSync();
            App.toast(`Sync complete! Added ${res.added} new members.`, 'success');
            await TrackerPage.loadRoster();
        } catch (err) { App.toast('Sync failed: ' + err.message, 'error'); }
        btn.disabled = false; btn.textContent = '📡 Sync Roster';
    },

    async quickInactivity() {
        const btn = document.getElementById('inactivity-force-all');
        const btn2 = document.getElementById('tracker-quick-inactivity');
        if (btn) { btn.disabled = true; btn.textContent = '⏳ Checking...'; }
        if (btn2) { btn2.disabled = true; btn2.textContent = '⏳ Scanning...'; }
        App.toast('Running live /find + /info for each member...', 'info');
        try {
            const report = await API.trackerQuickInactivity();
            TrackerPage.renderInactivityReport(report);
            App.toast('Live inactivity check done!', 'success');
        } catch (err) { App.toast('Check failed: ' + err.message, 'error'); }
        if (btn) { btn.disabled = false; btn.textContent = '🔄 Force Check All'; }
        if (btn2) { btn2.disabled = false; btn2.textContent = '⚡ Quick Inactivity'; }
    },

    async forceCheck() {
        const btn = document.getElementById('tracker-force-check');
        btn.disabled = true; btn.textContent = '⏳ Checking...';
        App.toast('Full check running (teamstats + info for all)...', 'info');
        try {
            await API.trackerCheck();
            App.toast('Full check complete!', 'success');
            await TrackerPage.loadRoster();
            await TrackerPage.loadInactivity();
            await TrackerPage.loadMonthly();
            // Refresh graphs for current member
            if (TrackerPage._selectedGraphMember) {
                await TrackerPage.selectGraphMember(TrackerPage._selectedGraphMember);
            }
        } catch (err) { App.toast('Check failed: ' + err.message, 'error'); }
        btn.disabled = false; btn.textContent = '🔄 Full Check All';
    },

    // ═══════════════════════════════════════
    // Member Stats (Profile Modal)
    // ═══════════════════════════════════════

    async viewStats(name) {
        const modal = document.getElementById('member-profile-modal');
        const body = document.getElementById('member-profile-body');

        // Show loading state immediately to prevent "no change" bugs on click
        modal.style.display = 'flex';
        body.innerHTML = `
            <div style="text-align:center; padding: 40px 20px;">
                <img src="https://mc-heads.net/avatar/${encodeURIComponent(name)}/64" width="64" height="64" style="border-radius:8px; margin-bottom:16px;">
                <h2>${App.escapeHtml(name)}</h2>
                <p class="text-muted">Loading Profile Data...</p>
            </div>
        `;

        // Fetch roster to know rank dates
        const roster = await API.trackerRoster();
        const pDate = roster.rankDates?.[name];
        const promotedStr = pDate ? `Since ${pDate}` : 'Unknown Date';

        try {
            const stats = await API.trackerStats(name).catch(() => null);
            const dbHistory = await API.trackerDailyDb(name, 30).catch(() => []);

            if (!stats) {
                body.innerHTML = `<div class="empty-state" style="padding:40px;"><p>No standard stats found for ${App.escapeHtml(name)}. Try running a Full Update first.</p></div>`;
                return;
            }

            let graphHtml = '';
            if (!dbHistory || dbHistory.length < 2) {
                graphHtml = '<p class="text-muted text-sm" style="text-align:center;">Not enough data for graphs. Run at least 2 checks for this member.</p>';
            } else {
                const reportG = TrackerPage._renderLineGraph('📝 Reports', dbHistory.map(d => ({ label: d.date.slice(5), value: d.reports_total || 0 })), 'var(--info)');
                const warnG = TrackerPage._renderLineGraph('⚠️ Warns', dbHistory.map(d => ({ label: d.date.slice(5), value: d.warns_total || 0 })), 'var(--warning)');
                const suppG = TrackerPage._renderLineGraph('📩 Support', dbHistory.map(d => ({ label: d.date.slice(5), value: d.support_total || 0 })), 'var(--success)');
                const playG = TrackerPage._renderLineGraph('⏱️ Playtime', dbHistory.map(d => ({ label: d.date.slice(5), value: d.playtime_total || 0 })), 'var(--accent)');

                graphHtml = `
                    <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 16px;">
                        <div style="cursor:pointer; transition: transform 0.2s;" onclick="TrackerPage.expandGraph(this)" title="Click to expand">${reportG}</div>
                        <div style="cursor:pointer; transition: transform 0.2s;" onclick="TrackerPage.expandGraph(this)" title="Click to expand">${warnG}</div>
                        <div style="cursor:pointer; transition: transform 0.2s;" onclick="TrackerPage.expandGraph(this)" title="Click to expand">${suppG}</div>
                        <div style="cursor:pointer; transition: transform 0.2s;" onclick="TrackerPage.expandGraph(this)" title="Click to expand">${playG}</div>
                    </div>
                `;
            }

            body.innerHTML = `
                <div class="flex-between" style="border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 16px; margin-bottom: 24px;">
                    <div class="flex-center gap-16">
                        <img src="https://mc-heads.net/avatar/${encodeURIComponent(name)}/48" width="48" height="48" style="border-radius:6px;" onerror="this.style.display='none'">
                        <div>
                            <h2 style="margin:0; display:flex; align-items:center; gap:12px;">
                                ${App.escapeHtml(name)}
                                <button class="btn btn-accent btn-sm" style="font-size:11px; padding: 4px 8px;" onclick="TrackerPage.updateSingle('${App.escapeHtml(name)}', this)">🔄 Live Update</button>
                            </h2>
                            <p class="text-muted" style="margin: 4px 0 0 0;">${App.escapeHtml(stats.rank)} &middot; ${promotedStr}</p>
                        </div>
                    </div>
                </div>

                <div class="stats-grid mb-24">
                    <div class="stat-card">
                        <div class="stat-label">📝 Reports</div>
                        <div class="stat-value info">${stats.reports?.today || 0} <span class="text-muted text-sm">/ ${stats.reports?.monthly || 0} / ${stats.reports?.total || 0}</span></div>
                        <div class="stat-sub">today / monthly / total</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-label">⚠️ Warns</div>
                        <div class="stat-value warning">${stats.warns?.today || 0} <span class="text-muted text-sm">/ ${stats.warns?.monthly || 0} / ${stats.warns?.total || 0}</span></div>
                        <div class="stat-sub">today / monthly / total</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-label">📩 Support</div>
                        <div class="stat-value success">${stats.support?.today || 0} <span class="text-muted text-sm">/ ${stats.support?.monthly || 0} / ${stats.support?.total || 0}</span></div>
                        <div class="stat-sub">today / monthly / total</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-label">⏱️ Playtime</div>
                        <div class="stat-value accent">${stats.playtime || 0}h</div>
                        <div class="stat-sub">today: +${stats.playtimeToday || 0}h</div>
                    </div>
                    <div class="stat-card" style="grid-column: span 2;">
                        <div class="stat-label">📅 Last Recorded Login</div>
                        <div class="stat-value text-sm" style="font-size: 1.2rem; margin-top: 8px;">${stats.lastLogin || 'Unknown'}</div>
                    </div>
                    <div class="stat-card" style="grid-column: span 2;">
                        <div class="stat-label">⭐ Rank First Recorded / Promoted</div>
                        <div class="stat-value text-sm text-info" style="font-size: 1.2rem; margin-top: 8px;">${pDate || 'Not recorded'}</div>
                    </div>
                </div>

                <h3 class="mb-16">📈 Performance History (30 Days)</h3>
                ${graphHtml}

                <p class="text-muted text-sm mt-24" style="text-align:right;">Profile Snapshot from ${stats.date || 'unknown'}${stats.collectedAt ? ` at ${new Date(stats.collectedAt).toLocaleTimeString()}` : ''}</p>
            `;
        } catch (err) {
            body.innerHTML = `<div class="empty-state"><p>Failed to load profile: ${App.escapeHtml(err.message)}</p></div>`;
        }
    },

    expandGraph(element) {
        const svgHtml = element.innerHTML;
        // create a full screen overlay dynamically
        const overlay = document.createElement('div');
        overlay.style.position = 'fixed';
        overlay.style.top = '0';
        overlay.style.left = '0';
        overlay.style.width = '100vw';
        overlay.style.height = '100vh';
        overlay.style.backgroundColor = 'rgba(0,0,0,0.85)';
        overlay.style.backdropFilter = 'blur(10px)';
        overlay.style.zIndex = '9999';
        overlay.style.display = 'flex';
        overlay.style.alignItems = 'center';
        overlay.style.justifyContent = 'center';
        overlay.style.padding = '40px';
        overlay.style.cursor = 'zoom-out';

        overlay.onclick = () => document.body.removeChild(overlay);

        const container = document.createElement('div');
        container.style.width = '100%';
        container.style.maxWidth = '1000px';
        container.style.background = 'var(--bg-card)';
        container.style.border = '1px solid var(--border)';
        container.style.borderRadius = 'var(--radius)';
        container.style.padding = '30px';
        container.style.boxShadow = 'var(--shadow-lg)';
        container.style.cursor = 'default';
        container.onclick = (e) => e.stopPropagation();

        // clone inner HTML but make sure the SVG scales bigger and title text is larger
        let expandedHtml = svgHtml.replace(/<svg /, '<svg style="width:100%;height:auto;min-height:300px;font-family:var(--mono)" ');
        expandedHtml = expandedHtml.replace(/<h3 class="card-title mb-8">/, '<h3 class="card-title mb-16" style="font-size: 20px;">');

        container.innerHTML = expandedHtml;
        overlay.appendChild(container);
        document.body.appendChild(overlay);
    }
};
