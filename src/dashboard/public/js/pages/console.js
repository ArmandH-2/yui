/**
 * Console Page — Execute Minecraft commands and view output.
 * Polished with better styling and scroll behavior.
 */

const ConsolePage = {
    history: [],
    historyIndex: -1,
    eventSource: null,

    async render(container) {
        container.innerHTML = `
            <div class="page-header">
                <h1>⌨️ Console</h1>
                <p>Execute Minecraft commands directly</p>
            </div>

            <div class="card">
                <div class="terminal" id="terminal">
                    <div class="terminal-line system">Yui Console — Type a command and press Enter.</div>
                    <div class="terminal-line system">Commands: /staff, /info &lt;name&gt;, /teamstats &lt;name&gt;, /find &lt;name&gt;</div>
                    <div class="terminal-line system">─────────────────────────────────────────</div>
                </div>
                <div class="terminal-input-row">
                    <span>❯</span>
                    <input type="text" id="console-input" placeholder="Type a command..." autocomplete="off">
                </div>
            </div>
        `;

        const input = document.getElementById('console-input');
        input.focus();

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                ConsolePage.execute(input.value.trim());
                input.value = '';
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                if (ConsolePage.historyIndex < ConsolePage.history.length - 1) {
                    ConsolePage.historyIndex++;
                    input.value = ConsolePage.history[ConsolePage.history.length - 1 - ConsolePage.historyIndex];
                }
            } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                if (ConsolePage.historyIndex > 0) {
                    ConsolePage.historyIndex--;
                    input.value = ConsolePage.history[ConsolePage.history.length - 1 - ConsolePage.historyIndex];
                } else {
                    ConsolePage.historyIndex = -1;
                    input.value = '';
                }
            }
        });

        ConsolePage.connectStream();
    },

    connectStream() {
        if (ConsolePage.eventSource) {
            ConsolePage.eventSource.close();
        }
        ConsolePage.eventSource = new EventSource('/api/console/stream');
        ConsolePage.eventSource.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.type === 'chat') {
                    ConsolePage.addLine(data.text, 'chat');
                }
            } catch (err) {
                console.error('Failed to parse console stream data', err);
            }
        };
    },

    destroy() {
        if (ConsolePage.eventSource) {
            ConsolePage.eventSource.close();
            ConsolePage.eventSource = null;
        }
    },

    addLine(text, type = '') {
        const terminal = document.getElementById('terminal');
        if (!terminal) return;
        const line = document.createElement('div');
        line.className = `terminal-line ${type}`;
        line.textContent = text;
        terminal.appendChild(line);
        terminal.scrollTop = terminal.scrollHeight;
    },

    async execute(command) {
        if (!command) return;

        ConsolePage.history.push(command);
        ConsolePage.historyIndex = -1;
        ConsolePage.addLine(`❯ ${command}`, 'input');

        try {
            const result = await API.runCommand(command);

            if (result.output && Array.isArray(result.output)) {
                result.output.forEach(line => ConsolePage.addLine(line));
            } else if (result.output) {
                ConsolePage.addLine(String(result.output));
            } else {
                ConsolePage.addLine('(no output)', 'system');
            }
        } catch (err) {
            ConsolePage.addLine(`Error: ${err.message}`, 'error');
        }

        ConsolePage.addLine(''); // blank line separator
    },
};
