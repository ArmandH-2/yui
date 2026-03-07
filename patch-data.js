const fs = require('fs');

const profPath = './data/profiles/itsb2_/profile.json';
const actPath = './data/profiles/itsb2_/activity.json';

if (fs.existsSync(profPath)) {
    const prof = JSON.parse(fs.readFileSync(profPath, 'utf8'));
    if (prof.alts && prof.alts.includes("Name")) {
        prof.alts = prof.alts.filter(a => a !== "Name");
        fs.writeFileSync(profPath, JSON.stringify(prof, null, 2));
        console.log("Fixed profile alts");
    }
}

if (fs.existsSync(actPath)) {
    const act = JSON.parse(fs.readFileSync(actPath, 'utf8'));
    act.dailySnapshots.forEach(s => {
        if (s.section === 'unknown' || s.section === 'Staff/Immortal Lobby') {
            s.section = 'Silent';
        }
    });
    const freqs = {};
    act.dailySnapshots.forEach(s => {
        freqs[s.section] = (freqs[s.section] || 0) + 1;
    });
    act.sectionFrequency = freqs;
    fs.writeFileSync(actPath, JSON.stringify(act, null, 2));
    console.log("Fixed activity sections");
}
