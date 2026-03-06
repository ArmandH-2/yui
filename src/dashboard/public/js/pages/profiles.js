/**
 * Player Profiles Page — Surveillance dashboard with dossier view.
 * Shows: watch list, schedule heatmap, alts, punishments, playtime graph,
 * section frequency, persona analysis, chatlogs, notes.
 */

const ProfilesPage = {
    currentProfile: null,
    currentTab: 'active',

    async render(container) {
        container.innerHTML = `
            <div class="page-header flex-between">
                <div>
                    <h1>🔍 Player Profiles</h1>
                    <p>Surveillance & intelligence gathering on players</p>
                </div>
            </div>

            <div class="input-group">
                <input type="text" id="profile-watch-name" placeholder="Player name...">
                <select id="profile-watch-type" style="width:160px">
                    <option value="applicant">Applicant</option>
                    <option value="suspect">Suspect</option>
                    <option value="staff-suspect">Staff Suspect</option>
                </select>
                <button class="btn btn-success" id="profile-watch-btn">👁️ Watch</button>
            </div>

            <div id="profiles-list-area">
                <div class="card mb-24">
                    <div class="card-header"><span class="card-title">📋 Watch List</span></div>
                    <div id="profiles-list"><p class="text-muted">Loading...</p></div>
                </div>
            </div>

            <div id="dossier-area" style="display:none">
                <div class="flex-between mb-16">
                    <h2 id="dossier-title">Dossier</h2>
                    <div class="flex-center gap-8">
                        <button class="btn btn-accent" id="dossier-force-check">🔄 Force Check</button>
                        <button class="btn btn-ghost" id="dossier-back">← Back</button>
                    </div>
                </div>
                <div id="dossier-content"></div>
            </div>
        `;

        document.getElementById('profile-watch-btn').addEventListener('click', () => ProfilesPage.watchPlayer());
        document.getElementById('profile-watch-name').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') ProfilesPage.watchPlayer();
        });
        document.getElementById('dossier-back').addEventListener('click', () => {
            document.getElementById('dossier-area').style.display = 'none';
            document.getElementById('profiles-list-area').style.display = 'block';
        });

        await ProfilesPage.loadList();
    },

    async loadList() {
        try {
            const profiles = await API.profiles();
            const el = document.getElementById('profiles-list');

            if (!profiles || profiles.length === 0) {
                el.innerHTML = '<div class="empty-state"><div class="empty-icon">🔍</div><p>No players being watched. Add one above!</p></div>';
                return;
            }

            const active = profiles.filter(p => p.status === 'active');
            const archived = profiles.filter(p => p.status !== 'active');

            const stateIcon = (s) => ({ idle: '💤', active: '🟢', cooldown: '🔶' }[s] || '⚪');
            const typeColor = (t) => ({ applicant: 'badge-accent', suspect: 'badge-warning', 'staff-suspect': 'badge-error' }[t] || 'badge-info');

            el.innerHTML = `
                <div class="tabs mb-16" style="display:flex; gap:8px;">
                    <button class="btn btn-sm ${ProfilesPage.currentTab === 'active' ? 'btn-primary' : 'btn-ghost'}" onclick="ProfilesPage.setTab('active')">🟢 Active (${active.length})</button>
                    <button class="btn btn-sm ${ProfilesPage.currentTab === 'archived' ? 'btn-primary' : 'btn-ghost'}" onclick="ProfilesPage.setTab('archived')">📦 Archived (${archived.length})</button>
                </div>
                <table>
                    <thead><tr>
                        <th>Player</th>
                        <th>Type</th>
                        <th>State</th>
                        <th>Since</th>
                        <th>Checks</th>
                        <th>Actions</th>
                    </tr></thead>
                    <tbody>
                        ${ProfilesPage.currentTab === 'active' ? active.map(p => `
                            <tr>
                                <td>
                                    <div class="flex-center gap-8">
                                        <img src="https://mc-heads.net/avatar/${encodeURIComponent(p.name)}/24" width="24" height="24" style="border-radius:4px" onerror="this.style.display='none'">
                                        <strong>${App.escapeHtml(p.name)}</strong>
                                    </div>
                                </td>
                                <td><span class="badge ${typeColor(p.type)}">${p.type || 'unknown'}</span></td>
                                <td>${stateIcon(p.surveillanceState)} ${p.surveillanceState || 'idle'}</td>
                                <td class="text-muted">${p.trackingSince?.slice(0, 10) || '—'}</td>
                                <td>${p.checkCount || 0}</td>
                                <td>
                                    <button class="btn btn-primary btn-sm" onclick="ProfilesPage.viewDossier('${App.escapeHtml(p.name)}')">🗂️ Dossier</button>
                                    <button class="btn btn-ghost btn-sm" onclick="ProfilesPage.forceCheck('${App.escapeHtml(p.name)}')">🔄</button>
                                    <button class="btn btn-danger btn-sm" onclick="ProfilesPage.unwatchPlayer('${App.escapeHtml(p.name)}')">✕</button>
                                </td>
                            </tr>
                        `).join('') : ''}
                        ${ProfilesPage.currentTab === 'archived' ? archived.map(p => `
                            <tr style="opacity:0.7">
                                <td><s>${App.escapeHtml(p.name)}</s></td>
                                <td><span class="badge badge-info">${p.type || 'unknown'}</span></td>
                                <td>📦</td>
                                <td class="text-muted">${p.trackingSince?.slice(0, 10) || '—'}</td>
                                <td>${p.checkCount || 0}</td>
                                <td>
                                    <span class="text-muted text-sm mr-8">archived</span>
                                    <button class="btn btn-danger btn-sm" title="Delete Profile" onclick="ProfilesPage.deleteProfile('${App.escapeHtml(p.name)}')">🗑️</button>
                                </td>
                            </tr>
                        `).join('') : ''}
                    </tbody>
                </table>
            `;
        } catch (err) {
            App.toast('Failed to load profiles: ' + err.message, 'error');
        }
    },

    setTab(tabName) {
        ProfilesPage.currentTab = tabName;
        ProfilesPage.loadList();
    },

    async watchPlayer() {
        const nameInput = document.getElementById('profile-watch-name');
        const typeSelect = document.getElementById('profile-watch-type');
        const name = nameInput.value.trim();
        if (!name) return;

        try {
            const result = await API.profileWatch(name, typeSelect.value);
            nameInput.value = '';
            App.toast(result.message, result.success ? 'success' : 'info');
            await ProfilesPage.loadList();
        } catch (err) {
            App.toast('Failed: ' + err.message, 'error');
        }
    },

    async unwatchPlayer(name) {
        try {
            await API.profileUnwatch(name);
            App.toast(`Stopped watching ${name}`, 'success');
            await ProfilesPage.loadList();
        } catch (err) {
            App.toast('Failed: ' + err.message, 'error');
        }
    },

    async deleteProfile(name) {
        if (!confirm(`WARNING: This will permanently delete ALL data for ${name} (playtime, chatlogs, notes, etc). Are you sure?`)) return;
        try {
            await API.profileDelete(name);
            App.toast(`Deleted profile for ${name}`, 'success');
            await ProfilesPage.loadList();
        } catch (err) {
            App.toast('Failed: ' + err.message, 'error');
        }
    },

    async forceCheck(name) {
        App.toast(`Running full intelligence check on ${name}...`, 'info');
        try {
            await API.profileCheck(name);
            App.toast(`${name} checked!`, 'success');
            if (ProfilesPage.currentProfile === name) {
                await ProfilesPage.viewDossier(name);
            }
        } catch (err) {
            App.toast('Failed: ' + err.message, 'error');
        }
    },

    async viewDossier(name) {
        ProfilesPage.currentProfile = name;
        document.getElementById('profiles-list-area').style.display = 'none';
        document.getElementById('dossier-area').style.display = 'block';
        document.getElementById('dossier-title').textContent = `🗂️ ${name} — Dossier`;

        const forceBtn = document.getElementById('dossier-force-check');
        forceBtn.onclick = () => ProfilesPage.forceCheck(name);

        const content = document.getElementById('dossier-content');
        content.innerHTML = '<p class="text-muted">Loading dossier...</p>';

        try {
            const d = await API.profileDossier(name);

            if (!d || !d.profile) {
                content.innerHTML = '<div class="empty-state"><p>No profile data. Run a force-check first.</p></div>';
                return;
            }

            const p = d.profile;
            const act = d.activity;
            const ana = d.analysis;
            const notes = d.notes || [];
            const alts = d.alts || [];
            const punishments = d.punishments || [];
            const schedule = d.schedule || { matrix: {} };
            const ptHistory = d.playtimeHistory || [];
            const chatlogs = d.recentChatlogs || [];

            let html = '<div class="dossier-grid">';

            // ── Profile + Surveillance Status ──
            html += `
                <div class="card">
                    <div class="card-title mb-16">📋 Profile</div>
                    <p><strong>Name:</strong> ${App.escapeHtml(p.name)}</p>
                    <p><strong>Type:</strong> <span class="badge ${({ 'applicant': 'badge-accent', 'suspect': 'badge-warning', 'staff-suspect': 'badge-error' })[p.type] || 'badge-info'}">${p.type || 'unknown'}</span></p>
                    <p><strong>Since:</strong> ${p.trackingSince?.slice(0, 10) || 'unknown'}</p>
                    <p><strong>Checks:</strong> ${p.checkCount || 0}</p>
                    <p><strong>Last checked:</strong> ${p.lastChecked ? App.timeAgo(p.lastChecked) : 'never'}</p>
                    <p><strong>State:</strong> ${{ idle: '💤 Idle', active: '🟢 Active', cooldown: '🔶 Cooldown' }[p.surveillanceState] || '⚪ Unknown'}</p>
                    ${p.latestPlaytime != null ? `<p><strong>Playtime:</strong> ${p.latestPlaytime}h ${p.playtimeBaseline != null ? `(+${Math.max(0, p.latestPlaytime - p.playtimeBaseline)}h since watch)` : ''}</p>` : ''}
                    ${p.lastChatlogAt ? `<p><strong>Last chatlog:</strong> ${App.timeAgo(p.lastChatlogAt)}</p>` : ''}
                </div>
            `;

            // ── Activity Summary ──
            html += `<div class="card"><div class="card-title mb-16">📡 Activity</div>`;
            if (act) {
                html += `
                    <p><strong>Latest playtime:</strong> ${act.latestPlaytime ?? '?'}h</p>
                    <p><strong>Activity rate:</strong> ${act.activityRate ?? 0}% (${act.activeDays ?? 0} active / ${act.inactiveDays ?? 0} inactive)</p>
                    <p><strong>Avg daily:</strong> ${act.avgDailyPlaytime ?? 0}h/day</p>
                    <p><strong>Days tracked:</strong> ${act.daysTracked ?? 0}</p>
                `;
            } else {
                html += '<p class="text-muted">No activity data yet.</p>';
            }
            html += '</div>';

            // ── Alt Accounts ──
            html += `<div class="card"><div class="card-title mb-16">👥 Alt Accounts (${alts.length})</div>`;
            if (alts.length > 0) {
                html += alts.map(a => `
                    <div class="flex-center gap-8 mb-8">
                        <img src="https://mc-heads.net/avatar/${encodeURIComponent(a)}/20" width="20" height="20" style="border-radius:3px" onerror="this.style.display='none'">
                        <strong>${App.escapeHtml(a)}</strong>
                    </div>
                `).join('');
            } else {
                html += '<p class="text-muted">No alts found yet.</p>';
            }
            html += '</div>';

            // ── Schedule Heatmap (24h × 7 days) ──
            html += `<div class="card full-width"><div class="card-title mb-16">🕐 Online Schedule Pattern</div>`;
            html += ProfilesPage._renderScheduleHeatmap(schedule);
            html += '</div>';

            // ── Playtime Graph ──
            if (ptHistory.length > 1) {
                html += `<div class="card full-width"><div class="card-title mb-16">📈 Playtime History</div>`;
                html += ProfilesPage._renderPlaytimeGraph(ptHistory);
                html += '</div>';
            }

            // ── Section Frequency ──
            if (act?.topSections?.length > 0) {
                const maxCount = act.topSections[0].count;
                html += `<div class="card full-width">
                    <div class="card-title mb-16">🎮 Most Played Sections</div>
                    <div style="display:flex;flex-direction:column;gap:6px">
                        ${act.topSections.map(s => `
                            <div style="display:flex;align-items:center;gap:8px">
                                <span style="min-width:100px;font-size:13px">${App.escapeHtml(s.section)}</span>
                                <div style="flex:1;height:16px;background:rgba(255,255,255,0.05);border-radius:4px;overflow:hidden">
                                    <div style="height:100%;width:${maxCount > 0 ? (s.count / maxCount) * 100 : 0}%;background:var(--accent);border-radius:4px"></div>
                                </div>
                                <span style="min-width:30px;text-align:right;font-size:12px;color:var(--text-dim)">${s.count}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>`;
            }

            // ── Punishment History ──
            html += `<div class="card full-width"><div class="card-title mb-16">⚖️ Punishment History (${punishments.length})</div>`;
            if (punishments.length > 0) {
                html += `<div class="table-wrap"><table>
                    <thead><tr><th>Type</th><th>Reason</th><th>By</th><th>Date</th><th>Duration</th></tr></thead>
                    <tbody>
                        ${punishments.slice().reverse().map(e => `
                            <tr>
                                <td><span class="badge badge-${e.type === 'ban' || e.type === 'tempban' ? 'error' : e.type === 'mute' || e.type === 'tempmute' ? 'warning' : 'info'}">${e.type}</span></td>
                                <td>${App.escapeHtml(e.reason || '—')}</td>
                                <td>${App.escapeHtml(e.by || '—')}</td>
                                <td class="text-muted">${e.date || '—'}</td>
                                <td>${e.duration || '—'}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table></div>`;
            } else {
                html += '<p class="text-muted">No punishments recorded. Clean record so far.</p>';
            }
            html += '</div>';

            // ── Persona Analysis ──
            html += `<div class="card full-width"><div class="card-title mb-16">🧠 Persona Analysis</div>`;
            if (ana?.persona) {
                const pa = ana.persona;
                html += `
                    <div class="stats-grid">
                        <div class="stat-card"><div class="stat-label">Tone</div><div class="stat-value text-sm">${pa.tone || '?'}</div></div>
                        <div class="stat-card"><div class="stat-label">Maturity</div><div class="stat-value text-sm">${pa.maturity || '?'}</div></div>
                        <div class="stat-card"><div class="stat-label">Staff Suitability</div><div class="stat-value text-sm">${pa.staffSuitability || '?'}</div></div>
                        <div class="stat-card"><div class="stat-label">Analyses</div><div class="stat-value text-sm">${ana.chatlogsAnalyzed || 0}</div></div>
                    </div>
                    ${pa.summary ? `<p class="mt-16">${App.escapeHtml(pa.summary)}</p>` : ''}
                    ${pa.redFlags?.length > 0 ? `<p class="mt-8" style="color:var(--error)">⚠️ Red flags: ${pa.redFlags.join(', ')}</p>` : ''}
                    ${pa.positiveTraits?.length > 0 ? `<p style="color:var(--success)">✅ Positive: ${pa.positiveTraits.join(', ')}</p>` : ''}
                `;
            } else {
                html += '<p class="text-muted">No analysis yet. Run a force-check.</p>';
            }
            html += '</div>';

            // ── Recent Chatlogs ──
            html += `<div class="card full-width">
                <div class="card-title mb-16">💬 Recent Chatlogs (${chatlogs.length})</div>`;
            if (chatlogs.length > 0) {
                html += chatlogs.slice().reverse().map(cl => `
                    <div class="brain-item" style="border-left-color: var(--info)">
                        <div class="brain-item-header">
                            <span class="brain-item-title">
                                ${cl.url
                        ? `<a href="${App.escapeHtml(cl.url)}" target="_blank" rel="noopener" style="color:var(--info);text-decoration:underline">📄 ${App.escapeHtml(cl.chatlogCode || 'View')}</a>`
                        : `📄 ${App.escapeHtml(cl.chatlogCode || 'N/A')}`
                    }
                            </span>
                            <div class="flex-center gap-8">
                                <span class="brain-item-meta">${cl.timestamp?.slice(0, 16).replace('T', ' ') || 'unknown'}</span>
                                ${cl.chatlogCode ? `<button class="btn btn-ghost btn-sm" title="Delete Chatlog" onclick="ProfilesPage.deleteChatlog('${App.escapeHtml(name)}', '${App.escapeHtml(cl.chatlogCode)}')">🗑️</button>` : ''}
                            </div>
                        </div>
                        ${cl.analysis?.summary ? `<div class="brain-item-body mt-8">${App.escapeHtml(cl.analysis.summary)}</div>` : ''}
                        ${cl.analysis ? `
                            <div class="flex-center gap-8 mt-8">
                                <span class="badge badge-${cl.analysis.tone === 'toxic' ? 'error' : cl.analysis.tone === 'respectful' || cl.analysis.tone === 'helpful' ? 'success' : 'info'}">${cl.analysis.tone || '?'}</span>
                                <span class="badge badge-${cl.analysis.staffSuitability === 'recommended' ? 'success' : cl.analysis.staffSuitability === 'not_recommended' ? 'error' : 'warning'}">${cl.analysis.staffSuitability || '?'}</span>
                                <span class="badge badge-accent">${cl.analysis.messageCount || 0} msgs</span>
                            </div>
                        ` : ''}
                    </div>
                `).join('');
            } else {
                html += '<p class="text-muted">No chatlogs analyzed yet.</p>';
            }
            html += '</div>';

            // ── Notes ──
            html += `<div class="card full-width">
                <div class="card-title mb-16">📌 Notes (${notes.length})</div>
                <div class="input-group">
                    <input type="text" id="note-input" placeholder="Add a note...">
                    <select id="note-category" style="width:140px">
                        <option value="general">General</option>
                        <option value="incident">Incident</option>
                        <option value="positive">Positive</option>
                    </select>
                    <button class="btn btn-primary" onclick="ProfilesPage.addNote('${App.escapeHtml(name)}')">Add</button>
                </div>`;
            if (notes.length > 0) {
                html += notes.slice().reverse().map(n => `
                    <div class="note-item" style="border-left-color: ${n.category === 'incident' ? 'var(--error)' : n.category === 'positive' ? 'var(--success)' : 'var(--accent)'}">
                        <div class="note-meta">${n.timestamp?.slice(0, 16).replace('T', ' ') || 'unknown'} — ${App.escapeHtml(n.author || 'unknown')} · <span class="badge badge-${n.category === 'incident' ? 'error' : n.category === 'positive' ? 'success' : 'info'}">${n.category || 'general'}</span></div>
                        <div class="note-text">${App.escapeHtml(n.text)}</div>
                    </div>
                `).join('');
            } else {
                html += '<p class="text-muted">No notes yet.</p>';
            }
            html += '</div>';

            html += '</div>'; // close dossier-grid
            content.innerHTML = html;
        } catch (err) {
            content.innerHTML = `<div class="empty-state"><p>Failed: ${App.escapeHtml(err.message)}</p></div>`;
        }
    },

    async deleteChatlog(name, code) {
        if (!confirm(`Are you sure you want to delete chatlog ${code}?`)) return;
        try {
            await API.profileChatlogDelete(name, code);
            App.toast('Chatlog deleted', 'success');
            await ProfilesPage.viewDossier(name);
        } catch (err) {
            App.toast('Failed to delete chatlog: ' + err.message, 'error');
        }
    },

    // ── Schedule Heatmap (24h × 7 days) ──
    _renderScheduleHeatmap(schedule) {
        const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
        const hours = Array.from({ length: 24 }, (_, i) => i);
        const matrix = schedule?.matrix || {};

        // Find max value for color scaling
        let maxVal = 0;
        for (const day of days) {
            for (const h of hours) {
                const v = matrix[day]?.[h] || 0;
                if (v > maxVal) maxVal = v;
            }
        }
        if (maxVal === 0) {
            return '<p class="text-muted">No schedule data yet. Needs at least a few /find checks.</p>';
        }

        let html = '<div style="overflow-x:auto"><table style="border-collapse:collapse;width:100%"><thead><tr><th style="font-size:11px;padding:2px 4px"></th>';
        for (const h of hours) {
            html += `<th style="font-size:9px;padding:2px;text-align:center;color:var(--text-dim)">${h}</th>`;
        }
        html += '</tr></thead><tbody>';

        for (const day of days) {
            html += `<tr><td style="font-size:11px;padding:2px 6px;font-weight:600;white-space:nowrap">${day}</td>`;
            for (const h of hours) {
                const v = matrix[day]?.[h] || 0;
                const intensity = v / maxVal;
                const bg = v === 0
                    ? 'rgba(255,255,255,0.03)'
                    : `rgba(139,92,246,${0.15 + intensity * 0.85})`;
                html += `<td style="padding:0;width:20px;height:18px;background:${bg};border:1px solid rgba(0,0,0,0.2);border-radius:2px" title="${day} ${h}:00 — ${v} sighting${v !== 1 ? 's' : ''}"></td>`;
            }
            html += '</tr>';
        }

        html += '</tbody></table></div>';
        html += `<p class="text-muted text-sm mt-8">Hours are in CET. Darker = more frequently seen online.</p>`;
        return html;
    },

    // ── Playtime Line Graph ──
    _renderPlaytimeGraph(ptHistory) {
        if (!ptHistory || ptHistory.length < 2) return '<p class="text-muted">Not enough data for a graph.</p>';

        const w = 600, h = 160, pad = { top: 15, right: 15, bottom: 35, left: 50 };
        const plotW = w - pad.left - pad.right;
        const plotH = h - pad.top - pad.bottom;

        const vals = ptHistory.map(d => d.playtime);
        const minV = Math.min(...vals);
        const maxV = Math.max(...vals);
        const range = maxV - minV || 1;

        const points = ptHistory.map((d, i) => ({
            x: pad.left + (i / (ptHistory.length - 1 || 1)) * plotW,
            y: pad.top + plotH - ((d.playtime - minV) / range) * plotH,
            label: d.date.slice(5),
            value: d.playtime,
        }));

        const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
        const areaD = pathD + ` L ${points[points.length - 1].x.toFixed(1)} ${(pad.top + plotH).toFixed(1)} L ${points[0].x.toFixed(1)} ${(pad.top + plotH).toFixed(1)} Z`;

        const yTicks = [];
        for (let i = 0; i <= 4; i++) {
            const val = minV + (range * i / 4);
            yTicks.push({ y: pad.top + plotH - (i / 4) * plotH, label: Math.round(val) });
        }

        const step = Math.max(1, Math.floor(ptHistory.length / 8));
        const xLabels = ptHistory.filter((_, i) => i % step === 0 || i === ptHistory.length - 1).map(d => {
            const idx = ptHistory.indexOf(d);
            return { x: pad.left + (idx / (ptHistory.length - 1 || 1)) * plotW, label: d.date.slice(5) };
        });

        return `
            <svg viewBox="0 0 ${w} ${h}" style="width:100%;max-width:${w}px;height:auto;font-family:var(--mono)">
                ${yTicks.map(t => `<line x1="${pad.left}" y1="${t.y}" x2="${w - pad.right}" y2="${t.y}" stroke="rgba(255,255,255,0.05)" stroke-dasharray="4,4"/>`).join('')}
                <path d="${areaD}" fill="var(--accent)" opacity="0.1"/>
                <path d="${pathD}" fill="none" stroke="var(--accent)" stroke-width="2"/>
                ${points.map(p => `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3" fill="var(--accent)"><title>${p.label}: ${p.value}h</title></circle>`).join('')}
                <line x1="${pad.left}" y1="${pad.top}" x2="${pad.left}" y2="${pad.top + plotH}" stroke="rgba(255,255,255,0.15)"/>
                ${yTicks.map(t => `<text x="${pad.left - 5}" y="${t.y + 3}" text-anchor="end" fill="rgba(255,255,255,0.4)" font-size="9">${t.label}h</text>`).join('')}
                <line x1="${pad.left}" y1="${pad.top + plotH}" x2="${w - pad.right}" y2="${pad.top + plotH}" stroke="rgba(255,255,255,0.15)"/>
                ${xLabels.map(l => `<text x="${l.x}" y="${pad.top + plotH + 14}" text-anchor="middle" fill="rgba(255,255,255,0.4)" font-size="8">${l.label}</text>`).join('')}
            </svg>
        `;
    },

    async addNote(name) {
        const input = document.getElementById('note-input');
        const category = document.getElementById('note-category').value;
        const text = input.value.trim();
        if (!text) return;

        try {
            await API.profileNote(name, text, category);
            input.value = '';
            App.toast('Note added!', 'success');
            await ProfilesPage.viewDossier(name);
        } catch (err) {
            App.toast('Failed: ' + err.message, 'error');
        }
    },
};
