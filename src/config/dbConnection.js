const { Sequelize } = require('sequelize');

// Database connection URL from environment
const DATABASE_URL =
  process.env.DATABASE_URL || 'postgres://username:password@localhost:5432/database_name';

const isProduction = process.env.NODE_ENV === 'production';

// Calculate optimal pool size: (CPU cores × 2) + effective_spindle_count
// For most servers: 4-8 cores = 10-20 max connections
const sequelize = new Sequelize(DATABASE_URL, {
  dialect: 'postgres',

  // Connection pool configuration
  pool: {
    max: 20, // Maximum connections in pool
    min: 5, // Minimum connections to maintain
    acquire: 60000, // Maximum time (ms) to get connection before timeout
    idle: 10000, // Time (ms) before releasing idle connection
    evict: 1000, // Time interval (ms) to check for idle connections
  },

  // Query execution settings
  dialectOptions: {
    statement_timeout: 30000, // Query timeout: 30 seconds
    idle_in_transaction_session_timeout: 60000, // Transaction timeout
    ...(isProduction && {
      ssl: {
        require: true,
        rejectUnauthorized: false, // For hosted databases (AWS RDS, etc)
      },
    }),
  },

  // Logging
  logging: isProduction ? false : console.log,

  // Performance optimizations
  benchmark: !isProduction, // Log query execution time in dev

  // Retry configuration
  retry: {
    max: 3, // Maximum retry attempts
    match: [
      /SequelizeConnectionError/,
      /SequelizeConnectionRefusedError/,
      /SequelizeHostNotFoundError/,
      /SequelizeHostNotReachableError/,
      /SequelizeInvalidConnectionError/,
      /SequelizeConnectionTimedOutError/,
      /TimeoutError/,
    ],
  },

  // Define options
  define: {
    timestamps: true, // Add createdAt/updatedAt
    underscored: true, // Use snake_case for columns
    freezeTableName: true, // Prevent table name pluralization
  },
});

// Test database connection
const testConnection = async () => {
  try {
    await sequelize.authenticate();
    console.log('✓ Database connection established successfully');

    // Log pool stats in development
    if (!isProduction) {
      console.log('Pool configuration:', {
        max: sequelize.config.pool.max,
        min: sequelize.config.pool.min,
        acquire: sequelize.config.pool.acquire,
        idle: sequelize.config.pool.idle,
      });
    }
  } catch (error) {
    console.error('✗ Unable to connect to database:', error.message);
    process.exit(1);
  }
};

// Graceful shutdown handler
const closeConnection = async () => {
  try {
    await sequelize.close();
    console.log('Database connection closed gracefully');
  } catch (error) {
    console.error('Error closing database connection:', error);
  }
};

module.exports = { sequelize, testConnection, closeConnection };
