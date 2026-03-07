/**
 * Activity Monitor — Adaptive /find polling with state machine.
 *
 * Surveillance states per target:
 *   IDLE     → /find every ~60 min
 *   ACTIVE   → /find every ~25 min (player is online)
 *   COOLDOWN → /find every ~25 min for 2 more rounds after disconnect, then → IDLE
 *
 * On each /find:
 *   - If online: record section + schedule heatmap
 *   - If offline: track when they left
 *
 * Uses the CommandQueue instead of running commands directly.
 */

const { parseFind } = require('../tracker/stat-parser');

const FIND_INTERVAL_IDLE = 60 * 60 * 1000;      // 60 min
const FIND_INTERVAL_ACTIVE = 25 * 60 * 1000;     // 25 min
const FIND_INTERVAL_COOLDOWN = 25 * 60 * 1000;   // 25 min (same as active)
const COOLDOWN_ROUNDS = 2;

class ActivityMonitor {
    /**
     * @param {import('../minecraft/command-queue').CommandQueue} cmdQueue
     * @param {import('./profile-store')} store
     */
    constructor(cmdQueue, store) {
        this.cmdQueue = cmdQueue;
        this.store = store;
    }

    /**
     * Check a single player via /find and update their surveillance state.
     * @param {string} playerName
     * @returns {Promise<object>} { online, section, stateChange }
     */
    async checkPlayer(playerName) {
        const findLines = await this.cmdQueue.enqueue(`/find ${playerName}`, {
            priority: 'NORMAL',
            timeout: 4000,
            maxLines: 10,
        });

        const findResult = parseFind(findLines);
        if (findResult.error) {
            console.log(`[ActivityMon] ${playerName}: ⚠️ Could not parse /find (maybe rate limit): ${findResult.rawText}`);
            return { error: 'Parse failed or rate limited' };
        }

        const profile = this.store.getProfile(playerName);
        if (!profile) return { error: 'No profile' };

        const prevState = profile.surveillanceState || 'idle';
        let newState = prevState;
        let cooldownLeft = profile.cooldownRoundsLeft || 0;
        let nextInterval;

        if (findResult.online) {
            // Player is online
            newState = 'active';
            cooldownLeft = COOLDOWN_ROUNDS; // Reset cooldown counter
            nextInterval = FIND_INTERVAL_ACTIVE;

            // Record to schedule heatmap
            this.store.recordOnlineTimestamp(playerName);

            // Log activity snapshot
            this.store.logActivity(playerName, {
                section: findResult.section || 'unknown',
                onlineState: 'online',
                playtime: null, // playtime comes from /info, not /find
                rank: null,
                lastLogin: null,
            });

            console.log(`[ActivityMon] ${playerName}: ✅ Online on ${findResult.section || 'unknown'} [state: ${newState}]`);
        } else {
            // Player is offline
            if (prevState === 'active') {
                // Just went offline → start cooldown
                newState = 'cooldown';
                cooldownLeft = COOLDOWN_ROUNDS;
                nextInterval = FIND_INTERVAL_COOLDOWN;
                console.log(`[ActivityMon] ${playerName}: ❌ Went offline → cooldown (${cooldownLeft} rounds left)`);
            } else if (prevState === 'cooldown') {
                cooldownLeft--;
                if (cooldownLeft <= 0) {
                    newState = 'idle';
                    nextInterval = FIND_INTERVAL_IDLE;
                    console.log(`[ActivityMon] ${playerName}: ❌ Cooldown expired → idle`);
                } else {
                    nextInterval = FIND_INTERVAL_COOLDOWN;
                    console.log(`[ActivityMon] ${playerName}: ❌ Still cooldown (${cooldownLeft} rounds left)`);
                }
            } else {
                // Already idle
                newState = 'idle';
                nextInterval = FIND_INTERVAL_IDLE;
                console.log(`[ActivityMon] ${playerName}: ❌ Offline [idle]`);
            }
        }

        // Update profile with new state
        const nextFindAt = new Date(Date.now() + nextInterval).toISOString();
        this.store.updateProfile(playerName, {
            surveillanceState: newState,
            cooldownRoundsLeft: cooldownLeft,
            nextFindAt,
        });

        return {
            online: findResult.online,
            section: findResult.section,
            prevState,
            newState,
            cooldownLeft,
            nextFindAt,
        };
    }

    /**
     * Check which targets are due for a /find check RIGHT NOW.
     * Called by the main tick loop.
     * @returns {string[]} List of player names that need checking
     */
    getDueTargets() {
        const now = new Date().toISOString();
        return this.store.getActiveProfiles()
            .filter(p => !p.nextFindAt || p.nextFindAt <= now)
            .map(p => p.name);
    }

    /**
     * Run /find for all due targets.
     * @returns {Promise<object>} Results map
     */
    async checkDue() {
        const due = this.getDueTargets();
        if (due.length === 0) return {};

        console.log(`[ActivityMon] Checking ${due.length} due targets...`);
        const results = {};

        for (const name of due) {
            try {
                results[name] = await this.checkPlayer(name);
            } catch (err) {
                console.error(`[ActivityMon] Failed to check ${name}:`, err.message);
                results[name] = { error: err.message };
            }
        }

        return results;
    }
}

module.exports = ActivityMonitor;
