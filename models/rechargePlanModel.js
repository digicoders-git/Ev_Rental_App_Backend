const mongoose = require('mongoose');

const rechargePlanSchema = new mongoose.Schema({
    days: {
        type: String,
        required: [true, 'Please add the duration (e.g., 3 Days)'],
        trim: true
    },
    price: {
        type: Number,
        required: [true, 'Please add a price']
    },
    status: {
        type: String,
        enum: ['active', 'inactive'],
        default: 'active'
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('RechargePlan', rechargePlanSchema);
