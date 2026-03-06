const { buildEmbed } = require('../../client');
const { ACTION_TYPES } = require('../../../audit/logger');

module.exports = async function handleAudit(message, args, app) {
    const subArgs = args.trim().split(/\s+/);
    const sub = subArgs[0] || 'recent';

    let entries;
    let title;

    if (sub === 'today') {
        entries = app.audit.getByDate();
        title = `📝 Audit Log — Today (${entries.length} entries)`;
    } else if (sub === 'commands') {
        entries = app.audit.getByType(ACTION_TYPES.COMMAND_EXECUTED, 7);
        title = `📝 Audit Log — Commands (last 7 days)`;
    } else {
        const count = parseInt(sub, 10) || 10;
        entries = app.audit.getRecent(count);
        title = `📝 Audit Log — Last ${entries.length} entries`;
    }

    if (entries.length === 0) {
        await message.reply('📭 No audit entries found.');
        return;
    }

    const list = entries.slice(0, 15).map((e) => {
        const time = new Date(e.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const detail = e.details.command || e.details.text || e.details.intent || e.details.mode || 'action';
        return `\`${time}\` **${e.action}** by ${e.username} — ${detail.substring(0, 80)}`;
    }).join('\n');

    const embed = buildEmbed({
        title,
        description: list.substring(0, 4096),
        color: '#6366F1',
    });

    await message.reply({ embeds: [embed] });
};
