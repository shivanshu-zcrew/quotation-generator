const crypto = require('crypto');
const User = require('../models/user');
const jwt = require('jsonwebtoken');
const logger = require('../config/logger');
const { Quotation } = require('../models/quotation');

// ============================================================
// HELPER FUNCTIONS
// ============================================================

const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d'
  });
};

const checkEmailExists = async (email, excludeUserId = null) => {
  const query = { email };
  if (excludeUserId) query._id = { $ne: excludeUserId };
  return await User.findOne(query);
};

const checkPhoneExists = async (phone, excludeUserId = null) => {
  if (!phone) return null;
  const query = { phone };
  if (excludeUserId) query._id = { $ne: excludeUserId };
  return await User.findOne(query);
};

// ============================================================
// PUBLIC ROUTES
// ============================================================

// @desc    Register user
// @route   POST /api/auth/register
exports.register = async (req, res) => {
  try {
    const { name, email, phone, password, designation, role: requestedRole } = req.body;

    // Role assignment during registration is disabled for security.
    // Use the admin panel to update user roles after creation.
    const assignedRole = 'user'; // always default; admins use a separate endpoint

    if (await checkEmailExists(email)) {
      return res.status(400).json({ message: 'User already exists' });
    }

    if (phone && await checkPhoneExists(phone)) {
      return res.status(400).json({ message: 'Phone number already in use' });
    }

    const user = await User.create({
      name,
      email,
      phone: phone || '',
      designation: designation || '',
      password,
      role: assignedRole
    });

    logger.info(`New user registered: ${email} (${user.role})`, {
      userId: user._id,
      email: user.email,
      role: user.role,
      ip: req.ip
    });

    res.status(201).json({
      _id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      designation: user.designation,
      role: user.role,
      token: generateToken(user._id)
    });
  } catch (error) {
    logger.error(`Registration failed for ${req.body.email}`, {
      error: error.message,
      ip: req.ip
    });
    res.status(500).json({ message: 'Error registering user', error: error.message });
  }
};

// @desc    Login user
// @route   POST /api/auth/login
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email }).select('+password');
    
    if (!user || !(await user.comparePassword(password))) {
      logger.warn(`Failed login attempt for ${email}`, { ip: req.ip });
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    if (!user.isActive) {
      logger.warn(`Deactivated account login attempt: ${email}`, { ip: req.ip });
      return res.status(401).json({ message: 'Account is deactivated. Contact admin.' });
    }

    user.lastLogin = new Date();
    await user.save({ validateBeforeSave: false });

    logger.info(`User logged in: ${email} (${user.role})`, {
      userId: user._id,
      email: user.email,
      role: user.role,
      ip: req.ip
    });

    res.json({
      _id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      token: generateToken(user._id)
    });
  } catch (error) {
    logger.error(`Login error for ${req.body.email}`, {
      error: error.message,
      ip: req.ip
    });
    res.status(500).json({ message: 'Error logging in', error: error.message });
  }
};

// @desc    Reset password using token
// @route   PUT /api/auth/reset-password
exports.resetPasswordWithToken = async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword || newPassword.length < 6) {
      return res.status(400).json({ message: 'Token and password (min 6 chars) are required' });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      return res.status(401).json({ message: 'Invalid or expired reset token' });
    }

    const user = await User.findOne({
      _id: decoded.id,
      passwordResetToken: token,
      passwordResetExpires: { $gt: new Date() }
    });

    if (!user) {
      return res.status(401).json({ message: 'Invalid or expired reset token' });
    }

    user.password = newPassword;
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save();

    logger.info(`Password reset completed for user: ${user.email}`, {
      userId: user._id,
      email: user.email,
      ip: req.ip
    });

    res.json({
      message: 'Password reset successfully',
      token: generateToken(user._id),
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role
      }
    });
  } catch (error) {
    logger.error(`Password reset error`, { error: error.message, ip: req.ip });
    res.status(500).json({ message: 'Error resetting password', error: error.message });
  }
};

// ============================================================
// PROTECTED ROUTES (USER)
// ============================================================

// @desc    Get current user
// @route   GET /api/auth/me
exports.getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching user', error: error.message });
  }
};

// @desc    Update own profile (user)
// @route   PUT /api/auth/updatedetails
exports.updateDetails = async (req, res) => {
  try {
    const { name, email, phone } = req.body;

    if (email && await checkEmailExists(email, req.user.id)) {
      return res.status(400).json({ message: 'Email already in use' });
    }

    if (phone && await checkPhoneExists(phone, req.user.id)) {
      return res.status(400).json({ message: 'Phone number already in use' });
    }

    const fieldsToUpdate = { name, email, phone };
    Object.keys(fieldsToUpdate).forEach(key => 
      fieldsToUpdate[key] === undefined && delete fieldsToUpdate[key]
    );

    const user = await User.findByIdAndUpdate(req.user.id, fieldsToUpdate, {
      new: true,
      runValidators: true
    });

    logger.info(`User profile updated: ${user.email}`, {
      userId: user._id,
      email: user.email,
      updatedFields: Object.keys(fieldsToUpdate)
    });

    res.json(user);
  } catch (error) {
    res.status(500).json({ message: 'Error updating profile', error: error.message });
  }
};

