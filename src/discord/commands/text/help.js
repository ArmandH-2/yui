const config = require('../../../../config');
const { buildEmbed } = require('../../client');

module.exports = async function handleHelp(message) {
    const embed = buildEmbed({
        title: '📖 Yui Commands',
        description: 'Talk to me naturally by mentioning **@Yui**, or use these shortcuts:',
        fields: [
            { name: '💬 **@Yui** `<anything>`', value: 'Talk to me naturally — I\'ll understand what you need' },
            { name: `\`${config.discord.prefix}run <command>\``, value: 'Execute a Minecraft command directly' },
            { name: `\`${config.discord.prefix}summary [minutes]\``, value: 'Summarize recent MC chat (default: 30 min)' },
            { name: `\`${config.discord.prefix}remind ...\``, value: 'Set, list, or cancel reminders' },
            { name: `\`${config.discord.prefix}skills ...\``, value: 'Manage the skills/procedures library' },
            { name: `\`${config.discord.prefix}bridge\``, value: 'Toggle MC ↔ Discord chat bridge' },
            { name: `\`${config.discord.prefix}mode\``, value: 'Toggle private/public mode (owner only)' },
            { name: `\`${config.discord.prefix}audit [today|commands|N]\``, value: 'View audit log entries' },
            { name: `\`${config.discord.prefix}feedback\``, value: 'View feedback stats (👍/👎)' },
            { name: `\`${config.discord.prefix}tracker add|remove|list|check|stats|inactivity\``, value: 'Staff activity tracker' },
            { name: `\`${config.discord.prefix}profile watch|unwatch|list|check|view|note\``, value: 'Player profiler / surveillance' },
            { name: `\`${config.discord.prefix}status\``, value: 'Show system status' },
        ],
        color: '#7C3AED',
    });

    await message.reply({ embeds: [embed] });
};
