/**
 * Profile Store — Per-player dossier file management.
 *
 * Each monitored player gets a folder under data/profiles/<name>/ with:
 *   - profile.json      → Core info, surveillance state, tracking config
 *   - activity.json     → Activity snapshots + section frequency map
 *   - notes.json        → Manual notes from the user
 *   - analysis.json     → LLM-generated persona summary
 *   - alts.json         → Known alt accounts (from /info su)
 *   - punishments.json  → Punishment history (from /punishhistory)
 *   - schedule.json     → 24×7 online schedule heatmap
 *   - playtime.json     → Daily playtime snapshots for graphing
 *   - chatlogs/         → Chatlog snapshots + LLM analysis
 */

const fs = require('fs');
const path = require('path');

const PROFILES_DIR = path.join(__dirname, '../../data/profiles');

class ProfileStore {
    constructor() {
        this._ensureDir(PROFILES_DIR);
    }

    _ensureDir(dir) {
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    }

    _playerDir(name) {
        // Normalize to lowercase for folder names
        return path.join(PROFILES_DIR, name.toLowerCase());
    }

    _readJSON(filePath) {
        try {
            if (fs.existsSync(filePath)) {
                return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
            }
        } catch (err) {
            console.error(`[ProfileStore] Failed to read ${filePath}:`, err.message);
        }
        return null;
    }

    _writeJSON(filePath, data) {
        try {
            this._ensureDir(path.dirname(filePath));
            fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
        } catch (err) {
            console.error(`[ProfileStore] Failed to write ${filePath}:`, err.message);
        }
    }

    // ═══════════════════════════════════════
    // Profile CRUD
    // ═══════════════════════════════════════

    /**
     * Create a new player profile.
     * @param {string} name - Player name (case-preserved in profile, lowercase folder)
     * @param {string} [type='applicant'] - 'applicant' or 'staff'
     * @returns {object} The created profile
     */
    createProfile(name, type = 'applicant') {
        const dir = this._playerDir(name);
        this._ensureDir(dir);
        this._ensureDir(path.join(dir, 'chatlogs'));

        const profilePath = path.join(dir, 'profile.json');
        if (this._readJSON(profilePath)) {
            console.log(`[ProfileStore] Profile for ${name} already exists.`);
            return this._readJSON(profilePath);
        }

        const profile = {
            name,
            nameLower: name.toLowerCase(),
            type,               // 'applicant' | 'suspect' | 'staff-suspect'
            trackingSince: new Date().toISOString(),
            status: 'active',   // active, paused, archived
            lastChecked: null,
            checkCount: 0,
            // Surveillance state machine
            surveillanceState: 'idle',    // idle | active | cooldown
            nextFindAt: new Date().toISOString(),
            cooldownRoundsLeft: 0,
            // Chatlog schedule
            lastChatlogAt: null,
            chatlogIntervalHours: 12,     // default: every 12h
            // Playtime baseline
            playtimeBaseline: null,       // playtime when first watched
            latestPlaytime: null,
        };

        this._writeJSON(profilePath, profile);

        // Initialize empty files
        this._writeJSON(path.join(dir, 'activity.json'), {
            dailySnapshots: [],
            sectionFrequency: {},
            totalChecks: 0,
        });
        this._writeJSON(path.join(dir, 'notes.json'), []);
        this._writeJSON(path.join(dir, 'analysis.json'), {
            persona: null,
            lastUpdated: null,
            chatlogsAnalyzed: 0,
        });
        this._writeJSON(path.join(dir, 'alts.json'), []);
        this._writeJSON(path.join(dir, 'punishments.json'), []);
        this._writeJSON(path.join(dir, 'schedule.json'), { matrix: {}, lastUpdated: null });
        this._writeJSON(path.join(dir, 'playtime.json'), []);

        console.log(`[ProfileStore] Created profile for ${name} (${type}).`);
        return profile;
    }

    /**
     * Check if a profile exists.
     */
    hasProfile(name) {
        return fs.existsSync(path.join(this._playerDir(name), 'profile.json'));
    }

    /**
     * Get a player's core profile.
     */
    getProfile(name) {
        return this._readJSON(path.join(this._playerDir(name), 'profile.json'));
    }