// @desc    Update password
// @route   PUT /api/auth/updatepassword
exports.updatePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword || newPassword.length < 6) {
      return res.status(400).json({ message: 'Current password and new password (min 6 chars) are required' });
    }

    const user = await User.findById(req.user.id).select('+password');

    if (!(await user.comparePassword(currentPassword))) {
      return res.status(401).json({ message: 'Current password is incorrect' });
    }

    user.password = newPassword;
    await user.save();

    logger.info(`Password changed for user: ${user.email}`, {
      userId: user._id,
      email: user.email
    });

    res.json({ message: 'Password updated successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error updating password', error: error.message });
  }
};

// @desc    Force password change (for temporary passwords)
// @route   PUT /api/auth/force-change-password
exports.forceChangePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword || newPassword.length < 6) {
      return res.status(400).json({ message: 'Current password and new password (min 6 chars) are required' });
    }

    const user = await User.findById(req.user.id).select('+password');

    if (!(await user.comparePassword(currentPassword))) {
      return res.status(401).json({ message: 'Current password is incorrect' });
    }

    user.password = newPassword;
    user.mustChangePassword = false;
    await user.save();

    logger.info(`Force password change completed for user: ${user.email}`, {
      userId: user._id,
      email: user.email
    });

    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error changing password', error: error.message });
  }
};

// ============================================================
// ADMIN ROUTES
// ============================================================

// @desc    Get all users
// @route   GET /api/auth/users
exports.getAllUsers = async (req, res) => {
  try {
    const users = await User.find().select('-password');
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching users', error: error.message });
  }
};

// @desc    Get single user
// @route   GET /api/auth/users/:id
exports.getUserById = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching user', error: error.message });
  }
};

// @desc    Update user (admin only)
// @route   PUT /api/auth/users/:id
exports.adminUpdateUser = async (req, res) => {
  try {
    const { name, email, phone, designation, role, isActive } = req.body;

    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Check email uniqueness
    if (email && email !== user.email && await checkEmailExists(email, req.params.id)) {
      return res.status(400).json({ message: 'Email already in use' });
    }

    // Check phone uniqueness
    if (phone && phone !== user.phone && await checkPhoneExists(phone, req.params.id)) {
      return res.status(400).json({ message: 'Phone number already in use' });
    }

    const oldRole = user.role;
    const oldStatus = user.isActive;

    // Update fields
    if (name) user.name = name;
    if (email) user.email = email;
    if (phone !== undefined) user.phone = phone;
    if (designation !== undefined) user.designation = designation;
    if (role) user.role = role;
    if (isActive !== undefined) user.isActive = isActive;

    await user.save();

    logger.info(`User updated by admin: ${user.email}`, {
      userId: user._id,
      updatedBy: req.user.id,
      changes: {
        role: oldRole !== user.role ? { from: oldRole, to: user.role } : undefined,
        status: oldStatus !== user.isActive ? { from: oldStatus, to: user.isActive } : undefined,
        email: email !== user.email ? { from: user.email, to: email } : undefined
      }
    });

    res.json({
      message: 'User updated successfully',
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        designation: user.designation,
        role: user.role,
        isActive: user.isActive
      }
    });
  } catch (error) {
    logger.error(`Admin user update failed`, {
      error: error.message,
      userId: req.params.id,
      adminId: req.user.id
    });
    res.status(500).json({ message: 'Error updating user', error: error.message });
  }
};

