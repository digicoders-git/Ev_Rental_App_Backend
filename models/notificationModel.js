const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
    recipient: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null // null or 'admin' logic if generic
    },
    recipient_role: {
        type: String,
        enum: ['user', 'admin', 'franchise'],
        default: 'admin'
    },
    title: {
        type: String,
        required: true
    },
    message: {
        type: String,
        required: true
    },
    type: {
        type: String,
        enum: ['booking', 'kyc', 'enquiry', 'payment', 'system', 'broadcast'],
        default: 'system'
    },
    related_id: {
        type: String, // ID of booking/kyc/etc
    },
    isRead: {
        type: Boolean,
        default: false
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('Notification', notificationSchema);
