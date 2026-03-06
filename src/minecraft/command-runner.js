/**
 * Executes Minecraft commands and captures server responses.
 */
const { isNoise } = require('./chat-filter');

class CommandRunner {
    /**
     * @param {import('./bot')} mcBot - The MinecraftBot instance
     */
    constructor(mcBot) {
        this.mcBot = mcBot;
        this.pendingCommands = new Map();
    }

    /**
     * Run a Minecraft command and capture the response.
     * @param {string} command - Command to run (with or without leading /)
     * @param {object} [options]
     * @param {number} [options.timeout=3000] - Max time to wait for response (ms)
     * @param {number} [options.maxLines=10] - Max lines to capture
     * @returns {Promise<string[]>} Array of response lines
     */
    async runCommand(command, options = {}) {
        const { timeout = 3000, maxLines = 10 } = options;

        if (!this.mcBot.isReady()) {
            throw new Error('Bot is not connected or authenticated.');
        }

        // Use the command directly. If it doesn't start with '/', it will be sent as a normal chat message.
        const cmd = command;

        return new Promise((resolve) => {
            const responses = [];
            let timer;

            const onMessage = (data) => {
                // Skip global noise (join/leave, alerts, broadcasts)
                if (isNoise(data.text)) return;

                responses.push(data.text);
                if (responses.length >= maxLines) {
                    cleanup();
                    resolve(responses);
                }
            };

            const cleanup = () => {
                clearTimeout(timer);
                this.mcBot.removeListener('chat', onMessage);
            };

            // Start listening before sending the command
            this.mcBot.on('chat', onMessage);

            // Send the command
            this.mcBot.sendChat(cmd);

            // Timeout: resolve with whatever we've captured
            timer = setTimeout(() => {
                cleanup();
                resolve(responses);
            }, timeout);
        });
    }

    /**
     * Run multiple commands in sequence.
     * @param {string[]} commands - Array of commands
     * @param {number} [delayBetween=500] - Delay between commands (ms)
     * @returns {Promise<{command: string, response: string[]}[]>}
     */
    async runSequence(commands, delayBetween = 500) {
        const results = [];

        for (const cmd of commands) {
            const response = await this.runCommand(cmd);
            results.push({ command: cmd, response });

            // Wait between commands to avoid spam
            if (delayBetween > 0) {
                await new Promise((r) => setTimeout(r, delayBetween));
            }
        }

        return results;
    }
}

module.exports = CommandRunner;