// @desc    Delete user
// @route   DELETE /api/auth/users/:id
exports.deleteUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (user._id.toString() === req.user.id) {
      return res.status(400).json({ message: 'You cannot delete your own account' });
    }

 
    // Check as creator
    const quotationsAsCreator = await Quotation.countDocuments({ 
      createdBy: user._id 
    });
    
    // Check as approver
    const quotationsAsApprover = await Quotation.countDocuments({ 
      approvedBy: user._id 
    });
    
    // Check as ops approver
    const quotationsAsOpsApprover = await Quotation.countDocuments({ 
      opsApprovedBy: user._id 
    });
    
    // Check as awarder
    const quotationsAsAwarder = await Quotation.countDocuments({ 
      awardedBy: user._id 
    });

    // Check in company snapshot (if user was a company contact)
    const quotationsAsCompanyContact = await Quotation.countDocuments({
      'companySnapshot.focalPointId': user._id
    });

    const totalQuotations = quotationsAsCreator + quotationsAsApprover + 
                           quotationsAsOpsApprover + quotationsAsAwarder + 
                           quotationsAsCompanyContact;

    if (totalQuotations > 0) {
      return res.status(400).json({ 
        message: `Cannot delete user. User is associated with ${totalQuotations} quotation(s).`,
        details: {
          asCreator: quotationsAsCreator,
          asApprover: quotationsAsApprover,
          asOpsApprover: quotationsAsOpsApprover,
          asAwarder: quotationsAsAwarder,
          asCompanyContact: quotationsAsCompanyContact,
          total: totalQuotations
        }
      });
    }

    await user.deleteOne();
    
    logger.warn(`User deleted by admin: ${user.email}`, {
      userId: user._id,
      deletedBy: req.user.id,
      userEmail: user.email,
      userRole: user.role
    });

    res.json({ 
      message: 'User deleted successfully',
      userId: user._id
    });
  } catch (error) {
    logger.error(`User deletion failed`, {
      error: error.message,
      userId: req.params.id,
      adminId: req.user.id
    });
    res.status(500).json({ message: 'Error deleting user', error: error.message });
  }
};

// @desc    Toggle user status
// @route   PUT /api/auth/users/:id/toggle-status
exports.toggleUserStatus = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const oldStatus = user.isActive;
    user.isActive = !user.isActive;
    await user.save();

    logger.info(`User status toggled by admin: ${user.email}`, {
      userId: user._id,
      toggledBy: req.user.id,
      oldStatus,
      newStatus: user.isActive
    });

    res.json({ 
      message: `User ${user.isActive ? 'activated' : 'deactivated'} successfully`,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        isActive: user.isActive
      }
    });
  } catch (error) {
    logger.error(`User status toggle failed`, {
      error: error.message,
      userId: req.params.id,
      adminId: req.user.id
    });
    res.status(500).json({ message: 'Error toggling user status', error: error.message });
  }
};

// @desc    Change user role
// @route   PUT /api/auth/users/:id/role
exports.changeUserRole = async (req, res) => {
  try {
    const { role } = req.body;
    const validRoles = ['user', 'admin', 'ops_manager'];
    
    if (!validRoles.includes(role)) {
      return res.status(400).json({ message: 'Invalid role' });
    }

    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const oldRole = user.role;
    user.role = role;
    await user.save();

    logger.info(`User role changed by admin: ${user.email}`, {
      userId: user._id,
      changedBy: req.user.id,
      oldRole,
      newRole: role
    });

    res.json({ 
      message: `User role changed to ${role}`,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role
      }
    });
  } catch (error) {
    logger.error(`Role change failed`, {
      error: error.message,
      userId: req.params.id,
      adminId: req.user.id
    });
    res.status(500).json({ message: 'Error changing user role', error: error.message });
  }
};

// @desc    Set user password (admin)
// @route   PUT /api/auth/users/:id/set-password
exports.setUserPassword = async (req, res) => {
  try {
    const { newPassword } = req.body;

    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }

    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    user.password = newPassword;
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save();

    logger.info(`Password set by admin for user: ${user.email}`, {
      userId: user._id,
      setBy: req.user.id,
      targetUser: user.email
    });

    res.json({
      message: `Password updated for ${user.name}`,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone
      }
    });
  } catch (error) {
    logger.error(`Admin password set failed`, {
      error: error.message,
      userId: req.params.id,
      adminId: req.user.id
    });
    res.status(500).json({ message: 'Error setting password', error: error.message });
  }
};

// @desc    Generate temporary password
// @route   POST /api/auth/users/:id/generate-temp-password
exports.getOpsManagers = async (req, res) => {
  try {
    const managers = await User.find({ role: 'ops_manager', isActive: true })
      .select('_id name email')
      .sort({ name: 1 })
      .lean();
    res.json({ success: true, managers });
  } catch (error) {
    logger.error('Failed to fetch ops managers', { error: error.message });
    res.status(500).json({ success: false, message: 'Failed to fetch managers' });
  }
};

exports.generateTemporaryPassword = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const tempPassword = crypto.randomBytes(9).toString('base64url');

    user.password = tempPassword;
    user.mustChangePassword = true;
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save();

    logger.info(`Temporary password generated for user: ${user.email}`, {
      userId: user._id,
      generatedBy: req.user.id,
      targetUser: user.email
    });

    res.json({
      message: `Temporary password generated for ${user.name}`,
      tempPassword,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone
      }
    });
  } catch (error) {
    logger.error(`Temp password generation failed`, {
      error: error.message,
      userId: req.params.id,
      adminId: req.user.id
    });
    res.status(500).json({ message: 'Error generating temp password', error: error.message });
  }
};