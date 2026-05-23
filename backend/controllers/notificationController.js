const notification = require("../models/notification");
const Notification  = require('../models/notification');

// Get all notifications for current user
exports.getNotifications = async (req, res) => {
  try {
    const { page = 1, limit = 20, isRead } = req.query;
    const companyId = req.headers['x-company-id'];

    const query = { userId: req.user._id, companyId };
    
    if (isRead === 'true') query.isRead = true;
    if (isRead === 'false') query.isRead = false;

    const notifications = await Notification.find(query)
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit))
      .lean();

    const unreadCount = await notification.countDocuments({
      userId: req.user._id,
      companyId,
      isRead: false
    });

    res.json({
      success: true,
      notifications,
      unreadCount,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        hasMore: notifications.length === Number(limit)
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get unread count only (for bell icon)
exports.getUnreadCount = async (req, res) => {
  try {
    const companyId = req.headers['x-company-id'];
    const count = await Notification.countDocuments({
      userId: req.user._id,
      companyId,
      isRead: false
    });

    res.json({ success: true, unreadCount: count });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Mark single notification as read
exports.markAsRead = async (req, res) => {
  try {
    const { id } = req.params;
    await Notification.findOneAndUpdate(
      { _id: id, userId: req.user._id },
      { isRead: true, readAt: new Date() }
    );
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Mark all notifications as read
exports.markAllAsRead = async (req, res) => {
  try {
    const companyId = req.headers['x-company-id'];
    await Notification.updateMany(
      { userId: req.user._id, companyId, isRead: false },
      { isRead: true, readAt: new Date() }
    );
    res.json({ success: true, message: 'All notifications marked as read' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Delete notification
exports.deleteNotification = async (req, res) => {
  try {
    const { id } = req.params;
    await Notification.findOneAndDelete({ _id: id, userId: req.user._id });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Archive notification
exports.archiveNotification = async (req, res) => {
  try {
    const { id } = req.params;
    await Notification.findOneAndUpdate(
      { _id: id, userId: req.user._id },
      { isArchived: true }
    );
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getNotificationById = async (req, res) => {
  try {
    const notification = await Notification.findOne({
      _id: req.params.id,
      userId: req.user._id
    });

    if (!notification) {
      return res.status(404).json({ success: false, message: 'Notification not found' });
    }

    res.json({ success: true, notification });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};