/**
 * App Router — SPA page navigation, status polling, mode toggle, utilities.
 */

const App = {
    currentPage: null,

    pages: {
        overview: OverviewPage,
        tracker: TrackerPage,
        profiles: ProfilesPage,
        audit: AuditPage,
        reminders: RemindersPage,
        brain: BrainPage,
        console: ConsolePage,
    },

    init() {
        // Nav click handlers
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const page = item.dataset.page;
                App.navigate(page);
            });
        });

        // Mode toggle
        const modeSwitch = document.getElementById('mode-switch');
        if (modeSwitch) {
            modeSwitch.addEventListener('click', () => App.toggleMode());
        }

        // Hash-based routing
        const hash = location.hash.replace('#', '') || 'overview';
        App.navigate(hash);

        // Start status polling
        App.pollStatus();
        setInterval(() => App.pollStatus(), 8000);
    },

    navigate(page) {
        if (!App.pages[page]) page = 'overview';

        // Update nav active state
        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
        const navItem = document.querySelector(`.nav-item[data-page="${page}"]`);
        if (navItem) navItem.classList.add('active');

        // Update hash
        location.hash = page;

        // Cleanup before rendering new page
        if (App.currentPage && App.pages[App.currentPage] && typeof App.pages[App.currentPage].destroy === 'function') {
            App.pages[App.currentPage].destroy();
        }

        // Render page
        const container = document.getElementById('page-content');
        container.innerHTML = '';
        container.style.animation = 'none';
        container.offsetHeight; // Trigger reflow
        container.style.animation = '';

        App.currentPage = page;
        App.pages[page].render(container);
    },

    async pollStatus() {
        try {
            const s = await API.status();
            document.getElementById('mc-dot').className = `dot ${s.minecraft ? 'online' : ''}`;
            document.getElementById('dc-dot').className = `dot ${s.discord ? 'online' : ''}`;
            document.getElementById('sidebar-uptime').textContent = App.formatUptime(s.uptime);

            // Update mode toggle
            const modeSwitch = document.getElementById('mode-switch');
            const modeLabel = document.getElementById('mode-label');
            if (modeSwitch && modeLabel) {
                if (s.mode === 'private') {
                    modeSwitch.classList.add('active');
                    modeLabel.textContent = '🔒 Private';
                } else {
                    modeSwitch.classList.remove('active');
                    modeLabel.textContent = '🌐 Public';
                }
            }
        } catch (err) {
            console.error('Status poll failed:', err);
        }
    },

    async toggleMode() {
        try {
            const result = await API.toggleMode();
            const modeSwitch = document.getElementById('mode-switch');
            const modeLabel = document.getElementById('mode-label');
            if (result.mode === 'private') {
                modeSwitch.classList.add('active');
                modeLabel.textContent = '🔒 Private';
            } else {
                modeSwitch.classList.remove('active');
                modeLabel.textContent = '🌐 Public';
            }
            App.toast(`Mode switched to ${result.mode}`, 'success');
        } catch (err) {
            App.toast('Failed to toggle mode: ' + err.message, 'error');
        }
    },

    formatUptime(seconds) {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        return `${h}h ${m}m`;
    },

    toast(message, type = 'info') {
        const container = document.getElementById('toasts');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        container.appendChild(toast);
        setTimeout(() => toast.remove(), 4000);
    },

    timeAgo(dateStr) {
        if (!dateStr) return 'unknown';
        const diff = Date.now() - new Date(dateStr).getTime();
        if (isNaN(diff)) return 'unknown';
        const mins = Math.floor(diff / 60000);
        if (mins < 1) return 'just now';
        if (mins < 60) return `${mins}m ago`;
        const hours = Math.floor(mins / 60);
        if (hours < 24) return `${hours}h ago`;
        const days = Math.floor(hours / 24);
        return `${days}d ago`;
    },

    escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    },
};

// Boot
document.addEventListener('DOMContentLoaded', () => App.init());
