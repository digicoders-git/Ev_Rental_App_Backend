const mongoose = require('mongoose');

const invoiceSchema = new mongoose.Schema({
    invoice_number: {
        type: String,
        unique: true,
        required: true
    },
    booking: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Booking',
        required: true
    },
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    franchise: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'FranchiseStore',
        default: null // Null means Platform
    },
    installment_id: {
        type: mongoose.Schema.Types.ObjectId,
        default: null
    },
    installment_no: {
        type: Number,
        default: null
    },
    amount: {
        type: Number,
        required: true
    },
    gst_amount: {
        type: Number,
        default: 0
    },
    discount_amount: {
        type: Number,
        default: 0
    },
    total_amount: {
        type: Number,
        required: true
    },
    status: {
        type: String,
        enum: ['paid', 'unpaid', 'refunded'],
        default: 'paid'
    },
    issue_date: {
        type: Date,
        default: Date.now
    }
}, { timestamps: true });

module.exports = mongoose.model('Invoice', invoiceSchema);
