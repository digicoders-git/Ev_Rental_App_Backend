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
    status: {
        type: String,
        enum: ['pending', 'approved', 'rejected'],
        default: 'pending'
    },
    rejectionReason: {
        type: String,
        default: ''
    }
}, {
    timestamps: true
});

const KYC = mongoose.model('KYC', kycSchema);

module.exports = KYC;
