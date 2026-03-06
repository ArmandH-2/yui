/**
 * Staff Activity Tracker — Tracks staff stats daily via Minecraft commands.
 *
 * - Polls /teamstats and /info for each roster member concurrently
 * - Stores daily snapshots in SQLite instead of relying purely on JSON files
 * - Uses async file I/O for fallback JSONs to prevent blocking
 * - Alerts on 3-day inactivity
 */

const fs = require('fs');
const fsPromises = require('fs').promises;
const path = require('path');
const cron = require('node-cron');
const { parseTeamStats, parsePlayerInfo, parseStaffList } = require('./stat-parser');
const StatsDB = require('./stats-db');

const TRACKER_DIR = path.join(__dirname, '../../data/tracker');
const ROSTER_FILE = path.join(TRACKER_DIR, 'roster.json');
const STATS_DIR = path.join(TRACKER_DIR, 'stats');

class StaffTracker {
    /**
     * @param {import('../minecraft/command-queue').CommandQueue} cmdQueue
     * @param {import('../audit/logger').AuditLogger} [audit]
     * @param {function} [alertCallback] - Called with alert message string
     */
    constructor(cmdQueue, audit = null, alertCallback = null) {
        this.cmdQueue = cmdQueue;
        this.audit = audit;
        this.alertCallback = alertCallback;
        this.collecting = false;

        this._ensureDirsSync();
        this.roster = this._loadRosterSync();
        this.statsDb = new StatsDB();

        console.log(`[Tracker] Staff roster: ${this.roster.members.length} members, ${this.roster.excluded.length} excluded.`);
    }

    // ═══════════════════════════════════════
    // Directory & File Management
    // ═══════════════════════════════════════

    _ensureDirsSync() {
        if (!fs.existsSync(TRACKER_DIR)) fs.mkdirSync(TRACKER_DIR, { recursive: true });
        if (!fs.existsSync(STATS_DIR)) fs.mkdirSync(STATS_DIR, { recursive: true });
    }

    _loadRosterSync() {
        let roster = { members: [], excluded: [], ranks: {}, rankDates: {}, lastUpdated: null };
        try {
            if (fs.existsSync(ROSTER_FILE)) {
                const loaded = JSON.parse(fs.readFileSync(ROSTER_FILE, 'utf-8'));
                roster = { ...roster, ...loaded };
                if (!roster.ranks) roster.ranks = {};
                if (!roster.rankDates) roster.rankDates = {};
                return roster;
            }
        } catch (err) {
            console.error('[Tracker] Failed to load roster:', err.message);
        }
        return roster;
    }

    _saveRoster() {
        this.roster.lastUpdated = new Date().toISOString();
        if (!this.roster.ranks) this.roster.ranks = {};
        if (!this.roster.rankDates) this.roster.rankDates = {};

        // Fire and forget save to avoid blocking
        fsPromises.writeFile(ROSTER_FILE, JSON.stringify(this.roster, null, 2))
            .catch(err => console.error('[Tracker] Failed to save roster:', err.message));
    }

    _getStatsPath(date = new Date()) {
        const dateStr = date.toISOString().slice(0, 10);
        return path.join(STATS_DIR, `${dateStr}.json`);
    }

    async _loadDayStats(date = new Date()) {
        const filePath = this._getStatsPath(date);
        try {
            const data = await fsPromises.readFile(filePath, 'utf-8');
            return JSON.parse(data);
        } catch (err) {
            // If file doesn't exist yet, just return null
        }
        return null;
    }

    _saveDayStats(data, date = new Date()) {
        const filePath = this._getStatsPath(date);
        fsPromises.writeFile(filePath, JSON.stringify(data, null, 2))
            .catch(err => console.error('[Tracker] Failed to save day stats:', err.message));
    }

    // ═══════════════════════════════════════
    // Roster Management
    // ═══════════════════════════════════════

    addStaff(name) {
        const lower = name.toLowerCase();
        if (this.roster.members.some(m => m.toLowerCase() === lower)) return false;

        // Remove from excluded if present
        this.roster.excluded = this.roster.excluded.filter(e => e.toLowerCase() !== lower);
        this.roster.members.push(name);
        this._saveRoster();
        return true;
    }

