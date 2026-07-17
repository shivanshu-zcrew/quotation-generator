const jwt = require('jsonwebtoken');
const User = require('../models/user');
const logger = require('../config/logger');

// Protect routes - verify token
exports.protect = async (req, res, next) => {
  let token;

  // Check for token in headers
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    logger.warn(`Unauthorized access attempt - No token provided`, {
      ip: req.ip,
      path: req.path,
      method: req.method
    });
    return res.status(401).json({ message: 'Not authorized to access this route' });
  }

  try {
    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Get user from token
    const user = await User.findById(decoded.id);

    if (!user) {
      logger.warn(`Unauthorized access - User not found for token`, {
        userId: decoded.id,
        ip: req.ip,
        path: req.path
      });
      return res.status(401).json({ message: 'User not found' });
    }

    if (!user.isActive) {
      logger.warn(`Deactivated account access attempt`, {
        userId: user._id,
        email: user.email,
        ip: req.ip,
        path: req.path
      });
      return res.status(401).json({ message: 'Account is deactivated' });
    }

    req.user = user;
    next();
  } catch (error) {
    logger.warn(`JWT verification failed`, {
      error: error.message,
      ip: req.ip,
      path: req.path,
      tokenPrefix: token?.substring(0, 20) + '...'
    });
    return res.status(401).json({ message: 'Not authorized to access this route' });
  }
};

// Admin only middleware
exports.adminOnly = (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    logger.warn(`Unauthorized admin access attempt`, {
      userId: req.user?._id,
      userEmail: req.user?.email,
      userRole: req.user?.role,
      ip: req.ip,
      path: req.path
    });
    return res.status(403).json({ message: 'Access denied. Admin only.' });
  }
};

exports.opsManagerOrAdmin = (req, res, next) => {
  if (req.user && ['ops_manager', 'admin'].includes(req.user.role)) {
    return next();
  }
  logger.warn(`Unauthorized ops/admin access attempt`, {
    userId: req.user?._id,
    userEmail: req.user?.email,
    userRole: req.user?.role,
    ip: req.ip,
    path: req.path
  });
  res.status(403).json({ message: 'Access denied: Operations Manager or Admin role required' });
};

/**
 * opsManagerOnly
 * Allows access only to users with role === 'ops_manager'
 */
exports.opsManagerOnly = (req, res, next) => {
  if (req.user && req.user.role === 'ops_manager') {
    return next();
  }
  logger.warn(`Unauthorized ops manager access attempt`, {
    userId: req.user?._id,
    userEmail: req.user?.email,
    userRole: req.user?.role,
    ip: req.ip,
    path: req.path
  });
  res.status(403).json({ message: 'Access denied: Operations Manager role required' });
};