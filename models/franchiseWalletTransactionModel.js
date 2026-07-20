const mongoose = require('mongoose');

const franchiseWalletTransactionSchema = new mongoose.Schema({
    franchise: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'FranchiseStore',
        required: true
    },
    amount: {
        type: Number,
        required: true
    },
    type: {
        type: String,
        enum: ['credit', 'debit'],
        required: true
    },
    description: {
        type: String,
        default: ''
    },
    booking: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Booking'
    },
    transaction_id: {
        type: String,
        unique: true
    }
}, {
    timestamps: true
});

// Generate unique transaction_id before saving
franchiseWalletTransactionSchema.pre('save', async function() {
    if (!this.transaction_id) {
        const dateStr = Date.now().toString();
        this.transaction_id = `FWTX-${dateStr.substring(dateStr.length - 8)}`;
    }
});

module.exports = mongoose.model('FranchiseWalletTransaction', franchiseWalletTransactionSchema);
