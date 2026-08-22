const User = require('../models/userModel');
const Booking = require('../models/bookingModel');
const KYC = require('../models/kycModel');

// @desc    Save / Update FCM Token
// @route   POST /api/user/fcm-token
// @access  Private
exports.saveFcmToken = async (req, res) => {
    try {
        const { fcm_token } = req.body;
        if (!fcm_token) return res.status(400).json({ success: false, message: 'fcm_token is required' });
        await User.findByIdAndUpdate(req.user.id, { fcm_token });
        res.status(200).json({ success: true, message: 'FCM token saved' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Manually trigger installment notification check (Admin/Test)
// @route   POST /api/user/trigger-installment-notifications
// @access  Private/Admin
exports.triggerInstallmentNotifications = async (req, res) => {
    try {
        const { runInstallmentNotifications } = require('../utils/installmentScheduler');
        const force = req.body.force === true || req.query.force === 'true';
        const result = await runInstallmentNotifications(force);
        res.status(200).json({
            success: true,
            message: `Notifications triggered (force=${force}). Sent: ${result.sent}, Bookings checked: ${result.bookingsChecked}`,
            data: result
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Get User Profile
// @route   GET /api/user/profile
// @access  Private
exports.getProfile = async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('-otp -otpExpire').lean();
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        const KYC = require('../models/kycModel');
        const kycRecord = await KYC.findOne({ user: req.user.id }).select('status');
        
        let kyc_status = 'pending'; // Default
        if (kycRecord) {
            kyc_status = kycRecord.status === 'approved' ? 'verified' : kycRecord.status;
        } else if (user.isKycVerified) {
            kyc_status = 'verified';
        }

        user.kyc_status = kyc_status;

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

        if (user.profile_edited) {
            return res.status(403).json({ success: false, message: 'Profile can only be edited once. Please contact admin to change details.' });
        }

        // Lock Name, Email, and Mobile if KYC is verified
        if (!user.isKycVerified) {
            if (name) user.name = name;
            if (email) user.email = email;
            if (mobile) user.mobile = mobile;
        }

        if (city) user.city = city;
        if (bio) user.bio = bio;

        if (req.file) {
            user.profile_picture = `/uploads/${req.file.filename}`;
        }

        user.profile_edited = true;

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
        // Fetch ALL bookings, sorted by newest first, so the latest booking comes first
        const allBookings = await Booking.find()
            .populate('user')
            .populate('vehicle', 'registration_number vehicle_name')
            .populate('franchise', 'store_name franchise_id store_id')
            .lean()
            .sort({ createdAt: -1 });

        const activeRideUsers = new Set();
        allBookings.forEach(b => {
            if (b.user && (b.booking_status === 'ongoing' || b.booking_status === 'confirmed')) {
                activeRideUsers.add(b.user._id.toString());
            }
        });

        const uniqueUsersMap = {};

        // Loop through all bookings. Since they are sorted newest first,
        // the first time we see a user, it's their latest booking.
        allBookings.forEach(b => {
            if (b.user && b.user.role === 'user') {
                const userIdStr = b.user._id.toString();
                if (!uniqueUsersMap[userIdStr]) {
                    // Include the user and attach their latest booking info
                    const userObj = { ...b.user };
                    
                    // Vehicle might be null if it was deleted, but we still attach it if available
                    userObj.assigned_vehicle = b.vehicle || null;
                    userObj.booking_date = b.createdAt; // Latest booking date
                    userObj.has_active_ride = activeRideUsers.has(userIdStr);
                    
                    // Franchise details
                    let franchiseName = 'Main Branch';
                    if (b.franchise && b.franchise.store_name && b.franchise.store_name.trim() !== '') {
                        franchiseName = `${b.franchise.store_name} (${b.franchise.franchise_id || b.franchise.store_id || 'Main Hub'})`;
                    }
                    userObj.franchise_name = franchiseName;
                    
                    // Financial details from latest booking
                    userObj.paid_amount = b.total_paid || 0;
                    userObj.due_amount = Math.max(0, (b.grand_total || 0) - (b.total_paid || 0));
                    
                    // Next installment date (if any pending/overdue)
                    let next_installment_date = null;
                    if (b.payment_installments && b.payment_installments.length > 0) {
                        const pendingInstallments = b.payment_installments.filter(i => i.status === 'pending' || i.status === 'overdue');
                        if (pendingInstallments.length > 0) {
                            pendingInstallments.sort((x, y) => new Date(x.due_date) - new Date(y.due_date));
                            next_installment_date = pendingInstallments[0].due_date;
                        }
                    }
                    userObj.next_installment_date = next_installment_date;
                    
                    uniqueUsersMap[userIdStr] = userObj;
                }
            }
        });

        // Also merge any users from DB to ensure fresh notes and no missing riders
        const allUsers = await User.find({ role: 'user' }).lean();
        allUsers.forEach(u => {
            const userIdStr = u._id.toString();
            if (!uniqueUsersMap[userIdStr]) {
                uniqueUsersMap[userIdStr] = {
                    ...u,
                    assigned_vehicle: null,
                    booking_date: u.createdAt,
                    has_active_ride: false,
                    franchise_name: 'Main Branch',
                    paid_amount: 0,
                    due_amount: 0,
                    next_installment_date: null
                };
            } else {
                uniqueUsersMap[userIdStr].notes = u.notes || "";
            }
        });

        const usersWithAnyBooking = Object.values(uniqueUsersMap);
        
        res.status(200).json({
            success: true,
            count: usersWithAnyBooking.length,
            data: usersWithAnyBooking
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
        const user = await User.findById(req.params.id).populate('referred_by', 'name driver_id mobile');
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
        const { status, role, credit_score, block_reason, name, email, mobile, profile_edited, notes } = req.body;
        
        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        // Prevent self-blocking - Using _id.toString() for both for absolute comparison
        if (status === 'blocked' && req.user && user._id.toString() === req.user._id.toString()) {
            return res.status(400).json({ success: false, message: 'You cannot block your own account' });
        }

        if (status) user.status = status;
        if (role) user.role = role;
        if (credit_score !== undefined) user.credit_score = credit_score;
        if (name !== undefined) user.name = name;
        if (email !== undefined) user.email = email;
        if (mobile !== undefined) user.mobile = mobile;
        if (profile_edited !== undefined) user.profile_edited = profile_edited;
        if (notes !== undefined) user.notes = notes;
        if (req.body.isLoggedIn !== undefined) {
            user.isLoggedIn = req.body.isLoggedIn;
            if (!user.isLoggedIn) user.active_device = null;
        }

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

        // Prevent self-deletion - Using _id.toString() for both for absolute comparison
        if (user._id.toString() === req.user._id.toString()) {
            return res.status(400).json({ success: false, message: 'You cannot delete your own account' });
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

// @desc    Get My Referrals
// @route   GET /api/user/my-referrals
// @access  Private
exports.getMyReferrals = async (req, res) => {
    try {
        const referrals = await User.find({ referred_by: req.user._id }).select('name mobile createdAt');
        
        const referralData = await Promise.all(referrals.map(async (user) => {
            const bookingCount = await Booking.countDocuments({ user: user._id });
            return {
                _id: user._id,
                name: user.name,
                mobile: user.mobile,
                date: user.createdAt,
                status: bookingCount > 0 ? 'Scooty Booked ✅' : 'Registered Only ⏳'
            };
        }));

        res.status(200).json({ success: true, data: referralData });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Get All Referrals (Admin & Franchise)
// @route   GET /api/user/admin/referrals
// @access  Private
exports.getAllReferrals = async (req, res) => {
    try {
        let referrals = await User.find({ referred_by: { $ne: null } })
            .populate('referred_by', 'name driver_id mobile')
            .select('name mobile createdAt referred_by');
            
        let referralData = await Promise.all(referrals.map(async (user) => {
            const latestBooking = await Booking.findOne({ user: user._id }).sort({ createdAt: -1 }).populate('franchise');
            return {
                _id: user._id,
                name: user.name,
                mobile: user.mobile,
                date: user.createdAt,
                referrer: user.referred_by,
                has_booking: !!latestBooking,
                booking_date: latestBooking ? latestBooking.createdAt : null,
                franchise_id: latestBooking && latestBooking.franchise ? latestBooking.franchise._id.toString() : null
            };
        }));

        if (req.franchise) {
            referralData = referralData.filter(r => r.franchise_id === req.franchise._id.toString());
        }

        res.status(200).json({ success: true, data: referralData });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
