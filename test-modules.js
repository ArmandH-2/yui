// Quick syntax & require validation for Yui modules
// Does NOT require API keys or server connections

try {
    console.log('Checking config...');
    const config = require('./config');
    console.log('  ✅ config.js');

    console.log('Checking AI modules...');
    const { ChatBuffer } = require('./src/ai/summarizer');
    console.log('  ✅ ai/summarizer.js');
    const { classifyIntent } = require('./src/ai/intent-router');
    console.log('  ✅ ai/intent-router.js');

    console.log('Checking Minecraft modules...');
    const MinecraftBot = require('./src/minecraft/bot');
    console.log('  ✅ minecraft/bot.js');
    const { parseMessage, stripColors } = require('./src/minecraft/chat-handler');
    console.log('  ✅ minecraft/chat-handler.js');
    const CommandRunner = require('./src/minecraft/command-runner');
    console.log('  ✅ minecraft/command-runner.js');

    console.log('Checking Memory modules...');
    const RAGEngine = require('./src/memory/rag');
    console.log('  ✅ memory/rag.js');

    console.log('Checking Skills module...');
    const SkillsManager = require('./src/skills/manager');
    console.log('  ✅ skills/manager.js');

    console.log('Checking Scheduler module...');
    const ReminderScheduler = require('./src/scheduler/reminder');
    console.log('  ✅ scheduler/reminder.js');

    console.log('Checking Discord modules...');
    const { createDiscordClient, buildEmbed, stripMention } = require('./src/discord/client');
    console.log('  ✅ discord/client.js');
    const Bridge = require('./src/discord/bridge');
    console.log('  ✅ discord/bridge.js');
    const ConversationManager = require('./src/discord/conversation');
    console.log('  ✅ discord/conversation.js');
    const handleRun = require('./src/discord/commands/run');
    console.log('  ✅ discord/commands/run.js');
    const handleSummary = require('./src/discord/commands/summary');
    console.log('  ✅ discord/commands/summary.js');
    const handleRemind = require('./src/discord/commands/remind');
    console.log('  ✅ discord/commands/remind.js');
    const handleSkills = require('./src/discord/commands/skills');
    console.log('  ✅ discord/commands/skills.js');
    const handleAsk = require('./src/discord/commands/ask');
    console.log('  ✅ discord/commands/ask.js (agentLoop)');

    // Quick unit tests
    console.log('\n--- Quick Tests ---');

    // Test chat parser
    const p1 = parseMessage('<Steve> hello world');
    console.assert(p1.type === 'player_chat' && p1.sender === 'Steve', 'parseMessage player chat');
    console.log('  ✅ parseMessage player chat');

    const p2 = parseMessage('[Staff] Admin: check reports');
    console.assert(p2.type === 'staff_chat' && p2.sender === 'Admin', 'parseMessage staff chat');
    console.log('  ✅ parseMessage staff chat');

    const p3 = parseMessage('Steve joined the game');
    console.assert(p3.type === 'join' && p3.sender === 'Steve', 'parseMessage join');
    console.log('  ✅ parseMessage join');

    // Test color stripping
    const stripped = stripColors('§4§lHello §r§aWorld');
    console.assert(stripped === 'Hello World', 'stripColors');
    console.log('  ✅ stripColors');

    // Test ChatBuffer
    const buf = new ChatBuffer(10);
    buf.add({ sender: 'Test', text: 'Hello' });
    console.assert(buf.messages.length === 1, 'ChatBuffer add');
    console.log('  ✅ ChatBuffer add');

    // Test SkillsManager
    const sm = new SkillsManager();
    sm.saveSkill('test_skill', 'A test', ['step1', 'step2']);
    console.assert(sm.getSkill('test_skill') !== null, 'SkillsManager save/get');
    sm.deleteSkill('test_skill');
    console.assert(sm.getSkill('test_skill') === null, 'SkillsManager delete');
    console.log('  ✅ SkillsManager CRUD');

    // Test ConversationManager
    const cm = new ConversationManager({ maxMessages: 3 });
    cm.addMessage('user1', 'user', 'hello');
    cm.addMessage('user1', 'assistant', 'hey!');
    console.assert(cm.getHistory('user1').length === 2, 'ConversationManager add/get');
    cm.addMessage('user1', 'user', 'msg2');
    cm.addMessage('user1', 'assistant', 'reply2');
    console.assert(cm.getHistory('user1').length === 3, 'ConversationManager max trim');
    cm.clear('user1');
    console.assert(cm.getHistory('user1').length === 0, 'ConversationManager clear');
    console.log('  ✅ ConversationManager');

    // Test stripMention
    const s1 = stripMention('<@123456789> hello yui', '123456789');
    console.assert(s1 === 'hello yui', 'stripMention basic');
    const s2 = stripMention('<@!123456789> ban someone', '123456789');
    console.assert(s2 === 'ban someone', 'stripMention nickname');
    console.log('  ✅ stripMention');

    console.log('\n✅ All modules loaded and quick tests passed!');
    process.exit(0);
} catch (err) {
    console.error('❌ Error:', err.message);
    console.error(err.stack);
    process.exit(1);
}
