/**
 * StatsDB — SQLite-backed storage for daily staff stats and monthly rollups.
 *
 * Tables:
 *   daily_stats  — one row per (member, date), upserted on each force-check
 *   monthly_stats — one row per (member, month), rolled up from daily data
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const TRACKER_DIR = path.join(__dirname, '../../data/tracker');
const DB_PATH = path.join(TRACKER_DIR, 'stats.db');

class StatsDB {
    constructor() {
        if (!fs.existsSync(TRACKER_DIR)) fs.mkdirSync(TRACKER_DIR, { recursive: true });
        this.db = new Database(DB_PATH);
        this.db.pragma('journal_mode = WAL');
        this._createTables();
        this._prepareStatements();
        console.log('[StatsDB] SQLite database initialized at', DB_PATH);
    }

    _createTables() {
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS daily_stats (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                member        TEXT    NOT NULL,
                date          TEXT    NOT NULL,
                reports_total INTEGER DEFAULT 0,
                warns_total   INTEGER DEFAULT 0,
                support_total INTEGER DEFAULT 0,
                playtime_total INTEGER DEFAULT 0,
                rank          TEXT    DEFAULT 'Unknown',
                last_login    TEXT,
                online_state  TEXT    DEFAULT 'unknown',
                collected_at  TEXT    NOT NULL,
                UNIQUE(member, date)
            );

            CREATE TABLE IF NOT EXISTS monthly_stats (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                member        TEXT    NOT NULL,
                month         TEXT    NOT NULL,
                reports_done  INTEGER DEFAULT 0,
                warns_done    INTEGER DEFAULT 0,
                support_done  INTEGER DEFAULT 0,
                playtime_hours INTEGER DEFAULT 0,
                rolled_at     TEXT    NOT NULL,
                UNIQUE(member, month)
            );
        `);

        // Safely add last_login_date if missing
        try {
            this.db.exec(`ALTER TABLE daily_stats ADD COLUMN last_login_date TEXT;`);
        } catch (e) {
            // Ignore error if column already exists
        }
    }

    _prepareStatements() {
        this._upsertDaily = this.db.prepare(`
            INSERT INTO daily_stats (member, date, reports_total, warns_total, support_total, playtime_total, rank, last_login, last_login_date, online_state, collected_at)
            VALUES (@member, @date, @reports_total, @warns_total, @support_total, @playtime_total, @rank, @last_login, @last_login_date, @online_state, @collected_at)
            ON CONFLICT(member, date) DO UPDATE SET
                reports_total  = @reports_total,
                warns_total    = @warns_total,
                support_total  = @support_total,
                playtime_total = @playtime_total,
                rank           = @rank,
                last_login     = @last_login,
                last_login_date = @last_login_date,
                online_state   = @online_state,
                collected_at   = @collected_at
        `);

        this._getDailyOne = this.db.prepare(
            `SELECT * FROM daily_stats WHERE member = @member AND date = @date`
        );

        this._getDailyAll = this.db.prepare(
            `SELECT * FROM daily_stats WHERE date = @date ORDER BY member`
        );

        this._getDailyRange = this.db.prepare(
            `SELECT * FROM daily_stats WHERE member = @member AND date BETWEEN @start AND @end ORDER BY date ASC`
        );

        this._getDailyHistory = this.db.prepare(
            `SELECT * FROM daily_stats WHERE member = @member ORDER BY date DESC LIMIT @limit`
        );

        this._getFirstDailyInMonth = this.db.prepare(
            `SELECT * FROM daily_stats WHERE member = @member AND date BETWEEN @start AND @end ORDER BY date ASC LIMIT 1`
        );

        this._getLastDailyInMonth = this.db.prepare(
            `SELECT * FROM daily_stats WHERE member = @member AND date BETWEEN @start AND @end ORDER BY date DESC LIMIT 1`
        );

        this._upsertMonthly = this.db.prepare(`
            INSERT INTO monthly_stats (member, month, reports_done, warns_done, support_done, playtime_hours, rolled_at)
            VALUES (@member, @month, @reports_done, @warns_done, @support_done, @playtime_hours, @rolled_at)
            ON CONFLICT(member, month) DO UPDATE SET
                reports_done   = @reports_done,
                warns_done     = @warns_done,
                support_done   = @support_done,
                playtime_hours = @playtime_hours,
                rolled_at      = @rolled_at
        `);

        this._getMonthlyOne = this.db.prepare(
            `SELECT * FROM monthly_stats WHERE member = @member AND month = @month`
        );

        this._getMonthlyAll = this.db.prepare(
            `SELECT * FROM monthly_stats WHERE month = @month ORDER BY member`
        );

        this._getMonthlyHistory = this.db.prepare(
            `SELECT * FROM monthly_stats WHERE member = @member ORDER BY month DESC LIMIT @limit`
        );

        this._getAllMembers = this.db.prepare(
            `SELECT DISTINCT member FROM daily_stats ORDER BY member`
        );
    }

    // ═══════════════════════════════════════
    // Daily Stats
    // ═══════════════════════════════════════

    /**
     * Insert or update today's stats for a member.
     * @param {string} member - Staff name (will be lowercased)
     * @param {string} date - YYYY-MM-DD
     * @param {object} stats - Parsed stats object from collectPlayerStats
     */
    upsertDailyStats(member, date, stats) {
        this._upsertDaily.run({
            member: member.toLowerCase(),
            date,
            reports_total: stats.reports?.total || 0,
            warns_total: stats.warns?.total || 0,
            support_total: stats.support?.total || 0,
            playtime_total: stats.playtime || 0,
            rank: stats.rank || 'Unknown',
            last_login: stats.lastLogin || null,
            last_login_date: stats.lastLoginDate || null,
            online_state: stats.onlineState || 'unknown',
            collected_at: new Date().toISOString(),
        });
    }

    /**
     * Get daily stats for one member on one date.
     */
    getDailyStats(member, date) {
        return this._getDailyOne.get({ member: member.toLowerCase(), date }) || null;
    }

    /**
     * Get all members' stats for a date.
     */
    getDailyStatsAll(date) {
        return this._getDailyAll.all({ date });
    }

    /**
     * Get daily history for a member (most recent N days).
     */
    getDailyHistory(member, limit = 30) {
        return this._getDailyHistory.all({ member: member.toLowerCase(), limit }).reverse();
    }

    // ═══════════════════════════════════════
    // Monthly Rollup
    // ═══════════════════════════════════════

    /**
     * Roll up a month's daily data into a monthly summary.
     * Delta = last day's totals − first day's totals.
     * @param {string} member
     * @param {string} month - YYYY-MM
     */
    rollupMonth(member, month) {
        const memberLower = member.toLowerCase();
        // Month date range: YYYY-MM-01 to YYYY-MM-31
        const start = `${month}-01`;
        const end = `${month}-31`; // SQLite string comparison handles this fine

        const first = this._getFirstDailyInMonth.get({ member: memberLower, start, end });
        const last = this._getLastDailyInMonth.get({ member: memberLower, start, end });

        if (!first || !last) {
            console.log(`[StatsDB] No daily data for ${member} in ${month}, skipping rollup.`);
            return null;
        }

        const delta = {
            member: memberLower,
            month,
            reports_done: Math.max(0, (last.reports_total || 0) - (first.reports_total || 0)),
            warns_done: Math.max(0, (last.warns_total || 0) - (first.warns_total || 0)),
            support_done: Math.max(0, (last.support_total || 0) - (first.support_total || 0)),
            playtime_hours: Math.max(0, (last.playtime_total || 0) - (first.playtime_total || 0)),
            rolled_at: new Date().toISOString(),
        };

        this._upsertMonthly.run(delta);
        console.log(`[StatsDB] Rolled up ${member} for ${month}: R=${delta.reports_done} W=${delta.warns_done} S=${delta.support_done} PT=${delta.playtime_hours}h`);
        return delta;
    }

    /**
     * Roll up ALL tracked members for a given month.
     * @param {string[]} members - List of member names
     * @param {string} month - YYYY-MM
     */
    rollupAllMembers(members, month) {
        const results = [];
        for (const member of members) {
            const result = this.rollupMonth(member, month);
            if (result) results.push(result);
        }
        return results;
    }

    /**
     * Get monthly stats for one member in one month.
     */
    getMonthlyStats(member, month) {
        return this._getMonthlyOne.get({ member: member.toLowerCase(), month }) || null;
    }

    /**
     * Get all members' monthly stats for a given month.
     */
    getAllMonthlyStats(month) {
        return this._getMonthlyAll.all({ month });
    }

    /**
     * Get monthly history for a member (last N months).
     */
    getMonthlyHistory(member, limit = 12) {
        return this._getMonthlyHistory.all({ member: member.toLowerCase(), limit }).reverse();
    }

    /**
     * Compute live stats for the current month (no rollup yet).
     * Delta from the first daily stat of the month to the latest.
     * @param {string} member
     * @param {string} month - YYYY-MM
     */
    getLiveMonthlyStats(member, month) {
        const memberLower = member.toLowerCase();
        const start = `${month}-01`;
        const end = `${month}-31`;

        const first = this._getFirstDailyInMonth.get({ member: memberLower, start, end });
        const last = this._getLastDailyInMonth.get({ member: memberLower, start, end });

        if (!first || !last) return null;

        return {
            member: memberLower,
            month,
            reports_done: Math.max(0, (last.reports_total || 0) - (first.reports_total || 0)),
            warns_done: Math.max(0, (last.warns_total || 0) - (first.warns_total || 0)),
            support_done: Math.max(0, (last.support_total || 0) - (first.support_total || 0)),
            playtime_hours: Math.max(0, (last.playtime_total || 0) - (first.playtime_total || 0)),
            live: true,
        };
    }

    /**
     * Close the database connection.
     */
    close() {
        this.db.close();
    }
}

module.exports = StatsDB;
