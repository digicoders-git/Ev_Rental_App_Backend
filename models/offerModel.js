const mongoose = require('mongoose');

const offerSchema = new mongoose.Schema({
    title: {
        type: String,
        required: [true, 'Please add a title for the offer'],
        trim: true
    },
    offer_type: {
        type: String,
        enum: ['discount_percentage', 'flat_discount'],
        required: true
    },
    coupon_code: {
        type: String,
        unique: true,
        trim: true,
        uppercase: true
    },
    min_booking_amount: {
        type: Number,
        default: 0
    },
    usage_limit: {
        type: Number,
        default: 0 // 0 means unlimited
    },
    usage_count: {
        type: Number,
        default: 0
    },
    discount_value: {
        type: Number,
        required: true
    },
    max_discount_amount: {
        type: Number,
    },
    applicable_vehicle_ids: [{
        type: String, // Internal vehicle_ids or MongoDB ObjectIds
    }],
    start_date: {
        type: Date,
        required: true
    },
    end_date: {
        type: Date,
        required: true
    },
    status: {
        type: String,
        enum: ['active', 'inactive', 'expired'],
        default: 'active'
    },
    description: {
        type: String
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('Offer', offerSchema);