    removeStaff(name) {
        const lower = name.toLowerCase();
        const before = this.roster.members.length;
        this.roster.members = this.roster.members.filter(m => m.toLowerCase() !== lower);

        if (this.roster.members.length < before) {
            this._saveRoster();
            return true;
        }
        return false;
    }

    excludeStaff(name) {
        const lower = name.toLowerCase();
        // Remove from members if present
        this.roster.members = this.roster.members.filter(m => m.toLowerCase() !== lower);

        if (!this.roster.excluded.some(e => e.toLowerCase() === lower)) {
            this.roster.excluded.push(name);
            this._saveRoster();
            return true;
        }
        return false;
    }

    unexcludeStaff(name) {
        const lower = name.toLowerCase();
        const before = this.roster.excluded.length;
        this.roster.excluded = this.roster.excluded.filter(e => e.toLowerCase() !== lower);

        if (this.roster.excluded.length < before) {
            this._saveRoster();
            return true;
        }
        return false;
    }

    getRoster() {
        if (!this.roster.ranks) this.roster.ranks = {};
        if (!this.roster.rankDates) this.roster.rankDates = {};
        return { ...this.roster };
    }

    // ═══════════════════════════════════════
    // Data Collection & Sync
    // ═══════════════════════════════════════

    /**
     * Fetch the current staff list from the server, 
     * process ranks, and add newcomers to the roster.
     */
    async syncStaffList() {
        console.log('[Tracker] Syncing staff roster from server...');
        try {
            // Wait slightly just in case right after startup
            await new Promise(r => setTimeout(r, 1000));
            const lines = await this.cmdQueue.enqueue('/staff', { timeout: 6000, maxLines: 60, priority: 'LOW' });
            const staffList = parseStaffList(lines);

            let addedCount = 0;
            if (!this.roster.ranks) this.roster.ranks = {};

            for (const { name, rank } of staffList) {
                // If developer, completely ignore
                if (rank.toLowerCase().includes('developer')) {
                    continue;
                }

                // Check rank changes to save the date
                const oldRank = this.roster.ranks[name];
                if (oldRank !== rank) {
                    this.roster.ranks[name] = rank;
                    if (!this.roster.rankDates) this.roster.rankDates = {};
                    this.roster.rankDates[name] = new Date().toISOString().slice(0, 10);
                }

                // Check if already on roster or explicitly excluded
                const lowerName = name.toLowerCase();
                const isMember = this.roster.members.some(m => m.toLowerCase() === lowerName);
                const isExcluded = this.roster.excluded.some(e => e.toLowerCase() === lowerName);

                if (!isMember && !isExcluded) {
                    this.roster.members.push(name);
                    addedCount++;
                    console.log(`[Tracker] Auto-discovered new staff member: ${name} (${rank})`);
                }
            }

            this._saveRoster();
            console.log(`[Tracker] ✅ Roster sync complete. Added ${addedCount} new members.`);
            return { success: true, added: addedCount, totalFound: staffList.length };
        } catch (err) {
            console.error('[Tracker] Failed to sync staff list:', err.message);
            return { success: false, error: err.message };
        }
    }

