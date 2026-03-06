/**
 * Audit Logger — Logs every action Yui takes with full context.
 * Storage: JSON files in data/audit/YYYY-MM-DD.json (one file per day).
 */

const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const AUDIT_DIR = path.join(__dirname, '../../data/audit');

// Action types
const ACTION_TYPES = {
    COMMAND_EXECUTED: 'command_executed',
    MEMORY_SAVED: 'memory_saved',
    SKILL_SAVED: 'skill_saved',
    REMINDER_SET: 'reminder_set',
    REMINDER_CANCELLED: 'reminder_cancelled',
    FEEDBACK_POSITIVE: 'feedback_positive',
    FEEDBACK_NEGATIVE: 'feedback_negative',
    MODE_CHANGED: 'mode_changed',
    AGENT_RESPONSE: 'agent_response',
    TRACKER_SYNC: 'tracker_sync',
    TRACKER_COLLECTED: 'tracker_collected',
    TRACKER_ROSTER_CHANGED: 'tracker_roster_changed',
    PROFILER_FORCE_CHECK: 'profile_force_check',
    PROFILER_DAILY_BATCH: 'profile_daily_batch',
    PROFILER_CHATLOG_CYCLE: 'profile_chatlog_cycle',
    PROFILER_WATCHLIST_CHANGED: 'profile_watchlist_changed',
    PROFILER_NOTE_ADDED: 'profile_note_added',
    PROFILER_DELETED: 'profile_deleted',
};

class AuditLogger {
    constructor() {
        this._ensureDir();
    }

    _ensureDir() {
        if (!fs.existsSync(AUDIT_DIR)) {
            fs.mkdirSync(AUDIT_DIR, { recursive: true });
        }
    }

    /**
     * Get the file path for a given date.
     * @param {Date} [date]
     * @returns {string}
     */
    _getFilePath(date = new Date()) {
        const dateStr = date.toISOString().slice(0, 10); // YYYY-MM-DD
        return path.join(AUDIT_DIR, `${dateStr}.json`);
    }

    /**
     * Read entries for a given date.
     * @param {Date} [date]
     * @returns {Array}
     */
    _readDay(date = new Date()) {
        const filePath = this._getFilePath(date);
        try {
            if (fs.existsSync(filePath)) {
                return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
            }
        } catch (err) {
            console.error('[Audit] Failed to read log:', err.message);
        }
        return [];
    }

    /**
     * Write entries for a given date.
     * @param {Array} entries
     * @param {Date} [date]
     */
    _writeDay(entries, date = new Date()) {
        const filePath = this._getFilePath(date);
        try {
            fs.writeFileSync(filePath, JSON.stringify(entries, null, 2));
        } catch (err) {
            console.error('[Audit] Failed to write log:', err.message);
        }
    }

    /**
     * Log an action.
     * @param {string} action - One of ACTION_TYPES
     * @param {object} details - Action-specific details
     * @param {object} [user] - { id, username } of the requester
     * @returns {object} The created entry
     */
    log(action, details = {}, user = null) {
        const entry = {
            id: uuidv4().slice(0, 8),
            timestamp: new Date().toISOString(),
            action,
            userId: user?.id || null,
            username: user?.username || 'system',
            details,
        };

        const entries = this._readDay();
        entries.push(entry);
        this._writeDay(entries);

        console.log(`[Audit] ${action} by ${entry.username}: ${JSON.stringify(details).substring(0, 100)}`);
        return entry;
    }

    /**
     * Get the most recent N entries (from today, then yesterday, etc.).
     * @param {number} [n=10]
     * @returns {Array}
     */
    getRecent(n = 10) {
        const results = [];
        const now = new Date();

        // Check up to 7 days back
        for (let i = 0; i < 7 && results.length < n; i++) {
            const date = new Date(now);
            date.setDate(date.getDate() - i);
            const dayEntries = this._readDay(date);
            results.push(...dayEntries.reverse());
        }

        return results.slice(0, n);
    }

    /**
     * Get all entries for a specific date.
     * @param {Date} [date]
     * @returns {Array}
     */
    getByDate(date = new Date()) {
        return this._readDay(date);
    }

    /**
     * Get entries filtered by action type.
     * @param {string} actionType
     * @param {number} [days=1] - How many days back to search
     * @returns {Array}
     */
    getByType(actionType, days = 1) {
        const results = [];
        const now = new Date();

        for (let i = 0; i < days; i++) {
            const date = new Date(now);
            date.setDate(date.getDate() - i);
            const dayEntries = this._readDay(date);
            results.push(...dayEntries.filter((e) => e.action === actionType));
        }

        return results;
    }

    /**
     * Get today's stats summary.
     * @returns {object}
     */
    getTodayStats() {
        const entries = this._readDay();
        const counts = {};
        for (const entry of entries) {
            counts[entry.action] = (counts[entry.action] || 0) + 1;
        }
        return { total: entries.length, breakdown: counts };
    }
}

module.exports = { AuditLogger, ACTION_TYPES };
