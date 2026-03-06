const LocalVectorStore = require('./vectorstore');
const fs = require('fs');
const path = require('path');

/**
 * RAG (Retrieval-Augmented Generation) engine.
 * Manages Yui's long-term memory — past incidents, rules, interactions, and notes.
 */
class RAGEngine {
    constructor() {
        this.store = new LocalVectorStore();
    }

    /**
     * Add a memory to the store.
     * @param {string} text - The information to remember
     * @param {string} [category='note'] - One of: incident, rule, interaction, note
     * @returns {Promise<string>} The memory ID
     */
    async addMemory(text, category = 'note') {
        console.log(`[RAG] Saving memory [${category}]: ${text.substring(0, 80)}...`);
        return this.store.add(text, { category });
    }

    /**
     * Search memories by semantic similarity.
     * @param {string} query - Natural language search query
     * @param {number} [topK=5] - Number of results to return
     * @returns {Promise<Array<{text: string, category: string, score: number}>>}
     */
    async searchMemory(query, topK = 5) {
        console.log(`[RAG] Searching for: "${query}"`);
        const results = await this.store.search(query, topK);

        return results.map((r) => ({
            id: r.id,
            text: r.text,
            category: r.metadata.category || 'note',
            timestamp: r.metadata.timestamp,
            score: r.score,
        }));
    }

    /**
     * Ingest a document file into memory (line-by-line for rules, paragraph-by-paragraph for others).
     * @param {string} filePath - Path to the document
     * @param {string} [category='rule'] - Category to assign
     */
    async ingestDocument(filePath, category = 'rule') {
        console.log(`[RAG] Ingesting document: ${filePath}`);
        const content = fs.readFileSync(filePath, 'utf-8');

        // Split into chunks (paragraphs separated by blank lines)
        const chunks = content
            .split(/\n\s*\n/)
            .map((c) => c.trim())
            .filter((c) => c.length > 10);

        console.log(`[RAG] Ingesting ${chunks.length} chunks from ${path.basename(filePath)}...`);

        for (const chunk of chunks) {
            await this.addMemory(chunk, category);
        }

        console.log(`[RAG] Document ingestion complete.`);
    }

    /**
     * Delete a memory by ID.
     */
    deleteMemory(id) {
        this.store.delete(id);
    }

    /**
     * Get total memory count.
     */
    getMemoryCount() {
        return this.store.count();
    }

    /**
     * Format search results for inclusion in an LLM prompt context.
     * @param {Array} results - Results from searchMemory
     * @returns {string} Formatted context string
     */
    formatContext(results) {
        if (results.length === 0) return 'No relevant memories found.';

        return results
            .map((r, i) => {
                const date = new Date(r.timestamp).toLocaleDateString();
                return `[Memory ${i + 1}] (${r.category}, ${date}, relevance: ${(r.score * 100).toFixed(0)}%)\n${r.text}`;
            })
            .join('\n\n');
    }
}

module.exports = RAGEngine;
