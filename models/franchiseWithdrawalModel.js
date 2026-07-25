const mongoose = require('mongoose');

const franchiseWithdrawalSchema = new mongoose.Schema({
    franchise: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'FranchiseStore',
        required: true
    },
    amount: {
        type: Number,
        required: true
    },
    status: {
        type: String,
        enum: ['pending', 'approved', 'rejected', 'processing', 'released', 'failed'],
        default: 'pending'
    },
    payment_proof: {
        type: String,
        default: ''
    },
    admin_note: {
        type: String,
        default: ''
    },
    withdrawal_id: {
        type: String,
        unique: true
    }
}, {
    timestamps: true
});

// Generate unique withdrawal_id before saving
franchiseWithdrawalSchema.pre('save', async function() {
    if (!this.withdrawal_id) {
        const dateStr = Date.now().toString();
        this.withdrawal_id = `FWD-${dateStr.substring(dateStr.length - 8)}`;
    }
});

module.exports = mongoose.model('FranchiseWithdrawal', franchiseWithdrawalSchema);
