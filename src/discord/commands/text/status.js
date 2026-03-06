const { buildEmbed } = require('../../client');

module.exports = async function handleStatus(message, app) {
    const embed = buildEmbed({
        title: '📊 Yui Status',
        description: 'Current system status overview.',
        fields: [
            { name: '🎮 Minecraft', value: app.mcBot.isReady() ? '🟢 Connected' : '🔴 Disconnected', inline: true },
            { name: '💬 Discord', value: app.discordClient.isReady() ? '🟢 Connected' : '🔴 Disconnected', inline: true },
            { name: '🔐 Mode', value: app.getMode() ? '🔒 Private' : '🌐 Public', inline: true },
            { name: '🧠 Memories', value: `${app.rag.getMemoryCount()} entries`, inline: true },
            { name: '📚 Skills', value: `${app.skills.getSkillNames().length} loaded`, inline: true },
            { name: '⏰ Reminders', value: `${app.scheduler.listReminders().length} active`, inline: true },
            { name: '📝 Audit', value: `${app.audit.getTodayStats().total} actions today`, inline: true },
            { name: '👍 Feedback', value: `${app.feedback.getStats().positive}👍 / ${app.feedback.getStats().negative}👎`, inline: true },
            { name: '📊 Tracker', value: `${app.tracker.getRoster().members.length} staff monitored`, inline: true },
            { name: '🔍 Profiler', value: `${app.profiler.getWatchList().filter(p => p.status === 'active').length} watched`, inline: true },
            { name: '💬 Chat Buffer', value: `${app.chatBuffer.messages.length} messages`, inline: true },
        ],
        color: '#10B981',
    });

    await message.reply({ embeds: [embed] });
};
