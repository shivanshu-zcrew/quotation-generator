const logger = require('../config/logger');

module.exports = (err, req, res, next) => {
  const status = err.status || err.statusCode || 500;
  if (process.env.NODE_ENV !== 'test') {
    const logFn = status >= 500 ? 'error' : 'warn';
    (logger[logFn] || logger.error).call(logger, { err, path: req.path, method: req.method });
  }
  res.status(status).json({
    success: false,
    message: status < 500 ? (err.message || 'Bad request') : 'Internal server error',
  });
};