    /**
     * Update profile fields.
     */
    updateProfile(name, updates) {
        const profilePath = path.join(this._playerDir(name), 'profile.json');
        const profile = this._readJSON(profilePath);
        if (!profile) return null;

        Object.assign(profile, updates);
        this._writeJSON(profilePath, profile);
        return profile;
    }

    /**
     * Delete a profile entirely.
     */
    deleteProfile(name) {
        const dir = this._playerDir(name);
        if (fs.existsSync(dir)) {
            fs.rmSync(dir, { recursive: true, force: true });
            console.log(`[ProfileStore] Deleted profile for ${name}.`);
            return true;
        }
        return false;
    }

    /**
     * List all profiles.
     * @returns {Array<object>} Array of profile objects
     */
    listProfiles() {
        if (!fs.existsSync(PROFILES_DIR)) return [];

        const dirs = fs.readdirSync(PROFILES_DIR, { withFileTypes: true })
            .filter(d => d.isDirectory());

        return dirs
            .map(d => this._readJSON(path.join(PROFILES_DIR, d.name, 'profile.json')))
            .filter(Boolean);
    }

    /**
     * Get active profiles only.
     */
    getActiveProfiles() {
        return this.listProfiles().filter(p => p.status === 'active');
    }

    // ═══════════════════════════════════════
    // Activity Data
    // ═══════════════════════════════════════

    /**
     * Log an activity snapshot (from /find + /info).
     * @param {string} name
     * @param {object} data - { section, playtime, onlineState, lastLogin, rank }
     */
    logActivity(name, data) {
        const actPath = path.join(this._playerDir(name), 'activity.json');
        const activity = this._readJSON(actPath) || {
            dailySnapshots: [],
            sectionFrequency: {},
            totalChecks: 0,
        };

        const snapshot = {
            timestamp: new Date().toISOString(),
            ...data,
        };

        activity.dailySnapshots.push(snapshot);
        activity.totalChecks++;

        // Update section frequency map
        if (data.section && data.section !== 'offline') {
            activity.sectionFrequency[data.section] =
                (activity.sectionFrequency[data.section] || 0) + 1;
        }

        // Keep last 500 snapshots to avoid file bloat
        if (activity.dailySnapshots.length > 500) {
            activity.dailySnapshots = activity.dailySnapshots.slice(-500);
        }

        this._writeJSON(actPath, activity);

        // Update profile lastChecked
        this.updateProfile(name, {
            lastChecked: new Date().toISOString(),
            checkCount: (this.getProfile(name)?.checkCount || 0) + 1,
        });
    }

    /**
     * Get activity data for a player.
     */
    getActivity(name) {
        return this._readJSON(path.join(this._playerDir(name), 'activity.json'));
    }

    /**
     * Calculate activity summary stats.
     * Uses playtime growth per calendar day (not 24h windows) for accuracy.
     */
    getActivitySummary(name) {
        const activity = this.getActivity(name);
        if (!activity) return null;

        const snapshots = activity.dailySnapshots || [];

        // Group activity check dates
        const byDate = new Set();
        for (const s of snapshots) {
            byDate.add(s.timestamp.slice(0, 10));
        }

        // Use playtime.json for playtime growth (since /find doesn't include playtime)
        const playtimes = this.getPlaytimeHistory(name) || [];
        const dailyGrowth = [];
        const profile = this.getProfile(name);

        let previousPlaytime = profile?.playtimeBaseline || 0;

        for (let i = 0; i < playtimes.length; i++) {
            const currentPlaytime = playtimes[i].playtime;
            const growth = Math.max(0, currentPlaytime - previousPlaytime);

            dailyGrowth.push({ date: playtimes[i].date, hoursPlayed: growth });

            // Set for next iteration
            previousPlaytime = currentPlaytime;
        }

        // Average daily playtime
        const avgDailyPlaytime = dailyGrowth.length > 0
            ? Math.round((dailyGrowth.reduce((sum, d) => sum + d.hoursPlayed, 0) / dailyGrowth.length) * 10) / 10
            : 0;

        // Active days = days with playtime growth > 0
        const activeDays = dailyGrowth.filter(d => d.hoursPlayed > 0).length;

        // Section ranking
        const sections = Object.entries(activity.sectionFrequency || {})
            .sort(([, a], [, b]) => b - a)
            .map(([section, count]) => ({ section, count }));

        return {
            totalChecks: activity.totalChecks,
            daysTracked: Math.max(byDate.size, playtimes.length),
            activeDays,
            inactiveDays: Math.max(0, dailyGrowth.length - activeDays),
            avgDailyPlaytime,
            dailyGrowth: dailyGrowth.slice(-14), // Last 14 days for graphs
            latestPlaytime: playtimes.length > 0 ? playtimes[playtimes.length - 1].playtime : null,
            topSections: sections.slice(0, 5),
            activityRate: dailyGrowth.length > 0
                ? Math.round((activeDays / dailyGrowth.length) * 100)
                : 0,
        };
    }

