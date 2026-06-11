const KYC = require('../models/kycModel');
const User = require('../models/userModel');
const fs = require('fs');
const path = require('path');
const { sendNotification } = require('../utils/notificationHelper');

const deleteFile = (filePath) => {
    if (filePath) {
        const fullPath = path.join(__dirname, '..', filePath);
        if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
    }
};

// @desc    Submit KYC documents
// @route   POST /api/kyc/submit
// @access  Private (User with valid token after OTP verify)
exports.submitKYC = async (req, res) => {
    try {
        const userId = req.user.id;
        const user = await User.findById(userId);

        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        if (!user.isVerified) {
            return res.status(403).json({ success: false, message: 'Please verify OTP first before submitting KYC' });
        }

        const { aadharNumber } = req.body;

        if (!aadharNumber || !/^\d{12}$/.test(aadharNumber)) {
            return res.status(400).json({ success: false, message: 'Valid 12-digit Aadhar number is required' });
        }

        const requiredFiles = ['aadharFront', 'aadharBack', 'panCard', 'selfie'];
        let existingKyc = await KYC.findOne({ user: userId });

        if (!existingKyc) {
            const missing = requiredFiles.filter(f => !req.files || !req.files[f]);
            if (missing.length > 0) {
                return res.status(400).json({ success: false, message: `Missing required documents: ${missing.join(', ')}` });
            }
        }

        const kycData = { user: userId, aadharNumber, status: 'pending' };

        if (req.files) {
            for (const field of requiredFiles) {
                if (req.files[field]) {
                    if (existingKyc) deleteFile(existingKyc[field]);
                    kycData[field] = `uploads/${req.files[field][0].filename}`;
                }
            }
        }

        if (existingKyc) {
            existingKyc = await KYC.findOneAndUpdate({ user: userId }, kycData, { new: true, runValidators: true });
        } else {
            existingKyc = await KYC.create(kycData);
        }

        await sendNotification({
            title: 'New KYC Submitted',
            message: `KYC submitted by user ${user.mobile} for admin approval.`,
            type: 'kyc',
            related_id: existingKyc._id
        });

        res.status(200).json({
            success: true,
            message: 'KYC documents submitted successfully. Awaiting admin approval.',
            data: existingKyc
        });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

// @desc    Get user's KYC status
// @route   GET /api/kyc/my-status
// @access  Private
exports.getMyKYCStatus = async (req, res) => {
    try {
        const kyc = await KYC.findOne({ user: req.user.id });
        if (!kyc) {
            return res.status(200).json({ success: true, status: 'not_submitted', message: 'No KYC submitted yet' });
        }
        res.status(200).json({ success: true, data: kyc });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Get all KYC submissions (Admin)
// @route   GET /api/kyc/admin/all
// @access  Private/Admin
exports.getAllKYCSubmissions = async (req, res) => {
    try {
        const kycList = await KYC.find().populate('user', 'name mobile email').sort('-createdAt');
        res.status(200).json({ success: true, count: kycList.length, data: kycList });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Approve or Reject KYC (Admin)
// @route   PUT /api/kyc/admin/status/:id
// @access  Private/Admin
exports.updateKYCStatus = async (req, res) => {
    try {
        const { status, rejectionReason } = req.body;

        if (!['approved', 'rejected', 'pending'].includes(status)) {
            return res.status(400).json({ success: false, message: 'Invalid status value' });
        }

        const kyc = await KYC.findByIdAndUpdate(
            req.params.id,
            { status, rejectionReason: status === 'rejected' ? rejectionReason : '' },
            { new: true }
        );

        if (!kyc) {
            return res.status(404).json({ success: false, message: 'KYC record not found' });
        }

        const user = await User.findById(kyc.user);
        if (user) {
            user.isKycVerified = status === 'approved';
            if (status === 'approved') user.credit_score += 50;
            await user.save();
        }

        res.status(200).json({
            success: true,
            message: `KYC ${status} successfully. Customer is now ${status === 'approved' ? 'registered' : 'not yet registered'}.`,
            data: { kyc, isKycVerified: user ? user.isKycVerified : false }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Track KYC by Mobile (Admin)
// @route   GET /api/kyc/admin/track/:mobile
// @access  Private/Admin
exports.getKYCByMobile = async (req, res) => {
    try {
        const user = await User.findOne({ mobile: req.params.mobile });
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });

        const kyc = await KYC.findOne({ user: user._id }).populate('user', 'name mobile email');
        if (!kyc) {
            return res.status(200).json({ success: true, status: 'not_submitted', message: 'No KYC submitted yet' });
        }

        res.status(200).json({ success: true, data: kyc });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
