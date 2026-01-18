const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');

const app = express();

const NODE_ENV = process.env.NODE_ENV || 'development';

app.use(helmet());

app.use(
  cors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    credentials: true,
  })
);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

if (NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: NODE_ENV,
  });
});

const v1Routes = require('./routers/router');
app.use('/api/v1', v1Routes);

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'The requested resource does not exist',
  });
});

// Global Error Handler - Updated to work with createAppError
app.use((err, req, res, next) => {
  // Log error for debugging
  console.error(err.stack);

  // Get status code from error or default to 500
  const statusCode = err.statusCode || 500;

  // Response object
  const response = {
    success: false,
    message: err.message || 'Internal Server Error',
  };

  // In development: show full error details
  if (NODE_ENV === 'development') {
    response.stack = err.stack;
  }

  // In production: hide details for operational errors
  if (NODE_ENV === 'production' && !err.isOperational) {
    response.message = 'Internal Server Error';
  }

  res.status(statusCode).json(response);
});

module.exports = app;
