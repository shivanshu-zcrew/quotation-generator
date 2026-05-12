const User = require('../models/user');
const jwt = require('jsonwebtoken');

// ============================================================
// HELPER FUNCTIONS
// ============================================================

const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET || 'your-secret-key', {
    expiresIn: '30d'
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
    const { name, email, phone, password, role } = req.body;

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
      password,
      role
    });

    res.status(201).json({
      _id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      token: generateToken(user._id)
    });
  } catch (error) {
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
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    if (!user.isActive) {
      return res.status(401).json({ message: 'Account is deactivated. Contact admin.' });
    }

    user.lastLogin = new Date();
    await user.save({ validateBeforeSave: false });

    res.json({
      _id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      token: generateToken(user._id)
    });
  } catch (error) {
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
      decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
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
    const { name, email, phone, role, isActive } = req.body;
    
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

    // Update fields
    if (name) user.name = name;
    if (email) user.email = email;
    if (phone !== undefined) user.phone = phone;
    if (role) user.role = role;
    if (isActive !== undefined) user.isActive = isActive;

    await user.save();

    res.json({
      message: 'User updated successfully',
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        isActive: user.isActive
      }
    });
  } catch (error) {
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

    await user.deleteOne();
    res.json({ message: 'User deleted successfully' });
  } catch (error) {
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

    user.isActive = !user.isActive;
    await user.save();

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

    user.role = role;
    await user.save();

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
    res.status(500).json({ message: 'Error setting password', error: error.message });
  }
};

// @desc    Generate temporary password
// @route   POST /api/auth/users/:id/generate-temp-password
exports.generateTemporaryPassword = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const tempPassword = Math.random().toString(36).slice(-12);

    user.password = tempPassword;
    user.mustChangePassword = true;
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save();

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
    res.status(500).json({ message: 'Error generating temp password', error: error.message });
  }
};