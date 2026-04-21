const KYC = require('../models/kycModel');
const fs = require('fs');
const path = require('path');
const { sendNotification } = require('../utils/notificationHelper');

// Helper to delete files
const deleteFile = (filePath) => {
    if (filePath) {
        const fullPath = path.join(__dirname, '..', filePath);
        if (fs.existsSync(fullPath)) {
            fs.unlinkSync(fullPath);
        }
    }
};

// @desc    Submit KYC documents
// @route   POST /api/kyc/submit
// @access  Private
exports.submitKYC = async (req, res) => {
    try {
        const userId = req.user.id;
        const { aadharNumber, drivingLicenseNumber } = req.body;

        // Check if KYC already exists
        let kyc = await KYC.findOne({ user: userId });

        const kycData = {
            user: userId,
            aadharNumber,
            drivingLicenseNumber,
            status: 'pending' // Reset status to pending on re-submission
        };

        // Handle File Uploads
        if (!req.files || !req.files.aadharFront || !req.files.aadharBack || !req.files.drivingLicenseFront || !req.files.drivingLicenseBack) {
            if (!kyc) {
                return res.status(400).json({ success: false, message: 'All 4 document images are required for first-time submission' });
            }
        }

        if (req.files) {
            if (req.files.aadharFront) {
                if (kyc) deleteFile(kyc.aadharFront);
                kycData.aadharFront = `uploads/${req.files.aadharFront[0].filename}`;
            }
            if (req.files.aadharBack) {
                if (kyc) deleteFile(kyc.aadharBack);
                kycData.aadharBack = `uploads/${req.files.aadharBack[0].filename}`;
            }
            if (req.files.drivingLicenseFront) {
                if (kyc) deleteFile(kyc.drivingLicenseFront);
                kycData.drivingLicenseFront = `uploads/${req.files.drivingLicenseFront[0].filename}`;
            }
            if (req.files.drivingLicenseBack) {
                if (kyc) deleteFile(kyc.drivingLicenseBack);
                kycData.drivingLicenseBack = `uploads/${req.files.drivingLicenseBack[0].filename}`;
            }
        }

        if (kyc) {
            kyc = await KYC.findOneAndUpdate({ user: userId }, kycData, { new: true, runValidators: true });
        } else {
            kyc = await KYC.create(kycData);
        }

        // Notify Admin
        await sendNotification({
            title: 'New KYC Submitted',
            message: `User ${req.user.name || req.user.mobile} has submitted KYC documents for approval.`,
            type: 'kyc',
            related_id: kyc._id
        });

        res.status(kyc ? 200 : 201).json({
            success: true,
            message: 'KYC documents submitted successfully',
            data: kyc
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
            return res.status(200).json({ success: true, status: 'not_submitted', message: 'No KYC documents submitted yet' });
        }
        res.status(200).json({ success: true, data: kyc });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Get all KYC submissions (Admin only)
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

// @desc    Update KYC status (Admin only)
// @route   PUT /api/kyc/admin/update-status/:id
// @access  Private/Admin
exports.updateKYCStatus = async (req, res) => {
    try {
        const { status, rejectionReason } = req.body;
        
        if (!['approved', 'rejected', 'pending'].includes(status)) {
            return res.status(400).json({ success: false, message: 'Invalid status' });
        }

        const kyc = await KYC.findByIdAndUpdate(
            req.params.id,
            { status, rejectionReason: status === 'rejected' ? rejectionReason : '' },
            { new: true }
        );

        if (!kyc) {
            return res.status(404).json({ success: false, message: 'KYC record not found' });
        }

        // --- FULL FLOW: SYNC WITH USER MODEL ---
        const User = require('../models/userModel');
        const user = await User.findById(kyc.user);

        if (user) {
            if (status === 'approved') {
                user.isKycVerified = true;
                user.credit_score += 50; // Performance bonus for KYC
            } else {
                user.isKycVerified = false;
            }
            await user.save();
        }

        res.status(200).json({ 
            success: true, 
            message: `KYC status updated to ${status} and user profile synced`, 
            data: { kyc, user_status: user ? user.isKycVerified : 'Unknown' } 
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Track KYC status by Mobile Number (Admin only)
// @route   GET /api/kyc/admin/track/:mobile
// @access  Private/Admin
exports.getKYCByMobile = async (req, res) => {
    try {
        const { mobile } = req.params;
        
        // Find user first
        const user = await require('../models/userModel').findOne({ mobile });
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        const kyc = await KYC.findOne({ user: user._id }).populate('user', 'name mobile email');
        if (!kyc) {
            return res.status(200).json({ 
                success: true, 
                status: 'not_submitted', 
                message: 'User has not submitted any KYC documents yet' 
            });
        }

        res.status(200).json({ success: true, data: kyc });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
