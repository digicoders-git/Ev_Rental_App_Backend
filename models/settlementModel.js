const mongoose = require('mongoose');

const settlementSchema = new mongoose.Schema({
    settlement_id: {
        type: String,
        unique: true,
        required: true
    },
    franchise: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'FranchiseStore',
        required: true
    },
    total_collected: {
        type: Number,
        required: true
    },
    platform_fee_percentage: {
        type: Number,
        default: 8 // 8% commission
    },
    commission_deducted: {
        type: Number,
        required: true
    },
    final_payout: {
        type: Number,
        required: true
    },
    date_from: {
        type: Date,
        required: true
    },
    date_to: {
        type: Date,
        required: true
    },
    status: {
        type: String,
        enum: ['pending', 'completed', 'failed'],
        default: 'completed'
    },
    transaction_reference: {
        type: String
    }
}, { timestamps: true });

module.exports = mongoose.model('Settlement', settlementSchema);