    /**
     * Collect stats for a single player concurrently.
     * @param {string} playerName
     * @param {string} [priority='NORMAL']
     * @returns {Promise<object>} Parsed stats
     */
    async collectPlayerStats(playerName, priority = 'NORMAL') {
        console.log(`[Tracker] Collecting stats for ${playerName}...`);

        // Run /teamstats and /info concurrently
        const [teamStatsLines, infoLines] = await Promise.all([
            this.cmdQueue.enqueue(`/teamstats ${playerName}`, { timeout: 5000, maxLines: 20, priority }),
            this.cmdQueue.enqueue(`/info ${playerName}`, { timeout: 5000, maxLines: 20, priority })
        ]);

        // Parse the outputs
        const teamStats = parseTeamStats(teamStatsLines);
        const playerInfo = parsePlayerInfo(infoLines);

        // Detect rank change
        const currentRank = playerInfo?.rank || 'Unknown';
        if (this.roster.ranks[playerName] !== currentRank && currentRank !== 'Unknown') {
            this.roster.ranks[playerName] = currentRank;
            if (!this.roster.rankDates) this.roster.rankDates = {};
            this.roster.rankDates[playerName] = new Date().toISOString().slice(0, 10);
            this._saveRoster();
        }

        return {
            reports: teamStats?.reports || { today: 0, monthly: 0, total: 0 },
            warns: teamStats?.warns || { today: 0, monthly: 0, total: 0 },
            support: teamStats?.support || { today: 0, monthly: 0, total: 0 },
            playtime: playerInfo?.playtime || 0,
            rank: currentRank,
            banPoints: playerInfo?.banPoints || 0,
            mutePoints: playerInfo?.mutePoints || 0,
            onlineState: playerInfo?.onlineState || 'unknown',
            lastLogin: playerInfo?.lastLogin || null,
            lastLoginDate: (playerInfo?.lastLoginDate instanceof Date && !isNaN(playerInfo.lastLoginDate)) ? playerInfo.lastLoginDate.toISOString() : null,
            firstLogin: playerInfo?.firstLogin || null,
            rawTeamStats: teamStatsLines,
            rawInfo: infoLines,
        };
    }

    /**
     * Collect stats for ALL roster members concurrently and save daily snapshot.
     * @returns {Promise<object>} The complete daily stats object
     */
    async collectAll() {
        if (this.collecting) {
            console.log('[Tracker] Collection already in progress, skipping.');
            return null;
        }

        this.collecting = true;

        // Sync the staff list to auto-discover new people before taking daily snapshot
        await this.syncStaffList();

        const now = new Date();
        const todayStr = now.toISOString().slice(0, 10);

        // Load existing today data to merge (same-day re-check)
        const existingToday = await this._loadDayStats(now);
        const staffData = existingToday?.staff || {};

        console.log(`[Tracker] Starting high-speed concurrent collection for ${this.roster.members.length} staff members (date: ${todayStr})...`);

        // Process all members concurrently via Promise.all. 
        // The CommandQueue gracefully handles the pacing behind the scenes.
        await Promise.all(this.roster.members.map(async (member) => {
            try {
                const stats = await this.collectPlayerStats(member, 'LOW');

                // Get prior days history from SQLite to calculate today's difference
                const history = this.statsDb.getDailyHistory(member, 7);
                const prev = history.find(h => h.date !== todayStr); // Last active day before today

                let playtimeToday = 0;
                if (prev && prev.playtime_total != null) {
                    playtimeToday = Math.max(0, stats.playtime - prev.playtime_total);
                }

                staffData[member] = {
                    ...stats,
                    playtimeToday,
                    rawTeamStats: undefined,
                    rawInfo: undefined,
                };

                // Save to SQLite DB
                try {
                    this.statsDb.upsertDailyStats(member, todayStr, stats);
                } catch (dbErr) {
                    console.error(`[Tracker] DB upsert failed for ${member}:`, dbErr.message);
                }
            } catch (err) {
                console.error(`[Tracker] Failed to collect stats for ${member}:`, err.message);
                staffData[member] = { error: err.message };
            }
        }));

        const dailyData = {
            date: todayStr,
            collectedAt: now.toISOString(),
            memberCount: this.roster.members.length,
            staff: staffData,
        };

        this._saveDayStats(dailyData, now);
        this.collecting = false;

        console.log(`[Tracker] ✅ Collection complete. ${Object.keys(staffData).length} staff members tracked.`);

        if (this.audit) {
            const { ACTION_TYPES } = require('../audit/logger');
            this.audit.log('staff_stats_collected', {
                memberCount: this.roster.members.length,
                date: dailyData.date,
            });
        }

        await this._checkInactivity();
        return dailyData;
    }

