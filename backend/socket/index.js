const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const { getAllowedOrigins } = require('../config/cors');

let io = null;

/**
 * Initialise Socket.IO on the given http.Server instance.
 * Call this once after the DB is connected, before server.listen().
 */
function initSocketIO(httpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: getAllowedOrigins(),
      credentials: true,
    },
  });

  // ── Auth middleware ──────────────────────────────────────────────────────────
  // The client sends { auth: { token: '<accessToken>' } } on connect.
  // We decode it and attach user info to the socket so rooms can be scoped per user.
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) {
      // Allow unauthenticated connections — they just won't join a user room.
      // Contest broadcast rooms are still accessible.
      socket.userId = null;
      return next();
    }
    try {
      const payload = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
      socket.userId = payload.id || payload._id || payload.sub || null;
      next();
    } catch {
      // Invalid token — still allow connection but without a userId.
      socket.userId = null;
      next();
    }
  });

  // ── Connection handler ───────────────────────────────────────────────────────
  io.on('connection', (socket) => {
    // Join a private room for this user so we can target events by userId.
    if (socket.userId) {
      socket.join(`user:${socket.userId}`);
    }

    // The client can join a contest room to receive leaderboard updates.
    // Message format: { contestId: '<id>' }
    socket.on('contest:join', ({ contestId } = {}) => {
      if (contestId) socket.join(`contest:${contestId}`);
    });

    socket.on('contest:leave', ({ contestId } = {}) => {
      if (contestId) socket.leave(`contest:${contestId}`);
    });
  });

  console.log('Socket.IO initialised');
  return io;
}

/**
 * Returns the Socket.IO server instance.
 * Throws if initSocketIO() has not been called yet.
 */
function getIO() {
  if (!io) throw new Error('Socket.IO has not been initialised. Call initSocketIO() first.');
  return io;
}

module.exports = { initSocketIO, getIO };
