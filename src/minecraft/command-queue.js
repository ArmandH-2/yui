/**
 * Command Queue — Central throttled command execution for all modules.
 *
 * Instead of each module running commands directly (slow, sequential, blocking),
 * everything goes through this queue. One command at a time, 800ms gap,
 * with priority levels.
 *
 * Usage:
 *   const queue = new CommandQueue(cmdRunner);
 *   const result = await queue.enqueue('/find ItsB2_');
 *   const result = await queue.enqueue('/info ItsB2_ su', { priority: 'HIGH' });
 */

const EventEmitter = require('events');

const PRIORITY = { HIGH: 0, NORMAL: 1, LOW: 2 };
const THROTTLE_MS = 800; // gap between commands

class CommandQueue extends EventEmitter {
    /**
     * @param {import('./command-runner')} cmdRunner
     */
    constructor(cmdRunner) {
        super();
        this.cmdRunner = cmdRunner;
        this._queue = [];       // { command, opts, priority, resolve, reject, enqueuedAt }
        this._processing = false;
        this._totalProcessed = 0;
        this._lastCmdTime = 0;

        console.log('[CmdQueue] Command queue initialized.');
    }

    /**
     * Enqueue a command for execution.
     * @param {string} command - The MC command (e.g. '/find ItsB2_')
     * @param {object} [opts] - Options
     * @param {string} [opts.priority='NORMAL'] - 'HIGH', 'NORMAL', 'LOW'
     * @param {number} [opts.timeout=5000] - Command timeout in ms
     * @param {number} [opts.maxLines=20] - Max response lines
     * @returns {Promise<string[]>} The command output lines
     */
    enqueue(command, opts = {}) {
        const priority = PRIORITY[opts.priority] ?? PRIORITY.NORMAL;

        return new Promise((resolve, reject) => {
            this._queue.push({
                command,
                opts: { timeout: opts.timeout || 5000, maxLines: opts.maxLines || 20 },
                priority,
                resolve,
                reject,
                enqueuedAt: Date.now(),
            });

            // Sort by priority (lower number = higher priority), then by enqueue time
            this._queue.sort((a, b) => a.priority - b.priority || a.enqueuedAt - b.enqueuedAt);

            this._process();
        });
    }

    /**
     * Process the queue — one command at a time.
     */
    async _process() {
        if (this._processing || this._queue.length === 0) return;

        this._processing = true;

        while (this._queue.length > 0) {
            const item = this._queue.shift();

            // Throttle — ensure THROTTLE_MS between commands
            const elapsed = Date.now() - this._lastCmdTime;
            if (elapsed < THROTTLE_MS) {
                await new Promise(r => setTimeout(r, THROTTLE_MS - elapsed));
            }

            try {
                const result = await this.cmdRunner.runCommand(item.command, item.opts);
                this._lastCmdTime = Date.now();
                this._totalProcessed++;
                item.resolve(result);
            } catch (err) {
                this._lastCmdTime = Date.now();
                this._totalProcessed++;
                item.reject(err);
            }
        }

        this._processing = false;
    }

    /**
     * Get queue stats.
     */
    getStats() {
        return {
            pending: this._queue.length,
            processing: this._processing,
            totalProcessed: this._totalProcessed,
        };
    }

    /**
     * Clear all pending LOW-priority commands.
     */
    clearLowPriority() {
        const before = this._queue.length;
        this._queue = this._queue.filter(q => q.priority < PRIORITY.LOW);
        const cleared = before - this._queue.length;
        if (cleared > 0) console.log(`[CmdQueue] Cleared ${cleared} low-priority commands.`);
    }
}

module.exports = { CommandQueue, PRIORITY };
