# Yui — Autonomous Minecraft Staff Manager

An AI-powered bot that lives inside your Minecraft server and is controlled through Discord. Yui manages your staff team, executes server commands, remembers past interactions, learns new procedures, and grows smarter over time.

## How It Works

Yui connects to both a **Minecraft server** (via [Mineflayer](https://github.com/PrismarineJS/mineflayer)) and a **Discord server** (via [Discord.js](https://discord.js.org/)). You talk to her on Discord, and she executes commands on the Minecraft server, returning the results to you.

She uses **OpenAI** for natural language understanding and a **RAG memory system** (backed by ChromaDB or a local JSON store) to remember everything she's taught. She starts with limited knowledge and **learns as you teach her** — commands, rules, procedures, and player history.

### Key Concepts

- **Learning Agent** — Yui doesn't come pre-programmed with every command. When she doesn't know something, she asks you, then saves it to memory for next time.
- **Skills** — Multi-step procedures that you teach Yui and she can replay on demand.
- **Private/Public Mode** — In private mode (default), only the owner can interact with Yui. Toggle to public to let all staff use her.
- **Audit Log** — Every action Yui takes is logged with timestamps, who requested it, and the result.
- **Feedback System** — React 👍/👎 on Yui's responses. Positive feedback reinforces behavior; negative is logged for review.
- **Staff Tracker** — Automatically polls staff stats daily at 11:45 PM CET. Tracks playtime, warns, reports, supports per member. Alerts on 3-day inactivity.
- **Player Profiler** — Surveillance system: monitors activity, analyzes chatlogs via LLM for persona profiling, stores notes per player. Supports applicants and staff.
- **Chat Bridge** — Optionally forwards Minecraft chat to a Discord channel in real-time.
- **Chat Noise Filtering** — Automatically filters out global server noise from command output.

---

## Setup

### Prerequisites

- Node.js 18+
- A Discord bot token
- An OpenAI API key
- (Optional) A ChromaDB instance for vector-based memory

### Installation

```bash
git clone https://github.com/ArmandH-2/yui.git
cd Yui
npm install
```

### Configuration

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

| Variable | Description |
|---|---|
| `DISCORD_TOKEN` | Your Discord bot token |
| `DISCORD_PREFIX` | Command prefix (default: `!`) |
| `DISCORD_CHANNEL_ID` | Channel ID for the MC ↔ Discord bridge |
| `OWNER_DISCORD_ID` | Your Discord user ID (for private mode & owner-only commands) |
| `OWNER_NAME` | Your display name (used in AI responses) |
| `MC_HOST` | Minecraft server address |
| `MC_PORT` | Minecraft server port (default: `25565`) |
| `MC_USERNAME` | Bot's in-game username |
| `MC_VERSION` | Minecraft version (default: `1.20.1`) |
| `MC_LOGIN_COMMAND` | Login command for cracked servers (leave empty if not needed) |
| `OPENAI_API_KEY` | Your OpenAI API key |
| `OPENAI_MODEL` | LLM model (default: `gpt-4o-mini`) |
| `OPENAI_EMBEDDING_MODEL` | Embedding model (default: `text-embedding-3-small`) |
| `CHROMA_URL` | ChromaDB URL (falls back to local JSON if unavailable) |
| `CHROMA_COLLECTION` | ChromaDB collection name |

### Running

```bash
npm start
```

---

## Commands

Yui has two interaction methods:
1. **`@Yui <anything>`** — Talk to her naturally via a mention. She'll understand your intent and act accordingly.
2. **`!<command>`** — Direct shortcut commands for power users.

### Conversational (via @mention)

| Example | What Yui Does |
|---|---|
| `@Yui check space_turtle9` | Runs the relevant command and reports the results |
| `@Yui remember that my in-game name is itsb2_` | Saves the info to long-term memory |
| `@Yui what happened with that griefer yesterday?` | Searches her memory for past events |
| `@Yui remind me at 5pm to check reports` | Sets a timed reminder |
| `@Yui what did I miss?` | Summarizes recent Minecraft chat |
| `@Yui are there any active reminders?` | Lists all active reminders |
| `@Yui how are you?` | Casual conversation |

### Direct Commands

| Command | Description |
|---|---|
| `!run <command>` | Execute a Minecraft command directly and return the output |
| `!ask <question>` | Shortcut for `@Yui` — asks the AI agent |
| `!summary [minutes]` | Summarize recent MC chat (default: last 30 min) |
| `!remind <who> <what> <when>` | Set a timed reminder |
| `!remind list` | List all active reminders |
| `!remind cancel <id>` | Cancel a reminder by ID |
| `!skills` | List all saved skills/procedures |
| `!skills list` | List all saved skills |
| `!skills view <name>` | View a skill's steps |
| `!skills add <name> "<desc>" "<step1>" "<step2>"` | Save a new skill |
| `!skills delete <name>` | Delete a skill |
| `!bridge` | Toggle the MC ↔ Discord chat bridge on/off |
| `!mode` | Toggle between 🔒 Private and 🌐 Public mode (owner only) |
| `!audit` | View recent audit log entries |
| `!audit today` | View all audit entries from today |
| `!audit commands` | View command executions (last 7 days) |
| `!feedback` | View feedback stats (👍/👎 breakdown) |
| `!tracker add <name>` | Add staff member to tracking roster |
| `!tracker remove <name>` | Remove staff from roster |
| `!tracker list` | Show current roster |
| `!tracker check` | Force-check all staff stats now |
| `!tracker stats <name>` | View a staff member's recent stats |
| `!tracker inactivity` | View inactivity report (🔴/🟡/🟢) |
| `!profile watch <name> [type]` | Start monitoring a player (applicant/staff) |
| `!profile unwatch <name>` | Stop monitoring (data preserved) |
| `!profile list` | Show all watched players |
| `!profile check <name>` | Force immediate activity + chatlog check |
| `!profile view <name>` | View full player dossier |
| `!profile note <name> <text>` | Add a manual note to dossier |
| `!status` | Show system status (connections, memory, mode, etc.) |
| `!help` | Show the command list in Discord |

### Reminder Time Formats

When setting reminders, Yui understands:

| Format | Example |
|---|---|
| Relative time | `in 30 minutes`, `in 2 hours`, `in 3 days` |
| Exact time (12h) | `at 5pm`, `at 3:30am` |
| Exact time (24h) | `at 17:00` |
| Time of day | `in the morning`, `this afternoon`, `tonight` |
| Tomorrow | `tomorrow`, `tomorrow morning`, `tomorrow at 3pm` |
| Recurring | `every day at 9am` |

---

## Architecture

```
src/
├── index.js                  # Boot sequence & message routing
├── ai/
│   ├── llm.js                # OpenAI API wrapper
│   ├── intent-router.js      # Intent classification (CHAT, COMMAND, REMIND, etc.)
│   ├── summarizer.js         # Chat summarization
│   └── system-prompt.md      # Yui's personality & instructions
├── audit/
│   └── logger.js             # Action audit logger (daily JSON files)
├── discord/
│   ├── client.js             # Discord client setup & helpers
│   ├── bridge.js             # MC ↔ Discord chat bridge
│   ├── conversation.js       # Multi-turn conversation manager
│   └── commands/
│       ├── ask.js            # Core AI agent loop
│       ├── run.js            # !run handler
│       ├── summary.js        # !summary handler
│       ├── remind.js         # !remind handler
│       └── skills.js         # !skills handler
├── feedback/
│   └── feedback.js           # Reaction feedback system (👍/👎)
├── tracker/
│   ├── staff-tracker.js      # Staff activity tracker (cron + roster)
│   └── stat-parser.js        # Minecraft command output parsers
├── profiler/
│   ├── player-profiler.js    # Main orchestrator (cron + watch list)
│   ├── profile-store.js      # Per-player dossier file I/O
│   ├── chatlog-analyzer.js   # Chatlog fetch + LLM analysis
│   └── activity-monitor.js   # /find + /info periodic checks
├── minecraft/
│   ├── bot.js                # Mineflayer bot (connect, auth, reconnect)
│   ├── chat-handler.js       # Chat message parser
│   ├── chat-filter.js        # Noise filter for command responses
│   └── command-runner.js     # Command execution & response capture
├── memory/
│   ├── rag.js                # RAG engine (search, store, recall)
│   └── vectorstore.js        # ChromaDB / local JSON vector store
├── skills/
│   └── manager.js            # Skills library (save, load, execute)
└── scheduler/
    └── reminder.js           # Reminder scheduler (cron + one-shot)
```

---

## License

ISC
