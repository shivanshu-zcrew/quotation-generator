const express = require('express');
const router = express.Router();
const {
  register,
  login,
  getMe,
  updateDetails,
  updatePassword,
  getAllUsers,
  toggleUserStatus,
  changeUserRole
} = require('../controllers/authController');
const { protect, adminOnly } = require('../middleware/auth');

// Public routes
router.post('/register', register);
router.post('/login', login);

// Protected routes
router.get('/me', protect, getMe);
router.put('/updatedetails', protect, updateDetails);
router.put('/updatepassword', protect, updatePassword);

// Admin only routes
router.get('/users', protect, adminOnly, getAllUsers);
router.put('/users/:id/toggle-status', protect, adminOnly, toggleUserStatus);
router.put('/users/:id/role', protect, adminOnly, changeUserRole);

module.exports = router;