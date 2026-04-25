const express = require('express');
const router = express.Router();
const {
    getNotifications,
    markAsRead,
    markAllRead,
    deleteNotification,
    broadcastNotification,
    getBroadcastHistory
} = require('../controller/notificationController');
const { protect, admin, anyProtect } = require('../middleware/authMiddleware');

router.get('/', anyProtect, getNotifications);
router.patch('/read-all', anyProtect, markAllRead);
router.patch('/:id/read', anyProtect, markAsRead);
router.delete('/:id', anyProtect, deleteNotification);

// Admin only
router.get('/broadcast-history', protect, admin, getBroadcastHistory);
router.post('/broadcast', protect, admin, broadcastNotification);

module.exports = router;
