/**
 * Parsers for Minecraft command output.
 * Extracts structured data from /teamstats and /info responses.
 */

/**
 * Parse /teamstats <player> output.
 * Expected format lines like:
 *   "Reports ▸ 0 ┃ 3 ┃ 5953"
 *   "Warns ▸ 0 ┃ 3 ┃ 7370"
 *   "Support ▸ 0/0 ┃ 1/0 ┃ 3176/1377"
 *
 * @param {string[]} lines - Raw output lines from the command
 * @returns {{ reports: {today:number, monthly:number, total:number}, warns: {today:number, monthly:number, total:number}, support: {today:number, monthly:number, total:number} } | null}
 */
function parseTeamStats(lines) {
    const text = lines.join('\n');
    const result = { reports: null, warns: null, support: null };

    // Reports ▸ 0 ┃ 3 ┃ 5953  (or similar formatting with unicode chars)
    const reportsMatch = text.match(/reports?\s*[▸►:]\s*(\d+)\s*[┃|│]\s*(\d+)\s*[┃|│]\s*(\d+)/i);
    if (reportsMatch) {
        result.reports = {
            today: parseInt(reportsMatch[1], 10),
            monthly: parseInt(reportsMatch[2], 10),
            total: parseInt(reportsMatch[3], 10),
        };
    }

    // Warns ▸ 0 ┃ 3 ┃ 7370
    const warnsMatch = text.match(/warns?\s*[▸►:]\s*(\d+)\s*[┃|│]\s*(\d+)\s*[┃|│]\s*(\d+)/i);
    if (warnsMatch) {
        result.warns = {
            today: parseInt(warnsMatch[1], 10),
            monthly: parseInt(warnsMatch[2], 10),
            total: parseInt(warnsMatch[3], 10),
        };
    }

    // Support ▸ 0/0 ┃ 1/0 ┃ 3176/1377
    const supportMatch = text.match(/support\s*[▸►:]\s*(\d+)\/(\d+)\s*[┃|│]\s*(\d+)\/(\d+)\s*[┃|│]\s*(\d+)\/(\d+)/i);
    if (supportMatch) {
        result.support = {
            today: parseInt(supportMatch[1], 10),
            monthly: parseInt(supportMatch[3], 10),
            total: parseInt(supportMatch[5], 10),
        };
    }

    // Return null if nothing was parsed
    if (!result.reports && !result.warns && !result.support) return null;

    // Fill defaults for any missing sections
    const def = { today: 0, monthly: 0, total: 0 };
    return {
        reports: result.reports || def,
        warns: result.warns || def,
        support: result.support || def,
    };
}

/**
 * Parse /info <player> output.
 * From the screenshot, the format is:
 *   "Name: ItsB2_ [2225332]"
 *   "Rank: Chairwoman"
 *   "Playtime: 1957h"
 *   "Online state: online"
 *   "First Login: 11.02.2022 - 21:00:45"
 *   "Last Login: 04.03.2026 - 00:59:15"
 *   "Ban points / Mute points: 0 / 0"
 *
 * @param {string[]} lines - Raw output lines from the command
 * @returns {{ playtime: number, rank: string, banPoints: number, mutePoints: number, name: string, lastLogin: string|null, lastLoginDate: Date|null, onlineState: string } | null}
 */
