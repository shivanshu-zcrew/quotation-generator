const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const {
  register,
  login,
  getMe,
  updateDetails,           // For users updating their own profile
  updatePassword,
  getAllUsers,
  getUserById,
  adminUpdateUser,        // For admin updating any user (renamed)
  deleteUser,
  toggleUserStatus,
  changeUserRole,
  setUserPassword,
  resetPasswordWithToken,
  generateTemporaryPassword,
  forceChangePassword,
  getOpsManagers,
} = require('../controllers/authController');
const { protect, adminOnly } = require('../middleware/auth');

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  skipSuccessfulRequests: true,
  message: { success: false, message: 'Too many attempts, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// ═════════════════════════════════════════════════════════════════════════
// PUBLIC ROUTES
// ═════════════════════════════════════════════════════════════════════════
router.post('/register', authLimiter, register);
router.post('/login', authLimiter, login);
router.put('/reset-password', authLimiter, resetPasswordWithToken);

// ═════════════════════════════════════════════════════════════════════════
// PROTECTED ROUTES (Authenticated users)
// ═════════════════════════════════════════════════════════════════════════
router.get('/me', protect, getMe);
router.put('/updatedetails', protect, updateDetails);  // Users update themselves
router.put('/updatepassword', protect, updatePassword);
router.put('/force-change-password', protect, forceChangePassword);
router.get('/ops-managers', protect, getOpsManagers);

// ═════════════════════════════════════════════════════════════════════════
// ADMIN ONLY ROUTES
// ═════════════════════════════════════════════════════════════════════════
router.get('/users', protect, adminOnly, getAllUsers);
router.get('/users/:id', protect, adminOnly, getUserById);
router.put('/users/:id', protect, adminOnly, adminUpdateUser);  // Admin updates any user
router.delete('/users/:id', protect, adminOnly, deleteUser);
router.put('/users/:id/toggle-status', protect, adminOnly, toggleUserStatus);
router.put('/users/:id/role', protect, adminOnly, changeUserRole);
router.put('/users/:id/set-password', protect, adminOnly, setUserPassword);
router.post('/users/:id/generate-temp-password', protect, adminOnly, generateTemporaryPassword);

module.exports = router;