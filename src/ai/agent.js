const fs = require('fs');
const path = require('path');
const { chat } = require('./llm');
const { isNoise } = require('../minecraft/chat-filter');
const config = require('../../config');

/**
 * Available tools for Yui to use
 */
const AGENT_TOOLS = [
    {
        type: 'function',
        function: {
            name: 'execute_minecraft_command',
            description: 'Executes a command on the Minecraft server and returns the output. Use this for ANY server action (ban, mute, list, op, etc.). Must start with / if it is a command.',
            parameters: {
                type: 'object',
                properties: {
                    command: {
                        type: 'string',
                        description: 'The exact Minecraft command to run (e.g., "/list", "/ban user reason")',
                    }
                },
                required: ['command']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'save_to_memory',
            description: 'Saves important information, knowledge, rules, or preferences to Yui\'s long-term memory for future reference.',
            parameters: {
                type: 'object',
                properties: {
                    knowledge: {
                        type: 'string',
                        description: 'The information to remember (be descriptive so it can be searched later)',
                    },
                    category: {
                        type: 'string',
                        enum: ['rule', 'command', 'note', 'identity'],
                        description: 'The type of knowledge',
                    }
                },
                required: ['knowledge']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'set_reminder',
            description: 'Sets a time-based reminder to ping a user.',
            parameters: {
                type: 'object',
                properties: {
                    target: { type: 'string', description: 'Who to remind (e.g. "ItzB2_")' },
                    message: { type: 'string', description: 'What to remind them about' },
                    time_expression: { type: 'string', description: 'When to remind them (e.g. "in 30 minutes", "tomorrow at 5pm")' }
                },
                required: ['target', 'message', 'time_expression']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'summarize_chat',
            description: 'Retrieves a summary of recent Minecraft server chat activity.',
            parameters: {
                type: 'object',
                properties: {
                    minutes: { type: 'number', description: 'How many minutes back to summarize', default: 30 }
                }
            }
        }
    }
];

let _mcCommandsRef = null;
function getCommandReference() {
    if (_mcCommandsRef === null) {
        try {
            _mcCommandsRef = fs.readFileSync(path.join(__dirname, '../../data/minecraft-commands.md'), 'utf-8');
        } catch {
            _mcCommandsRef = '(Minecraft commands reference not found)';
        }
    }
    return _mcCommandsRef;
}

class YuiAgent {
    constructor(deps) {
        this.deps = deps;
    }

    /**
     * ReAct loop execution using native OpenAI Function Calling
     */
    async execute(userMessage, username, userId, conversationHistory = []) {
        console.log(`[Agent] Processing request from ${username}: "${userMessage}"`);

        // Context Gathering
        const isOwner = config.discord.ownerIds && config.discord.ownerIds.includes(userId);
        const role = isOwner ? `your creator/boss "${username}"` : `staff member "${username}"`;

        const memories = await this.deps.rag.searchMemory(userMessage, 5);
        let contextBlock = memories.length > 0 ? this.deps.rag.formatContext(memories) : 'No specific memories found for this topic.';
        contextBlock += `\n\n--- SERVER COMMANDS REFERENCE ---\n${getCommandReference()}`;

        const systemPromptOverride = `You are Yui, a Minecraft Staff AI. You are speaking with ${role}.
Context available to you:
${contextBlock}

Use functions strictly when needed. Provide clear and concise text responses to the user after operations.`;

        let messages = [
            { role: 'system', content: systemPromptOverride },
            ...conversationHistory,
            { role: 'user', content: userMessage }
        ];

        let maxIterations = 5;
        let finalResponseText = '';
        let toolsUsed = [];

        // Primary ReAct Loop
        for (let i = 0; i < maxIterations; i++) {
            const llmResponse = await chat(messages, { tools: AGENT_TOOLS });
            messages.push(llmResponse);

            if (llmResponse.tool_calls && llmResponse.tool_calls.length > 0) {
                // Need to parallel execute tool calls
                for (const toolCall of llmResponse.tool_calls) {
                    const args = JSON.parse(toolCall.function.arguments);
                    let resultStr = '';

                    try {
                        if (toolCall.function.name === 'execute_minecraft_command') {
                            console.log(`[Agent] Calling Command: ${args.command}`);
                            const cmdLines = await this.deps.cmdRunner.runCommand(args.command);
                            resultStr = cmdLines.filter(l => !isNoise(l)).join('\n');
                            if (!resultStr.trim()) resultStr = "(Command executed but returned no relevant output)";

                            toolsUsed.push({ tool: 'Command', action: args.command, result: resultStr });
                            if (this.deps.audit) this.deps.audit.log('COMMAND_EXECUTED', { command: args.command, result: resultStr.substring(0, 200) }, { id: userId, username });
                        }
                        else if (toolCall.function.name === 'save_to_memory') {
                            console.log(`[Agent] Saving Memory: ${args.knowledge}`);
                            await this.deps.rag.addMemory(`Taught by ${username}: ${args.knowledge}`, args.category || 'note');
                            resultStr = "Knowledge saved successfully.";

                            toolsUsed.push({ tool: 'Memory', action: "Saved knowledge", result: "Success" });
                            if (this.deps.audit) this.deps.audit.log('MEMORY_SAVED', { text: args.knowledge }, { id: userId, username });
                        }
                        else if (toolCall.function.name === 'set_reminder') {
                            console.log(`[Agent] Setting Reminder for ${args.target} at ${args.time_expression}`);
                            const r = this.deps.scheduler.addReminder(args.target, args.message, args.time_expression);
                            resultStr = `Reminder set successfully for ${r.scheduledFor} (ID: ${r.id})`;

                            toolsUsed.push({ tool: 'Reminder', action: `Set for ${args.time_expression}`, result: resultStr });
                        }
                        else if (toolCall.function.name === 'summarize_chat') {
                            console.log(`[Agent] Summarizing Chat for ${args.minutes} mins`);
                            const { summarizeChat } = require('./summarizer');
                            const summary = await summarizeChat(this.deps.chatBuffer, args.minutes || 30);

                            resultStr = `Summary: ${summary.summary}\nKey Events: ${(summary.key_events || []).join(', ')}\nViolations: ${(summary.violations || []).join(', ')}`;
                            toolsUsed.push({ tool: 'Summary', action: `Summarized ${args.minutes || 30} mins`, result: "Success" });
                        }
                        else {
                            resultStr = `Error: Unknown function ${toolCall.function.name}`;
                        }
                    } catch (err) {
                        resultStr = `Error executing tool: ${err.message}`;
                    }

                    messages.push({
                        role: 'tool',
                        tool_call_id: toolCall.id,
                        name: toolCall.function.name,
                        content: resultStr
                    });
                }
            } else if (llmResponse.content) {
                finalResponseText = llmResponse.content;
                break;
            } else {
                finalResponseText = "I finished executing the operations but have nothing more to say.";
                break;
            }
        }

        if (!finalResponseText && messages[messages.length - 1].content) {
            finalResponseText = messages[messages.length - 1].content;
        }

        return {
            text: finalResponseText,
            toolsUsed: toolsUsed
        };
    }
}

module.exports = YuiAgent;
