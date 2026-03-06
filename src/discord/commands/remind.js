const { buildEmbed } = require('../client');

/**
 * Handle the !remind command.
 * Usage:
 *   !remind @user Do daily report in 30 minutes
 *   !remind list
 *   !remind cancel <id>
 *
 * @param {import('discord.js').Message} message
 * @param {string} args
 * @param {import('../../scheduler/reminder')} scheduler
 */
async function handleRemind(message, args, scheduler) {
    if (!args) {
        return message.reply(
            '⚠️ Usage:\n• `!remind <who> <what> in <time>`\n• `!remind list`\n• `!remind cancel <id>`'
        );
    }

    const parts = args.trim().split(/\s+/);

    // !remind list
    if (parts[0] === 'list') {
        const reminders = scheduler.listReminders();

        if (reminders.length === 0) {
            return message.reply('📭 No active reminders.');
        }

        const list = reminders
            .map((r) => `• **\`${r.id}\`** — ${r.target}: "${r.message}" (${r.whenRaw})`)
            .join('\n');

        const embed = buildEmbed({
            title: '⏰ Active Reminders',
            description: list.substring(0, 4096),
            color: '#EC4899',
        });

        return message.reply({ embeds: [embed] });
    }

    // !remind cancel <id>
    if (parts[0] === 'cancel') {
        const id = parts[1];
        if (!id) return message.reply('⚠️ Usage: `!remind cancel <id>`');

        const success = scheduler.cancelReminder(id);
        return message.reply(success ? `✅ Reminder \`${id}\` cancelled.` : `❌ Reminder \`${id}\` not found.`);
    }

    // !remind <who> <what> in <time>
    // Parse: first word is target, last "in X minutes" / "at HH:MM" is when, middle is message
    const target = parts[0];
    const rest = parts.slice(1).join(' ');

    // Try to extract "in X minutes/hours" or "at HH:MM" from the end
    const whenMatch = rest.match(/(in\s+\d+\s*(?:min(?:ute)?s?|hours?|h|m)|at\s+\d{1,2}:\d{2}|every\s+day\s+at\s+\d{1,2}:\d{2})$/i);

    let reminderMessage, when;
    if (whenMatch) {
        reminderMessage = rest.substring(0, whenMatch.index).trim();
        when = whenMatch[1].trim();
    } else {
        reminderMessage = rest;
        when = 'in 1 hour';
    }

    if (!reminderMessage) {
        return message.reply('⚠️ Please include a message for the reminder.');
    }

    const result = scheduler.addReminder(target, reminderMessage, when);

    const embed = buildEmbed({
        title: '⏰ Reminder Set!',
        description: `**For:** ${target}\n**Message:** ${reminderMessage}\n**When:** ${result.scheduledFor}`,
        color: '#EC4899',
        fields: [{ name: 'ID', value: `\`${result.id}\``, inline: true }],
    });

    await message.reply({ embeds: [embed] });
}

module.exports = handleRemind;
