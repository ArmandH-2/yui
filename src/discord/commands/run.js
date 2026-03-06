const { buildEmbed } = require('../client');

/**
 * Handle the !run command — execute a Minecraft command and return output.
 * @param {import('discord.js').Message} message
 * @param {string} args - The command to run
 * @param {import('../minecraft/command-runner')} cmdRunner
 */
async function handleRun(message, args, cmdRunner) {
    if (!args) {
        return message.reply('⚠️ Usage: `!run <command>`\nExample: `!run /list`');
    }

    try {
        await message.react('⏳');
        const response = await cmdRunner.runCommand(args);

        const output = response.length > 0 ? response.join('\n') : '_No response from server._';

        const embed = buildEmbed({
            title: '🎮 Command Executed',
            description: `\`${args}\``,
            fields: [{ name: 'Server Response', value: output.substring(0, 1024) }],
            color: '#10B981',
        });

        await message.reply({ embeds: [embed] });
        await message.reactions.removeAll().catch(() => { });
    } catch (err) {
        await message.reply(`❌ Error: ${err.message}`);
    }
}

module.exports = handleRun;
