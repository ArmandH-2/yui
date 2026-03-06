const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const STORE_PATH = path.join(__dirname, 'store.json');

/**
 * Reminder scheduler — stores and fires reminders via node-cron or one-shot timeouts.
 */
class ReminderScheduler {
    /**
     * @param {Function} onFire - Callback when a reminder fires: (reminder) => void
     */
    constructor(onFire) {
        this.reminders = {};
        this.activeJobs = {};
        this.onFire = onFire;
        this._load();
    }

    _load() {
        try {
            if (fs.existsSync(STORE_PATH)) {
                this.reminders = JSON.parse(fs.readFileSync(STORE_PATH, 'utf-8'));
                console.log(`[Scheduler] Loaded ${Object.keys(this.reminders).length} reminders.`);
                // Re-schedule active reminders
                for (const [id, reminder] of Object.entries(this.reminders)) {
                    if (reminder.active) {
                        this._schedule(id, reminder);
                    }
                }
            }
        } catch (err) {
            console.error('[Scheduler] Failed to load reminders:', err.message);
            this.reminders = {};
        }
    }

    _save() {
        try {
            const dir = path.dirname(STORE_PATH);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(STORE_PATH, JSON.stringify(this.reminders, null, 2));
        } catch (err) {
            console.error('[Scheduler] Failed to save reminders:', err.message);
        }
    }

    /**
     * Add a new reminder.
     * @param {string} target - Who to remind (Discord user ID or @mention)
     * @param {string} message - What to remind about
     * @param {string} when - When to fire: "in X minutes/hours", "at HH:MM", or cron expression
     * @returns {{id: string, scheduledFor: string}}
     */
    addReminder(target, message, when) {
        const id = uuidv4().slice(0, 8);
        const parsed = this._parseWhen(when);

        const reminder = {
            id,
            target,
            message,
            whenRaw: when,
            type: parsed.type, // 'once' or 'recurring'
            cronExpr: parsed.cronExpr,
            fireAt: parsed.fireAt,
            active: true,
            created: Date.now(),
        };

        this.reminders[id] = reminder;
        this._save();
        this._schedule(id, reminder);

        console.log(`[Scheduler] Added reminder ${id}: "${message}" for ${target}`);
        return { id, scheduledFor: parsed.description };
    }

