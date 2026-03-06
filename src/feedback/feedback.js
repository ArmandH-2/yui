/**
 * Reaction Feedback System — Learn from user reactions on Yui's responses.
 * 
 * 👍 = positive feedback → reinforces behavior (saved to RAG memory)
 * 👎 = negative feedback → logged for review (NOT saved to RAG)
 * 
 * Self-contained module: delete this file and Yui's core is unaffected.
 */

const fs = require('fs');
const path = require('path');

const FEEDBACK_DIR = path.join(__dirname, '../../data/feedback');
const NEGATIVE_LOG = path.join(FEEDBACK_DIR, 'negative.json');
const STATS_FILE = path.join(FEEDBACK_DIR, 'stats.json');

class FeedbackSystem {
    /**
     * @param {import('discord.js').Client} discordClient
     * @param {import('../memory/rag')} rag - RAG engine for saving positive feedback
     * @param {import('../audit/logger').AuditLogger} [audit] - Optional audit logger
     */
    constructor(discordClient, rag, audit = null) {
        this.client = discordClient;
        this.rag = rag;
        this.audit = audit;
        this.responseMap = new Map(); // messageId → { query, response, intent, userId }

        this._ensureDir();
        this.stats = this._loadStats();

        this._setupListeners();
        console.log(`[Feedback] System initialized. Total: ${this.stats.positive} 👍 / ${this.stats.negative} 👎`);
    }

    _ensureDir() {
        if (!fs.existsSync(FEEDBACK_DIR)) {
            fs.mkdirSync(FEEDBACK_DIR, { recursive: true });
        }
    }

    _loadStats() {
        try {
            if (fs.existsSync(STATS_FILE)) {
                return JSON.parse(fs.readFileSync(STATS_FILE, 'utf-8'));
            }
        } catch (err) {
            console.error('[Feedback] Failed to load stats:', err.message);
        }
        return { positive: 0, negative: 0 };
    }

    _saveStats() {
        try {
            fs.writeFileSync(STATS_FILE, JSON.stringify(this.stats, null, 2));
        } catch (err) {
            console.error('[Feedback] Failed to save stats:', err.message);
        }
    }

    _loadNegativeLog() {
        try {
            if (fs.existsSync(NEGATIVE_LOG)) {
                return JSON.parse(fs.readFileSync(NEGATIVE_LOG, 'utf-8'));
            }
        } catch (err) {
            console.error('[Feedback] Failed to load negative log:', err.message);
        }
        return [];
    }

    _saveNegativeLog(entries) {
        try {
            fs.writeFileSync(NEGATIVE_LOG, JSON.stringify(entries, null, 2));
        } catch (err) {
            console.error('[Feedback] Failed to save negative log:', err.message);
        }
    }

    /**
     * Track a response from Yui so we can capture feedback on it later.
     * Call this after Yui replies to a message.
     * @param {string} replyMessageId - The ID of Yui's reply message
     * @param {object} context - { query, response, intent, userId, username }
     */
    trackResponse(replyMessageId, context) {
        this.responseMap.set(replyMessageId, {
            ...context,
            timestamp: new Date().toISOString(),
        });

        // Clean up old entries (keep last 100)
        if (this.responseMap.size > 100) {
            const keys = [...this.responseMap.keys()];
            for (let i = 0; i < keys.length - 100; i++) {
                this.responseMap.delete(keys[i]);
            }
        }
    }

    /**
     * Set up reaction listeners.
     */
    _setupListeners() {
        this.client.on('messageReactionAdd', async (reaction, user) => {
            // Ignore bot reactions
            if (user.bot) return;

            // Only process reactions on Yui's messages
            if (reaction.message.author?.id !== this.client.user.id) return;

            const emoji = reaction.emoji.name;
            if (emoji !== '👍' && emoji !== '👎') return;

            const context = this.responseMap.get(reaction.message.id);

            if (emoji === '👍') {
                await this._handlePositive(reaction, user, context);
            } else {
                await this._handleNegative(reaction, user, context);
            }
        });
    }

    /**
     * Handle positive feedback — reinforce behavior in RAG.
     */
    async _handlePositive(reaction, user, context) {
        this.stats.positive++;
        this._saveStats();

        if (context) {
            // Save the successful interaction to RAG so Yui repeats this behavior
            const memoryText = `[POSITIVE FEEDBACK] User "${context.username}" approved this response. Query: "${context.query}" → Response worked correctly. Intent: ${context.intent}`;
            await this.rag.addMemory(memoryText, 'reinforced');
            console.log(`[Feedback] 👍 from ${user.username} on "${context.query?.substring(0, 50)}..."`);
        } else {
            console.log(`[Feedback] 👍 from ${user.username} (no tracked context)`);
        }

        if (this.audit) {
            const { ACTION_TYPES } = require('../audit/logger');
            this.audit.log(ACTION_TYPES.FEEDBACK_POSITIVE, {
                query: context?.query?.substring(0, 200),
                response: context?.response?.substring(0, 200),
            }, { id: user.id, username: user.username });
        }
    }

    /**
     * Handle negative feedback — log for review, do NOT save to RAG.
     */
    async _handleNegative(reaction, user, context) {
        this.stats.negative++;
        this._saveStats();

        const entry = {
            timestamp: new Date().toISOString(),
            userId: user.id,
            username: user.username,
            query: context?.query || 'unknown',
            response: context?.response || 'unknown',
            intent: context?.intent || 'unknown',
            messageId: reaction.message.id,
        };

        const log = this._loadNegativeLog();
        log.push(entry);
        this._saveNegativeLog(log);

        console.log(`[Feedback] 👎 from ${user.username} on "${context?.query?.substring(0, 50)}..." — logged for review`);

        if (this.audit) {
            const { ACTION_TYPES } = require('../audit/logger');
            this.audit.log(ACTION_TYPES.FEEDBACK_NEGATIVE, {
                query: context?.query?.substring(0, 200),
                response: context?.response?.substring(0, 200),
            }, { id: user.id, username: user.username });
        }
    }

    /**
     * Get feedback statistics.
     * @returns {{ positive: number, negative: number, ratio: string, recentNegative: Array }}
     */
    getStats() {
        const total = this.stats.positive + this.stats.negative;
        const ratio = total > 0
            ? `${Math.round((this.stats.positive / total) * 100)}%`
            : 'N/A';

        const recentNeg = this._loadNegativeLog().slice(-5);

        return {
            positive: this.stats.positive,
            negative: this.stats.negative,
            total,
            ratio,
            recentNegative: recentNeg,
        };
    }
}

module.exports = FeedbackSystem;
