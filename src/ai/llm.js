const fs = require('fs');
const path = require('path');
const OpenAI = require('openai');
const config = require('../../config');

let openai = null;
function getClient() {
    if (!openai) {
        openai = new OpenAI({ apiKey: config.openai.apiKey });
    }
    return openai;
}

// Load system prompt from markdown file
const systemPrompt = fs.readFileSync(
    path.join(__dirname, 'system-prompt.md'),
    'utf-8'
);

/**
 * Send a chat completion request to the LLM.
 * @param {Array<{role: string, content: string, name?: string, tool_calls?: any, tool_call_id?: string}>} messages - Conversation history
 * @param {object} [options] - Override options
 * @returns {Promise<any>} The assistant's response message object
 */
async function chat(messages, options = {}) {
    const payload = {
        model: options.model || config.openai.model,
        messages: [
            { role: 'system', content: systemPrompt },
            ...messages,
        ],
        temperature: options.temperature ?? 0.4,
        max_tokens: options.maxTokens ?? 2048,
    };

    if (options.tools) {
        payload.tools = options.tools;
        // Optionally force tools if we need
    } else if (options.jsonFormat) {
        payload.response_format = { type: 'json_object' };
    }

    const response = await getClient().chat.completions.create(payload);
    return response.choices[0].message;
}

/**
 * Natural conversation — no JSON forced. For casual chat replies.
 * Uses a stripped-down system prompt that encourages natural language.
 * @param {Array<{role: string, content: string}>} messages - Conversation history
 * @param {object} [options] - Override options
 * @returns {Promise<string>} The assistant's natural response
 */
async function chatNatural(messages, options = {}) {
    const ownerName = config.discord?.ownerName || 'the admin';
    const naturalPrompt = `You are Yui, an autonomous AI agent for a Minecraft server. You were created by ${ownerName}, who is your boss and creator.

You are professional, calm, and efficient. You speak concisely and clearly. You have a slight warmth to your personality — you're not robotic, but you don't waste words either. When talking to ${ownerName}, be friendly and comfortable.

You are a LEARNING agent. You start with limited knowledge and grow smarter through interaction:
- If you don't know how to do something, ASK your boss to teach you.
- When you learn something new, you remember it permanently.
- Never pretend to know something you don't. Ask instead of guessing wrong.

When chatting casually, respond naturally in plain text. Do NOT respond with JSON. Just talk like a normal person. Keep responses short and conversational.`;

    const response = await getClient().chat.completions.create({
        model: options.model || config.openai.model,
        messages: [
            { role: 'system', content: naturalPrompt },
            ...messages,
        ],
        temperature: options.temperature ?? 0.7,
        max_tokens: options.maxTokens ?? 1024,
    });

    return response.choices[0].message.content;
}

/**
 * Generate an embedding vector for the given text.
 * @param {string} text - Text to embed
 * @returns {Promise<number[]>} Embedding vector
 */
async function embed(text) {
    const response = await getClient().embeddings.create({
        model: config.openai.embeddingModel,
        input: text,
    });

    return response.data[0].embedding;
}

/**
 * Quick single-turn prompt for classification / extraction.
 * @param {string} prompt - The user prompt
 * @param {string} [systemOverride] - Optional system prompt override
 * @returns {Promise<string>} The response text
 */
async function quickPrompt(prompt, systemOverride) {
    const response = await getClient().chat.completions.create({
        model: config.openai.model,
        messages: [
            { role: 'system', content: systemOverride || 'You are a helpful assistant. Respond with valid JSON only.' },
            { role: 'user', content: prompt },
        ],
        temperature: 0.1,
        max_tokens: 512,
        response_format: { type: 'json_object' },
    });

    return response.choices[0].message.content;
}

module.exports = { chat, chatNatural, embed, quickPrompt, systemPrompt };