    /**
     * Parse a natural-language "when" string into a schedulable format.
     */
    _parseWhen(when) {
        const lower = when.toLowerCase().trim();

        // "in X minutes/hours/days"
        const inMatch = lower.match(/in\s+(\d+)\s*(min(?:ute)?s?|hours?|h|m|days?|d)/);
        if (inMatch) {
            const amount = parseInt(inMatch[1], 10);
            const unitRaw = inMatch[2];
            let unit, ms;
            if (unitRaw.startsWith('d')) {
                unit = 'days';
                ms = amount * 86400000;
            } else if (unitRaw.startsWith('h')) {
                unit = 'hours';
                ms = amount * 3600000;
            } else {
                unit = 'minutes';
                ms = amount * 60000;
            }
            return {
                type: 'once',
                fireAt: Date.now() + ms,
                cronExpr: null,
                description: `in ${amount} ${unit}`,
            };
        }

        // "at 5pm", "at 5:30pm", "at 5 pm", "at 17:00", "at 3:30 am"
        const atMatch = lower.match(/at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
        if (atMatch) {
            let hour = parseInt(atMatch[1], 10);
            const minute = parseInt(atMatch[2] || '0', 10);
            const ampm = atMatch[3];

            if (ampm === 'pm' && hour < 12) hour += 12;
            if (ampm === 'am' && hour === 12) hour = 0;

            // Schedule for today if the time hasn't passed, otherwise tomorrow
            const now = new Date();
            const target = new Date(now);
            target.setHours(hour, minute, 0, 0);
            if (target <= now) {
                target.setDate(target.getDate() + 1);
            }

            const timeStr = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
            return {
                type: 'once',
                fireAt: target.getTime(),
                cronExpr: null,
                description: `at ${timeStr}${ampm ? ' ' + ampm : ''} (${target.toLocaleDateString()})`,
            };
        }

        // "tomorrow" / "tomorrow at X" / "tomorrow morning/afternoon/evening"
        const tomorrowMatch = lower.match(/tomorrow\s*(?:at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?)?/);
        if (tomorrowMatch && lower.includes('tomorrow')) {
            const now = new Date();
            const target = new Date(now);
            target.setDate(target.getDate() + 1);

            if (tomorrowMatch[1]) {
                let hour = parseInt(tomorrowMatch[1], 10);
                const minute = parseInt(tomorrowMatch[2] || '0', 10);
                const ampm = tomorrowMatch[3];
                if (ampm === 'pm' && hour < 12) hour += 12;
                if (ampm === 'am' && hour === 12) hour = 0;
                target.setHours(hour, minute, 0, 0);
            } else if (lower.includes('morning')) {
                target.setHours(8, 0, 0, 0);
            } else if (lower.includes('afternoon')) {
                target.setHours(14, 0, 0, 0);
            } else if (lower.includes('evening') || lower.includes('night')) {
                target.setHours(20, 0, 0, 0);
            } else {
                target.setHours(9, 0, 0, 0); // Default tomorrow = 9 AM
            }

            return {
                type: 'once',
                fireAt: target.getTime(),
                cronExpr: null,
                description: `tomorrow at ${target.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
            };
        }

        // "in the morning" / "this morning" / "this afternoon" / "tonight" / "this evening"
        const timeOfDayMatch = lower.match(/(?:in\s+the|this)\s+(morning|afternoon|evening)|tonight/);
        if (timeOfDayMatch) {
            const now = new Date();
            const target = new Date(now);
            const period = timeOfDayMatch[1] || 'evening'; // "tonight" → evening

            const hourMap = { morning: 8, afternoon: 14, evening: 20 };
            target.setHours(hourMap[period], 0, 0, 0);

            // If the time already passed today, push to tomorrow
            if (target <= now) {
                target.setDate(target.getDate() + 1);
            }

            return {
                type: 'once',
                fireAt: target.getTime(),
                cronExpr: null,
                description: `${period} at ${target.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} (${target.toLocaleDateString()})`,
            };
        }

        // "every day at HH:MM" or "every day at Xpm"
        const everyDayMatch = lower.match(/every\s+day\s+at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
        if (everyDayMatch) {
            let hour = parseInt(everyDayMatch[1], 10);
            const minute = parseInt(everyDayMatch[2] || '0', 10);
            const ampm = everyDayMatch[3];
            if (ampm === 'pm' && hour < 12) hour += 12;
            if (ampm === 'am' && hour === 12) hour = 0;
            return {
                type: 'recurring',
                fireAt: null,
                cronExpr: `${minute} ${hour} * * *`,
                description: `every day at ${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`,
            };
        }

        // Fallback: treat as cron expression or default to 1 hour
        if (cron.validate(when)) {
            return { type: 'recurring', fireAt: null, cronExpr: when, description: `cron: ${when}` };
        }

        // Default: fire in 1 hour
        return {
            type: 'once',
            fireAt: Date.now() + 3600000,
            cronExpr: null,
            description: 'in 1 hour (default)',
        };
    }

    _schedule(id, reminder) {
        if (reminder.type === 'once' && reminder.fireAt) {
            const delay = Math.max(0, reminder.fireAt - Date.now());
            this.activeJobs[id] = setTimeout(() => {
                this._fire(id);
            }, delay);
        } else if (reminder.type === 'recurring' && reminder.cronExpr) {
            this.activeJobs[id] = cron.schedule(reminder.cronExpr, () => {
                this._fire(id);
            });
        }
    }

    _fire(id) {
        const reminder = this.reminders[id];
        if (!reminder || !reminder.active) return;

        console.log(`[Scheduler] Firing reminder ${id}: "${reminder.message}"`);
        this.onFire(reminder);

        // Deactivate one-shot reminders
        if (reminder.type === 'once') {
            reminder.active = false;
            this._save();
        }
    }

    /**
     * List all reminders.
     * @param {boolean} [activeOnly=true]
     * @returns {Array}
     */
    listReminders(activeOnly = true) {
        return Object.values(this.reminders).filter((r) => !activeOnly || r.active);
    }

    /**
     * Cancel a reminder by ID.
     * @param {string} id
     * @returns {boolean}
     */
    cancelReminder(id) {
        const reminder = this.reminders[id];
        if (!reminder) return false;

        reminder.active = false;
        if (this.activeJobs[id]) {
            if (typeof this.activeJobs[id] === 'object' && this.activeJobs[id].stop) {
                this.activeJobs[id].stop(); // cron job
            } else {
                clearTimeout(this.activeJobs[id]); // timeout
            }
            delete this.activeJobs[id];
        }

        this._save();
        console.log(`[Scheduler] Cancelled reminder ${id}`);
        return true;
    }

    /**
     * Stop all active jobs (for shutdown).
     */
    stopAll() {
        for (const [id, job] of Object.entries(this.activeJobs)) {
            if (typeof job === 'object' && job.stop) {
                job.stop();
            } else {
                clearTimeout(job);
            }
        }
        this.activeJobs = {};
    }
}

module.exports = ReminderScheduler;