function parsePlayerInfo(lines) {
    let text = lines.join('\n');
    // Strip Minecraft color and formatting codes (e.g., §a, §l) to prevent regex failure
    text = text.replace(/§[0-9a-fk-or]/gi, '');

    // Playtime — various formats: "1957h", "12h 30min", "1d 5h", "Playtime ▸ 42", "1957 hours"
    let playtime = 0;
    // Try "Nh" or "N h" or "N hours"
    const ptMatch = text.match(/playtime\s*[:\s▸►]+\s*(\d+(?:[.,]\d+)?)\s*(?:h(?:ours?)?|$)/im);
    if (ptMatch) {
        playtime = Math.round(parseFloat(ptMatch[1].replace(',', '.')));
    } else {
        // Try "Nd Nh" format
        const ptDayMatch = text.match(/playtime\s*[:\s▸►]+\s*(\d+)\s*d\s+(\d+)\s*h/i);
        if (ptDayMatch) {
            playtime = parseInt(ptDayMatch[1], 10) * 24 + parseInt(ptDayMatch[2], 10);
        } else {
            // Try just a plain number after "Playtime"
            const ptPlain = text.match(/playtime\s*[:\s▸►]+\s*(\d+)/i);
            if (ptPlain) {
                playtime = parseInt(ptPlain[1], 10);
            }
        }
    }

    // Ban points / Mute points
    let banPoints = 0, mutePoints = 0;
    const pointsMatch = text.match(/ban\s*points?\s*\/\s*mute\s*points?[:\s]+(\d+)\s*\/\s*(\d+)/i);
    if (pointsMatch) {
        banPoints = parseInt(pointsMatch[1], 10);
        mutePoints = parseInt(pointsMatch[2], 10);
    }

    // Rank
    let rank = 'Unknown';
    const rankMatch = text.match(/rank[:\s]+([^\n\r]+)/i);
    if (rankMatch) {
        rank = rankMatch[1].trim();
    }

    // Name with ID
    let name = '';
    const nameMatch = text.match(/name[:\s]+(\S+)\s*\[(\d+)\]/i);
    if (nameMatch) {
        name = nameMatch[1];
    }

    // Online state: "online" or "offline"
    let onlineState = 'unknown';
    const onlineMatch = text.match(/online\s*state[:\s]+(\w+)/i);
    if (onlineMatch) {
        onlineState = onlineMatch[1].toLowerCase();
    }

    // Last Login: "04.03.2026 - 00:59:15" (DD.MM.YYYY - HH:MM:SS)
    let lastLogin = null;
    let lastLoginDate = null;
    const lastLoginMatch = text.match(/last\s*login[:\s]+(\d{2})\.(\d{2})\.(\d{4})\s*[-–]\s*(\d{2}):(\d{2}):(\d{2})/i);
    if (lastLoginMatch) {
        const [, day, month, year, hour, min, sec] = lastLoginMatch;
        lastLogin = `${day}.${month}.${year} - ${hour}:${min}:${sec}`;
        lastLoginDate = new Date(`${year}-${month}-${day}T${hour}:${min}:${sec}`);
    }

    // First Login
    let firstLogin = null;
    const firstLoginMatch = text.match(/first\s*login[:\s]+(\d{2})\.(\d{2})\.(\d{4})\s*[-–]\s*(\d{2}):(\d{2}):(\d{2})/i);
    if (firstLoginMatch) {
        const [, day, month, year, hour, min, sec] = firstLoginMatch;
        firstLogin = `${day}.${month}.${year} - ${hour}:${min}:${sec}`;
    }

    if (playtime === 0 && rank === 'Unknown' && !nameMatch && !lastLoginMatch) return null;

    return { name: name || 'Unknown', playtime, rank, banPoints, mutePoints, onlineState, lastLogin, lastLoginDate, firstLogin };
}

/**
 * Parse /staff output to extract list of staff names.
 * Tries to extract player names from the output.
 * 
 * @param {string[]} lines - Raw output lines
 * @returns {string[]} Array of staff names
 */
function parseStaffList(lines) {
    const members = [];
    let text = lines.join('\n');
    text = text.replace(/§[0-9a-fk-or]/gi, '');

    // Match patterns like: "[X] ItsB2_ [Supervisor]" or "[v] SomeName [Support]"
    // The first bracket is status (ignored), second captures name, third captures rank.
    // E.g. /\[.*?\]\s*([A-Za-z0-9_]{3,16})\s*\[(.*?)\]/gi
    const pattern = /\[.*?\]\s*([A-Za-z0-9_]{3,16})\s*\[(.*?)\]/gi;

    let match;
    while ((match = pattern.exec(text)) !== null) {
        const name = match[1];
        const rank = match[2].trim();

        // Exclude specific placeholder/filler words just in case
        if (name.toLowerCase() !== 'online' && name.toLowerCase() !== 'offline' && name.length >= 3) {
            members.push({ name, rank });
        }
    }

    // Deduplicate by name (keep the first occurrence)
    const unique = [];
    const seen = new Set();
    for (const m of members) {
        if (!seen.has(m.name.toLowerCase())) {
            seen.add(m.name.toLowerCase());
            unique.push(m);
        }
    }

    return unique;
}

/**
 * Parse /find <player> output to extract which section they're on.
 * Expected: "Player is currently on: BedWars-1" or "Player is offline" or similar.
 * Normalizes weird server suffixes (like bw-dou-11 -> Bw, silent... -> Silent).
 *
 * @param {string[]} lines - Raw output lines
 * @returns {{ online: boolean, section: string|null, error?: boolean, rawText?: string }}
 */
