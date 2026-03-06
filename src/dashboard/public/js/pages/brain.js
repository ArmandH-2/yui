/**
 * Memory & Skills Page — Add/delete memories, add/delete skills.
 */

const BrainPage = {
    activeTab: 'memories',

    async render(container) {
        container.innerHTML = `
            <div class="page-header">
                <h1>🧠 Memory & Skills</h1>
                <p>Manage Yui's knowledge base and learned procedures</p>
            </div>

            <div class="tab-bar">
                <button class="tab-btn active" data-tab="memories" onclick="BrainPage.switchTab('memories')">🧠 Memories</button>
                <button class="tab-btn" data-tab="skills" onclick="BrainPage.switchTab('skills')">📚 Skills</button>
            </div>

            <div id="tab-memories">
                <div class="form-section mb-24">
                    <div class="card-title mb-16">➕ Add Memory</div>
                    <div class="form-row">
                        <div style="flex:3">
                            <label class="form-label">Memory Text</label>
                            <input type="text" id="memory-text" placeholder="Something Yui should remember...">
                        </div>
                        <div style="flex:1">
                            <label class="form-label">Category</label>
                            <select id="memory-category">
                                <option value="note">Note</option>
                                <option value="rule">Rule</option>
                                <option value="incident">Incident</option>
                                <option value="interaction">Interaction</option>
                            </select>
                        </div>
                    </div>
                    <button class="btn btn-gradient" id="memory-add-btn">🧠 Save Memory</button>
                    <span class="text-muted text-sm" style="margin-left:12px">⚠️ Uses API tokens for embedding</span>
                </div>

                <div class="card">
                    <div class="card-header flex-between">
                        <span class="card-title">📋 Stored Memories</span>
                        <span class="text-muted text-sm" id="memory-count">—</span>
                    </div>
                    <div id="memories-list"><p class="text-muted">Loading...</p></div>
                </div>
            </div>

            <div id="tab-skills" style="display:none">
                <div class="form-section mb-24">
                    <div class="card-title mb-16">➕ Add Skill</div>
                    <div class="form-row">
                        <div>
                            <label class="form-label">Skill Name</label>
                            <input type="text" id="skill-name" placeholder="e.g. check_player_stats">
                        </div>
                        <div>
                            <label class="form-label">Description</label>
                            <input type="text" id="skill-description" placeholder="What does this skill do?">
                        </div>
                    </div>
                    <div>
                        <label class="form-label">Steps (one per line)</label>
                        <textarea id="skill-steps" placeholder="execute_command('/info {player}')&#10;execute_command('/teamstats {player}')&#10;save_memory('Checked stats for {player}')"></textarea>
                    </div>
                    <button class="btn btn-gradient mt-16" id="skill-add-btn">📚 Save Skill</button>
                </div>

                <div class="card">
                    <div class="card-header">
                        <span class="card-title">📋 Skills Library</span>
                    </div>
                    <div id="skills-list"><p class="text-muted">Loading...</p></div>
                </div>
            </div>
        `;

        document.getElementById('memory-add-btn').addEventListener('click', () => BrainPage.addMemory());
        document.getElementById('memory-text').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') BrainPage.addMemory();
        });
        document.getElementById('skill-add-btn').addEventListener('click', () => BrainPage.addSkill());

        await BrainPage.loadMemories();
        await BrainPage.loadSkills();
    },

    switchTab(tab) {
        BrainPage.activeTab = tab;
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelector(`.tab-btn[data-tab="${tab}"]`).classList.add('active');

        document.getElementById('tab-memories').style.display = tab === 'memories' ? 'block' : 'none';
        document.getElementById('tab-skills').style.display = tab === 'skills' ? 'block' : 'none';
    },

    async loadMemories() {
        try {
            const result = await API.memories(50, 0);
            const el = document.getElementById('memories-list');
            const countEl = document.getElementById('memory-count');

            if (countEl) countEl.textContent = `${result.total || 0} total`;

            if (!result.items || result.items.length === 0) {
                el.innerHTML = '<div class="empty-state"><div class="empty-icon">🧠</div><p>No memories stored yet. Add one above!</p></div>';
                return;
            }

            el.innerHTML = result.items.map(m => {
                const date = m.timestamp ? new Date(m.timestamp).toLocaleDateString() : 'unknown';
                return `
                    <div class="brain-item">
                        <div class="brain-item-header">
                            <span class="badge badge-${m.category === 'rule' ? 'warning' : m.category === 'incident' ? 'error' : m.category === 'interaction' ? 'accent' : 'info'}">${m.category || 'note'}</span>
                            <div class="flex-center gap-8">
                                <span class="brain-item-meta">${date}</span>
                                <button class="btn btn-danger btn-sm" onclick="BrainPage.deleteMemory('${m.id}')">✕</button>
                            </div>
                        </div>
                        <div class="brain-item-body mt-8">${App.escapeHtml((m.text || '').substring(0, 300))}${(m.text || '').length > 300 ? '...' : ''}</div>
                    </div>
                `;
            }).join('');
        } catch (err) {
            App.toast('Failed to load memories: ' + err.message, 'error');
        }
    },

    async addMemory() {
        const text = document.getElementById('memory-text').value.trim();
        const category = document.getElementById('memory-category').value;
        if (!text) {
            App.toast('Please enter memory text.', 'error');
            return;
        }

        try {
            await API.memoryAdd(text, category);
            document.getElementById('memory-text').value = '';
            App.toast('Memory saved!', 'success');
            await BrainPage.loadMemories();
        } catch (err) {
            App.toast('Failed: ' + err.message, 'error');
        }
    },

    async deleteMemory(id) {
        try {
            await API.memoryDelete(id);
            App.toast('Memory deleted.', 'success');
            await BrainPage.loadMemories();
        } catch (err) {
            App.toast('Failed: ' + err.message, 'error');
        }
    },

    async loadSkills() {
        try {
            const skills = await API.skills();
            const el = document.getElementById('skills-list');

            if (!skills || skills.length === 0) {
                el.innerHTML = '<div class="empty-state"><div class="empty-icon">📚</div><p>No skills in the library. Add one above!</p></div>';
                return;
            }

            el.innerHTML = skills.map((s, i) => {
                const skill = s.skill || {};
                const steps = skill.steps || [];
                return `
                    <div class="brain-item" style="border-left-color: var(--accent)">
                        <div class="brain-item-header">
                            <span class="brain-item-title">${App.escapeHtml(s.name)}</span>
                            <div class="flex-center gap-8">
                                <span class="badge badge-accent">${steps.length} steps</span>
                                <button class="btn btn-ghost btn-sm" onclick="BrainPage.toggleSteps(${i})">👁️</button>
                                <button class="btn btn-danger btn-sm" onclick="BrainPage.deleteSkill('${App.escapeHtml(s.name)}')">✕</button>
                            </div>
                        </div>
                        <div class="brain-item-body mt-8">${App.escapeHtml(skill.description || 'No description')}</div>
                        <div class="brain-item-meta mt-8">Author: ${App.escapeHtml(skill.author || 'unknown')} · Created: ${skill.created || 'unknown'}</div>
                        <div class="brain-item-steps" id="skill-steps-${i}">
                            <ol class="mt-8">
                                ${steps.map(step => `<li>${App.escapeHtml(step)}</li>`).join('')}
                            </ol>
                        </div>
                    </div>
                `;
            }).join('');
        } catch (err) {
            App.toast('Failed to load skills: ' + err.message, 'error');
        }
    },

    toggleSteps(index) {
        const el = document.getElementById(`skill-steps-${index}`);
        if (el) el.classList.toggle('open');
    },

    async addSkill() {
        const name = document.getElementById('skill-name').value.trim();
        const description = document.getElementById('skill-description').value.trim();
        const stepsRaw = document.getElementById('skill-steps').value.trim();

        if (!name || !description || !stepsRaw) {
            App.toast('Please fill in all skill fields.', 'error');
            return;
        }

        const steps = stepsRaw.split('\n').map(s => s.trim()).filter(s => s.length > 0);
        if (steps.length === 0) {
            App.toast('Enter at least one step.', 'error');
            return;
        }

        try {
            const result = await API.skillAdd(name, description, steps);
            App.toast(result.message, 'success');
            document.getElementById('skill-name').value = '';
            document.getElementById('skill-description').value = '';
            document.getElementById('skill-steps').value = '';
            await BrainPage.loadSkills();
        } catch (err) {
            App.toast('Failed: ' + err.message, 'error');
        }
    },

    async deleteSkill(name) {
        try {
            await API.skillDelete(name);
            App.toast(`Skill "${name}" deleted.`, 'success');
            await BrainPage.loadSkills();
        } catch (err) {
            App.toast('Failed: ' + err.message, 'error');
        }
    },
};
