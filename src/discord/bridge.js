const { parseMessage } = require('../minecraft/chat-handler');
const { buildEmbed, sendToChannel } = require('./client');

/**
 * Bridge between Minecraft chat and Discord.
 * Forwards relevant MC messages to Discord and vice versa.
 */
class Bridge {
    /**
     * @param {import('./client').Client} discordClient
     * @param {import('../minecraft/bot')} mcBot
     * @param {import('../ai/summarizer').ChatBuffer} chatBuffer
     * @param {string} channelId - Discord channel to bridge to
     */
    constructor(discordClient, mcBot, chatBuffer, channelId) {
        this.discordClient = discordClient;
        this.mcBot = mcBot;
        this.chatBuffer = chatBuffer;
        this.channelId = channelId;
        this.enabled = true;

        // Filter settings
        this.forwardPlayerChat = true;
        this.forwardStaffChat = true;
        this.forwardJoinLeave = true;
        this.forwardSystem = false;
    }

    /**
     * Start the bridge — listen to MC events and forward to Discord.
     */
    start() {
        this.mcBot.on('chat', (data) => {
            if (!this.enabled) return;

            const parsed = parseMessage(data.text);

            // Always add to chat buffer for summarization
            this.chatBuffer.add({
                sender: parsed.sender || 'System',
                text: parsed.text,
                type: parsed.type,
            });

            // Decide whether to forward to Discord
            if (!this._shouldForward(parsed)) return;

            this._forwardToDiscord(parsed);
        });

        // MC bot status events
        this.mcBot.on('authenticated', () => {
            sendToChannel(this.discordClient, this.channelId, '🟢 **Yui** connected and authenticated on the Minecraft server.');
        });

        this.mcBot.on('disconnected', (reason) => {
            sendToChannel(this.discordClient, this.channelId, `🔴 **Yui** disconnected from Minecraft: ${reason || 'Unknown reason'}`);
        });

        this.mcBot.on('kicked', (reason) => {
            sendToChannel(this.discordClient, this.channelId, `⚠️ **Yui** was kicked: ${reason || 'Unknown reason'}`);
        });

        console.log('[Bridge] MC ↔ Discord bridge started.');
    }

    _shouldForward(parsed) {
        switch (parsed.type) {
            case 'player_chat':
                return this.forwardPlayerChat;
            case 'staff_chat':
                return this.forwardStaffChat;
            case 'join':
            case 'leave':
                return this.forwardJoinLeave;
            case 'private_message':
                return true; // Always forward PMs
            case 'system':
                return this.forwardSystem;
            default:
                return false;
        }
    }

    _forwardToDiscord(parsed) {
        let content;

        switch (parsed.type) {
            case 'player_chat':
                content = `💬 **${parsed.sender}**: ${parsed.text}`;
                break;
            case 'staff_chat':
                content = `🛡️ [${parsed.channel}] **${parsed.sender}**: ${parsed.text}`;
                break;
            case 'private_message':
                content = `📩 **${parsed.sender}** → **${parsed.recipient}**: ${parsed.text}`;
                break;
            case 'join':
                content = `📥 **${parsed.sender}** joined the server`;
                break;
            case 'leave':
                content = `📤 **${parsed.sender}** left the server`;
                break;
            default:
                content = `📢 ${parsed.text}`;
        }

        sendToChannel(this.discordClient, this.channelId, content);
    }

    /**
     * Toggle the bridge on/off.
     */
    toggle() {
        this.enabled = !this.enabled;
        return this.enabled;
    }
}

module.exports = Bridge;
