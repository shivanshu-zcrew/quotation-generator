const morgan = require('morgan');
const logger = require('../config/logger');

// Create morgan middleware with custom format
const httpLogger = morgan(
  ':method :url :status :res[content-length] - :response-time ms',
  {
    stream: logger.stream,
    skip: (req) => req.originalUrl === '/health' || req.originalUrl === '/'
  }
);

// Custom request logger with detailed info
const requestLogger = (req, res, next) => {
  const start = Date.now();
  
  // Log request
  logger.debug(`${req.method} ${req.originalUrl}`, {
    method: req.method,
    url: req.originalUrl,
    query: req.query,
    body: req.method === 'POST' || req.method === 'PUT' ? req.body : undefined,
    ip: req.ip,
    userAgent: req.get('user-agent'),
    companyId: req.headers['x-company-id']
  });
  
  // Capture response
  const originalSend = res.send;
  res.send = function(data) {
    const duration = Date.now() - start;
    
    // Log response
    const logLevel = res.statusCode >= 400 ? 'error' : 'info';
    logger[logLevel](`${req.method} ${req.originalUrl} - ${res.statusCode} (${duration}ms)`, {
      method: req.method,
      url: req.originalUrl,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      companyId: req.headers['x-company-id']
    });
    
    originalSend.call(this, data);
  };
  
  next();
};

module.exports = { httpLogger, requestLogger };