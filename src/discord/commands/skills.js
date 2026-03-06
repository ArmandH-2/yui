const { buildEmbed } = require('../client');

/**
 * Handle the !skills command.
 * Usage:
 *   !skills — list all skills
 *   !skills list — list all skills
 *   !skills view <name> — view a skill's details
 *   !skills add <name> "<description>" "<step1>" "<step2>" ...
 *   !skills delete <name>
 *
 * @param {import('discord.js').Message} message
 * @param {string} args
 * @param {import('../../skills/manager')} skillsManager
 */
async function handleSkills(message, args, skillsManager) {
    const parts = args ? args.trim().split(/\s+/) : ['list'];
    const subcommand = parts[0];

    switch (subcommand) {
        case 'list': {
            const skills = skillsManager.listSkills();

            if (skills.length === 0) {
                return message.reply('📭 No skills saved yet. Use `!skills add` to create one.');
            }

            const list = skills
                .map((s) => `• **${s.name}** — ${s.description} (${s.stepCount} steps)`)
                .join('\n');

            const embed = buildEmbed({
                title: '📚 Skills Library',
                description: list.substring(0, 4096),
                color: '#F59E0B',
            });

            return message.reply({ embeds: [embed] });
        }

        case 'view': {
            const name = parts[1];
            if (!name) return message.reply('⚠️ Usage: `!skills view <name>`');

            const skill = skillsManager.getSkill(name);
            if (!skill) return message.reply(`❌ Skill "${name}" not found.`);

            const steps = skill.steps.map((s, i) => `${i + 1}. \`${s}\``).join('\n');

            const embed = buildEmbed({
                title: `🎯 Skill: ${name}`,
                description: skill.description,
                color: '#F59E0B',
                fields: [
                    { name: 'Steps', value: steps.substring(0, 1024) },
                    { name: 'Author', value: skill.author || 'Unknown', inline: true },
                    { name: 'Created', value: skill.created || 'Unknown', inline: true },
                ],
            });

            return message.reply({ embeds: [embed] });
        }

        case 'add': {
            // Parse: !skills add skill_name "description" "step1" "step2"
            const rest = args.substring(4).trim(); // Remove "add "
            const tokens = rest.match(/"[^"]+"|[^\s"]+/g);

            if (!tokens || tokens.length < 3) {
                return message.reply(
                    '⚠️ Usage: `!skills add <name> "<description>" "<step1>" "<step2>" ...`\nExample: `!skills add handle_spam "Handle a spammer" "execute_command(\'/mute {player} 10m spam\')" "save_memory(\'Muted {player} for spam\')"`'
                );
            }

            const name = tokens[0].replace(/"/g, '');
            const description = tokens[1].replace(/"/g, '');
            const steps = tokens.slice(2).map((t) => t.replace(/"/g, ''));

            skillsManager.saveSkill(name, description, steps, message.author.username);

            const embed = buildEmbed({
                title: '✅ Skill Saved',
                description: `**${name}** — ${description}`,
                color: '#10B981',
                fields: [{ name: 'Steps', value: steps.map((s, i) => `${i + 1}. \`${s}\``).join('\n').substring(0, 1024) }],
            });

            return message.reply({ embeds: [embed] });
        }

        case 'delete': {
            const name = parts[1];
            if (!name) return message.reply('⚠️ Usage: `!skills delete <name>`');

            const success = skillsManager.deleteSkill(name);
            return message.reply(success ? `✅ Skill "${name}" deleted.` : `❌ Skill "${name}" not found.`);
        }

        default:
            return message.reply(
                '⚠️ Available subcommands: `list`, `view <name>`, `add <name> ...`, `delete <name>`'
            );
    }
}

module.exports = handleSkills;
