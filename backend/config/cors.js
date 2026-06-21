// Single source of truth for allowed cross-origin callers.
//
// CLIENT_ORIGIN may be a single origin or a comma-separated list, e.g.
//   CLIENT_ORIGIN=https://judge.example.com,https://www.judge.example.com
// Both the Express HTTP API (server.js) and the Socket.IO server (socket/index.js)
// use this so the allow-list never drifts between the two.
const getAllowedOrigins = () =>
  (process.env.CLIENT_ORIGIN || 'http://localhost:8080')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

module.exports = { getAllowedOrigins };
