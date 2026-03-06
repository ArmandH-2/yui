/**
 * API Client — Fetch wrapper for the dashboard REST API.
 */

const API = {
    async get(path) {
        const res = await fetch(`/api${path}`);
        if (!res.ok) throw new Error(await res.text());
        return res.json();
    },

    async post(path, body = {}) {
        const res = await fetch(`/api${path}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error(await res.text());
        return res.json();
    },

    async del(path) {
        const res = await fetch(`/api${path}`, { method: 'DELETE' });
        if (!res.ok) throw new Error(await res.text());
        return res.json();
    },

    // ── Status ──
    status: () => API.get('/status'),
    toggleMode: () => API.post('/mode/toggle'),

    // ── Tracker ──
    trackerRoster: () => API.get('/tracker/roster'),
    trackerSync: () => API.post('/tracker/sync'),
    trackerAdd: (name) => API.post('/tracker/add', { name }),
    trackerRemove: (name) => API.post('/tracker/remove', { name }),
    trackerExclude: (name) => API.post('/tracker/exclude', { name }),
    trackerUnexclude: (name) => API.post('/tracker/unexclude', { name }),
    trackerCheck: () => API.post('/tracker/check'),
    trackerCheckSingle: (name) => API.post(`/tracker/check/${encodeURIComponent(name)}`),
    trackerQuickInactivity: () => API.post('/tracker/quick-inactivity'),
    trackerStats: (name) => API.get(`/tracker/stats/${encodeURIComponent(name)}`),
    trackerInactivity: () => API.get('/tracker/inactivity'),
    trackerHistory: (name, days = 7) => API.get(`/tracker/history/${encodeURIComponent(name)}?days=${days}`),
    trackerMonthly: (name, months = 12) => API.get(`/tracker/monthly/${encodeURIComponent(name)}?months=${months}`),
    trackerMonthlyAll: (month) => API.get(`/tracker/monthly-all?month=${encodeURIComponent(month || '')}`),
    trackerDailyDb: (name, days = 30) => API.get(`/tracker/daily-db/${encodeURIComponent(name)}?days=${days}`),
    trackerRollup: (month) => API.post('/tracker/rollup', { month }),

    // ── Profiles ──
    profiles: () => API.get('/profiles'),
    profileWatch: (name, type) => API.post('/profiles/watch', { name, type }),
    profileUnwatch: (name) => API.post('/profiles/unwatch', { name }),
    profileDelete: (name) => API.del(`/profiles/${encodeURIComponent(name)}`),
    profileDossier: (name) => API.get(`/profiles/${encodeURIComponent(name)}`),
    profileCheck: (name) => API.post(`/profiles/${encodeURIComponent(name)}/check`),
    profileNote: (name, text, category) => API.post(`/profiles/${encodeURIComponent(name)}/note`, { text, category }),
    profileChatlogDelete: (name, code) => API.del(`/profiles/${encodeURIComponent(name)}/chatlogs/${encodeURIComponent(code)}`),

    // ── Audit & Feedback ──
    auditToday: () => API.get('/audit/today'),
    auditRecent: (n = 20) => API.get(`/audit/recent/${n}`),
    auditStats: () => API.get('/audit/stats'),
    auditSearch: (q, type, limit) => API.get(`/audit/search?q=${encodeURIComponent(q || '')}&type=${encodeURIComponent(type || '')}&limit=${limit || 50}`),
    feedback: () => API.get('/feedback'),
    feedbackDetails: () => API.get('/feedback/details'),

    // ── Console ──
    runCommand: (command) => API.post('/console/run', { command }),

    // ── Reminders ──
    reminders: () => API.get('/reminders'),
    reminderAdd: (target, message, when) => API.post('/reminders/add', { target, message, when }),
    reminderCancel: (id) => API.post(`/reminders/cancel/${encodeURIComponent(id)}`),

    // ── Skills ──
    skills: () => API.get('/skills'),
    skillAdd: (name, description, steps) => API.post('/skills/add', { name, description, steps }),
    skillDelete: (name) => API.del(`/skills/${encodeURIComponent(name)}`),

    // ── Memories ──
    memories: (limit, offset) => API.get(`/memories?limit=${limit || 50}&offset=${offset || 0}`),
    memoryAdd: (text, category) => API.post('/memories', { text, category }),
    memoryDelete: (id) => API.del(`/memories/${encodeURIComponent(id)}`),
};
