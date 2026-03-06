const config = require('../../../config');
const { stripMention } = require('../client');
const { ACTION_TYPES } = require('../../audit/logger');
const agentLoop = require('../commands/ask');

// Built-in commands
const handleRun = require('../commands/run');
const handleSummary = require('../commands/summary');
const handleRemind = require('../commands/remind');
const handleSkills = require('../commands/skills');

const handleTracker = require('../commands/text/tracker');
const handleProfile = require('../commands/text/profile');
const handleAudit = require('../commands/text/audit');
const handleStatus = require('../commands/text/status');
const handleHelp = require('../commands/text/help');

module.exports = async function messageCreateHandler(message, app) {
    if (message.author.bot) return;

    const isOwner = config.discord.ownerIds && config.discord.ownerIds.includes(message.author.id);

    if (app.getMode() && !isOwner) return;

    // ──────────────────────────────────
    // Route 1: @Yui mention → AI agent
    // ──────────────────────────────────
    if (message.mentions.has(app.discordClient.user)) {
        const userText = stripMention(message.content, app.discordClient.user.id);
        const userId = message.author.id;

        const history = app.conversations.getHistory(userId);
        const result = await agentLoop(message, userText, app.deps, history);

        if (result && result.response) {
            app.conversations.addMessage(userId, 'user', userText);
            app.conversations.addMessage(userId, 'assistant', result.response);
        }

        return;
    }

    // ──────────────────────────────────
    // Route 2: !prefix → direct shortcuts
    // ──────────────────────────────────
    if (!message.content.startsWith(config.discord.prefix)) return;

    const content = message.content.slice(config.discord.prefix.length).trim();
    const [command, ...argParts] = content.split(/\s+/);
    const args = argParts.join(' ');

    switch (command.toLowerCase()) {
        case 'run':
            await handleRun(message, args, app.deps.cmdRunner);
            break;

        case 'ask':
            await agentLoop(message, args, app.deps);
            break;

        case 'summary':
            await handleSummary(message, args, app.deps.chatBuffer);
            break;

        case 'remind':
            await handleRemind(message, args, app.deps.scheduler);
            break;

        case 'skills':
        case 'skill':
            await handleSkills(message, args, app.deps.skills);
            break;

        case 'bridge':
            const state = app.deps.bridge.toggle();
            await message.reply(state ? '🟢 Bridge enabled.' : '🔴 Bridge disabled.');
            break;

        case 'mode': {
            if (!isOwner) {
                await message.reply('❌ Only the owner can change the mode.');
                break;
            }
            app.setMode(!app.getMode());
            const modeName = app.getMode() ? 'Private' : 'Public';
            app.audit.log(ACTION_TYPES.MODE_CHANGED, { mode: modeName }, { id: message.author.id, username: message.author.username });
            await message.reply(`${app.getMode() ? '🔒' : '🌐'} Mode switched to **${modeName}**.\n${app.getMode() ? 'Only you can interact with me now.' : 'Everyone can interact with me now.'}`);
            break;
        }

        case 'audit':
            await handleAudit(message, args, app);
            break;

        case 'feedback': {
            const fbStats = app.feedback.getStats();
            const { buildEmbed } = require('../client');
            const fields = [
                { name: '👍 Positive', value: `${fbStats.positive}`, inline: true },
                { name: '👎 Negative', value: `${fbStats.negative}`, inline: true },
                { name: '📊 Approval', value: fbStats.ratio, inline: true },
            ];

            if (fbStats.recentNegative.length > 0) {
                const negList = fbStats.recentNegative.map((n) => {
                    const time = new Date(n.timestamp).toLocaleString();
                    return `• \`${time}\` "${n.query?.substring(0, 60)}..."`;
                }).join('\n');
                fields.push({ name: '⚠️ Recent Negative Feedback', value: negList.substring(0, 1024) });
            }

            const embed = buildEmbed({
                title: '👍 Feedback Stats',
                description: `React with 👍 or 👎 on any of my responses to help me learn!\nTotal feedback received: **${fbStats.total}**`,
                color: '#10B981',
                fields,
            });
            await message.reply({ embeds: [embed] });
            break;
        }

        case 'tracker':
            await handleTracker(message, args, app);
            break;

        case 'profile':
            await handleProfile(message, args, app);
            break;

        case 'status':
            await handleStatus(message, app);
            break;

        case 'help':
            await handleHelp(message);
            break;

        default:
            await agentLoop(message, `${command} ${args}`.trim(), app.deps);
            break;
    }
};
