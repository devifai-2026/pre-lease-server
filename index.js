require("dotenv").config();
const http = require("http");
const app = require("./src/app");
const {
  testConnection,
  closeConnection,
} = require("./src/config/dbConnection");
const { connectMongo, closeMongo } = require("./src/config/mongoConnection");
const { initSocket } = require("./src/config/socket");

const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || "development";

testConnection();
connectMongo();

const server = http.createServer(app);
initSocket(server);

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT} in ${NODE_ENV} mode`);
});

const gracefulShutdown = async (signal) => {
  console.log(`${signal} received, shutting down gracefully`);

  server.close(async () => {
    console.log("HTTP server closed");
    await closeConnection();
    await closeMongo();
    console.log("All resources released, exiting");
    process.exit(0);
  });

  setTimeout(() => {
    console.error("Forcing shutdown due to timeout");
    process.exit(1);
  }, 30000);
};

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
