const { buildEmbed } = require('../../client');

module.exports = async function handleTracker(message, args, app) {
    const tParts = args.trim().split(/\s+/);
    const tSub = tParts[0] || 'list';
    const tArg = tParts.slice(1).join(' ');

    const tracker = app.tracker;

    switch (tSub) {
        case 'add': {
            if (!tArg) { await message.reply('⚠️ Usage: `!tracker add <player_name>`'); break; }
            const added = tracker.addStaff(tArg);
            await message.reply(added ? `✅ **${tArg}** added to tracking roster.` : `⚠️ **${tArg}** is already on the roster.`);
            break;
        }
        case 'remove': {
            if (!tArg) { await message.reply('⚠️ Usage: `!tracker remove <player_name>`'); break; }
            const removed = tracker.removeStaff(tArg);
            await message.reply(removed ? `✅ **${tArg}** removed from roster.` : `❌ **${tArg}** not found on roster.`);
            break;
        }
        case 'list': {
            const roster = tracker.getRoster();
            if (roster.members.length === 0) {
                await message.reply('📭 No staff on the tracking roster yet. Use `!tracker add <name>` to add someone.');
                break;
            }
            const memberList = roster.members.map(m => `• **${m}**`).join('\n');
            const embed = buildEmbed({
                title: '📊 Staff Tracker — Roster',
                description: `**${roster.members.length} members tracked:**\n${memberList}`,
                color: '#3B82F6',
                fields: roster.excluded.length > 0
                    ? [{ name: 'Excluded', value: roster.excluded.join(', ') }]
                    : [],
            });
            await message.reply({ embeds: [embed] });
            break;
        }
        case 'check': {
            await message.reply('🔄 Starting force check for all roster members... This may take a moment.');
            const data = await tracker.collectAll();
            if (data) {
                const count = Object.keys(data.staff).length;
                await message.reply(`✅ Force check complete! Collected stats for **${count}** staff members.`);
            } else {
                await message.reply('⚠️ Collection is already in progress.');
            }
            break;
        }
        case 'stats': {
            if (!tArg) { await message.reply('⚠️ Usage: `!tracker stats <player_name>`'); break; }
            const stats = await tracker.getMemberStats(tArg);
            if (!stats) {
                await message.reply(`❌ No stats found for **${tArg}**. Run \`!tracker check\` first.`);
                break;
            }
            const embed = buildEmbed({
                title: `📊 ${tArg} — Staff Stats`,
                description: `Data from **${stats.date}** (collected at ${new Date(stats.collectedAt).toLocaleTimeString()})`,
                color: '#3B82F6',
                fields: [
                    { name: '📝 Reports', value: `Today: ${stats.reports?.today || 0} | Monthly: ${stats.reports?.monthly || 0} | Total: ${stats.reports?.total || 0}` },
                    { name: '⚠️ Warns', value: `Today: ${stats.warns?.today || 0} | Monthly: ${stats.warns?.monthly || 0} | Total: ${stats.warns?.total || 0}` },
                    { name: '📩 Support', value: `Today: ${stats.support?.today || 0} | Monthly: ${stats.support?.monthly || 0} | Total: ${stats.support?.total || 0}` },
                    { name: '⏱️ Playtime', value: `Total: ${stats.playtime}h | Today: ${stats.playtimeToday || 0}h`, inline: true },
                    { name: '🎭 Rank', value: stats.rank || 'Unknown', inline: true },
                ],
            });
            await message.reply({ embeds: [embed] });
            break;
        }
        case 'inactivity': {
            const report = tracker.getInactivityReport();
            if (report.red.length === 0 && report.yellow.length === 0 && report.green.length === 0) {
                await message.reply('📭 No roster members to check. Use `!tracker add <name>` first.');
                break;
            }

            let desc = '';

            if (report.red.length > 0) {
                desc += '🔴 **INACTIVE 3+ DAYS:**\n';
                desc += report.red.map(r => `• **${r.name}** — ${r.inactiveDays} days (last login: ${r.lastLogin || r.lastActiveDate || 'never'})`).join('\n');
                desc += '\n\n';
            }
            if (report.yellow.length > 0) {
                desc += '🟡 **Approaching Limit (2 days):**\n';
                desc += report.yellow.map(r => `• **${r.name}** — 2 days (last login: ${r.lastLogin || r.lastActiveDate || 'never'})`).join('\n');
                desc += '\n\n';
            }
            if (report.green.length > 0) {
                desc += '🟢 **Active:**\n';
                desc += report.green.map(r => `• **${r.name}** — ${r.onlineState === 'online' ? '🟢 online now' : `last login: ${r.lastLogin || r.lastActiveDate || 'today'}`}`).join('\n');
            }

            if (report.red.length === 0 && report.yellow.length === 0) {
                desc = '✅ All staff are active — no inactivity issues!\n\n' + desc;
            }

            const embed = buildEmbed({
                title: '📋 Staff Inactivity Report',
                description: desc.substring(0, 4096),
                color: report.red.length > 0 ? '#EF4444' : report.yellow.length > 0 ? '#F59E0B' : '#10B981',
            });
            await message.reply({ embeds: [embed] });
            break;
        }
        default:
            await message.reply('⚠️ Usage: `!tracker add|remove|list|check|stats|inactivity <name>`');
    }
};
