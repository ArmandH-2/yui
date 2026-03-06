const mineflayer = require('mineflayer');
const EventEmitter = require('events');
const config = require('../../config');

class MinecraftBot extends EventEmitter {
    constructor() {
        super();
        this.bot = null;
        this.authenticated = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 10;
        this.reconnectDelay = 5000; // ms, doubles each attempt
    }

    /**
     * Connect to the Minecraft server.
     */
    connect() {
        console.log(`[MC] Connecting to ${config.minecraft.host}:${config.minecraft.port} as ${config.minecraft.username}...`);

        this.bot = mineflayer.createBot({
            host: config.minecraft.host,
            port: config.minecraft.port,
            username: config.minecraft.username,
            version: config.minecraft.version,
            auth: 'offline', // Cracked server
            hideErrors: false,
        });

        this._setupListeners();
        return this;
    }

    _setupListeners() {
        this.bot.on('spawn', () => {
            console.log('[MC] Bot spawned in world.');
            this.reconnectAttempts = 0;

            // Send login command if configured
            if (config.minecraft.loginCommand) {
                console.log('[MC] Sending login command...');
                setTimeout(() => {
                    this.bot.chat(config.minecraft.loginCommand);
                    console.log('[MC] Login command sent, assuming authenticated in 1s...');
                    setTimeout(() => {
                        this.authenticated = true;
                        this.emit('authenticated');
                    }, 1000);
                }, 1500);
            } else {
                this.authenticated = true;
                this.emit('authenticated');
            }
        });

        this.bot.on('messagestr', (message, messagePosition) => {
            // Emit all chat messages
            this.emit('chat', {
                text: message,
                position: messagePosition,
                timestamp: Date.now(),
            });
        });

        this.bot.on('message', (jsonMsg) => {
            // Raw JSON message — useful for parsing colored/formatted messages
            const text = jsonMsg.toString();
            if (text.trim()) {
                this.emit('raw_message', {
                    text,
                    json: jsonMsg,
                    timestamp: Date.now(),
                });
            }
        });

        this.bot.on('kicked', (reason) => {
            console.log('[MC] Bot was kicked:', reason);
            this.authenticated = false;
            this.emit('kicked', reason);
            this._scheduleReconnect();
        });

        this.bot.on('end', (reason) => {
            console.log('[MC] Connection ended:', reason);
            this.authenticated = false;
            this.emit('disconnected', reason);
            this._scheduleReconnect();
        });

        this.bot.on('error', (err) => {
            console.error('[MC] Bot error:', err.message);
            this.emit('error', err);
        });
    }

    _scheduleReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error('[MC] Max reconnect attempts reached. Giving up.');
            this.emit('give_up');
            return;
        }

        const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts);
        this.reconnectAttempts++;
        console.log(`[MC] Reconnecting in ${delay / 1000}s (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);

        setTimeout(() => {
            this.connect();
        }, delay);
    }

    /**
     * Send a chat message or command to the server.
     * @param {string} msg - Message or /command to send
     */
    sendChat(msg) {
        if (!this.bot) {
            console.error('[MC] Bot not connected.');
            return;
        }
        this.bot.chat(msg);
    }

    /**
     * Disconnect the bot.
     */
    disconnect() {
        if (this.bot) {
            this.maxReconnectAttempts = 0; // Prevent reconnect
            this.bot.quit();
        }
    }

    /**
     * Check if the bot is connected and authenticated.
     */
    isReady() {
        return this.bot !== null && this.authenticated;
    }
}

module.exports = MinecraftBot;
