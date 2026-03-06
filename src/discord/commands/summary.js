const { buildEmbed } = require('../client');

/**
 * Handle the !summary command — summarize recent Minecraft chat.
 * @param {import('discord.js').Message} message
 * @param {string} args - Optional timeframe in minutes
 * @param {import('../../ai/summarizer').ChatBuffer} chatBuffer
 */
async function handleSummary(message, args, chatBuffer) {
    try {
        await message.react('📋');

        const minutes = parseInt(args, 10) || 30;
        const { summarizeChat } = require('../../ai/summarizer');
        const summary = await summarizeChat(chatBuffer, minutes);

        const embed = buildEmbed({
            title: `📋 Chat Summary (Last ${minutes} min)`,
            description: summary.summary || 'No activity in the requested timeframe.',
            color: '#6366F1',
            fields: [
                ...(summary.key_events?.length
                    ? [{ name: '🔑 Key Events', value: summary.key_events.join('\n').substring(0, 1024) }]
                    : []),
                ...(summary.violations?.length
                    ? [{ name: '⚠️ Violations', value: summary.violations.join('\n').substring(0, 1024) }]
                    : []),
                ...(summary.staff_actions?.length
                    ? [{ name: '🛡️ Staff Actions', value: summary.staff_actions.join('\n').substring(0, 1024) }]
                    : []),
            ],
        });

        await message.reply({ embeds: [embed] });
        await message.reactions.removeAll().catch(() => { });
    } catch (err) {
        await message.reply(`❌ Error generating summary: ${err.message}`);
    }
}

module.exports = handleSummary;
