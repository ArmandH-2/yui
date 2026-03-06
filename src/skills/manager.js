const fs = require('fs');
const path = require('path');

const SKILLS_PATH = path.join(__dirname, 'skills.json');

/**
 * Skills Manager — reads, writes, and executes multi-step procedures.
 */
class SkillsManager {
    constructor() {
        this.skills = {};
        this._load();
    }

    _load() {
        try {
            if (fs.existsSync(SKILLS_PATH)) {
                this.skills = JSON.parse(fs.readFileSync(SKILLS_PATH, 'utf-8'));
                console.log(`[Skills] Loaded ${Object.keys(this.skills).length} skills.`);
            }
        } catch (err) {
            console.error('[Skills] Failed to load skills:', err.message);
            this.skills = {};
        }
    }

    _save() {
        try {
            fs.writeFileSync(SKILLS_PATH, JSON.stringify(this.skills, null, 2));
        } catch (err) {
            console.error('[Skills] Failed to save skills:', err.message);
        }
    }

    /**
     * List all available skills.
     * @returns {{name: string, description: string}[]}
     */
    listSkills() {
        return Object.entries(this.skills).map(([name, skill]) => ({
            name,
            description: skill.description,
            stepCount: skill.steps.length,
            created: skill.created,
        }));
    }

    /**
     * Get a skill by name.
     * @param {string} name
     * @returns {object|null}
     */
    getSkill(name) {
        return this.skills[name] || null;
    }

    /**
     * Save a new skill or update an existing one.
     * @param {string} name - Skill identifier (snake_case)
     * @param {string} description - Human-readable description
     * @param {string[]} steps - Array of step descriptions/commands
     * @param {string} [author='Yui']
     */
    saveSkill(name, description, steps, author = 'Yui') {
        this.skills[name] = {
            description,
            steps,
            created: new Date().toISOString().split('T')[0],
            author,
        };
        this._save();
        console.log(`[Skills] Saved skill: ${name} (${steps.length} steps)`);
    }

    /**
     * Delete a skill.
     * @param {string} name
     * @returns {boolean}
     */
    deleteSkill(name) {
        if (!this.skills[name]) return false;
        delete this.skills[name];
        this._save();
        console.log(`[Skills] Deleted skill: ${name}`);
        return true;
    }

    /**
     * Execute a skill by running its steps through a command runner.
     * Steps can reference variables with {variable} syntax.
     * @param {string} name - Skill name
     * @param {object} context - Variables to interpolate (e.g., { player: 'Steve' })
     * @param {object} handlers - Object with handler functions: { executeCommand, saveMemory }
     * @returns {Promise<{success: boolean, results: Array}>}
     */
    async executeSkill(name, context = {}, handlers = {}) {
        const skill = this.getSkill(name);
        if (!skill) {
            return { success: false, results: [{ error: `Skill "${name}" not found.` }] };
        }

        console.log(`[Skills] Executing skill: ${name}`);
        const results = [];

        for (const step of skill.steps) {
            // Interpolate variables
            let resolvedStep = step;
            for (const [key, value] of Object.entries(context)) {
                resolvedStep = resolvedStep.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
            }

            // Also replace {date} with current date
            resolvedStep = resolvedStep.replace(/\{date\}/g, new Date().toISOString().split('T')[0]);

            try {
                // Parse the step to determine action
                if (resolvedStep.startsWith('execute_command(')) {
                    const cmd = resolvedStep.match(/execute_command\(['"](.+)['"]\)/)?.[1];
                    if (cmd && handlers.executeCommand) {
                        const result = await handlers.executeCommand(cmd);
                        results.push({ step: resolvedStep, result, success: true });
                    }
                } else if (resolvedStep.startsWith('save_memory(')) {
                    const text = resolvedStep.match(/save_memory\(['"](.+)['"]\)/)?.[1];
                    if (text && handlers.saveMemory) {
                        await handlers.saveMemory(text);
                        results.push({ step: resolvedStep, result: 'Memory saved', success: true });
                    }
                } else {
                    // Generic step — just log it
                    results.push({ step: resolvedStep, result: 'Executed', success: true });
                }
            } catch (err) {
                results.push({ step: resolvedStep, error: err.message, success: false });
            }
        }

        return { success: results.every((r) => r.success), results };
    }

    /**
     * Get skill names for intent routing.
     * @returns {string[]}
     */
    getSkillNames() {
        return Object.keys(this.skills);
    }
}

module.exports = SkillsManager;
