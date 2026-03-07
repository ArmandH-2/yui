/**
 * Chatlog Analyzer — Fetches player chatlogs and analyzes persona via LLM.
 *
 * Flow:
 *   1. Run /chatlog <player> → capture code
 *   2. Build URL: https://chatlog.gamster.org/?report=CODE
 *   3. Fetch URL content (HTTP GET)
 *   4. Parse chat lines
 *   5. Send to LLM for persona/behavior analysis
 *   6. Save raw chatlog + analysis to profile store
 */

const https = require('https');
const http = require('http');
const { parseChatlogCode } = require('../tracker/stat-parser');
const { quickPrompt } = require('../ai/llm');

const CHATLOG_BASE_URL = 'https://chatlog.gamster.org/?report=';

function buildProfilingPrompt(playerName) {
    return `You are a professional HR Manager evaluating candidates for a community moderation role (Gamster Minecraft Server).
Your task is to review the candidate's chat history and assess their maturity, communication style, and readiness for a staff position.

The candidate's username is TARGET: ${playerName}.

CRITICAL: Chatlogs often contain messages from multiple players. You must MUST ONLY evaluate the messages sent by ${playerName}. Do NOT evaluate the behavior of other players, but you CAN use other players' messages as context to understand the conversation flow and how ${playerName} responded to them.

Evaluate the candidate using modern HR standards:
- Do not penalize brevity or the use of names/abbreviations natively used in gaming (e.g., short callouts, typing a player's name).
- If the chat history is very short, primarily consists of simple commands/names, or lacks substantial contextual interaction, you MUST conclude the data is "inconclusive" and default to a neutral, unbiased stance rather than marking them as immature.
- Look for severe red flags ONLY: Toxicity, racism, threats, severe spam, advertising, or direct staff disrespect. Otherwise, give the benefit of the doubt.

Key Gamster Server Rules to enforce:
1. No insults, threats, vulgarity, swearing (e.g., wtf, stfu, bch), or discrimination.
2. No spam, excessive CAPS, or advertising.

Respond ONLY in valid JSON with the following fields:
{
  "tone": "one of: respectful, neutral, toxic, helpful, mixed",
  "maturity": "one of: mature, moderate, childish, inconclusive",
  "behaviors": ["list of observed behavior patterns"],
  "redFlags": ["list of severe rule breaks or concerning behaviors, empty if none"],
  "positiveTraits": ["list of positive traits, empty if none"],
  "staffSuitability": "one of: recommended, neutral, not_recommended",
  "summary": "2-3 sentence professional HR summary. Focus on facts, not assumptions based on short messages.",
  "messageCount": number_of_messages_analyzed
}

CRITICAL INSTRUCTION: If the player only types a few words, names, or short abbreviations, DO NOT mark them negatively (childish/unfit). Short comms in games are normal. Mark as neutral/inconclusive.`;
}

class ChatlogAnalyzer {
    /**
     * @param {import('../minecraft/command-runner')} cmdRunner
     * @param {import('./profile-store')} store
     */
    constructor(cmdRunner, store) {
        this.cmdRunner = cmdRunner;
        this.store = store;
    }

    /**
     * Generate a chatlog for a player and get the code.
     * @param {string} playerName
     * @returns {Promise<string|null>} The chatlog code, or null
     */
    async generateChatlog(playerName) {
        console.log(`[ChatlogAnalyzer] Generating chatlog for ${playerName}...`);

        const lines = await this.cmdRunner.runCommand(`/chatlog ${playerName}`, {
            timeout: 5000,
            maxLines: 10,
        });

        const code = parseChatlogCode(lines);
        if (!code) {
            console.error(`[ChatlogAnalyzer] Failed to extract chatlog code for ${playerName}.`);
            return null;
        }

        console.log(`[ChatlogAnalyzer] Got chatlog code: ${code}`);
        return code;
    }

