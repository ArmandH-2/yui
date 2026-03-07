/**
 * Player Profiler — Main surveillance orchestrator.
 *
 * Architecture: single 60-second tick loop ("the lab") that checks:
 *   1. Which targets need a /find check (adaptive timing)
 *   2. Which targets need a chatlog run (2×/day, 12h apart)
 *   3. Daily 11:45 PM CET batch: /info for playtime + /info su for alts + /punishhistory
 *
 * All commands go through the shared CommandQueue — no more blocking.
 */

const cron = require('node-cron');
const ProfileStore = require('./profile-store');
const ChatlogAnalyzer = require('./chatlog-analyzer');
const ActivityMonitor = require('./activity-monitor');
const { parsePlayerInfo, parseInfoSU, parsePunishHistory } = require('../tracker/stat-parser');

class PlayerProfiler {
    /**
     * @param {import('../minecraft/command-queue').CommandQueue} cmdQueue
     * @param {import('../minecraft/command-runner')} cmdRunner  — still needed by ChatlogAnalyzer
     * @param {import('../audit/logger').AuditLogger} [audit]
     */
    constructor(cmdQueue, cmdRunner, audit = null) {
        this.cmdQueue = cmdQueue;
        this.cmdRunner = cmdRunner;
        this.audit = audit;
        this.busy = false;

        this.store = new ProfileStore();
        this.chatlog = new ChatlogAnalyzer(cmdRunner, this.store);
        this.activity = new ActivityMonitor(cmdQueue, this.store);

        this._tickTimer = null;
        this._dailyJob = null;
        this._chatlogCronAM = null;
        this._chatlogCronPM = null;

        const count = this.store.getActiveProfiles().length;
        console.log(`[Profiler] Initialized. ${count} active profiles.`);
    }

    // ═══════════════════════════════════════
    // Watch List Management
    // ═══════════════════════════════════════

    /**
     * Start watching a player.
     * @param {string} name
     * @param {string} [type='applicant'] - 'applicant', 'suspect', or 'staff-suspect'
     * @returns {boolean} true if new, false if already exists
     */
    watch(name, type = 'applicant') {
        if (this.store.hasProfile(name)) {
            const profile = this.store.getProfile(name);
            if (profile.status === 'active') return false;
            this.store.updateProfile(name, { status: 'active', nextFindAt: new Date().toISOString() });
            console.log(`[Profiler] Reactivated surveillance on ${name}.`);
            return true;
        }
        this.store.createProfile(name, type);
        console.log(`[Profiler] 🎯 Now watching ${name} (${type}).`);

        // Kickstart: run an immediate /find
        this.activity.checkPlayer(name).catch(err => {
            console.error(`[Profiler] Initial check failed for ${name}:`, err.message);
        });

        return true;
    }

    /**
     * Stop watching a player (archives profile, keeps data).
     */
    unwatch(name) {
        if (!this.store.hasProfile(name)) return false;
        this.store.updateProfile(name, { status: 'archived' });
        console.log(`[Profiler] ❌ Stopped watching ${name}. Data preserved.`);
        return true;
    }

    getWatchList() {
        return this.store.listProfiles();
    }

    /**
     * Get a player's full dossier.
     */
    getDossier(name) {
        if (!this.store.hasProfile(name)) return null;

        return {
            profile: this.store.getProfile(name),
            activity: this.store.getActivitySummary(name),
            notes: this.store.getNotes(name),
            analysis: this.store.getAnalysis(name),
            alts: this.store.getAlts(name),
            punishments: this.store.getPunishments(name),
            schedule: this.store.getSchedule(name),
            playtimeHistory: this.store.getPlaytimeHistory(name),
            recentChatlogs: this.store.getChatlogAnalyses(name).slice(-5),
        };
    }

    addNote(playerName, text, author = 'system', category = 'general') {
        if (!this.store.hasProfile(playerName)) return false;
        this.store.addNote(playerName, text, author, category);
        return true;
    }

    // ═══════════════════════════════════════
    // Force Check (on-demand, HIGH priority)
    // ═══════════════════════════════════════

