const User = require('../models/userModel');
const jwt = require('jsonwebtoken');

// Generate JWT
const generateToken = (id) => {
    return jwt.sign({ id }, process.env.JWT_SECRET, {
        expiresIn: '30d',
    });
};

// @desc    Send OTP using Aadhar Number only
// @route   POST /api/auth/send-otp
// @access  Public
exports.sendOTP = async (req, res) => {
    const { aadharNumber } = req.body;

    if (!aadharNumber) {
        return res.status(400).json({ success: false, message: 'Please provide Aadhar number' });
    }

    if (!/^\d{12}$/.test(aadharNumber)) {
        return res.status(400).json({ success: false, message: 'Please provide a valid 12-digit Aadhar number' });
    }

    try {
        const otp = '123456'; // TODO: replace with real SMS OTP service
        const otpExpire = new Date(Date.now() + 10 * 60 * 1000);

        let user = await User.findOne({ aadharNumber });
        if (!user) {
            user = await User.create({ aadharNumber });
        }

        user.otp = otp;
        user.otpExpire = otpExpire;
        await user.save();

        console.log(`OTP for Aadhar ${aadharNumber}: ${otp}`);

        res.status(200).json({
            success: true,
            message: 'OTP sent to your Aadhar-linked mobile number',
            ...(process.env.NODE_ENV === 'development' && { otp })
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Verify OTP
// @route   POST /api/auth/verify-otp
// @access  Public
exports.verifyOTP = async (req, res) => {
    const { aadharNumber, otp, fcm_token } = req.body;

    if (!aadharNumber || !otp) {
        return res.status(400).json({ success: false, message: 'Please provide Aadhar number and OTP' });
    }

    try {
        const user = await User.findOne({ aadharNumber });

        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        if (user.otp !== otp || user.otpExpire < Date.now()) {
            return res.status(400).json({ success: false, message: 'Invalid or expired OTP' });
        }

        user.otp = undefined;
        user.otpExpire = undefined;
        user.isVerified = true;
        if (fcm_token) user.fcm_token = fcm_token;
        await user.save();

        res.status(200).json({
            success: true,
            message: 'Login successful',
            user: {
                id: user._id,
                aadharNumber: user.aadharNumber,
                name: user.name,
                email: user.email,
                role: user.role,
                isKycVerified: user.isKycVerified
            },
            token: generateToken(user._id)
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Register Admin
// @route   POST /api/auth/admin/register
// @access  Public
exports.registerAdmin = async (req, res) => {
    const { name, email, mobile, password } = req.body;

    if (!mobile || !password || !email) {
        return res.status(400).json({ success: false, message: 'Please provide email, mobile and password' });
    }

    try {
        const userExists = await User.findOne({
            $or: [{ mobile }, { email }]
        });

        if (userExists) {
            return res.status(400).json({ success: false, message: 'User already exists with this mobile or email' });
        }

        const user = await User.create({
            name,
            email,
            mobile,
            password,
            role: 'admin',
            isVerified: true
        });

        res.status(201).json({
            success: true,
            message: 'Admin registered successfully',
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                mobile: user.mobile,
                role: user.role
            },
            token: generateToken(user._id)
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Admin Login
// @route   POST /api/auth/admin/login
// @access  Public
exports.adminLogin = async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ success: false, message: 'Please provide email and password' });
    }

    try {
        const user = await User.findOne({ email }).select('+password');

        if (!user || user.role !== 'admin') {
            return res.status(401).json({ success: false, message: 'Invalid credentials or not an admin' });
        }

        const isMatch = await user.matchPassword(password);
        if (!isMatch) {
            return res.status(401).json({ success: false, message: 'Invalid credentials' });
        }

        res.status(200).json({
            success: true,
            message: 'Admin login successful',
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                mobile: user.mobile,
                role: user.role
            },
            token: generateToken(user._id)
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
