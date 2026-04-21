const Notification = require('../models/notificationModel');

/**
 * Helper to create internal notifications
 * @param {Object} data { recipient, recipient_role, title, message, type, related_id }
 */
const sendNotification = async (data) => {
    try {
        await Notification.create({
            recipient: data.recipient || null,
            recipient_role: data.recipient_role || 'admin',
            title: data.title,
            message: data.message,
            type: data.type || 'system',
            related_id: data.related_id || null
        });
        return true;
    } catch (error) {
        console.error('Notification Error:', error.message);
        return false;
    }
};

module.exports = { sendNotification };
