const mongoose = require('mongoose');

const supportSchema = new mongoose.Schema({
    ticket_id: {
        type: String,
        unique: true
    },
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    category: {
        type: String,
        enum: ['Vehicle Issue', 'Billing/Payment', 'KYC Verification', 'App/Technical', 'Other'],
        required: true
    },
    subject: {
        type: String,
        required: true,
        trim: true
    },
    description: {
        type: String,
        required: true
    },
    attachments: [String], // File paths for screenshots/photos
    booking: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Booking',
        default: null
    },
    priority: {
        type: String,
        enum: ['low', 'medium', 'high'],
        default: 'medium'
    },
    status: {
        type: String,
        enum: ['open', 'in-progress', 'resolved', 'closed'],
        default: 'open'
    },
    admin_reply: {
        type: String,
        default: ''
    },
    resolved_at: {
        type: Date
    }
}, {
    timestamps: true
});

// Generate Ticket ID before saving
supportSchema.pre('save', async function () {
    if (!this.ticket_id) {
        const dateStr = Date.now().toString();
        this.ticket_id = `TKT-${dateStr.substring(dateStr.length - 6)}`;
    }
});

module.exports = mongoose.model('Support', supportSchema);