    // ═══════════════════════════════════════
    // Notes
    // ═══════════════════════════════════════

    /**
     * Add a note to a player's dossier.
     * @param {string} name
     * @param {string} text
     * @param {string} [author='system']
     * @param {string} [category='general'] - e.g. 'incident', 'positive', 'general'
     */
    addNote(name, text, author = 'system', category = 'general') {
        const notesPath = path.join(this._playerDir(name), 'notes.json');
        const notes = this._readJSON(notesPath) || [];

        notes.push({
            timestamp: new Date().toISOString(),
            text,
            author,
            category,
        });

        this._writeJSON(notesPath, notes);
        console.log(`[ProfileStore] Note added for ${name}: "${text.substring(0, 60)}..."`);
    }

    /**
     * Get all notes for a player.
     */
    getNotes(name) {
        return this._readJSON(path.join(this._playerDir(name), 'notes.json')) || [];
    }

    // ═══════════════════════════════════════
    // Chatlog Analysis
    // ═══════════════════════════════════════

    /**
     * Save a chatlog analysis.
     * @param {string} name
     * @param {string} rawChatlog - Raw chatlog text
     * @param {object} analysis - LLM analysis result
     * @param {string} chatlogCode - The chatlog code/URL
     */
    saveChatlogAnalysis(name, rawChatlog, analysis, chatlogCode) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
        const chatlogDir = path.join(this._playerDir(name), 'chatlogs');
        this._ensureDir(chatlogDir);

        const entry = {
            timestamp: new Date().toISOString(),
            chatlogCode,
            url: `https://chatlog.gamster.org/?report=${chatlogCode}`,
            rawChatlog,
            analysis,
        };

