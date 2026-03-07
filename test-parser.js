const { parseInfoSU, parsePunishHistory } = require('./src/tracker/stat-parser');
const infoOutput = require('./info-output.json').output;
const banOutput = require('./baninfo-output.json').output;

console.log('INFO SU:', parseInfoSU(infoOutput));
console.log('BANINFO:', parsePunishHistory(banOutput).length);
