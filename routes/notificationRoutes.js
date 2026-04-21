const express = require('express');
const router = express.Router();
const {
    getNotifications,
    markAsRead,
    markAllRead,
    deleteNotification,
    broadcastNotification
} = require('../controller/notificationController');
const { protect, admin, anyProtect } = require('../middleware/authMiddleware');

router.get('/', anyProtect, getNotifications);
router.patch('/read-all', anyProtect, markAllRead);
router.patch('/:id/read', anyProtect, markAsRead);
router.delete('/:id', anyProtect, deleteNotification);

// Admin only
router.post('/broadcast', protect, admin, broadcastNotification);

module.exports = router;