        this._writeJSON(path.join(chatlogDir, `${timestamp}.json`), entry);
    }

    getChatlogAnalyses(name) {
        const chatlogDir = path.join(this._playerDir(name), 'chatlogs');
        if (!fs.existsSync(chatlogDir)) return [];

        return fs.readdirSync(chatlogDir)
            .filter(f => f.endsWith('.json'))
            .sort()
            .map(f => this._readJSON(path.join(chatlogDir, f)))
            .filter(Boolean);
    }

    /**
     * Delete a chatlog analysis by its code.
     */
    deleteChatlogAnalysis(name, code) {
        const chatlogDir = path.join(this._playerDir(name), 'chatlogs');
        if (!fs.existsSync(chatlogDir)) return false;

        const files = fs.readdirSync(chatlogDir);
        for (const file of files) {
            const fp = path.join(chatlogDir, file);
            const data = this._readJSON(fp);
            if (data && data.chatlogCode === code) {
                fs.unlinkSync(fp);
                console.log(`[ProfileStore] Deleted chatlog ${code} for ${name}`);
                return true;
            }
        }
        return false;
    }

    // ═══════════════════════════════════════
    // Persona / Analysis Summary
    // ═══════════════════════════════════════

    /**
     * Update the cumulative LLM persona analysis.
     */
    updateAnalysis(name, persona) {
        const analysisPath = path.join(this._playerDir(name), 'analysis.json');
        const current = this._readJSON(analysisPath) || {};

        this._writeJSON(analysisPath, {
            ...current,
            persona,
            lastUpdated: new Date().toISOString(),
            chatlogsAnalyzed: (current.chatlogsAnalyzed || 0) + 1,
        });
    }

    /**
     * Get the current persona analysis.
     */
    getAnalysis(name) {
        return this._readJSON(path.join(this._playerDir(name), 'analysis.json'));
    }

    // ═══════════════════════════════════════
    // Alts
    // ═══════════════════════════════════════

    /**
     * Save alt accounts for a player.
     * @param {string} name
     * @param {string[]} alts
     */
    saveAlts(name, alts) {
        const altsPath = path.join(this._playerDir(name), 'alts.json');
        const existing = this._readJSON(altsPath) || [];
        const merged = [...new Set([...existing, ...alts])];
        this._writeJSON(altsPath, merged);
    }

    getAlts(name) {
        return this._readJSON(path.join(this._playerDir(name), 'alts.json')) || [];
    }

    // ═══════════════════════════════════════
    // Punishments
    // ═══════════════════════════════════════

    /**
     * Append punishment entries (avoids duplicates by raw string).
     * @param {string} name
     * @param {Array} entries - From parsePunishHistory
     */
    savePunishments(name, entries) {
        const pPath = path.join(this._playerDir(name), 'punishments.json');
        const existing = this._readJSON(pPath) || [];
        const existingRaw = new Set(existing.map(e => e.raw));
        const newEntries = entries.filter(e => !existingRaw.has(e.raw));
        if (newEntries.length > 0) {
            existing.push(...newEntries.map(e => ({ ...e, fetchedAt: new Date().toISOString() })));
            this._writeJSON(pPath, existing);
            console.log(`[ProfileStore] Added ${newEntries.length} new punishment entries for ${name}.`);
        }
    }

    getPunishments(name) {
        return this._readJSON(path.join(this._playerDir(name), 'punishments.json')) || [];
    }

    // ═══════════════════════════════════════
    // Schedule Heatmap (24h × 7 days-of-week)
    // ═══════════════════════════════════════

    /**
     * Record that the player was seen online at a specific time.
     * Increments the [dayOfWeek][hour] counter in the schedule matrix.
     * @param {string} name
     * @param {Date} [when=new Date()]
     */
    recordOnlineTimestamp(name, when = new Date()) {
        const schedPath = path.join(this._playerDir(name), 'schedule.json');
        const sched = this._readJSON(schedPath) || { matrix: {}, lastUpdated: null };

        const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][when.getDay()];
        const hour = when.getHours();

        if (!sched.matrix[day]) sched.matrix[day] = {};
        sched.matrix[day][hour] = (sched.matrix[day][hour] || 0) + 1;
        sched.lastUpdated = when.toISOString();

        this._writeJSON(schedPath, sched);
    }

    getSchedule(name) {
        return this._readJSON(path.join(this._playerDir(name), 'schedule.json')) || { matrix: {}, lastUpdated: null };
    }

    // ═══════════════════════════════════════
    // Playtime Snapshots
    // ═══════════════════════════════════════

    /**
     * Record a daily playtime snapshot.
     * @param {string} name
     * @param {number} playtime - Total playtime in hours
     * @param {string} [date] - YYYY-MM-DD, defaults to today
     */
    recordPlaytime(name, playtime, date = null) {
        const ptPath = path.join(this._playerDir(name), 'playtime.json');
        const entries = this._readJSON(ptPath) || [];
        const dateStr = date || new Date().toISOString().slice(0, 10);

        // Upsert: update today's entry or add new
        const existing = entries.find(e => e.date === dateStr);
        if (existing) {
            existing.playtime = playtime;
            existing.updatedAt = new Date().toISOString();
        } else {
            entries.push({ date: dateStr, playtime, updatedAt: new Date().toISOString() });
        }

        // Keep last 90 days
        if (entries.length > 90) entries.splice(0, entries.length - 90);

        this._writeJSON(ptPath, entries);
    }

    getPlaytimeHistory(name) {
        return this._readJSON(path.join(this._playerDir(name), 'playtime.json')) || [];
    }
}

module.exports = ProfileStore;