    /**
     * Force-check a single player: /find + /info su + /punishhistory + chatlog.
     * @param {string} name
     * @returns {Promise<object>} Full results
     */
    async forceCheck(name) {
        if (!this.store.hasProfile(name)) {
            return { error: 'Player not being watched.' };
        }

        console.log(`[Profiler] 🔍 Force-checking ${name}...`);
        const results = { name };

        // 1. /find
        try {
            results.find = await this.activity.checkPlayer(name);
        } catch (err) { results.find = { error: err.message }; }

        // 2. /info su (alts + playtime)
        try {
            const infoLines = await this.cmdQueue.enqueue(`/info ${name} su`, {
                priority: 'HIGH', timeout: 5000, maxLines: 30,
            });
            const { alts, playerInfo } = parseInfoSU(infoLines);
            if (playerInfo?.name) {
                this.store.updateProfile(name, { name: playerInfo.name });
            }
            if (alts.length > 0) this.store.saveAlts(name, alts);
            if (playerInfo?.playtime) {
                this.store.recordPlaytime(name, playerInfo.playtime);
                // Set baseline if first time
                const profile = this.store.getProfile(name);
                if (!profile.playtimeBaseline) {
                    this.store.updateProfile(name, {
                        playtimeBaseline: playerInfo.playtime,
                        latestPlaytime: playerInfo.playtime,
                    });
                } else {
                    this.store.updateProfile(name, { latestPlaytime: playerInfo.playtime });
                }
            }
            results.info = { alts, playerInfo };
        } catch (err) { results.info = { error: err.message }; }

        // 3. /punishhistory
        try {
            const punishLines = await this.cmdQueue.enqueue(`/punishhistory ${name}`, {
                priority: 'HIGH', timeout: 5000, maxLines: 50,
            });
            const entries = parsePunishHistory(punishLines);
            if (entries.length > 0) this.store.savePunishments(name, entries);
            results.punishments = entries;
        } catch (err) { results.punishments = { error: err.message }; }

        // 4. Chatlog
        try {
            results.chatlog = await this.chatlog.profilePlayer(name);
            this.store.updateProfile(name, { lastChatlogAt: new Date().toISOString() });
        } catch (err) { results.chatlog = { error: err.message }; }

        if (this.audit) {
            this.audit.log('profile_force_check', { player: name });
        }

        console.log(`[Profiler] ✅ Force-check complete for ${name}.`);
        return results;
    }

    // ═══════════════════════════════════════
    // Quick Check (only /find online state)
    // ═══════════════════════════════════════

    /**
     * Quick check a single player: just /find
     * @param {string} name
     * @returns {Promise<object>} Results map
     */
    async quickCheck(name) {
        if (!this.store.hasProfile(name)) {
            return { error: 'Player not being watched.' };
        }

        console.log(`[Profiler] ⚡ Quick-checking ${name}...`);
        const results = { name };
        try {
            results.find = await this.activity.checkPlayer(name);
        } catch (err) { results.find = { error: err.message }; }

        console.log(`[Profiler] ✅ Quick-check complete for ${name}.`);
        return results;
    }

    // ═══════════════════════════════════════
    // Tick Loop — The "Lab"
    // ═══════════════════════════════════════

    /**
     * Main tick — runs every 60 seconds.
     * Checks which targets are due for a /find and processes them.
     */
    async _tick() {
        try {
            const results = await this.activity.checkDue();
            const count = Object.keys(results).length;
            if (count > 0) {
                console.log(`[Profiler] Tick: checked ${count} targets.`);
            }
        } catch (err) {
            console.error(`[Profiler] Tick error:`, err.message);
        }
    }

    // ═══════════════════════════════════════
    // Daily Batch — 11:45 PM CET
    // ═══════════════════════════════════════

