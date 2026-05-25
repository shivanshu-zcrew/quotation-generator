const logger = require('../config/logger');

class LoggerHelper {
  static logOperation(operation, data, req) {
    logger.info(`${operation} executed`, {
      operation,
      data,
      userId: req.user?.id,
      companyId: req.headers['x-company-id'],
      ip: req.ip
    });
  }
  
  static logError(operation, error, req) {
    logger.error(`${operation} failed: ${error.message}`, {
      operation,
      error: error.stack,
      userId: req.user?.id,
      companyId: req.headers['x-company-id'],
      ip: req.ip
    });
  }
  
  static logDBQuery(model, operation, filter, duration) {
    logger.debug(`Database ${operation} on ${model}`, {
      model,
      operation,
      filter,
      duration: `${duration}ms`
    });
  }
  
  static logExternalAPI(service, endpoint, method, duration, status) {
    logger.info(`External API call to ${service}`, {
      service,
      endpoint,
      method,
      duration: `${duration}ms`,
      status
    });
  }
}

module.exports = LoggerHelper;