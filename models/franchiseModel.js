const mongoose = require('mongoose');

const franchiseEnquirySchema = new mongoose.Schema({
    enquiry_id: {
        type: String,
        unique: true
    },
    full_name: {
        type: String,
        required: [true, 'Please add full name'],
        trim: true
    },
    phone_number: {
        type: String,
        required: [true, 'Please add phone number'],
    },
    email: {
        type: String,
        required: [true, 'Please add email'],
    },
    city: {
        type: String,
        required: [true, 'Please add city'],
    },
    state: {
        type: String,
        required: [true, 'Please add state'],
    },
    investment_budget: {
        type: String,
    },
    message: {
        type: String,
    },
    status: {
        type: String,
        enum: ['new', 'contacted', 'interested', 'not_interested', 'converted'],
        default: 'new'
    },
    notes: {
        type: String,
    },
    follow_up_date: {
        type: Date,
    }
}, {
    timestamps: true
});

// Generate unique enquiry_id before saving
franchiseEnquirySchema.pre('save', async function() {
    if (!this.enquiry_id) {
        // Simple unique ID generation: FR + Current Timestamp (last 6 digits)
        const dateStr = Date.now().toString();
        this.enquiry_id = `FR-${dateStr.substring(dateStr.length - 6)}`;
    }
});

module.exports = mongoose.model('FranchiseEnquiry', franchiseEnquirySchema);
