const Application = require('./core/app');

// ═══════════════════════════════════════════
// Boot Sequence
// ═══════════════════════════════════════════

const app = new Application();

app.start().catch((err) => {
    console.error('[FATAL]', err);
    process.exit(1);
});
