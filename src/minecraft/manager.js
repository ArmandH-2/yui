const MinecraftBot = require('./bot');
const CommandRunner = require('./command-runner');
const { CommandQueue } = require('./command-queue');

class MinecraftManager {
    constructor() {
        this.mcBot = new MinecraftBot();
        this.cmdRunner = new CommandRunner(this.mcBot);
        this.cmdQueue = new CommandQueue(this.cmdRunner);

        this.setupEventHandlers();
    }

    setupEventHandlers() {
        this.mcBot.on('authenticated', () => {
            console.log('[MC Manager] ✅ Minecraft bot authenticated!');
        });

        this.mcBot.on('error', (err) => {
            console.error('[MC Manager] Error:', err.message);
        });

        const { isNoise } = require('./chat-filter');
        this.mcBot.on('chat', (msg) => {
            if (msg.text && msg.text.trim() && !isNoise(msg.text)) {
                console.log(`[MC Chat] ${msg.text.trim()}`);
            }
        });
    }

    connect() {
        this.mcBot.connect();
    }

    disconnect() {
        this.mcBot.disconnect();
    }

    isReady() {
        return this.mcBot.isReady();
    }

    sendChat(msg) {
        this.mcBot.sendChat(msg);
    }
}

module.exports = MinecraftManager;
