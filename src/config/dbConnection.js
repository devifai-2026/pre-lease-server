const { Sequelize } = require("sequelize");
const { Pool } = require("pg");

// Database connection URL from environment
const DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgres://username:password@localhost:5432/database_name";

const isProduction = process.env.NODE_ENV === "production";

// === Sequelize ORM Connection ===
const sequelize = new Sequelize(DATABASE_URL, {
  dialect: "postgres",

  pool: {
    max: 20,
    min: 5,
    acquire: 60000,
    idle: 10000,
    evict: 1000,
  },

  dialectOptions: {
    statement_timeout: 30000,
    idle_in_transaction_session_timeout: 60000,
    ...(isProduction && {
      ssl: {
        require: true,
        rejectUnauthorized: false,
      },
    }),
  },

  logging: isProduction ? false : console.log,
  benchmark: !isProduction,

  retry: {
    max: 3,
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

  define: {
    timestamps: true,
    underscored: true,
    freezeTableName: true,
  },
});

// Test Sequelize connection
const testConnection = async () => {
  try {
    await sequelize.authenticate();
    console.log("Database connection established successfully");

    if (!isProduction) {
      console.log("Pool configuration:", {
        max: sequelize.config.pool.max,
        min: sequelize.config.pool.min,
        acquire: sequelize.config.pool.acquire,
        idle: sequelize.config.pool.idle,
      });
    }
  } catch (error) {
    console.error("Unable to connect to database:", error.message);
  }
};

// Graceful shutdown handler
const closeConnection = async () => {
  try {
    await sequelize.close();
    console.log("Database connection closed gracefully");
  } catch (error) {
    console.error("Error closing database connection:", error);
  }
};

// === Raw PG Pool Connection ===
const getPool = async () => {
  const pool = new Pool({
    host: process.env.db_host,
    port: 5432,
    user: process.env.db_user,
    password: process.env.db_password,
    database: process.env.db_name,
    ssl: {
      rejectUnauthorized: false,
    },
  });
  return pool;
};

const testDbConnection = async () => {
  try {
    const pool = await getPool();
    await pool.query("SELECT NOW()");
    console.log("Database (pg) connected successfully");
  } catch (err) {
    console.error("Database (pg) connection failed:", err.message);
  }
};

module.exports = {
  sequelize,
  testConnection,
  closeConnection,
  getPool,
  testDbConnection,
};
