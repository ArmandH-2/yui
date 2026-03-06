const { buildEmbed } = require('../../client');

module.exports = async function handleProfile(message, args, app) {
    const [pSub, pName, ...pRest] = args.split(/\s+/);
    if (!pSub) { await message.reply('⚠️ Usage: `!profile watch|unwatch|list|check|view|note <name> [text]`'); return; }

    const profiler = app.profiler;

    switch (pSub.toLowerCase()) {
        case 'watch': {
            if (!pName) { await message.reply('⚠️ Usage: `!profile watch <player_name> [staff|applicant]`'); break; }
            const pType = pRest[0] || 'applicant';
            const added = profiler.watch(pName, pType);
            await message.reply(added
                ? `✅ Now watching **${pName}** (${pType}). Activity checks every 2h, chatlog analysis every 6h.`
                : `ℹ️ **${pName}** is already being watched.`);
            break;
        }
        case 'unwatch': {
            if (!pName) { await message.reply('⚠️ Usage: `!profile unwatch <player_name>`'); break; }
            const removed = profiler.unwatch(pName);
            await message.reply(removed
                ? `✅ Stopped watching **${pName}**. Data is preserved.`
                : `❌ **${pName}** is not being watched.`);
            break;
        }
        case 'list': {
            const profiles = profiler.getWatchList();
            if (profiles.length === 0) { await message.reply('📭 No players being watched. Use `!profile watch <name>` to start.'); break; }
            const active = profiles.filter(p => p.status === 'active');
            const archived = profiles.filter(p => p.status !== 'active');
            let desc = `**Active (${active.length}):**\n`;
            desc += active.map(p => `• **${p.name}** — ${p.type} | since ${p.trackingSince.slice(0, 10)} | ${p.checkCount || 0} checks`).join('\n');
            if (archived.length > 0) {
                desc += `\n\n**Archived (${archived.length}):**\n`;
                desc += archived.map(p => `• ~~${p.name}~~ — ${p.type}`).join('\n');
            }
            const embed = buildEmbed({ title: '🔍 Player Watch List', description: desc, color: '#8B5CF6' });
            await message.reply({ embeds: [embed] });
            break;
        }
        case 'check': {
            if (!pName) { await message.reply('⚠️ Usage: `!profile check <player_name>`'); break; }
            if (!profiler.store.hasProfile(pName)) {
                await message.reply(`❌ **${pName}** is not being watched. Use \`!profile watch ${pName}\` first.`);
                break;
            }
            await message.reply(`🔄 Force-checking **${pName}**... This may take a moment.`);
            const results = await profiler.forceCheck(pName);
            let checkDesc = '';
            if (results.activity && !results.activity.error) {
                const a = results.activity;
                checkDesc += `**Activity:** ${a.onlineState}${a.section ? ` on ${a.section}` : ''} | Playtime: ${a.playtime || '?'}h\n`;
            }
            if (results.chatlog && !results.chatlog.error) {
                const c = results.chatlog;
                checkDesc += `**Chatlog Analysis:**\n• Tone: ${c.tone} | Maturity: ${c.maturity}\n• Staff suitability: ${c.staffSuitability}\n• ${c.summary || 'No summary'}\n`;
            } else if (results.chatlog?.error) {
                checkDesc += `**Chatlog:** ⚠️ ${results.chatlog.error}\n`;
            }
            if (!checkDesc) checkDesc = 'No data collected. The player may be offline or commands may have failed.';
            const checkEmbed = buildEmbed({ title: `🔍 ${pName} — Quick Report`, description: checkDesc.substring(0, 4096), color: '#3B82F6' });
            await message.reply({ embeds: [checkEmbed] });
            break;
        }
        case 'view': {
            if (!pName) { await message.reply('⚠️ Usage: `!profile view <player_name>`'); break; }
            const dossier = profiler.getDossier(pName);
            if (!dossier) { await message.reply(`❌ No profile found for **${pName}**.`); break; }
            const p = dossier.profile;
            const act = dossier.activity;
            const ana = dossier.analysis;
            const fields = [
                { name: '📋 Type', value: p.type, inline: true },
                { name: '📅 Tracking Since', value: p.trackingSince.slice(0, 10), inline: true },
                { name: '🔢 Checks', value: `${p.checkCount || 0}`, inline: true },
            ];
            if (act) {
                fields.push({ name: '⏱️ Playtime', value: `${act.latestPlaytime || '?'}h`, inline: true });
                fields.push({ name: '📡 Online Rate', value: `${act.onlineRate}%`, inline: true });
                if (act.topSections?.length > 0) {
                    fields.push({ name: '🎮 Top Sections', value: act.topSections.map(s => `${s.section} (${s.count})`).join(', ') });
                }
            }
            if (ana?.persona) {
                fields.push({ name: '🧠 Persona', value: `Tone: ${ana.persona.tone || '?'} | Maturity: ${ana.persona.maturity || '?'} | Staff: ${ana.persona.staffSuitability || '?'}` });
                if (ana.persona.summary) fields.push({ name: '📝 Summary', value: ana.persona.summary.substring(0, 1024) });
            }
            if (dossier.notes.length > 0) {
                const recentNotes = dossier.notes.slice(-3).map(n => `• [${n.timestamp.slice(0, 10)}] ${n.text.substring(0, 100)}`).join('\n');
                fields.push({ name: `📌 Notes (${dossier.notes.length})`, value: recentNotes });
            }
            const viewEmbed = buildEmbed({ title: `🗂️ ${p.name} — Dossier`, fields, color: '#8B5CF6' });
            await message.reply({ embeds: [viewEmbed] });
            break;
        }
        case 'note': {
            if (!pName || pRest.length === 0) { await message.reply('⚠️ Usage: `!profile note <player_name> <note text>`'); break; }
            const noteText = pRest.join(' ');
            const saved = profiler.addNote(pName, noteText, message.author.username, 'manual');
            await message.reply(saved
                ? `📌 Note added to **${pName}**'s dossier.`
                : `❌ **${pName}** is not being watched. Use \`!profile watch ${pName}\` first.`);
            break;
        }
        default:
            await message.reply('⚠️ Usage: `!profile watch|unwatch|list|check|view|note <name> [text]`');
    }
};
