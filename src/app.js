const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const morgan = require("morgan");

const app = express();

const NODE_ENV = process.env.NODE_ENV || "development";

app.use(helmet());
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "http://localhost:3000",
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
