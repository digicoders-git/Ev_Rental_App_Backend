const mongoose = require('mongoose');

const rentalPlanSchema = new mongoose.Schema({
    plan_name: {
        type: String,
        required: [true, 'Please add a plan name'],
        trim: true
    },
    pricing_type: {
        type: String,
        enum: ['daily', 'weekly', 'monthly', 'custom'],
        required: true
    },
    price: {
        type: Number,
        required: [true, 'Please add a price']
    },
    security_deposit: {
        type: Number,
        default: 0
    },
    min_duration: {
        type: Number, // In days
        default: 1
    },
    max_duration: {
        type: Number, // In days
        default: 30
    },
    grace_period: {
        type: Number, // In minutes
        default: 30
    },
    late_fee_per_hour: {
        type: Number,
        default: 100 // Default late fee ₹100/hr
    },
    status: {
        type: String,
        enum: ['active', 'inactive'],
        default: 'active'
    },
    description: {
        type: String
    },
    features: {
        type: [String],
        default: []
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('RentalPlan', rentalPlanSchema);