    /**
     * Daily batch: for ALL active targets, run /info to snapshot playtime,
     * /info su to check for new alts, and /punishhistory for new entries.
     */
    async _dailyBatch() {
        const profiles = this.store.getActiveProfiles();
        if (profiles.length === 0) return;

        console.log(`[Profiler] 🌙 Daily batch started for ${profiles.length} targets...`);

        for (const profile of profiles) {
            const name = profile.name;
            try {
                // /info su → playtime + alts
                const infoLines = await this.cmdQueue.enqueue(`/info ${name} su`, {
                    priority: 'NORMAL', timeout: 5000, maxLines: 30,
                });
                const { alts, playerInfo } = parseInfoSU(infoLines);
                if (playerInfo?.name) {
                    this.store.updateProfile(name, { name: playerInfo.name });
                }
                if (alts.length > 0) this.store.saveAlts(name, alts);
                if (playerInfo?.playtime) {
                    this.store.recordPlaytime(name, playerInfo.playtime);
                    // Update profile
                    const p = this.store.getProfile(name);
                    if (!p.playtimeBaseline) {
                        this.store.updateProfile(name, {
                            playtimeBaseline: playerInfo.playtime,
                            latestPlaytime: playerInfo.playtime,
                        });
                    } else {
                        this.store.updateProfile(name, { latestPlaytime: playerInfo.playtime });
                    }
                }

                // /punishhistory
                const punishLines = await this.cmdQueue.enqueue(`/punishhistory ${name}`, {
                    priority: 'NORMAL', timeout: 5000, maxLines: 50,
                });
                const entries = parsePunishHistory(punishLines);
                if (entries.length > 0) this.store.savePunishments(name, entries);

                console.log(`[Profiler] 🌙 ${name}: PT=${playerInfo?.playtime || '?'}h, alts=${alts.length}, punish=${entries.length}`);
            } catch (err) {
                console.error(`[Profiler] Daily batch failed for ${name}:`, err.message);
            }
        }

        if (this.audit) {
            this.audit.log('profile_daily_batch', { count: profiles.length });
        }

        console.log(`[Profiler] 🌙 Daily batch complete.`);
    }

    // ═══════════════════════════════════════
    // Chatlog Cycle — 2×/day
    // ═══════════════════════════════════════

    /**
     * Run chatlog for all targets that are due.
     * A target is due if (now - lastChatlogAt) >= chatlogIntervalHours.
     */
    async _chatlogCycle() {
        const profiles = this.store.getActiveProfiles();
        const now = Date.now();
        const due = profiles.filter(p => {
            if (!p.lastChatlogAt) return true;
            const elapsed = now - new Date(p.lastChatlogAt).getTime();
            const intervalMs = (p.chatlogIntervalHours || 12) * 60 * 60 * 1000;
            return elapsed >= intervalMs;
        });

        if (due.length === 0) return;

        console.log(`[Profiler] 📋 Chatlog cycle: ${due.length} targets due.`);

        for (const profile of due) {
            try {
                const analysis = await this.chatlog.profilePlayer(profile.name);
                this.store.updateProfile(profile.name, { lastChatlogAt: new Date().toISOString() });
                console.log(`[Profiler] 📋 ${profile.name}: chatlog analyzed (tone: ${analysis?.tone || 'unknown'})`);
            } catch (err) {
                console.error(`[Profiler] Chatlog failed for ${profile.name}:`, err.message);
            }
        }

        if (this.audit) {
            this.audit.log('profile_chatlog_cycle', { count: due.length });
        }
    }

    // ═══════════════════════════════════════
    // Scheduling
    // ═══════════════════════════════════════

    startSchedule() {
        // Tick loop: every 60 seconds
        this._tickTimer = setInterval(() => this._tick(), 60 * 1000);
        console.log('[Profiler] ⏰ Surveillance tick loop started (60s interval).');

        // Daily batch at 11:45 PM CET (Europe/Berlin)
        this._dailyJob = cron.schedule('45 23 * * *', async () => {
            console.log('[Profiler] 🌙 Daily playtime + enrichment batch triggered (23:45 CET).');
            await this._dailyBatch();
        }, { timezone: 'Europe/Berlin' });

        // Chatlog: 2×/day with 12hr gap — 06:00 and 18:00 CET
        this._chatlogCronAM = cron.schedule('0 6 * * *', async () => {
            console.log('[Profiler] 📋 Morning chatlog cycle triggered (06:00 CET).');
            await this._chatlogCycle();
        }, { timezone: 'Europe/Berlin' });

        this._chatlogCronPM = cron.schedule('0 18 * * *', async () => {
            console.log('[Profiler] 📋 Evening chatlog cycle triggered (18:00 CET).');
            await this._chatlogCycle();
        }, { timezone: 'Europe/Berlin' });

        console.log('[Profiler] 📋 Chatlog scheduled: 06:00 + 18:00 CET.');
        console.log('[Profiler] 🌙 Daily batch scheduled: 23:45 CET.');
    }

    stopSchedule() {
        if (this._tickTimer) { clearInterval(this._tickTimer); this._tickTimer = null; }
        if (this._dailyJob) this._dailyJob.stop();
        if (this._chatlogCronAM) this._chatlogCronAM.stop();
        if (this._chatlogCronPM) this._chatlogCronPM.stop();
        console.log('[Profiler] All schedules stopped.');
    }
}

module.exports = PlayerProfiler;
