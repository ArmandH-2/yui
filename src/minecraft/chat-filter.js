/**
 * Filters noise/global messages from command response capture.
 * These are messages that appear in chat but are NOT part of a command's output.
 */

// Patterns that indicate a message is global noise, not command output
const NOISE_PATTERNS = [
    // Player connection messages: "PlayerName connected!", "PlayerName disconnected"
    /^\w{3,16}\s+(connected|disconnected)!?$/i,

    // Join/leave: "PlayerName joined the game", "PlayerName left the game"
    /^\w{3,16}\s+(joined|left)\s+the\s+game\.?$/i,

    // Repeated global alert broadcasts (e.g., "THERE IS 1 OPEN REPORT!", "THERE ARE 7 OPEN REPORTS!")
    /^THERE\s+(?:IS|ARE)\s+\d+\s+OPEN\s+REPORTS?!*$/i,

    // Broader report alarm variants
    /OPEN\s+REPORTS?!*$/i,

    // "1 PLAYER NEEDS HELP!" (or any number of players) - useless spam
    /^\d+\s+PLAYERS?\s+NEEDS?\s+HELP!*$/i,

    // Community/info broadcast lines: "▸ Community and information! ▸ discord.gamster.org"
    /[►▸]\s*Community\s+and\s+information/i,

    // Warn messages from staff OTHER than itzb2_ — we only care about our own warns
    /^Warn\s+[►▸]\s+(?!.*itzb2_)/i,

    // Follow commands from other players
    /^\s*►\s*Follow\s+\w/i,

    // Discord-style attribution lines: "Yui — Staff Manager•Today at 2:42 AM"
    /^.+—.+•.+at\s+\d{1,2}:\d{2}\s*(AM|PM)?$/i,

    // Blank or whitespace-only lines
    /^\s*$/,

    // Generic server broadcast prefixes
    /^\[(?:Server|Broadcast|Alert)\]/i,
];

/**
 * Check if a chat message is global noise that should be excluded from command responses.
 * @param {string} text - The chat message text (already stripped of color codes)
 * @returns {boolean} true if the message is noise and should be skipped
 */
function isNoise(text) {
    if (!text || typeof text !== 'string') return true;

    const trimmed = text.trim();
    if (!trimmed) return true;

    return NOISE_PATTERNS.some((pattern) => pattern.test(trimmed));
}

module.exports = { isNoise, NOISE_PATTERNS };
