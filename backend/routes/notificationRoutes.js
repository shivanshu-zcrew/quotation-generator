const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');
const { protect } = require('../middleware/auth'); 

// All routes are protected
router.use(protect);

router.get('/', notificationController.getNotifications);
router.get('/unread-count', notificationController.getUnreadCount);
router.get('/:id', notificationController.getNotificationById);

router.put('/:id/read', notificationController.markAsRead);
router.put('/read-all', notificationController.markAllAsRead);
router.put('/:id/archive', notificationController.archiveNotification);

router.delete('/:id', notificationController.deleteNotification);

module.exports = router;