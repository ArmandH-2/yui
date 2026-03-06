const fs = require('fs');
const path = require('path');
const config = require('../../config');
const MinecraftManager = require('../minecraft/manager');
const { createDiscordClient, buildEmbed, sendToChannel, stripMention } = require('../discord/client');
const Bridge = require('../discord/bridge');
const ConversationManager = require('../discord/conversation');
const RAGEngine = require('../memory/rag');
const SkillsManager = require('../skills/manager');
const ReminderScheduler = require('../scheduler/reminder');
const { ChatBuffer } = require('../ai/summarizer');
const { AuditLogger, ACTION_TYPES } = require('../audit/logger');
const FeedbackSystem = require('../feedback/feedback');
const StaffTracker = require('../tracker/staff-tracker');
const PlayerProfiler = require('../profiler/player-profiler');
const startDashboard = require('../dashboard/server');

class Application {
    constructor() {
        this.privateMode = true;
        this.deps = {};
    }

    async start() {
        console.log('');
        console.log('╔═══════════════════════════════════════╗');
        console.log('║   Yui — Minecraft Staff Manager AI    ║');
        console.log('╚═══════════════════════════════════════╝');
        console.log('');

        // 1. Initialize RAG Memory
        console.log('[Boot] Initializing RAG memory...');
        this.rag = new RAGEngine();
        console.log(`[Boot] Memory loaded: ${this.rag.getMemoryCount()} entries.`);

        // 2. Initialize Skills Library
        console.log('[Boot] Loading skills library...');
        this.skills = new SkillsManager();
        console.log(`[Boot] Skills loaded: ${this.skills.getSkillNames().length} skills.`);

        // 3. Initialize Chat Buffer
        this.chatBuffer = new ChatBuffer(500);

        // 4. Initialize Conversation Manager
        this.conversations = new ConversationManager();

        // 5. Initialize Discord Client
        this.discordClient = createDiscordClient();

        // 6. Initialize Reminder Scheduler
        console.log('[Boot] Starting reminder scheduler...');
        this.scheduler = new ReminderScheduler((reminder) => {
            const channelId = config.discord.channelId;
            if (channelId && this.discordClient.isReady()) {
                const embed = buildEmbed({
                    title: '⏰ Reminder!',
                    description: `**For:** ${reminder.target}\n**Message:** ${reminder.message}`,
                    color: '#EC4899',
                });
                sendToChannel(this.discordClient, channelId, embed);
            }
        });

        // 7. Connect Minecraft
        console.log('[Boot] Connecting to Minecraft server...');
        this.mcManager = new MinecraftManager();
        this.mcManager.connect();

        this.mcBot = this.mcManager.mcBot;
        this.cmdRunner = this.mcManager.cmdRunner;
        this.cmdQueue = this.mcManager.cmdQueue;
        this.setupConsoleInput();

        // 8. Connect Discord Bot
        console.log('[Boot] Connecting to Discord...');
        const { Events } = require('discord.js');
        this.discordClient.once(Events.ClientReady, () => {
            console.log(`[Boot] ✅ Discord bot ready as ${this.discordClient.user.tag}`);
            console.log('[Boot] ═══════════════════════════════════');
            console.log('[Boot] 🟢 Yui is online and ready!');
            console.log('[Boot] ═══════════════════════════════════');
        });

        // 9. Set up Bridge
        this.bridge = new Bridge(this.discordClient, this.mcBot, this.chatBuffer, config.discord.channelId);
        this.mcBot.on('authenticated', () => {
            this.bridge.start();
        });

        // 10. Initialize Audit Logger
        console.log('[Boot] Initializing audit logger...');
        this.audit = new AuditLogger();
        console.log(`[Boot] Audit log loaded: ${this.audit.getTodayStats().total} entries today.`);

        // 11. Initialize Feedback System
        console.log('[Boot] Initializing feedback system...');
        this.feedback = new FeedbackSystem(this.discordClient, this.rag, this.audit);

        // 12. Initialize Staff Tracker
        console.log('[Boot] Initializing staff tracker...');
        this.tracker = new StaffTracker(this.cmdQueue, this.audit, (alertMsg) => {
            const channelId = config.discord.channelId;
            if (channelId && this.discordClient.isReady()) {
                sendToChannel(this.discordClient, channelId, alertMsg);
            }
        });
        this.tracker.startSchedule();

        // 13. Initialize Player Profiler
        console.log('[Boot] Initializing player profiler...');
        this.profiler = new PlayerProfiler(this.cmdQueue, this.cmdRunner, this.audit);
        this.profiler.startSchedule();

        // Pack dependencies
        this.deps = {
            rag: this.rag,
            skills: this.skills,
            cmdRunner: this.cmdRunner,
            cmdQueue: this.cmdQueue,
            chatBuffer: this.chatBuffer,
            scheduler: this.scheduler,
            audit: this.audit,
            feedback: this.feedback,
            tracker: this.tracker,
            profiler: this.profiler,
            conversations: this.conversations,
            bridge: this.bridge,
            mcBot: this.mcBot,
            discordClient: this.discordClient
        };

        // 14. Start Web Dashboard
        console.log('[Boot] Starting web dashboard...');
        const dashboardDeps = {
            ...this.deps,
            getMode: () => this.privateMode,
            setMode: (val) => { this.privateMode = val; },
        };
        startDashboard(dashboardDeps);

        // 15. Load Event Handlers
        this.loadDiscordEvents();

        // 16. Login
        await this.discordClient.login(config.discord.token);

        this.setupGracefulShutdown();
    }

    getMode() {
        return this.privateMode;
    }

    setMode(val) {
        this.privateMode = val;
    }

    setupConsoleInput() {
        const readline = require('readline');
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
            terminal: false
        });

        rl.on('line', (line) => {
            const text = line.trim();
            if (!text) return;
            if (!this.mcBot.isReady()) {
                console.log('[Console] Bot is not connected yet.');
                return;
            }

            if (text.startsWith('/')) {
                console.log(`[Console Command] Executing: ${text}`);
            } else {
                console.log(`[Console Chat] Sending: ${text}`);
            }
            this.mcBot.sendChat(text);
        });
    }

    loadDiscordEvents() {
        const messageCreateHandler = require('../discord/events/messageCreate');
        this.discordClient.on('messageCreate', (message) => messageCreateHandler(message, this));
    }

    setupGracefulShutdown() {
        const shutdown = () => {
            console.log('\n[Shutdown] Shutting down Yui...');
            if (this.scheduler) this.scheduler.stopAll();
            if (this.tracker) this.tracker.stopSchedule();
            if (this.profiler) this.profiler.stopSchedule();
            if (this.mcBot) this.mcBot.disconnect();
            if (this.discordClient) this.discordClient.destroy();
            process.exit(0);
        };

        process.on('SIGINT', shutdown);
        process.on('SIGTERM', shutdown);
    }
}

module.exports = Application;