    /**
     * Collect stats for a SINGLE member and merge into today's snapshot.
     * @param {string} name
     * @returns {Promise<object>} The member's stats
     */
    async collectSingleMember(name) {
        const lower = name.toLowerCase();
        if (!this.roster.members.some(m => m.toLowerCase() === lower)) {
            throw new Error(`${name} is not on the roster.`);
        }

        const now = new Date();
        const todayStr = now.toISOString().slice(0, 10);

        const history = this.statsDb.getDailyHistory(name, 7);
        const prev = history.find(h => h.date !== todayStr);

        const stats = await this.collectPlayerStats(name);

        let playtimeToday = 0;
        if (prev && prev.playtime_total != null) {
            playtimeToday = Math.max(0, stats.playtime - prev.playtime_total);
        }

        const memberData = { ...stats, playtimeToday, rawTeamStats: undefined, rawInfo: undefined };

        // Merge into today's file asynchronously
        let todayData = await this._loadDayStats(now) || {
            date: todayStr,
            collectedAt: now.toISOString(),
            memberCount: this.roster.members.length,
            staff: {},
        };
        todayData.staff[name] = memberData;
        todayData.collectedAt = now.toISOString();
        this._saveDayStats(todayData, now);

        // Save to SQLite DB
        try {
            this.statsDb.upsertDailyStats(name, todayStr, stats);
        } catch (dbErr) {
            console.error(`[Tracker] DB upsert failed for ${name}:`, dbErr.message);
        }

        console.log(`[Tracker] ✅ Updated ${name}'s stats.`);
        return memberData;
    }

    /**
     * Quick inactivity check — fast version using /staff first, then /info for offline players.
     * @returns {Promise<object>} { red, yellow, green } report
     */
    async quickInactivityCheck() {
        if (this.collecting) {
            return this.getInactivityReport();
        }

        this.collecting = true;
        console.log(`[Tracker] Quick inactivity check for ${this.roster.members.length} members...`);

        const results = {};

        try {
            // Check who is online right now using /staff to skip /info completely for online members
            const staffLines = await this.cmdQueue.enqueue('/staff online', { timeout: 6000, maxLines: 60, priority: 'LOW' });
            const onlineStaff = parseStaffList(staffLines).map(s => s.name.toLowerCase());

            const offlineMembers = [];

            for (const member of this.roster.members) {
                if (onlineStaff.includes(member.toLowerCase())) {
                    results[member] = { online: true, section: null, lastLogin: 'Online now', inactiveDays: 0 };
                    console.log(`[Tracker] ${member}: ✅ Online (via /staff)`);
                } else {
                    offlineMembers.push(member);
                }
            }

            // Only run /info for offline members, concurrently!
            await Promise.all(offlineMembers.map(async (member) => {
                try {
                    const infoLines = await this.cmdQueue.enqueue(`/info ${member}`, { timeout: 5000, maxLines: 20 });
                    const info = parsePlayerInfo(infoLines);

                    if (info && info.onlineState === 'online') {
                        // Fallback: they were online but vanished, or logged in millisecond ago
                        results[member] = { online: true, section: null, lastLogin: 'Online now', inactiveDays: 0 };
                        console.log(`[Tracker] ${member}: ✅ Online (via /info)`);
                    } else if (info && info.lastLoginDate) {
                        const diffMs = Date.now() - new Date(info.lastLoginDate).getTime();
                        const inactiveDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
                        results[member] = { online: false, lastLogin: info.lastLogin, inactiveDays, playtime: info.playtime };
                        console.log(`[Tracker] ${member}: ❌ Offline (last login: ${info.lastLogin}, ${inactiveDays}d ago)`);
                    } else {
                        results[member] = { online: false, lastLogin: null, inactiveDays: -1, playtime: null };
                        console.log(`[Tracker] ${member}: ❓ Could not fetch info.`);
                    }
                } catch (err) {
                    console.error(`[Tracker] Quick check failed for ${member}:`, err.message);
                    results[member] = { online: false, lastLogin: null, inactiveDays: -1, error: err.message };
                }
            }));
        } catch (e) {
            console.error('[Tracker] Overall quick check failed:', e);
        }

        this.collecting = false;
        console.log(`[Tracker] ✅ Quick inactivity check complete.`);

        // Build tiered report from results
        const red = [], yellow = [], green = [];
        for (const [name, r] of Object.entries(results)) {
            const entry = { name, ...r };
            if (r.online) {
                green.push(entry);
            } else if (r.inactiveDays >= 3) {
                red.push(entry);
            } else if (r.inactiveDays === 2) {
                yellow.push(entry);
            } else {
                green.push(entry);
            }
        }

        red.sort((a, b) => b.inactiveDays - a.inactiveDays);
        return { red, yellow, green };
    }