function parseFind(lines) {
    let text = lines.join('\n');
    text = text.replace(/§[0-9a-fk-or]/gi, '');

    // Check for offline
    if (/offline|not\s+(?:online|found|on)/i.test(text)) {
        return { online: false, section: null };
    }

    // Check for rate limit or unparseable generic messages
    if (/wait|cooldown|slow down|error|invalid/i.test(text) || text.trim() === '') {
        return { online: false, section: null, error: true, rawText: text.trim() };
    }

    let section = 'unknown';

    // Strictly extract from the exact format the server uses to avoid noise like "Follow us on Instagram..."
    // Expected: "Ganster ▸ ItsB2_ is connected to:\n Silent-2_a422e0812b (proxy-002-backup)"
    const connectMatch = text.match(/is connected to:\s*\n?\s*([A-Za-z0-9_.-]+)/i);
    // Also try standard matching if the exact text wasn't found (fallback)
    const fallbackMatch = text.match(/(?:on|playing|server)[:\s▸►]+\s*([A-Za-z0-9_.-]+)/i);

    const rawSection = connectMatch ? connectMatch[1] : (fallbackMatch ? fallbackMatch[1] : null);

    if (rawSection) {
        let raw = rawSection.toLowerCase();

        if (raw.includes('silent')) {
            section = 'Silent';
        } else {
            // "almost all the server names contain "-" and the part before "-" is sufficient enough"
            section = rawSection.split('-')[0];
            // Capitalize first letter properly
            if (section) section = section.charAt(0).toUpperCase() + section.slice(1).toLowerCase();
        }
    } else {
        // If we didn't find "offline", nor "is connected to", nor a rate limit message,
        // it's likely an unrecognized output format. Return error to avoid logging "unknown" online state.
        return { online: false, section: null, error: true, rawText: text.trim() };
    }

    return { online: true, section };
}

/**
 * Parse /chatlog <player> output to extract the chatlog code.
 * Expected: "ChatLog ▸ The chat log has been uploaded.\nChatLog ▸ jpxbOJyuyZ"
 *
 * @param {string[]} lines - Raw output lines
 * @returns {string|null} The chatlog code, or null if not found
 */
function parseChatlogCode(lines) {
    const text = lines.join('\n');

    // Look for the code line: "ChatLog ▸ <code>" where code is alphanumeric
    const codeMatch = text.match(/chatlog\s*[▸►:]\s*([A-Za-z0-9]{6,20})\b/i);
    if (codeMatch) {
        return codeMatch[1];
    }

    // Fallback: look for any standalone alphanumeric string that looks like a code
    // (10 chars, mixed case, after "uploaded" line)
    if (/uploaded/i.test(text)) {
        const fallback = text.match(/\b([A-Za-z0-9]{8,20})\b/);
        if (fallback) return fallback[1];
    }

    return null;
}

/**
 * Parse /info <player> su output to extract alt accounts.
 * The "su" variant shows additional info including alt accounts.
 * Look for patterns like:
 *   "Alts: Player1, Player2, Player3"
 *   "Connected accounts: Player1, Player2"
 *   "» Sub-Accounts (2):" followed by lines
 *
 * @param {string[]} lines - Raw output lines from /info <player> su
 * @returns {{ alts: string[], playerInfo: object }} Alts list + normal info
 */
function parseInfoSU(lines) {
    let text = lines.join('\n');
    text = text.replace(/§[0-9a-fk-or]/gi, '');

    // We pass lines as-is since parsePlayerInfo strips color codes on its own too
    const playerInfo = parsePlayerInfo(lines) || {};
    const alts = [];

    // Try patterns for alt accounts (comma separated on same line)
    const altsMatch = text.match(/(?:alts?|connected\s*accounts?|linked)\s*[▸►:\s]+\s*(.+)/i);
    if (altsMatch) {
        const altsRaw = altsMatch[1].trim();
        // Split by commas, clean up each name
        const names = altsRaw.split(/[,;]+/).map(n => n.trim()).filter(n => n.length >= 3 && n.length <= 16 && /^[A-Za-z0-9_]+$/.test(n));
        alts.push(...names);
    }

    // Line-by-line parsing for lists
    let inSubAccounts = false;
    const flatLines = lines.flatMap(l => l.split('\n'));
    for (let line of flatLines) {
        line = line.replace(/§[0-9a-fk-or]/gi, '').trim();

        if (/sub-accounts|alts|connected accounts/i.test(line)) {
            inSubAccounts = true;
            // Also try to see if they are on the same line (e.g. "Sub-Accounts (2): Player1, Player2")
            const inlineNames = line.split(/:\s*/)[1];
            if (inlineNames && inlineNames.length > 2) {
                const names = inlineNames.split(/[,; ]+/).map(n => n.trim()).filter(n => n.length >= 3 && n.length <= 16 && /^[A-Za-z0-9_]+$/.test(n));
                alts.push(...names);
            }
            continue;
        }

        if (inSubAccounts) {
            // Match "» PlayerName" or "1. PlayerName" or "- PlayerName"
            const match = line.match(/^[\s»▸►•-]*(\d+\.\s*)?([A-Za-z0-9_]{3,16})\s*$/);
            if (match && !alts.includes(match[2])) {
                alts.push(match[2]);
            }
        }
    }

    return { alts: [...new Set(alts)], playerInfo };
}

