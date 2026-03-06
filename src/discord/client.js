const { Client, GatewayIntentBits, EmbedBuilder, Partials } = require('discord.js');
const config = require('../../config');

/**
 * Create and configure the Discord client.
 * @returns {Client}
 */
function createDiscordClient() {
    const client = new Client({
        intents: [
            GatewayIntentBits.Guilds,
            GatewayIntentBits.GuildMessages,
            GatewayIntentBits.MessageContent,
            GatewayIntentBits.DirectMessages,
            GatewayIntentBits.GuildMessageReactions,
        ],
        partials: [
            Partials.Message,
            Partials.Reaction,
        ],
    });

    return client;
}

/**
 * Build a rich embed for Yui's responses.
 * @param {object} options
 * @param {string} options.title
 * @param {string} options.description
 * @param {string} [options.color='#7C3AED'] - Hex color
 * @param {Array<{name: string, value: string, inline?: boolean}>} [options.fields]
 * @returns {EmbedBuilder}
 */
function buildEmbed({ title, description, color = '#7C3AED', fields = [] }) {
    const embed = new EmbedBuilder()
        .setTitle(title)
        .setDescription(description)
        .setColor(color)
        .setTimestamp()
        .setFooter({ text: 'Yui — Staff Manager' });

    for (const field of fields) {
        embed.addFields({ name: field.name, value: field.value, inline: field.inline ?? false });
    }

    return embed;
}

/**
 * Send a message to a specific Discord channel.
 * @param {Client} client
 * @param {string} channelId
 * @param {string|EmbedBuilder} content
 */
async function sendToChannel(client, channelId, content) {
    try {
        const channel = await client.channels.fetch(channelId);
        if (!channel) {
            console.error(`[Discord] Channel ${channelId} not found.`);
            return;
        }

        if (content instanceof EmbedBuilder) {
            await channel.send({ embeds: [content] });
        } else {
            await channel.send(content);
        }
    } catch (err) {
        console.error('[Discord] Failed to send message:', err.message);
    }
}

/**
 * Strip bot mention from a message and return clean text.
 * @param {string} content - Raw message content
 * @param {string} botId - The bot's user ID
 * @returns {string} Message text without the mention prefix
 */
function stripMention(content, botId) {
    return content
        .replace(new RegExp(`<@!?${botId}>`, 'g'), '')
        .trim();
}

module.exports = { createDiscordClient, buildEmbed, sendToChannel, stripMention };