    // ═══════════════════════════════════════
    // Inactivity Detection
    // ═══════════════════════════════════════

    /**
     * Count how many consecutive days a member has been inactive.
     * Uses DB SQL history over the last 7 days instead of reading JSON files.
     * @param {string} member
     * @returns {{ inactiveDays: number, lastActiveDate: string|null, onlineState: string }}
     */
    _getMemberInactivity(member) {
        const history = this.statsDb.getDailyHistory(member, 7);
        const now = new Date();

        if (!history || history.length === 0) {
            return { inactiveDays: 0, lastActiveDate: null, lastLogin: null, onlineState: 'unknown' };
        }

        let inactiveDays = 0;

        // Try reading exact last_login_date first
        for (const record of history) {
            if (record.last_login_date) {
                const lastLogin = new Date(record.last_login_date);
                const diffMs = now - lastLogin;
                inactiveDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
                return {
                    inactiveDays,
                    lastActiveDate: lastLogin.toISOString().slice(0, 10),
                    lastLogin: record.last_login,
                    onlineState: record.online_state || 'unknown'
                };
            }
        }

        // Fallback constraint (only relies on playtime_total differences if we lack lastLoginDate)
        for (let i = 0; i < history.length - 1; i++) {
            const curr = history[i];
            const prev = history[i + 1];
            let ptToday = Math.max(0, curr.playtime_total - prev.playtime_total);
            if (ptToday === 0) {
                inactiveDays++;
            } else {
                return {
                    inactiveDays,
                    lastActiveDate: curr.date,
                    lastLogin: null,
                    onlineState: 'unknown'
                };
            }
        }

        return {
            inactiveDays: history.length > 0 ? history.length - 1 : 0,
            lastActiveDate: history[history.length - 1] ? history[history.length - 1].date : null,
            lastLogin: null,
            onlineState: 'unknown'
        };
    }

    /**
     * Run after daily collection. Posts a tiered report:
     *   🔴 3+ days = rule violation
     *   🟡 2 days = approaching limit
     *   🟢 everyone fine = all clear
     */
    async _checkInactivity() {
        if (!this.alertCallback || this.roster.members.length === 0) return;

        const report = this.getInactivityReport();

        if (report.red.length > 0 || report.yellow.length > 0) {
            let msg = '📋 **Daily Staff Activity Report**\n';

            if (report.red.length > 0) {
                msg += '\n🔴 **INACTIVE 3+ DAYS (Rule Violation):**\n';
                msg += report.red.map(r =>
                    `• **${r.name}** — ${r.inactiveDays} days inactive (last login: ${r.lastLogin || r.lastActiveDate || 'never recorded'})`
                ).join('\n');
            }

            if (report.yellow.length > 0) {
                msg += '\n\n🟡 **Approaching Limit (2 days inactive):**\n';
                msg += report.yellow.map(r =>
                    `• **${r.name}** — 2 days inactive (last login: ${r.lastLogin || r.lastActiveDate || 'never recorded'})`
                ).join('\n');
            }

            msg += '\n\n_Per server rules, staff cannot be AFK for more than 3 days without prior explanation._';
            this.alertCallback(msg);
        } else {
            // Everyone is active — send a quick all-clear
            this.alertCallback('✅ **Daily Staff Activity Report** — All staff are active. No inactivity issues detected.');
        }
    }

