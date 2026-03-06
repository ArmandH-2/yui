const { embed } = require('../ai/llm');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');

const STORE_PATH = path.join(__dirname, '..', '..', 'data', 'memories.json');

/**
 * Local JSON-based vector store (fallback when ChromaDB is unavailable).
 * Stores documents with embeddings and performs cosine similarity search.
 */
class LocalVectorStore {
    constructor() {
        this.documents = [];
        this._load();
    }

    _load() {
        try {
            if (fs.existsSync(STORE_PATH)) {
                this.documents = JSON.parse(fs.readFileSync(STORE_PATH, 'utf-8'));
                console.log(`[VectorStore] Loaded ${this.documents.length} memories from disk.`);
            }
        } catch (err) {
            console.error('[VectorStore] Failed to load store:', err.message);
            this.documents = [];
        }
    }

    _save() {
        try {
            const dir = path.dirname(STORE_PATH);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(STORE_PATH, JSON.stringify(this.documents, null, 2));
        } catch (err) {
            console.error('[VectorStore] Failed to save store:', err.message);
        }
    }

    /**
     * Add a document with its embedding.
     */
    async add(text, metadata = {}) {
        const embedding = await embed(text);
        const doc = {
            id: uuidv4(),
            text,
            metadata: { ...metadata, timestamp: Date.now() },
            embedding,
        };
        this.documents.push(doc);
        this._save();
        return doc.id;
    }

    /**
     * Search for similar documents using cosine similarity.
     */
    async search(query, topK = 5) {
        if (this.documents.length === 0) return [];

        const queryEmbedding = await embed(query);

        const scored = this.documents.map((doc) => ({
            ...doc,
            score: cosineSimilarity(queryEmbedding, doc.embedding),
        }));

        scored.sort((a, b) => b.score - a.score);

        return scored.slice(0, topK).map((doc) => ({
            id: doc.id,
            text: doc.text,
            metadata: doc.metadata,
            score: doc.score,
        }));
    }

    /**
     * Delete a document by ID.
     */
    delete(id) {
        this.documents = this.documents.filter((d) => d.id !== id);
        this._save();
    }

    /**
     * Get total document count.
     */
    count() {
        return this.documents.length;
    }

    /**
     * List all documents (paginated, newest first). No embedding needed.
     * @param {number} [limit=50]
     * @param {number} [offset=0]
     * @returns {{ items: Array, total: number }}
     */
    listAll(limit = 50, offset = 0) {
        const sorted = [...this.documents].sort((a, b) => (b.metadata.timestamp || 0) - (a.metadata.timestamp || 0));
        return {
            items: sorted.slice(offset, offset + limit).map(d => ({
                id: d.id,
                text: d.text,
                category: d.metadata.category || 'note',
                timestamp: d.metadata.timestamp,
            })),
            total: this.documents.length,
        };
    }
}

/**
 * Compute cosine similarity between two vectors.
 */
function cosineSimilarity(a, b) {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
        dotProduct += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }

    normA = Math.sqrt(normA);
    normB = Math.sqrt(normB);

    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (normA * normB);
}

module.exports = LocalVectorStore;
