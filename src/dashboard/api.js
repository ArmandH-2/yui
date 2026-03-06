/**
 * Dashboard API — REST endpoints exposing all Yui functionality.
 * All routes are prefixed with /api/ by the server.
 */

const express = require('express');

/**
 * Create API router with access to bot deps.
 * @param {object} deps - Shared dependencies from index.js
 * @returns {express.Router}
 */
function createApiRouter(deps) {
    const router = express.Router();
    const { rag, skills, cmdRunner, chatBuffer, scheduler, audit, feedback, tracker, profiler } = deps;

    // ═══════════════════════════════════════
    // System Status
    // ═══════════════════════════════════════

    router.get('/status', (req, res) => {
        const mcBot = deps.mcBot;
        const discordClient = deps.discordClient;

        res.json({
            minecraft: mcBot?.isReady?.() || false,
            discord: discordClient?.isReady?.() || false,
            mode: deps.getMode?.() ? 'private' : 'public',
            memories: rag?.getMemoryCount?.() || 0,
            skills: skills?.getSkillNames?.()?.length || 0,
            reminders: scheduler?.listReminders?.()?.length || 0,
            staffTracked: tracker?.getRoster?.()?.members?.length || 0,
            playersWatched: profiler?.getWatchList?.()?.filter(p => p.status === 'active')?.length || 0,
            auditToday: audit?.getTodayStats?.()?.total || 0,
            feedbackPositive: feedback?.getStats?.()?.positive || 0,
            feedbackNegative: feedback?.getStats?.()?.negative || 0,
            chatBuffer: chatBuffer?.messages?.length || 0,
            uptime: process.uptime(),
        });
    });

    // ═══════════════════════════════════════
    // Mode Toggle
    // ═══════════════════════════════════════

    router.post('/mode/toggle', (req, res) => {
        if (!deps.setMode || !deps.getMode) {
            return res.status(500).json({ error: 'Mode control not available' });
        }
        const current = deps.getMode();
        deps.setMode(!current);
        const newMode = deps.getMode() ? 'private' : 'public';
        console.log(`[Dashboard] Mode toggled to ${newMode}`);
        if (audit) {
            audit.log('mode_changed', { mode: newMode, source: 'dashboard' });
        }
        res.json({ mode: newMode });
    });

    // ═══════════════════════════════════════
    // Staff Tracker
    // ═══════════════════════════════════════

    router.get('/tracker/roster', (req, res) => {
        res.json(tracker.getRoster());
    });

    router.post('/tracker/add', (req, res) => {
        const { name } = req.body;
        if (!name) return res.status(400).json({ error: 'Name required' });
        const added = tracker.addStaff(name);
        if (added && audit) {
            audit.log('tracker_roster_changed', { action: 'add', member: name, source: 'dashboard' });
        }
        res.json({ success: added, message: added ? `Added ${name}` : `${name} already on roster` });
    });

    router.post('/tracker/remove', (req, res) => {
        const { name } = req.body;
        if (!name) return res.status(400).json({ error: 'Name required' });
        const removed = tracker.removeStaff(name);
        if (removed && audit) {
            audit.log('tracker_roster_changed', { action: 'remove', member: name, source: 'dashboard' });
        }
        res.json({ success: removed, message: removed ? `Removed ${name}` : `${name} not found` });
    });

    router.post('/tracker/exclude', (req, res) => {
        const { name } = req.body;
        if (!name) return res.status(400).json({ error: 'Name required' });
        const excluded = tracker.excludeStaff(name);
        if (excluded && audit) {
            audit.log('tracker_roster_changed', { action: 'exclude', member: name, source: 'dashboard' });
        }
        res.json({ success: excluded, message: excluded ? `Excluded ${name}` : `${name} already excluded` });
    });

    router.post('/tracker/unexclude', (req, res) => {
        const { name } = req.body;
        if (!name) return res.status(400).json({ error: 'Name required' });
        const unexcluded = tracker.unexcludeStaff(name);
        if (unexcluded && audit) {
            audit.log('tracker_roster_changed', { action: 'unexclude', member: name, source: 'dashboard' });
        }
        res.json({ success: unexcluded, message: unexcluded ? `Un-excluded ${name}` : `${name} not in exclude list` });
    });

    router.post('/tracker/sync', async (req, res) => {
        try {
            const result = await tracker.syncStaffList();
            if (result.success && result.added > 0 && audit) {
                audit.log('tracker_sync', { addedCount: result.added, totalFound: result.totalFound, source: 'dashboard' });
            }
            res.json(result);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    router.post('/tracker/check', async (req, res) => {
        try {
            const data = await tracker.collectAll();
            res.json({ success: true, data });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    router.post('/tracker/check/:name', async (req, res) => {
        try {
            const data = await tracker.collectSingleMember(req.params.name);
            res.json({ success: true, data });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    router.post('/tracker/quick-inactivity', async (req, res) => {
        try {
            const report = await tracker.quickInactivityCheck();
            res.json(report);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    router.get('/tracker/stats/:name', async (req, res) => {
        try {
            const stats = await tracker.getMemberStats(req.params.name);
            if (!stats) return res.status(404).json({ error: 'No stats found. Run a check first.' });
            res.json(stats);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    router.get('/tracker/inactivity', (req, res) => {
        res.json(tracker.getInactivityReport());
    });

    router.get('/tracker/history/:name', (req, res) => {
        const days = parseInt(req.query.days) || 7;
        res.json(tracker.getMemberHistory(req.params.name, days));
    });

    // ── Monthly Stats ──

    router.get('/tracker/monthly/:name', (req, res) => {
        const months = parseInt(req.query.months) || 12;
        res.json(tracker.getMonthlyHistory(req.params.name, months));
    });

    router.get('/tracker/monthly-all', (req, res) => {
        const month = req.query.month || new Date().toISOString().slice(0, 7);
        res.json(tracker.getAllMonthlyStats(month));
    });

    router.get('/tracker/daily-db/:name', (req, res) => {
        const days = parseInt(req.query.days) || 30;
        res.json(tracker.getDailyStatsFromDb(req.params.name, days));
    });

    router.post('/tracker/rollup', (req, res) => {
        const { month } = req.body;
        if (!month) return res.status(400).json({ error: 'month (YYYY-MM) required' });
        try {
            const results = tracker.rollupMonth(month);
            res.json({ success: true, results });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // ═══════════════════════════════════════
    // Player Profiler
    // ═══════════════════════════════════════

    router.get('/profiles', (req, res) => {
        res.json(profiler.getWatchList());
    });

    router.post('/profiles/watch', (req, res) => {
        const { name, type } = req.body;
        if (!name) return res.status(400).json({ error: 'Name required' });
        const added = profiler.watch(name, type || 'applicant');
        if (added && audit) {
            audit.log('profile_watchlist_changed', { action: 'watch', player: name, type: type || 'applicant', source: 'dashboard' });
        }
        res.json({ success: added, message: added ? `Watching ${name}` : `${name} already watched` });
    });

    router.post('/profiles/unwatch', (req, res) => {
        const { name } = req.body;
        if (!name) return res.status(400).json({ error: 'Name required' });
        const removed = profiler.unwatch(name);
        if (removed && audit) {
            audit.log('profile_watchlist_changed', { action: 'unwatch', player: name, source: 'dashboard' });
        }
        res.json({ success: removed });
    });

    router.delete('/profiles/:name', (req, res) => {
        const deleted = profiler.store.deleteProfile(req.params.name);
        if (deleted) {
            if (audit) audit.log('profile_deleted', { player: req.params.name, source: 'dashboard' });
            res.json({ success: true });
        } else {
            res.status(404).json({ error: 'Profile not found' });
        }
    });

    router.get('/profiles/:name', (req, res) => {
        const dossier = profiler.getDossier(req.params.name);
        if (!dossier) return res.status(404).json({ error: 'Profile not found' });
        res.json(dossier);
    });

    router.post('/profiles/:name/check', async (req, res) => {
        try {
            const results = await profiler.forceCheck(req.params.name);
            res.json(results);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    router.post('/profiles/:name/note', (req, res) => {
        const { text, category } = req.body;
        if (!text) return res.status(400).json({ error: 'Note text required' });
        const saved = profiler.addNote(req.params.name, text, 'dashboard', category || 'manual');
        if (saved && audit) {
            audit.log('profile_note_added', { player: req.params.name, category: category || 'manual', source: 'dashboard' });
        }
        res.json({ success: saved });
    });

    router.delete('/profiles/:name/chatlogs/:code', (req, res) => {
        const deleted = profiler.store.deleteChatlogAnalysis(req.params.name, req.params.code);
        if (deleted) {
            if (audit) audit.log('profile_chatlog_deleted', { player: req.params.name, code: req.params.code, source: 'dashboard' });
            res.json({ success: true });
        } else {
            res.status(404).json({ error: 'Chatlog not found' });
        }
    });

    // ═══════════════════════════════════════
    // Audit Log
    // ═══════════════════════════════════════

    router.get('/audit/today', (req, res) => {
        res.json(audit.getByDate());
    });

    router.get('/audit/recent/:n', (req, res) => {
        const n = parseInt(req.params.n) || 20;
        res.json(audit.getRecent(n));
    });

    router.get('/audit/stats', (req, res) => {
        res.json(audit.getTodayStats());
    });

    router.get('/audit/search', (req, res) => {
        const q = (req.query.q || '').toLowerCase();
        const type = req.query.type || '';
        const limit = parseInt(req.query.limit) || 50;
        let entries = audit.getRecent(200);

        if (type) {
            entries = entries.filter(e => e.action === type);
        }
        if (q) {
            entries = entries.filter(e => {
                const str = JSON.stringify(e).toLowerCase();
                return str.includes(q);
            });
        }
        res.json(entries.slice(0, limit));
    });

    // ═══════════════════════════════════════
    // Feedback
    // ═══════════════════════════════════════

    router.get('/feedback', (req, res) => {
        res.json(feedback.getStats());
    });

    router.get('/feedback/details', (req, res) => {
        const stats = feedback.getStats();
        res.json({
            ...stats,
            recentNegative: stats.recentNegative || [],
        });
    });

    // ═══════════════════════════════════════
    // Console (Minecraft Commands)
    // ═══════════════════════════════════════

    const consoleClients = new Set();

    if (deps.mcBot) {
        const { isNoise } = require('../minecraft/chat-filter');
        deps.mcBot.on('chat', (msg) => {
            if (msg.text && msg.text.trim() && !isNoise(msg.text)) {
                const data = JSON.stringify({ type: 'chat', text: msg.text.trim() });
                for (const client of consoleClients) {
                    client.write(`data: ${data}\n\n`);
                }
            }
        });
    }

    router.get('/console/stream', (req, res) => {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.flushHeaders?.();

        consoleClients.add(res);

        req.on('close', () => {
            consoleClients.delete(res);
        });
    });

    router.post('/console/run', async (req, res) => {
        const { command } = req.body;
        if (!command) return res.status(400).json({ error: 'Command required' });

        try {
            const lines = await cmdRunner.runCommand(command, { timeout: 5000, maxLines: 30 });
            if (audit) {
                audit.log('command_executed', { command, source: 'dashboard' });
            }
            res.json({ success: true, output: lines });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // ═══════════════════════════════════════
    // Reminders
    // ═══════════════════════════════════════

    router.get('/reminders', (req, res) => {
        res.json(scheduler.listReminders());
    });

    router.post('/reminders/add', (req, res) => {
        const { target, message, when } = req.body;
        if (!target || !message || !when) {
            return res.status(400).json({ error: 'target, message, and when are required' });
        }
        try {
            const result = scheduler.addReminder(target, message, when);
            if (audit) {
                audit.log('reminder_created', { target, message, when, source: 'dashboard' });
            }
            res.json({ success: true, ...result });
        } catch (err) {
            res.status(400).json({ error: err.message });
        }
    });

    router.post('/reminders/cancel/:id', (req, res) => {
        const cancelled = scheduler.cancelReminder(req.params.id);
        res.json({ success: cancelled, message: cancelled ? 'Reminder cancelled' : 'Reminder not found' });
    });

    // ═══════════════════════════════════════
    // Skills
    // ═══════════════════════════════════════

    router.get('/skills', (req, res) => {
        const names = skills.getSkillNames();
        const list = names.map(n => ({
            name: n,
            skill: skills.getSkill(n),
        }));
        res.json(list);
    });

    router.post('/skills/add', (req, res) => {
        const { name, description, steps } = req.body;
        if (!name || !description || !steps || !Array.isArray(steps)) {
            return res.status(400).json({ error: 'name, description, and steps[] required' });
        }
        skills.saveSkill(name, description, steps, 'dashboard');
        if (audit) {
            audit.log('skill_created', { name, stepCount: steps.length, source: 'dashboard' });
        }
        res.json({ success: true, message: `Skill "${name}" saved with ${steps.length} steps.` });
    });

    router.delete('/skills/:name', (req, res) => {
        const deleted = skills.deleteSkill(req.params.name);
        res.json({ success: deleted, message: deleted ? 'Skill deleted' : 'Skill not found' });
    });

    // ═══════════════════════════════════════
    // Memories (RAG)
    // ═══════════════════════════════════════

    router.get('/memories', (req, res) => {
        const limit = parseInt(req.query.limit) || 50;
        const offset = parseInt(req.query.offset) || 0;
        const result = rag.store.listAll(limit, offset);
        res.json(result);
    });

    router.post('/memories', async (req, res) => {
        const { text, category } = req.body;
        if (!text) return res.status(400).json({ error: 'Memory text required' });
        try {
            const id = await rag.addMemory(text, category || 'note');
            if (audit) {
                audit.log('memory_added', { text: text.substring(0, 100), category: category || 'note', source: 'dashboard' });
            }
            res.json({ success: true, id });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    router.delete('/memories/:id', (req, res) => {
        rag.deleteMemory(req.params.id);
        res.json({ success: true });
    });

    return router;
}

module.exports = createApiRouter;
