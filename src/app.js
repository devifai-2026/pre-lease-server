const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const morgan = require("morgan");
const { sequelize } = require("./config/dbConnection");
// const { testDbConnection } = require("./config/dbConnection");
// testDbConnection();
const app = express();

// ── Auto-migration: ensure deleted_at column exists on users ───────────────
(async () => {
  try {
    await sequelize.query(
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL`
    );
    console.log("✓ Migration: deleted_at column ensured on users table");
  } catch (e) {
    console.warn("Migration warning (deleted_at):", e.message);
  }
})();

// ── Auto-migration: ensure 'denied' value exists in note_status enum ────────
(async () => {
  try {
    await sequelize.query(
      `ALTER TYPE note_status ADD VALUE IF NOT EXISTS 'denied'`
    );
    console.log("✓ Migration: 'denied' added to note_status enum");
  } catch (e) {
    console.warn("Migration warning (note_status enum):", e.message);
  }
})();

const NODE_ENV = process.env.NODE_ENV || "development";
app.use(helmet());
app.use(
  cors({
    origin: [
      /^http:\/\/localhost(:\d+)?$/,
      /^http:\/\/127\.0\.0\.1(:\d+)?$/,
      "https://starlit-parfait-041a93.netlify.app",
      "https://prelease-admin-qa.netlify.app",
      process.env.CORS_ORIGIN,
    ].filter(Boolean),
    credentials: true,
  })
);
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

if (NODE_ENV === "development") {
  app.use(morgan("dev"));
} else {
  app.use(morgan("combined"));
}
console.log(process.env.DATABASE_URL, "DATABASE_URL");
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    timestamp: new Date().toISOString(),
    environment: NODE_ENV,
  });
});

const v1Routes = require("./routers/router");
app.use("/api/v1", v1Routes);

// 404 Handler - Must be after all routes
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "The requested resource does not exist",
  });
});

// Global Error Handler - Must be last
app.use((err, req, res, next) => {
  // Log error for debugging (only in development)
  if (NODE_ENV === "development") {
    console.error("Error:", err.stack);
  } else {
    console.error("Error:", err.message);
  }

  // Get status code from error or default to 500
  const statusCode = err.statusCode || 500;

  // Base response object
  const response = {
    success: false,
    message: err.message || "Internal Server Error",
  };

  // Add expired flag if present (for JWT token expiry)
  if (err.expired) {
    response.expired = true;
  }

  // In development: show full error details
  if (NODE_ENV === "development") {
    response.stack = err.stack;
  }

  // In production: hide internal error details for security
  if (NODE_ENV === "production" && !err.isOperational) {
    response.message = "Internal Server Error";
  }

  res.status(statusCode).json(response);
});

module.exports = app;
