require('dotenv').config();
const app = require('./src/app');
const { testConnection, closeConnection } = require('./src/config/dbConnection');

const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';

testConnection();

const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT} in ${NODE_ENV} mode`);
});

const gracefulShutdown = async signal => {
  console.log(`${signal} received, shutting down gracefully`);

  server.close(async () => {
    console.log('HTTP server closed');
    await closeConnection();
    console.log('All resources released, exiting');
    process.exit(0);
  });

  setTimeout(() => {
    console.error('Forcing shutdown due to timeout');
    process.exit(1);
  }, 30000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
