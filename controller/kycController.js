const KYC = require('../models/kycModel');
const User = require('../models/userModel');
const fs = require('fs');
const path = require('path');
const { sendNotification } = require('../utils/notificationHelper');
const { sendPushNotification } = require('../utils/fcmHelper');
const crypto = require('crypto');
const Razorpay = require('razorpay');

const deleteFile = (filePath) => {
    if (filePath) {
        const fullPath = path.join(__dirname, '..', filePath);
        if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
    }
};

// @desc    Submit KYC documents
// @route   POST /api/kyc/submit
// @access  Private (User with valid token)
exports.submitKYC = async (req, res) => {
    try {
        let userId = req.user.id;
        if ((req.user.role === 'admin' || req.user.role === 'franchise') && req.body.userId) {
            userId = req.body.userId;
        }
        const user = await User.findById(userId);

        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        const { name, mobileNumber, current_address, permanent_address, dob, razorpay_payment_id, razorpay_order_id, razorpay_signature } = req.body;

        if (!name || name.trim() === '') {
            return res.status(400).json({ success: false, message: 'Name is required' });
        }

        if (!mobileNumber || !/^\d{10}$/.test(mobileNumber)) {
            return res.status(400).json({ success: false, message: 'Valid 10-digit mobile number is required' });
        }
        
        if (!current_address || !permanent_address || !dob) {
            return res.status(400).json({ success: false, message: 'Current Address, Permanent Address, and Date of Birth are required' });
        }

        if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature) {
            return res.status(400).json({ success: false, message: 'Payment details are required for KYC submission (₹49 fee)' });
        }

        const expectedSignature = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
                                        .update(razorpay_order_id + "|" + razorpay_payment_id)
                                        .digest('hex');
                                        
        if (expectedSignature !== razorpay_signature) {
            return res.status(400).json({ success: false, message: 'Invalid payment signature' });
        }

        let existingKyc = await KYC.findOne({ user: userId });

        if (!existingKyc && (
            !req.files || 
            !req.files['aadharFront'] || 
            !req.files['aadharBack'] || 
            !req.files['panCard'] || 
            !req.files['selfie']
        )) {
            return res.status(400).json({ success: false, message: 'All 4 KYC document files (Aadhar Front, Aadhar Back, PAN Card, Selfie) are required.' });
        }

        const kycData = { 
            user: userId, 
            name, 
            mobileNumber, 
            status: 'pending',
            registration_fee_paid: true,
            registration_fee_amount: 49
        };

        // Update User Profile with new details
        user.current_address = current_address;
        user.permanent_address = permanent_address;
        user.dob = new Date(dob);
        user.kyc_fee_paid = true;
        user.kyc_fee_transaction_id = razorpay_payment_id;
        await user.save();

        const fileFields = ['aadharFront', 'aadharBack', 'panCard', 'selfie'];
        fileFields.forEach(field => {
            if (req.files && req.files[field]) {
                if (existingKyc && existingKyc[field]) {
                    deleteFile(existingKyc[field]);
                }
                kycData[field] = `uploads/${req.files[field][0].filename}`;
            }
        });

        if (existingKyc) {
            existingKyc = await KYC.findOneAndUpdate({ user: userId }, kycData, { new: true, runValidators: true });
        } else {
            existingKyc = await KYC.create(kycData);
        }

        // Update User with Gig Company info
        if (req.body.gigCompanyId || req.body.employeeId) {
            await User.findByIdAndUpdate(userId, {
                gigCompanyId: req.body.gigCompanyId || user.gigCompanyId,
                employeeId: req.body.employeeId || user.employeeId
            });
        }

        await sendNotification({
            title: 'New KYC Submitted',
            message: `KYC submitted by user ${mobileNumber} for admin approval.`,
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
        const kycList = await KYC.find().populate('user', 'name mobile email dob kyc_fee_paid kyc_fee_transaction_id current_address permanent_address').sort('-createdAt');
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
            if (status === 'approved') {
                user.credit_score += 50;
                if (kyc.name) user.name = kyc.name;
                if (kyc.mobileNumber) user.mobile = kyc.mobileNumber;
            }
            await user.save();

            const title = status === 'approved' ? '✅ KYC Approved!' : '❌ KYC Rejected';
            const message = status === 'approved'
                ? 'Your KYC has been verified successfully. You can now book vehicles!'
                : `Your KYC was rejected. Reason: ${rejectionReason || 'Documents not clear'}. Please resubmit.`;

            // ✅ Real-time Socket.IO event → customer ke room mein emit
            const io = req.app.get('io');
            if (io) {
                io.to(user._id.toString()).emit('kyc_status_update', {
                    status,
                    isKycVerified: status === 'approved',
                    rejectionReason: status === 'rejected' ? (rejectionReason || 'Documents not clear') : null,
                    message
                });
            }

            // FCM push to mobile app (app background mein ho tab bhi kaam kare)
            if (user.fcm_token) {
                await sendPushNotification(user.fcm_token, title, message, {
                    type: 'kyc_status',
                    kyc_status: status,
                    is_kyc_verified: String(status === 'approved'),
                });
            }

            // In-app notification DB mein store
            await sendNotification({
                recipient: user._id,
                recipient_role: 'user',
                title,
                message,
                type: 'kyc',
                related_id: kyc._id,
            });
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

// @desc    Get KYC by mobile number
// @route   GET /api/kyc/admin/search/:mobile
// @access  Private/Admin
exports.getKYCByMobile = async (req, res) => {
    try {
        const user = await User.findOne({ mobile: req.params.mobile });
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        
        const kyc = await KYC.findOne({ user: user._id }).populate('user', 'name mobile email dob kyc_fee_paid kyc_fee_transaction_id current_address permanent_address');
        if (!kyc) {
            return res.status(200).json({ success: true, status: 'not_submitted', message: 'No KYC submitted yet' });
        }

        res.status(200).json({ success: true, data: kyc });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Create Razorpay Order for KYC Registration Fee (INR 49)
// @route   POST /api/kyc/create-fee-order
// @access  Private
exports.createFeeOrder = async (req, res) => {
    try {
        const razorpay = new Razorpay({
            key_id: process.env.RAZORPAY_KEY_ID,
            key_secret: process.env.RAZORPAY_KEY_SECRET
        });

        const amountInPaise = 49 * 100; // INR 49
        const options = {
            amount: amountInPaise,
            currency: 'INR',
            receipt: `kyc_fee_${req.user.id}`
        };

        const order = await razorpay.orders.create(options);

        res.status(201).json({
            success: true,
            razorpay_order_id: order.id,
            razorpay_key: process.env.RAZORPAY_KEY_ID,
            amount_in_paise: amountInPaise
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Get KYC for only this franchise's assigned riders
// @route   GET /api/kyc/franchise/my-riders
// @access  Private/Franchise
exports.getFranchiseKYCSubmissions = async (req, res) => {
    try {
        const Booking = require('../models/bookingModel');
        const franchiseId = req.franchise.id;

        // Get all unique user IDs from this franchise's bookings
        const bookings = await Booking.find({ franchise: franchiseId }).select('user').lean();
        const userIds = [...new Set(bookings.map(b => b.user?.toString()).filter(Boolean))];

        // Get KYC for those users only
        const kycList = await KYC.find({ user: { $in: userIds } })
            .populate('user', 'name mobile email dob kyc_fee_paid kyc_fee_transaction_id current_address permanent_address isKycVerified')
            .sort('-createdAt');

        res.status(200).json({ success: true, count: kycList.length, data: kycList });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Franchise approves or rejects a rider's KYC
// @route   PUT /api/kyc/franchise/status/:id
// @access  Private/Franchise
exports.franchiseUpdateKYCStatus = async (req, res) => {
    try {
        const { status, rejectionReason } = req.body;

        if (!['approved', 'rejected'].includes(status)) {
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
            if (status === 'approved') {
                user.credit_score = (user.credit_score || 0) + 50;
                if (kyc.name) user.name = kyc.name;
                if (kyc.mobileNumber) user.mobile = kyc.mobileNumber;
            }
            await user.save();

            const title = status === 'approved' ? '✅ KYC Approved!' : '❌ KYC Rejected';
            const message = status === 'approved'
                ? 'Your KYC has been verified successfully. You can now book vehicles!'
                : `Your KYC was rejected. Reason: ${rejectionReason || 'Documents not clear'}. Please resubmit.`;

            // Real-time Socket.IO event
            const io = req.app.get('io');
            if (io) {
                io.to(user._id.toString()).emit('kyc_status_update', {
                    status,
                    isKycVerified: status === 'approved',
                    rejectionReason: status === 'rejected' ? (rejectionReason || 'Documents not clear') : null,
                    message
                });
            }

            // FCM push notification
            if (user.fcm_token) {
                await sendPushNotification(user.fcm_token, title, message, {
                    type: 'kyc_status',
                    kyc_status: status,
                    is_kyc_verified: String(status === 'approved'),
                });
            }

            // In-app notification
            await sendNotification({
                recipient: user._id,
                recipient_role: 'user',
                title,
                message,
                type: 'kyc',
                related_id: kyc._id,
            });
        }

        res.status(200).json({
            success: true,
            message: `KYC ${status} successfully.`,
            data: { kyc, isKycVerified: user ? user.isKycVerified : false }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