    /**
     * Get full inactivity report for all roster members (used by !tracker inactivity).
     * @returns {{ red: Array, yellow: Array, green: Array }}
     */
    getInactivityReport() {
        const red = [];    // 3+ days
        const yellow = []; // 2 days
        const green = [];  // 0-1 days

        for (const member of this.roster.members) {
            const { inactiveDays, lastActiveDate, lastLogin, onlineState } = this._getMemberInactivity(member);

            const entry = { name: member, inactiveDays, lastActiveDate, lastLogin, onlineState };

            if (inactiveDays >= 3) {
                red.push(entry);
            } else if (inactiveDays === 2) {
                yellow.push(entry);
            } else {
                green.push(entry);
            }
        }

        // Sort by most inactive first
        red.sort((a, b) => b.inactiveDays - a.inactiveDays);

        return { red, yellow, green };
    }

    // ═══════════════════════════════════════
    // Scheduling
    // ═══════════════════════════════════════

    /**
     * Start the daily cron job at 11:45 PM CET (Europe/Berlin).
     */
    startSchedule() {
        // 45 23 * * * = 11:45 PM every day
        this.cronJob = cron.schedule('45 23 * * *', async () => {
            console.log('[Tracker] 🕐 Daily collection triggered (11:45 PM CET)');
            await this.collectAll();
        }, {
            timezone: 'Europe/Berlin',
        });

        // Monthly rollup: midnight on the 1st of each month
        this.monthlyRollupJob = cron.schedule('0 0 1 * *', () => {
            console.log('[Tracker] 📅 Monthly rollup triggered.');
            this.rollupPreviousMonth();
        }, {
            timezone: 'Europe/Berlin',
        });

        console.log('[Tracker] ⏰ Daily poll scheduled at 11:45 PM CET.');
        console.log('[Tracker] 📅 Monthly rollup scheduled for 1st of each month.');
    }

    stopSchedule() {
        if (this.cronJob) {
            this.cronJob.stop();
            console.log('[Tracker] Schedule stopped.');
        }
        if (this.monthlyRollupJob) {
            this.monthlyRollupJob.stop();
            console.log('[Tracker] Monthly rollup schedule stopped.');
        }
    }

    // ═══════════════════════════════════════
    // Query / Display
    // ═══════════════════════════════════════

    /**
     * Get a member's stats asynchronously. Tries JSON first to keep rich 'today'/'monthly' data,
     * falls back to SQLite mapped data if file is missing.
     * @param {string} memberName
     * @param {Date} [date]
     * @returns {Promise<object|null>}
     */
    async getMemberStats(memberName, date = new Date()) {
        const dateStr = date.toISOString().slice(0, 10);
        const dayData = await this._loadDayStats(date);

        if (dayData && dayData.staff) {
            const key = Object.keys(dayData.staff).find(k => k.toLowerCase() === memberName.toLowerCase());
            if (key) {
                return { ...dayData.staff[key], date: dayData.date, collectedAt: dayData.collectedAt };
            }
        }

        // Fallback to SQLite DB
        const stats = this.statsDb.getDailyStats(memberName, dateStr);
        if (!stats) return null;

        return {
            date: stats.date,
            collectedAt: stats.collected_at,
            reports: { total: stats.reports_total },
            warns: { total: stats.warns_total },
            support: { total: stats.support_total },
            playtime: stats.playtime_total,
            rank: stats.rank,
            lastLogin: stats.last_login,
            lastLoginDate: stats.last_login_date,
            onlineState: stats.online_state,
            playtimeToday: 0
        };
    }

    /**
     * Asynchronous fetch for all stats. JSON first, DB fallback.
     * @param {Date} [date]
     * @returns {Promise<object|null>}
     */
    async getAllStats(date = new Date()) {
        const dayData = await this._loadDayStats(date);
        if (dayData) return dayData;

        const dateStr = date.toISOString().slice(0, 10);
        const allDbStats = this.statsDb.getDailyStatsAll(dateStr);
        if (!allDbStats || allDbStats.length === 0) return null;

        const mappedStaff = {};
        for (const dbRow of allDbStats) {
            mappedStaff[dbRow.member] = {
                reports: { total: dbRow.reports_total },
                warns: { total: dbRow.warns_total },
                support: { total: dbRow.support_total },
                playtime: dbRow.playtime_total,
                rank: dbRow.rank,
                lastLogin: dbRow.last_login,
                lastLoginDate: dbRow.last_login_date,
                onlineState: dbRow.online_state
            };
        }

        return {
            date: dateStr,
            collectedAt: allDbStats[0].collected_at,
            memberCount: allDbStats.length,
            staff: mappedStaff
        };
    }

