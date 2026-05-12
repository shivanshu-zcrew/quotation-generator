const express = require('express');
const router = express.Router();
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
} = require('../controllers/authController');
const { protect, adminOnly } = require('../middleware/auth');

// ═════════════════════════════════════════════════════════════════════════
// PUBLIC ROUTES
// ═════════════════════════════════════════════════════════════════════════
router.post('/register', register);
router.post('/login', login);
router.put('/reset-password', resetPasswordWithToken);

// ═════════════════════════════════════════════════════════════════════════
// PROTECTED ROUTES (Authenticated users)
// ═════════════════════════════════════════════════════════════════════════
router.get('/me', protect, getMe);
router.put('/updatedetails', protect, updateDetails);  // Users update themselves
router.put('/updatepassword', protect, updatePassword);
router.put('/force-change-password', protect, forceChangePassword);

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