    /**
     * Fetch chatlog content from the URL (follows redirects).
     * @param {string} code - The chatlog code
     * @returns {Promise<string>} Raw text content of the chatlog page
     */
    async fetchChatlog(code) {
        const url = `${CHATLOG_BASE_URL}${code}`;
        console.log(`[ChatlogAnalyzer] Fetching chatlog: ${url}`);

        return new Promise((resolve, reject) => {
            const fetchUrl = (targetUrl, redirects = 0) => {
                if (redirects > 5) return reject(new Error('Too many redirects'));

                const protocol = targetUrl.startsWith('https') ? https : http;
                const req = protocol.get(targetUrl, {
                    headers: { 'User-Agent': 'Yui-Bot/1.0 ChatlogFetcher' },
                    timeout: 15000,
                }, (res) => {
                    // Follow redirects
                    if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                        const newUrl = res.headers.location.startsWith('http')
                            ? res.headers.location
                            : new URL(res.headers.location, targetUrl).href;
                        return fetchUrl(newUrl, redirects + 1);
                    }

                    if (res.statusCode !== 200) {
                        return reject(new Error(`HTTP ${res.statusCode}`));
                    }

                    let data = '';
                    res.on('data', chunk => data += chunk);
                    res.on('end', () => resolve(data));
                    res.on('error', reject);
                });

                req.on('error', reject);
                req.on('timeout', () => { req.destroy(); reject(new Error('Fetch timeout')); });
            };

            fetchUrl(url);
        });
    }

    /**
     * Parse raw HTML chatlog into structured chat lines.
     * Format: [02.03.2026 - 19:45:27] (Practice-1) <BossMan360Storm> gg
     * @param {string} html - Raw HTML content
     * @returns {{ messages: Array<{timestamp: string, section: string, player: string, message: string}>, raw: string }}
     */
    parseChatlogContent(html) {
        const messages = [];

        let text = html;

        // Step 1: Replace common line breaks with newlines
        text = text.replace(/<br\s*\/?>/gi, '\n');
        text = text.replace(/<\/(p|div|tr|li|h[1-6])>/gi, '\n');

        // Step 2: Strip HTML tags.
        // Importantly, user names like <ItsB2_> are encoded as &lt;ItsB2_&gt; in the Raw HTML!
        // So this will NOT strip the username, it will only strip real HTML tags.
        text = text.replace(/<[^>]+>/g, '');

        // Step 3: Decode HTML entities LAST so the &lt; becomes <
        text = text
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/&#x27;/g, "'")
            .replace(/&nbsp;/g, ' ');

        // Step 4: The chatlog lines may be concatenated without newlines.
        // Insert newlines before each timestamp pattern: [DD.MM.YYYY - HH:MM:SS]
        text = text.replace(/\[(\d{2}\.\d{2}\.\d{4})/g, '\n[$1');

        // Step 5: Parse structured chat lines
        const linePattern = /\[(\d{2}\.\d{2}\.\d{4}\s*-\s*\d{2}:\d{2}:\d{2})\]\s*\(([^)]+)\)\s*<([^>]+)>\s*(.*)/g;

        let match;
        while ((match = linePattern.exec(text)) !== null) {
            messages.push({
                timestamp: match[1].trim(),
                section: match[2].trim(),
                player: match[3].trim(),
                message: match[4].trim(),
            });
        }

        // Step 5: Build clean raw text for LLM
        // If we parsed messages, reconstruct a clean version
        let raw;
        if (messages.length > 0) {
            raw = messages.map(m =>
                `[${m.timestamp}] (${m.section}) <${m.player}> ${m.message}`
            ).join('\n');
        } else {
            // Fallback: just use the cleaned text
            raw = text.replace(/\n{3,}/g, '\n\n').trim();
        }

        console.log(`[ChatlogAnalyzer] Parsed ${messages.length} chat messages from HTML (${html.length} bytes → ${raw.length} bytes clean text)`);

        return { messages, raw };
    }

    /**
     * Analyze chatlog content using LLM.
     * @param {string} playerName
     * @param {string} chatContent - The raw chat text
     * @returns {Promise<object>} LLM analysis result
     */
    async analyzeChatlog(playerName, chatContent) {
        if (!chatContent || chatContent.length < 20) {
            return {
                tone: 'neutral',
                maturity: 'moderate',
                behaviors: [],
                redFlags: [],
                positiveTraits: [],
                staffSuitability: 'neutral',
                summary: 'Insufficient chat data to perform analysis.',
                messageCount: 0,
            };
        }

        // Truncate very long chatlogs to save tokens
        const truncated = chatContent.length > 8000
            ? chatContent.substring(0, 8000) + '\n[...truncated...]'
            : chatContent;

        const prompt = `Analyze the following chat history for player "${playerName}":\n\n${truncated}`;

        try {
            const systemPrompt = buildProfilingPrompt(playerName);
            const response = await quickPrompt(prompt, systemPrompt);
            return JSON.parse(response);
        } catch (err) {
            console.error(`[ChatlogAnalyzer] LLM analysis failed for ${playerName}:`, err.message);
            return {
                tone: 'unknown',
                maturity: 'unknown',
                behaviors: [],
                redFlags: [],
                positiveTraits: [],
                staffSuitability: 'neutral',
                summary: `Analysis failed: ${err.message}`,
                messageCount: 0,
            };
        }
    }

    /**
     * Full pipeline: generate chatlog → fetch → parse → analyze → save.
     * @param {string} playerName
     * @returns {Promise<object|null>} The analysis result, or null on failure
     */
    async profilePlayer(playerName) {
        try {
            // Step 1: Generate chatlog
            const code = await this.generateChatlog(playerName);
            if (!code) return null;

            // Step 2: Fetch chatlog content
            const html = await this.fetchChatlog(code);
            if (!html || html.length < 50) {
                console.log(`[ChatlogAnalyzer] Empty or invalid chatlog for ${playerName}.`);
                return null;
            }

            // Step 3: Parse into messages
            const { messages, raw } = this.parseChatlogContent(html);
            console.log(`[ChatlogAnalyzer] Parsed ${messages.length} messages for ${playerName}.`);

            // Step 4: LLM analysis
            const analysis = await this.analyzeChatlog(playerName, raw);

            // Step 5: Save to profile store
            this.store.saveChatlogAnalysis(playerName, raw, analysis, code);

            // Step 6: Update cumulative persona
            await this._updateCumulativePersona(playerName, analysis);

            return analysis;
        } catch (err) {
            console.error(`[ChatlogAnalyzer] Pipeline failed for ${playerName}:`, err.message);
            return null;
        }
    }

    /**
     * Update the cumulative persona summary based on all analyses.
     */
    async _updateCumulativePersona(playerName, latestAnalysis = null) {
        const allAnalyses = this.store.getChatlogAnalyses(playerName);

        if (allAnalyses.length === 0) {
            this.store.updateAnalysis(playerName, null);
            return;
        }

        if (allAnalyses.length === 1) {
            this.store.updateAnalysis(playerName, allAnalyses[0].analysis);
            return;
        }

        // Build a cumulative summary from all analyses
        try {
            const summaries = allAnalyses
                .slice(-5) // Last 5 analyses
                .map(a => a.analysis?.summary || '')
                .filter(Boolean)
                .join('\n- ');

            const cumulativePrompt = `You have performed multiple behavioral analyses of Minecraft player "${playerName}" over time. Here are the findings:\n\n- ${summaries}\n\nProvide a single cumulative assessment. Has their behavior changed over time? What is the overall pattern? Respond ONLY in valid JSON matching the format.`;

            const response = await quickPrompt(cumulativePrompt, buildProfilingPrompt(playerName));
            const cumulative = JSON.parse(response);
            this.store.updateAnalysis(playerName, cumulative);
        } catch (err) {
            console.error(`[ChatlogAnalyzer] Cumulative update failed:`, err.message);
            if (latestAnalysis) this.store.updateAnalysis(playerName, latestAnalysis);
        }
    }
}

module.exports = ChatlogAnalyzer;
