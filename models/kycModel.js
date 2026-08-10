const mongoose = require('mongoose');

const kycSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        unique: true
    },
    name: {
        type: String,
        required: true,
        trim: true
    },
    mobileNumber: {
        type: String,
        required: true,
        trim: true
    },
    aadharFront: {
        type: String,
        required: true
    },
    aadharBack: {
        type: String,
        required: true
    },
    panCard: {
        type: String,
        required: true
    },
    selfie: {
        type: String,
        required: true
    },
    extraId: {
        type: String,
        default: null
    },
    status: {
        type: String,
        enum: ['pending', 'approved', 'rejected'],
        default: 'pending'
    },
    rejectionReason: {
        type: String,
        default: ''
    },
    registration_fee_paid: {
        type: Boolean,
        default: false
    },
    registration_fee_amount: {
        type: Number,
        default: 0
    },
    razorpay_payment_id: {
        type: String,
        default: ''
    },
    razorpay_order_id: {
        type: String,
        default: ''
    },
    franchise: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'FranchiseStore',
        default: null
    }
}, {
    timestamps: true
});

const KYC = mongoose.model('KYC', kycSchema);

module.exports = KYC;
