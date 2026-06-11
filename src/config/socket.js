const { Server } = require("socket.io");
const Token = require("../models/token");

let io = null;

const initSocket = (httpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin: [
        /^http:\/\/localhost(:\d+)?$/,
        /^http:\/\/127\.0\.0\.1(:\d+)?$/,
        process.env.CORS_ORIGIN,
      ].filter(Boolean),
      credentials: true,
    },
  });

  // Authenticate the socket: a valid access token is required, and the client may
  // only join its OWN user room (prevents joining arbitrary user:${id} rooms — IDOR).
  io.use((socket, next) => {
    const token =
      socket.handshake.auth?.token ||
      socket.handshake.query?.token ||
      (socket.handshake.headers?.authorization || "").replace(/^Bearer\s+/i, "");
    if (!token) return next(new Error("Unauthorized: missing token"));
    const result = Token.verifyAccessToken(token);
    if (!result.valid) return next(new Error("Unauthorized: " + result.message));
    socket.userId = result.decoded._id || result.decoded.userId;
    next();
  });

  io.on("connection", (socket) => {
    // Join only the authenticated user's own room.
    if (socket.userId) {
      socket.join(`user:${socket.userId}`);
    }

    // Application-level Ping/Pong for keep-alive and latency checks
    socket.on("ping", () => {
      socket.emit("pong", { timestamp: new Date().toISOString() });
    });

    socket.on("disconnect", () => {
      console.log(`Socket disconnected: ${socket.id}`);
    });
  });

  return io;
};

const getIO = () => {
  if (!io) {
    throw new Error("Socket.IO not initialized. Call initSocket first.");
  }
  return io;
};

module.exports = { initSocket, getIO };
