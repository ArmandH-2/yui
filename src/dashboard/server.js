/**
 * Dashboard Server — Express server for the Yui web dashboard.
 * Serves static frontend from public/ and REST API from api.js.
 */

const express = require('express');
const path = require('path');
const createApiRouter = require('./api');

const PORT = 3000;

/**
 * Start the dashboard server.
 * @param {object} deps - Shared dependencies from index.js
 * @returns {http.Server}
 */
function startDashboard(deps) {
    const app = express();

    // Middleware
    app.use(express.json());

    // API routes
    app.use('/api', createApiRouter(deps));

    // Static frontend
    app.use(express.static(path.join(__dirname, 'public')));

    // SPA fallback — serve index.html for all non-API routes
    app.get('/*path', (req, res) => {
        res.sendFile(path.join(__dirname, 'public', 'index.html'));
    });

    const server = app.listen(PORT, () => {
        console.log(`[Dashboard] 🌐 Web dashboard running at http://localhost:${PORT}`);
    });

    return server;
}

module.exports = startDashboard;
