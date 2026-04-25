const User = require('../models/userModel');
const Booking = require('../models/bookingModel');
const KYC = require('../models/kycModel');

// @desc    Get User Profile
// @route   GET /api/user/profile
// @access  Private
exports.getProfile = async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('-otp -otpExpire');
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        res.status(200).json({ success: true, data: user });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Update User Profile
// @route   PUT /api/user/profile
// @access  Private
exports.updateProfile = async (req, res) => {
    try {
        const { name, email, mobile, city, bio } = req.body;
        
        const user = await User.findById(req.user.id);

        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        if (name) user.name = name;
        if (email) user.email = email;
        if (mobile) user.mobile = mobile;
        if (city) user.city = city;
        if (bio) user.bio = bio;

        const updatedUser = await user.save();

        res.status(200).json({
            success: true,
            message: 'Profile updated successfully',
            data: updatedUser
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Calculate and Get Rider Credit Score
// @route   GET /api/user/credit-score
// @access  Private
exports.getCreditScore = async (req, res) => {
    try {
        const userId = req.user.id;
        
        // 1. Get Base Score from DB
        const user = await User.findById(userId);
        let score = 700; // Start with base 700
        let breakdown = { base: 700 };

        // 2. Check KYC (+50 if approved)
        const kyc = await KYC.findOne({ user: userId });
        if (kyc && kyc.status === 'approved') {
            score += 50;
            breakdown.kyc_verified = +50;
        }

        // 3. Check Bookings
        const bookings = await Booking.find({ user: userId });
        
        const completedCount = bookings.filter(b => b.booking_status === 'completed').length;
        const cancelledCount = bookings.filter(b => b.booking_status === 'cancelled').length;
        const lateCount = bookings.filter(b => b.late_fee > 0).length;

        // +10 for each completed trip (max 10 trips considered here)
        const completedBonus = Math.min(completedCount * 10, 100);
        score += completedBonus;
        breakdown.completed_trips = +completedBonus;

        // -10 for each cancellation
        const cancellationPenalty = cancelledCount * 10;
        score -= cancellationPenalty;
        breakdown.cancellation_penalty = -cancellationPenalty;

        // -20 for each late return
        const latePenalty = lateCount * 20;
        score -= latePenalty;
        breakdown.late_return_penalty = -latePenalty;

        // Clamp score between 300 and 900
        score = Math.max(300, Math.min(900, score));

        // Update in DB for persistence
        user.credit_score = score;
        await user.save();

        res.status(200).json({
            success: true,
            data: {
                current_score: score,
                breakdown,
                rating: score >= 800 ? 'Excellent' : score >= 700 ? 'Good' : score >= 500 ? 'Fair' : 'Poor'
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Change Password
// @route   PUT /api/user/change-password
// @access  Private
exports.changePassword = async (req, res) => {
    try {
        const { oldPassword, newPassword } = req.body;

        if (!oldPassword || !newPassword) {
            return res.status(400).json({ success: false, message: 'Please provide old and new password' });
        }

        // Find user and include password field
        const user = await User.findById(req.user.id).select('+password');

        // Check if old password matches
        const isMatch = await user.matchPassword(oldPassword);
        if (!isMatch) {
            return res.status(401).json({ success: false, message: 'Current password is incorrect' });
        }

        // Set new password (pre-save hook will hash it)
        user.password = newPassword;
        await user.save();

        res.status(200).json({ success: true, message: 'Password changed successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// --- ADMIN CONTROLLERS ---

// @desc    Add New Rider (Admin Only)
// @route   POST /api/user/admin/add-rider
// @access  Private/Admin
exports.addRider = async (req, res) => {
    try {
        const { name, email, mobile, password } = req.body;

        if (!mobile) {
            return res.status(400).json({ success: false, message: 'Please provide at least a mobile number' });
        }

        // Check if user already exists
        const userExists = await User.findOne({ 
            $or: [{ mobile }, email ? { email } : { mobile }] 
        });

        if (userExists) {
            return res.status(400).json({ success: false, message: 'User with this mobile or email already exists' });
        }

        const rider = await User.create({
            name: name || "",
            email: email || "",
            mobile,
            password: password || "123456", // Default password if not provided
            role: 'user',
            isVerified: true,
            status: 'active'
        });

        res.status(201).json({
            success: true,
            message: 'Rider added successfully',
            data: rider
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Get All Users (Admin Only)
// @route   GET /api/user/admin/all
// @access  Private/Admin
exports.getAllUsers = async (req, res) => {
    try {
        const users = await User.find({}).sort({ createdAt: -1 });
        res.status(200).json({
            success: true,
            count: users.length,
            data: users
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Get Single User Details (Admin Only)
// @route   GET /api/user/admin/:id
// @access  Private/Admin
exports.getUserDetail = async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        // Get associated data
        const kyc = await KYC.findOne({ user: user._id });
        const bookings = await Booking.find({ user: user._id }).sort({ createdAt: -1 });

        res.status(200).json({
            success: true,
            data: {
                user,
                kyc,
                bookings
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Update User Status/Role (Admin Only)
// @route   PUT /api/user/admin/:id
// @access  Private/Admin
exports.updateUserStatus = async (req, res) => {
    try {
        const { status, role, credit_score, block_reason } = req.body;
        
        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        if (status) user.status = status;
        if (role) user.role = role;
        if (credit_score !== undefined) user.credit_score = credit_score;

        // Handle Block Reason
        if (status === 'blocked') {
            user.block_reason = block_reason || "Violation of terms of service";
        } else if (status === 'active') {
            user.block_reason = ""; // Clear reason on unblock
        }

        await user.save();

        res.status(200).json({
            success: true,
            message: `User updated successfully. Status: ${user.status}`,
            data: user
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Delete User (Admin Only)
// @route   DELETE /api/user/admin/:id
// @access  Private/Admin
exports.deleteUser = async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        // Also delete KYC if exists (optional, could keep for records)
        await KYC.deleteOne({ user: user._id });
        
        await user.deleteOne();

        res.status(200).json({
            success: true,
            message: 'User and associated KYC record deleted successfully'
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

