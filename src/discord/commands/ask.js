const { buildEmbed } = require('../client');
const config = require('../../../config');
const YuiAgent = require('../../ai/agent');
const { ACTION_TYPES } = require('../../audit/logger');

/**
 * The core agent loop — executes Yui's ReAct loop and sends response back to Discord.
 *
 * @param {import('discord.js').Message} message - Discord message
 * @param {string} userText - Clean user text (mention stripped)
 * @param {object} deps - { rag, skills, cmdRunner, chatBuffer, scheduler, audit, etc. }
 * @param {Array<{role: string, content: string}>} [conversationHistory=[]] - Prior turns
 */
async function agentLoop(message, userText, deps, conversationHistory = []) {
    if (!userText) {
        return message.reply("Hey! What's up? You can ask me anything or tell me what to do. 💜");
    }

    try {
        await message.react('🤔');

        const agent = new YuiAgent(deps);

        // Execute the native ReAct Tool Loop
        const result = await agent.execute(userText, message.author.username, message.author.id, conversationHistory);

        // Reply mechanism:
        let replyMsg;

        if (result.toolsUsed && result.toolsUsed.length > 0) {
            // Rich embed if Yui took actions
            const embed = buildEmbed({
                title: '🤖 Yui',
                description: result.text.substring(0, 4096),
                color: '#10B981',
                fields: [{
                    name: '🔧 Actions Taken',
                    value: result.toolsUsed.map((t) => {
                        let resText = t.result || 'done';
                        return `• \`${t.tool}\` (${t.action}): ${resText.substring(0, 200)}`;
                    }).join('\n').substring(0, 1024)
                }]
            });
            replyMsg = await message.reply({ embeds: [embed] });
        } else {
            // Natural plain text for pure conversation
            replyMsg = await message.reply(result.text.substring(0, 2000));
        }

        await message.reactions.removeAll().catch(() => { });

        // Save interaction to long-term memory if it wasn't just chat
        if (result.toolsUsed && result.toolsUsed.length > 0) {
            await deps.rag.addMemory(
                `[${new Date().toISOString()}] ${message.author.username} asked: "${userText}" | Actions taken: ${result.toolsUsed.map(t => t.tool).join(',')} | Response: ${result.text.substring(0, 200)}`,
                'interaction'
            );
        }

        // Track response for feedback system (👍/👎 reactions)
        if (replyMsg && deps.feedback) {
            deps.feedback.trackResponse(replyMsg.id, {
                query: userText,
                response: result.text,
                tools: result.toolsUsed,
                userId: message.author.id,
                username: message.author.username,
            });
        }

        if (deps.audit) {
            deps.audit.log(ACTION_TYPES.AGENT_RESPONSE, {
                query: userText.substring(0, 200),
                response: result.text.substring(0, 200),
                tools: result.toolsUsed.map(t => t.tool)
            }, { id: message.author.id, username: message.author.username });
        }

        return { response: result.text, toolsUsed: result.toolsUsed };
    } catch (err) {
        console.error('[Agent] Error:', err);
        await message.reply(`❌ Something went wrong: ${err.message}`);
        return { response: null, error: err.message };
    }
}

module.exports = agentLoop;
