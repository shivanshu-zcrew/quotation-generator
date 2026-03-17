const jwt = require('jsonwebtoken');
const User = require('../models/user');

// Protect routes - verify token
exports.protect = async (req, res, next) => {
  let token;

  // Check for token in headers
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({ message: 'Not authorized to access this route' });
  }

  try {
    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');

    // Get user from token
    const user = await User.findById(decoded.id);

    if (!user) {
      return res.status(401).json({ message: 'User not found' });
    }

    if (!user.isActive) {
      return res.status(401).json({ message: 'Account is deactivated' });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Not authorized to access this route' });
  }
};

// Admin only middleware
exports.adminOnly = (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    return res.status(403).json({ message: 'Access denied. Admin only.' });
  }
};

exports.opsManagerOrAdmin = (req, res, next) => {
  if (req.user && ['ops_manager', 'admin'].includes(req.user.role)) {
    return next();
  }
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
  res.status(403).json({ message: 'Access denied: Operations Manager role required' });
};