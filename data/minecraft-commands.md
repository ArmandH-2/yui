# Minecraft Server Commands Reference

Commands available on the Minecraft server (mc.yourserver.com). Yui executes these through her bot connection.

## Staff Management Commands

| Command | Syntax | Description |
|---|---|---|
| `/staff` | `/staff` | List all online staff members and their current section |
| `/teamstats` | `/teamstats <player>` | View a staff member's reports, warns, support stats (today/monthly/total) |
| `/info` | `/info <player>` | View player info: rank, playtime, last login, online status, section |
| `/find` | `/find <player>` | Find a player's current server/section (e.g. "Lobby-1", "Practice-1") |
| `/chatlog` | `/chatlog <player>` | Generate a chatlog report. Returns a code → URL: `https://chatlog.yourserver.com/?report=CODE` |

## Moderation Commands

| Command | Syntax | Description |
|---|---|---|
| `/ban` | `/ban <player> <reason>` | Permanently ban a player |
| `/tempban` | `/tempban <player> <duration> <reason>` | Temporarily ban a player (e.g. `30d`, `1h`) |
| `/unban` | `/unban <player>` | Unban a player |
| `/mute` | `/mute <player> <duration> <reason>` | Mute a player for a duration |
| `/unmute` | `/unmute <player>` | Unmute a player |
| `/warn` | `/warn <player> <reason>` | Issue a warning to a player |
| `/kick` | `/kick <player> [reason]` | Kick a player from the server |

## Utility Commands

| Command | Syntax | Description |
|---|---|---|
| `/list` | `/list` | List all online players |
| `/online` | `/online` | Check online player count per section |
| `/msg` | `/msg <player> <message>` | Send a private message to a player |
| `/r` | `/r <message>` | Reply to last private message |
| `/report` | `/report <player> <reason>` | Report a player |

## Command Output Patterns

### /teamstats Output Format
```
Reports ▸ <today> ┃ <monthly> ┃ <total>
Warns ▸ <today> ┃ <monthly> ┃ <total>
Support ▸ <today>/<x> ┃ <monthly>/<x> ┃ <total>/<x>
```

### /info Output Format
```
Player: <name>
Rank: <rank>
Playtime: <hours>h
Last login: <DD.MM.YYYY - HH:MM:SS>
Online: <yes/no> [Section: <section>]
```

### /chatlog Output Format
```
Generated chatlog: <CODE>
```
The code is appended to `https://chatlog.yourserver.com/?report=` to view the chatlog.

### /find Output Format
```
<player> is playing on <section>
```
or
```
<player> is not online
```

## Important Notes

- All commands require the bot to be authenticated (`/login` at spawn)
- Commands that target players use exact player names (case-sensitive on some)
- Moderation commands (ban, mute, warn, kick) should be used carefully
- `/teamstats` is the primary command for staff performance tracking
- `/info` provides playtime and login data essential for inactivity tracking
- The `/chatlog` code is temporary — fetch the URL content promptly
