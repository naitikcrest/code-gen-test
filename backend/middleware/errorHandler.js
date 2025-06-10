const errorHandler = (err, req, res, next) => {
  console.error('Error:', err);

  // Default error
  let error = {
    status: 500,
    message: 'Internal Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  };

  // Validation errors
  if (err.name === 'ValidationError') {
    error.status = 400;
    error.message = 'Validation Error';
    error.details = Object.values(err.errors).map(val => val.message);
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    error.status = 401;
    error.message = 'Invalid token';
  }

  if (err.name === 'TokenExpiredError') {
    error.status = 401;
    error.message = 'Token expired';
  }

  // PostgreSQL errors
  if (err.code === '23505') { // Unique constraint violation
    error.status = 409;
    error.message = 'Resource already exists';
  }

  if (err.code === '23503') { // Foreign key constraint violation
    error.status = 400;
    error.message = 'Invalid reference';
  }

  if (err.code === '23502') { // Not null constraint violation
    error.status = 400;
    error.message = 'Required field missing';
  }

  // Multer errors (file upload)
  if (err.code === 'LIMIT_FILE_SIZE') {
    error.status = 413;
    error.message = 'File too large';
  }

  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    error.status = 400;
    error.message = 'Unexpected file field';
  }

  // Custom application errors
  if (err.status) {
    error.status = err.status;
    error.message = err.message;
  }

  res.status(error.status).json({
    error: error.message,
    ...(error.details && { details: error.details }),
    ...(process.env.NODE_ENV === 'development' && { stack: error.stack }),
    timestamp: new Date().toISOString()
  });
};

module.exports = errorHandler;

