const { quickPrompt } = require('./llm');

const SUMMARY_SYSTEM = `You are Yui, summarizing Minecraft server chat logs for staff.
Create a concise, structured summary covering:
1. Key events and player actions
2. Rule violations or suspicious activity
3. Staff actions taken
4. Notable conversations or requests
5. Player joins/leaves if significant

Be factual and concise. Use bullet points. Respond in JSON:
{
  "summary": "the formatted summary text",
  "key_events": ["event1", "event2"],
  "violations": ["violation1"],
  "staff_actions": ["action1"]
}`;

/**
 * In-memory chat log buffer.
 */
class ChatBuffer {
    constructor(maxSize = 500) {
        this.messages = [];
        this.maxSize = maxSize;
    }

    add(message) {
        this.messages.push({
            timestamp: Date.now(),
            ...message,
        });

        // Prune old messages
        if (this.messages.length > this.maxSize) {
            this.messages = this.messages.slice(-this.maxSize);
        }
    }

    getRecent(minutes = 30) {
        const cutoff = Date.now() - minutes * 60 * 1000;
        return this.messages.filter((m) => m.timestamp >= cutoff);
    }

    clear() {
        this.messages = [];
    }
}

/**
 * Summarize recent chat messages.
 * @param {ChatBuffer} buffer - The chat buffer instance
 * @param {number} [minutes=30] - How many minutes back to look
 * @returns {Promise<object>} Structured summary
 */
async function summarizeChat(buffer, minutes = 30) {
    const recent = buffer.getRecent(minutes);

    if (recent.length === 0) {
        return {
            summary: 'No chat activity in the requested timeframe.',
            key_events: [],
            violations: [],
            staff_actions: [],
        };
    }

    const chatText = recent
        .map((m) => {
            const time = new Date(m.timestamp).toLocaleTimeString();
            return `[${time}] ${m.sender || 'System'}: ${m.text}`;
        })
        .join('\n');

    const prompt = `Summarize the following Minecraft server chat log from the last ${minutes} minutes:\n\n${chatText}`;
    const raw = await quickPrompt(prompt, SUMMARY_SYSTEM);

    try {
        return JSON.parse(raw);
    } catch (err) {
        console.error('[Summarizer] Failed to parse LLM response:', err.message);
        return {
            summary: 'Failed to generate summary.',
            key_events: [],
            violations: [],
            staff_actions: [],
        };
    }
}

module.exports = { ChatBuffer, summarizeChat };
