require('dotenv').config();

module.exports = {
  discord: {
    token: process.env.DISCORD_TOKEN,
    prefix: process.env.DISCORD_PREFIX || '!',
    channelId: process.env.DISCORD_CHANNEL_ID,
    ownerIds: (process.env.OWNER_DISCORD_ID || '').split(',').map(id => id.trim()).filter(Boolean),
    ownerName: process.env.OWNER_NAME || 'Boss',
  },
  minecraft: {
    host: process.env.MC_HOST || 'localhost',
    port: parseInt(process.env.MC_PORT, 10) || 25565,
    username: process.env.MC_USERNAME || 'Yui',
    version: process.env.MC_VERSION || '1.20.1',
    loginCommand: process.env.MC_LOGIN_COMMAND || '',
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY,
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    embeddingModel: process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small',
  },
  chroma: {
    url: process.env.CHROMA_URL || 'http://localhost:8000',
    collection: process.env.CHROMA_COLLECTION || 'yui_memories',
  },
  logLevel: process.env.LOG_LEVEL || 'info',
};
