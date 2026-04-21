const Notification = require('../models/notificationModel');
const User = require('../models/userModel');
const { sendNotification } = require('../utils/notificationHelper');

// @desc    Get notifications for logged in user/admin
// @route   GET /api/notifications
// @access  Private
exports.getNotifications = async (req, res) => {
    try {
        let query = {};
        
        if (req.user && req.user.role === 'admin') {
            query.recipient_role = 'admin';
        } else if (req.franchise) {
            query.recipient = req.franchise.id;
        } else {
            query.recipient = req.user.id;
        }

        const notifications = await Notification.find(query).sort('-createdAt').limit(50);
        
        const unreadCount = await Notification.countDocuments({ ...query, isRead: false });

        res.status(200).json({ 
            success: true, 
            unread_count: unreadCount,
            data: notifications 
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Mark notification as read
// @route   PATCH /api/notifications/:id/read
// @access  Private
exports.markAsRead = async (req, res) => {
    try {
        const notification = await Notification.findByIdAndUpdate(
            req.params.id,
            { isRead: true },
            { new: true }
        );

        if (!notification) {
            return res.status(404).json({ success: false, message: 'Notification not found' });
        }

        res.status(200).json({ success: true, message: 'Marked as read' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Mark all as read
// @route   PATCH /api/notifications/read-all
// @access  Private
exports.markAllRead = async (req, res) => {
    try {
        let query = {};
        if (req.user && req.user.role === 'admin') {
            query.recipient_role = 'admin';
        } else if (req.franchise) {
            query.recipient = req.franchise.id;
        } else {
            query.recipient = req.user.id;
        }

        await Notification.updateMany(query, { isRead: true });

        res.status(200).json({ success: true, message: 'All notifications marked as read' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Delete notification
// @route   DELETE /api/notifications/:id
// @access  Private
exports.deleteNotification = async (req, res) => {
    try {
        await Notification.findByIdAndDelete(req.params.id);
        res.status(200).json({ success: true, message: 'Notification deleted' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Broadcast notification (Admin only)
// @route   POST /api/notifications/broadcast
// @access  Private/Admin
exports.broadcastNotification = async (req, res) => {
    try {
        const { title, message } = req.body;
        
        // Find all users
        const users = await User.find({ role: 'user' });
        
        // In a real app, you'd use a background job, but for now:
        const notifications = users.map(u => ({
            recipient: u._id,
            recipient_role: 'user',
            title,
            message,
            type: 'broadcast'
        }));

        await Notification.insertMany(notifications);

        res.status(200).json({ success: true, message: `Broadcast sent to ${users.length} users` });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