    /**
     * Get a member's stats across multiple days (for graphing).
     * Now purely relies on fast DB queries instead of multiple JSON loads!
     * @param {string} memberName
     * @param {number} [days=7]
     * @returns {Array<{date: string, stats: object}>}
     */
    getMemberHistory(memberName, days = 7) {
        const history = this.statsDb.getDailyHistory(memberName, days);
        const mappedHistory = history.map(dbRow => ({
            date: dbRow.date,
            stats: {
                reports: { total: dbRow.reports_total },
                warns: { total: dbRow.warns_total },
                support: { total: dbRow.support_total },
                playtime: dbRow.playtime_total,
                rank: dbRow.rank,
                lastLogin: dbRow.last_login,
                lastLoginDate: dbRow.last_login_date,
                onlineState: dbRow.online_state
            }
        }));
        return mappedHistory.reverse(); // Oldest first
    }

    /**
     * Check if a specific member is on the roster.
     * @param {string} name
     * @returns {boolean}
     */
    isTracked(name) {
        return this.roster.members.some(m => m.toLowerCase() === name.toLowerCase());
    }

    // ═══════════════════════════════════════
    // Monthly Rollup
    // ═══════════════════════════════════════

    /**
     * Roll up the previous month's daily stats into monthly_stats.
     * Called by cron on the 1st of each month.
     */
    rollupPreviousMonth() {
        const now = new Date();
        const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const monthStr = prevMonth.toISOString().slice(0, 7); // YYYY-MM

        console.log(`[Tracker] Rolling up stats for ${monthStr}...`);
        const results = this.statsDb.rollupAllMembers(this.roster.members, monthStr);
        console.log(`[Tracker] ✅ Monthly rollup complete for ${monthStr}. ${results.length} members processed.`);

        if (this.alertCallback && results.length > 0) {
            let msg = `📅 **Monthly Stats Rollup — ${monthStr}**\n\n`;
            for (const r of results) {
                msg += `• **${r.member}** — Reports: ${r.reports_done}, Warns: ${r.warns_done}, Support: ${r.support_done}, Playtime: ${r.playtime_hours}h\n`;
            }
            this.alertCallback(msg);
        }

        return results;
    }

    /**
     * Roll up a specific month (on-demand).
     * @param {string} month - YYYY-MM
     */
    rollupMonth(month) {
        return this.statsDb.rollupAllMembers(this.roster.members, month);
    }

    /**
     * Get monthly stats from the DB for one member.
     * For the current month, returns live delta; for past months, returns rolled-up data.
     * @param {string} name
     * @param {number} [months=12]
     */
    getMonthlyHistory(name, months = 12) {
        return this.statsDb.getMonthlyHistory(name, months);
    }

    /**
     * Get all members' stats for a given month.
     * If it's the current month, compute live deltas.
     * @param {string} month - YYYY-MM
     */
    getAllMonthlyStats(month) {
        const currentMonth = new Date().toISOString().slice(0, 7);

        if (month === currentMonth) {
            // Live delta for current month
            return this.roster.members.map(m => {
                const live = this.statsDb.getLiveMonthlyStats(m, month);
                return live || { member: m.toLowerCase(), month, reports_done: 0, warns_done: 0, support_done: 0, playtime_hours: 0, live: true };
            });
        }

        // Rolled-up data for past months
        return this.statsDb.getAllMonthlyStats(month);
    }

    /**
     * Get daily stats history from DB for one member.
     * @param {string} name
     * @param {number} [days=30]
     */
    getDailyStatsFromDb(name, days = 30) {
        return this.statsDb.getDailyHistory(name, days);
    }
}

module.exports = StaffTracker;
