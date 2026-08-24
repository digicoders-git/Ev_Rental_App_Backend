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

        if (!title || !message) {
            return res.status(400).json({ success: false, message: 'Title and message are required' });
        }

        console.log('Received broadcast request:', { title, message, file: req.file ? req.file.filename : 'none' });

        // Build image_url if an image was uploaded
        let image_url = null;
        if (req.file) {
            const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 5002}`;
            image_url = `${baseUrl}/uploads/${req.file.filename}`;
        }

        // Find all active users with a valid fcm_token (including admins/franchises who use the app)
        const users = await User.find({ 
            fcm_token: { $exists: true, $ne: null, $ne: '' } 
        }).select('_id fcm_token');

        if (!users.length) {
            return res.status(404).json({ success: false, message: 'No users found to send broadcast' });
        }

        // Save DB notifications for all users
        const notifications = users.map(u => ({
            recipient: u._id,
            recipient_role: 'user',
            title,
            message,
            image_url,
            type: 'broadcast'
        }));

        await Notification.insertMany(notifications);

        // Send real-time FCM push notifications to all users with a valid token
        const { sendPushNotification } = require('../utils/fcmHelper');
        const fcmPayloadData = { type: 'broadcast' };
        if (image_url) fcmPayloadData.image_url = image_url;

        // Deduplicate fcm_tokens to avoid sending multiple pushes to the same physical device
        const uniqueTokens = [...new Set(users.map(u => u.fcm_token).filter(Boolean))];

        const pushPromises = uniqueTokens.map(token => 
            sendPushNotification(token, title, message, fcmPayloadData)
        );

        await Promise.allSettled(pushPromises);

        res.status(200).json({
            success: true,
            message: `Broadcast sent to ${users.length} users`,
            push_sent: pushPromises.length
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Get unique broadcast history (Admin only)
// @route   GET /api/notifications/broadcast-history
// @access  Private/Admin
exports.getBroadcastHistory = async (req, res) => {
    try {
        const history = await Notification.aggregate([
            { $match: { type: 'broadcast' } },
            {
                $group: {
                    _id: { title: "$title", message: "$message" },
                    createdAt: { $first: "$createdAt" },
                    image_url: { $first: "$image_url" },
                    recipient_count: { $sum: 1 }
                }
            },
            { $sort: { createdAt: -1 } },
            { $limit: 20 }
        ]);

        const formatted = history.map(h => ({
            _id: h._id.title + h.createdAt,
            title: h._id.title,
            message: h._id.message,
            image_url: h.image_url || null,
            createdAt: h.createdAt,
            recipient_count: h.recipient_count,
            type: 'broadcast',
            isRead: true
        }));

        res.status(200).json({ success: true, data: formatted });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
