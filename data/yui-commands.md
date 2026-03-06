# Yui Commands Reference

All commands available through Discord. Prefix: `!` (configurable).

## Direct Commands (! prefix)

| Command | Syntax | Description |
|---|---|---|
| `!run` | `!run <mc_command>` | Execute a Minecraft command directly and return its output |
| `!ask` | `!ask <question>` | Send a question/request to Yui's AI agent |
| `!summary` | `!summary [minutes]` | Summarize recent MC chat (default: 30 minutes) |
| `!remind` | `!remind <target> in <time> <message>` | Set a timed reminder for someone |
| `!skills` | `!skills list\|add\|delete` | Manage the skills/procedures library |
| `!bridge` | `!bridge` | Toggle MC ↔ Discord live chat bridge |
| `!mode` | `!mode` | Toggle private/public mode (owner only) |
| `!audit` | `!audit [today\|commands\|N]` | View audit log entries |
| `!feedback` | `!feedback` | View feedback stats (👍/👎 reactions) |
| `!status` | `!status` | Show full system status overview |
| `!help` | `!help` | List all available commands |

## Tracker Commands

| Command | Syntax | Description |
|---|---|---|
| `!tracker add` | `!tracker add <name>` | Add a staff member to the tracking roster |
| `!tracker remove` | `!tracker remove <name>` | Remove a staff member from tracking |
| `!tracker list` | `!tracker list` | Show all tracked staff members |
| `!tracker check` | `!tracker check` | Force-check all staff stats (runs /teamstats + /info for each) |
| `!tracker stats` | `!tracker stats <name>` | View a specific staff member's statistics |
| `!tracker inactivity` | `!tracker inactivity` | Generate staff inactivity report (red/yellow/green) |

## Profiler Commands

| Command | Syntax | Description |
|---|---|---|
| `!profile watch` | `!profile watch <name> [staff\|applicant]` | Start monitoring a player |
| `!profile unwatch` | `!profile unwatch <name>` | Stop monitoring (data is preserved) |
| `!profile list` | `!profile list` | Show all watched players and their status |
| `!profile check` | `!profile check <name>` | Force activity + chatlog check for a player |
| `!profile view` | `!profile view <name>` | View full player dossier |
| `!profile delete` | `!profile delete <name>` | Permanently delete a player's profile data |
| `!profile note` | `!profile note <name> <text>` | Add a manual note to player dossier |

## @Yui Mention (AI Agent)

Mentioning `@Yui` triggers the conversational AI. Yui understands natural language and can:

| Intent | Examples | What Happens |
|---|---|---|
| Chat | "hey Yui", "how are you?" | Casual conversation |
| Command | "check ItsB2_'s stats", "ban Player123" | Executes MC command if she knows it, asks if she doesn't |
| Memory Search | "what happened with Player123?", "what are the rules?" | Searches her RAG memory |
| Memory Save | "remember that X is a rule", "keep in mind..." | Saves to long-term memory |
| Skill Exec | "follow the spam procedure for Player123" | Runs a multi-step skill |
| Summarize | "what happened in chat?", "summary" | Summarizes recent chat |
| Remind | "remind me in 30 minutes to check reports" | Sets a timed reminder |

## Dashboard (Web)

The web dashboard at `http://localhost:3000` provides:
- **Overview**: System status, recent activity, daily activity chart
- **Staff Tracker**: Roster, force-checks, inactivity reports, monthly performance graphs
- **Player Profiles**: Watch list, dossiers, chatlog analysis, notes
- **Console**: Direct Minecraft command execution
- **Audit & Feedback**: Action logs, search, thumbs up/down feedback
- **Reminders**: Create, list, cancel time-based reminders
- **Memory & Skills**: Add/delete memories and skills
