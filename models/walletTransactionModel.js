const mongoose = require('mongoose');

const walletTransactionSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
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
    transaction_id: {
        type: String,
        unique: true
    },
    performed_by: {
        type: String,
        enum: ['admin', 'system', 'user'],
        default: 'admin'
    }
}, {
    timestamps: true
});

// Generate unique transaction_id before saving
walletTransactionSchema.pre('save', async function() {
    if (!this.transaction_id) {
        const dateStr = Date.now().toString();
        this.transaction_id = `WTX-${dateStr.substring(dateStr.length - 8)}`;
    }
});

module.exports = mongoose.model('WalletTransaction', walletTransactionSchema);