/**
 * Parse /punishhistory <player> output.
 * Expected formats vary, common patterns:
 *   "Ban ▸ Reason: Hacking ┃ By: StaffName ┃ Date: 01.03.2026"
 *   Two-line format:
 *   "» BAN, 26.05.2022 - 16:38:41 ➟ expires never"
 *   "➥ CloudAdmin, Unfair Advantage"
 *
 * @param {string[]} lines - Raw output lines
 * @returns {Array<{type: string, reason: string, by: string, date: string, duration: string|null, raw: string}>}
 */
function parsePunishHistory(lines) {
    const entries = [];
    const flatLines = lines.flatMap(l => l.split('\n'));

    for (let i = 0; i < flatLines.length; i++) {
        let line = flatLines[i].replace(/§[0-9a-fk-or]/gi, '').trim();
        if (!line) continue;

        // Try the two-line format:
        // » BAN, 26.05.2022 - 16:38:41 ➟ expires never
        // ➥ CloudAdmin, Unfair Advantage
        const twoLineMatch = line.match(/^»\s*(BAN|UNBAN|MUTE|UNMUTE|WARN|KICK|TEMPBAN|TEMPMUTE)[,\s]+([\d.-]+\s*[-–]\s*[\d:]+)\s*[➟➔>]\s*(.+)/i);
        if (twoLineMatch && i + 1 < flatLines.length) {
            const type = twoLineMatch[1].toLowerCase();
            const date = twoLineMatch[2].trim();
            const duration = twoLineMatch[3].trim();

            const nextLine = flatLines[i + 1].replace(/§[0-9a-fk-or]/gi, '').trim();
            const reasonMatch = nextLine.match(/^➥\s*([^,]+),\s*(.+)/i);

            if (reasonMatch) {
                entries.push({
                    type,
                    reason: reasonMatch[2].trim() || 'Unknown',
                    by: reasonMatch[1].trim() || 'Unknown',
                    date,
                    duration,
                    raw: line + '\n' + nextLine,
                });
                i++; // Skip the next line as it's part of this entry
                continue;
            }
        }

        // Try single-line format: Type ▸ Reason ┃ StaffName ┃ Date [┃ Duration]
        const singlePattern = /^(ban|mute|warn|kick|tempban|tempmute)\s*[▸►:]\s*(.+)/i;
        const singleMatch = line.match(singlePattern);

        if (singleMatch) {
            const type = singleMatch[1].toLowerCase();
            const rest = singleMatch[2];
            const parts = rest.split(/[┃|│]+/).map(p => p.trim());

            let reason = '', by = '', date = '', duration = null;

            if (parts.length >= 3) {
                reason = parts[0].replace(/^reason[:\s]*/i, '').trim();
                by = parts[1].replace(/^(?:by|staff)[:\s]*/i, '').trim();
                date = parts[2].replace(/^(?:date|when)[:\s]*/i, '').trim();
                if (parts[3]) duration = parts[3].replace(/^(?:duration|time)[:\s]*/i, '').trim();
            } else if (parts.length === 2) {
                reason = parts[0];
                by = parts[1];
            } else {
                reason = rest.trim();
            }

            entries.push({
                type,
                reason: reason || 'Unknown',
                by: by || 'Unknown',
                date: date || null,
                duration,
                raw: line,
            });
            continue;
        }

        // Heuristic fallback
        const heuristicMatch = line.match(/^(ban|mute|warn|kick|tempban|tempmute)\b/i);
        if (heuristicMatch && line.length > 5) {
            entries.push({
                type: heuristicMatch[1].toLowerCase(),
                reason: line.substring(heuristicMatch[0].length).trim(),
                by: 'Unknown',
                date: null,
                duration: null,
                raw: line,
            });
        }
    }

    return entries;
}

/**
 * Parse `/server list` output.
 * Output typically looks like a comma-separated list of servers, or lines of server names and counts.
 * We want to return an array of available servers.
 *
 * @param {string[]} lines
 * @returns {string[]} Array of server names
 */
function parseServerList(lines) {
    const text = lines.join('\n');
    const servers = new Set();

    // Some server lists look like "Servers: lobby, bedwars-1, bedwars-2"
    // Or bullet points
    const words = text.match(/\b([a-zA-Z0-9_-]+)\b/g) || [];

    // Filter out common non-server English filler words found in such command output.
    const ignoreList = new Set(['servers', 'online', 'players', 'list', 'connected', 'the', 'and', 'are']);

    for (const word of words) {
        if (!ignoreList.has(word.toLowerCase()) && word.length > 2) {
            servers.add(word);
        }
    }

    return [...servers];
}

module.exports = { parseTeamStats, parsePlayerInfo, parseStaffList, parseFind, parseChatlogCode, parseInfoSU, parsePunishHistory, parseServerList };

