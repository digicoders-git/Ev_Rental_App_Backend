const mongoose = require('mongoose');

const damageReportSchema = new mongoose.Schema({
    report_id: {
        type: String,
        unique: true
    },
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    vehicle: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Vehicle',
        default: null
    },
    booking: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Booking',
        default: null
    },
    description: {
        type: String,
        default: ''
    },
    photos: [String],
    status: {
        type: String,
        enum: ['pending', 'reviewed', 'resolved'],
        default: 'pending'
    },
    admin_notes: {
        type: String,
        default: ''
    }
}, {
    timestamps: true
});

// Generate Report ID before saving
damageReportSchema.pre('save', async function () {
    if (!this.report_id) {
        const dateStr = Date.now().toString();
        this.report_id = `DR-${dateStr.substring(dateStr.length - 6)}`;
    }
});

module.exports = mongoose.model('DamageReport', damageReportSchema);
