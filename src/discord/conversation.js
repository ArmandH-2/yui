/**
 * ConversationManager — Per-user short-term conversation memory.
 * Keeps track of the last N messages per user so Yui has context
 * within a chat session. Messages auto-expire after inactivity.
 */

const DEFAULT_MAX_MESSAGES = 10;
const DEFAULT_EXPIRY_MS = 30 * 60 * 1000; // 30 minutes

class ConversationManager {
    /**
     * @param {object} [options]
     * @param {number} [options.maxMessages=10] - Max messages per user
     * @param {number} [options.expiryMs=1800000] - Expire after ms of inactivity
     */
    constructor(options = {}) {
        this.maxMessages = options.maxMessages || DEFAULT_MAX_MESSAGES;
        this.expiryMs = options.expiryMs || DEFAULT_EXPIRY_MS;
        /** @type {Map<string, {messages: Array, lastActivity: number}>} */
        this.conversations = new Map();
    }

    /**
     * Add a message to a user's conversation history.
     * @param {string} userId
     * @param {'user'|'assistant'} role
     * @param {string} content
     */
    addMessage(userId, role, content) {
        this._ensureConversation(userId);
        const conv = this.conversations.get(userId);

        conv.messages.push({ role, content });
        conv.lastActivity = Date.now();

        // Trim to max
        if (conv.messages.length > this.maxMessages) {
            conv.messages = conv.messages.slice(-this.maxMessages);
        }
    }

    /**
     * Get conversation history for a user (as OpenAI-compatible messages array).
     * Returns empty array if expired or no history.
     * @param {string} userId
     * @returns {Array<{role: string, content: string}>}
     */
    getHistory(userId) {
        const conv = this.conversations.get(userId);
        if (!conv) return [];

        // Check expiry
        if (Date.now() - conv.lastActivity > this.expiryMs) {
            this.conversations.delete(userId);
            return [];
        }

        return [...conv.messages];
    }

    /**
     * Clear a user's conversation.
     * @param {string} userId
     */
    clear(userId) {
        this.conversations.delete(userId);
    }

    /**
     * Get number of active conversations.
     * @returns {number}
     */
    get activeCount() {
        this._cleanup();
        return this.conversations.size;
    }

    _ensureConversation(userId) {
        if (!this.conversations.has(userId)) {
            this.conversations.set(userId, {
                messages: [],
                lastActivity: Date.now(),
            });
        }
    }

    /** Remove expired conversations */
    _cleanup() {
        const now = Date.now();
        for (const [userId, conv] of this.conversations) {
            if (now - conv.lastActivity > this.expiryMs) {
                this.conversations.delete(userId);
            }
        }
    }
}

module.exports = ConversationManager;
