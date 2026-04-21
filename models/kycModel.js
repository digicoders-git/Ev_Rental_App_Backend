const mongoose = require('mongoose');

const kycSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        unique: true
    },
    aadharNumber: {
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
    drivingLicenseNumber: {
        type: String,
        required: true,
        trim: true
    },
    drivingLicenseFront: {
        type: String,
        required: true
    },
    drivingLicenseBack: {
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
