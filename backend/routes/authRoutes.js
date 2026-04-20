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
  changeUserRole,
   sendPasswordResetEmail,
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
router.put('/updatedetails', protect, updateDetails);
router.put('/updatepassword', protect, updatePassword);
router.put('/force-change-password', protect, forceChangePassword); 
 
// ═════════════════════════════════════════════════════════════════════════
// ADMIN ONLY ROUTES
// ═════════════════════════════════════════════════════════════════════════
router.get('/users', protect, adminOnly, getAllUsers);
router.put('/users/:id/toggle-status', protect, adminOnly, toggleUserStatus);
router.put('/users/:id/role', protect, adminOnly, changeUserRole);
 
router.post('/users/:id/send-reset-password', protect, adminOnly, sendPasswordResetEmail);
router.put('/users/:id/set-password', protect, adminOnly, setUserPassword);
router.post('/users/:id/generate-temp-password', protect, adminOnly, generateTemporaryPassword);
 
module.exports = router;