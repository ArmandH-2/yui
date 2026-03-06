/**
 * Parses incoming Minecraft chat messages.
 * Strips color codes, identifies sender, and categorizes messages.
 */

// Minecraft color code regex (§ followed by a character)
const COLOR_CODE_REGEX = /§[0-9a-fk-or]/gi;

/**
 * Strip Minecraft color/formatting codes from a string.
 * @param {string} text
 * @returns {string}
 */
function stripColors(text) {
    return text.replace(COLOR_CODE_REGEX, '').trim();
}

/**
 * Parse a chat message into a structured object.
 * @param {string} rawText - The raw message text
 * @returns {{type: string, sender: string|null, text: string, isSystem: boolean}}
 */
function parseMessage(rawText) {
    const text = stripColors(rawText);

    // Common chat patterns
    // Player chat: <PlayerName> message
    const playerChat = text.match(/^<(\w+)>\s*(.+)$/);
    if (playerChat) {
        return {
            type: 'player_chat',
            sender: playerChat[1],
            text: playerChat[2],
            isSystem: false,
        };
    }

    // Staff chat: [Staff] PlayerName: message
    const staffChat = text.match(/^\[(\w+)\]\s*(\w+):\s*(.+)$/);
    if (staffChat) {
        return {
            type: 'staff_chat',
            sender: staffChat[2],
            channel: staffChat[1],
            text: staffChat[3],
            isSystem: false,
        };
    }

    // Private message: PlayerName -> You: message OR You -> PlayerName: message
    const pm = text.match(/^(\w+)\s*->\s*(\w+):\s*(.+)$/);
    if (pm) {
        return {
            type: 'private_message',
            sender: pm[1],
            recipient: pm[2],
            text: pm[3],
            isSystem: false,
        };
    }

    // Join/leave: PlayerName joined/left the game
    const joinLeave = text.match(/^(\w+)\s+(joined|left)\s+the game\.?$/i);
    if (joinLeave) {
        return {
            type: joinLeave[2].toLowerCase() === 'joined' ? 'join' : 'leave',
            sender: joinLeave[1],
            text,
            isSystem: true,
        };
    }

    // System/server message (anything else)
    return {
        type: 'system',
        sender: null,
        text,
        isSystem: true,
    };
}

module.exports = { stripColors, parseMessage };
