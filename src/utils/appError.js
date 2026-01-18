const createAppError = (message, statusCode) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.isOperational = true;
  Error.captureStackTrace(error, createAppError);
  return error;
};

module.exports = createAppError;
