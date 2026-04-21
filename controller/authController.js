const User = require('../models/userModel');
const jwt = require('jsonwebtoken');

// Generate JWT
const generateToken = (id) => {
    return jwt.sign({ id }, process.env.JWT_SECRET, {
        expiresIn: '30d',
    });
};

// @desc    Send OTP to Mobile
// @route   POST /api/auth/send-otp
// @access  Public
exports.sendOTP = async (req, res) => {
    const { mobile } = req.body;

    if (!mobile) {
        return res.status(400).json({ success: false, message: 'Please provide a mobile number' });
    }

    try {
        // Fixed OTP for testing
        const otp = "123456";
        const otpExpire = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes from now

        // Find user or create if not exists
        let user = await User.findOne({ mobile });

        if (!user) {
            user = await User.create({ mobile });
        }

        user.otp = otp;
        user.otpExpire = otpExpire;
        await user.save();

        // NOTE: In production, integrate an SMS gateway here (Twilio, Fast2SMS, etc.)
        console.log(`OTP for ${mobile}: ${otp}`);

        res.status(200).json({
            success: true,
            message: 'OTP sent successfully',
            otp: process.env.NODE_ENV === 'development' ? otp : undefined // Hide OTP in production
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Verify OTP and Login/Register
// @route   POST /api/auth/verify-otp
// @access  Public
exports.verifyOTP = async (req, res) => {
    const { mobile, otp } = req.body;

    if (!mobile || !otp) {
        return res.status(400).json({ success: false, message: 'Please provide mobile and OTP' });
    }

    try {
        const user = await User.findOne({ mobile });

        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        // Check if OTP matches and is not expired
        if (user.otp !== otp || user.otpExpire < Date.now()) {
            return res.status(400).json({ success: false, message: 'Invalid or expired OTP' });
        }

        // Clear OTP and mark as verified
        user.otp = undefined;
        user.otpExpire = undefined;
        user.isVerified = true;
        await user.save();

        res.status(200).json({
            success: true,
            message: 'Login successful',
            user: {
                id: user._id,
                mobile: user.mobile,
                name: user.name,
                email: user.email,
                role: user.role
            },
            token: generateToken(user._id)
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
// @desc    Register Admin
// @route   POST /api/auth/admin/register
// @access  Public (Should be protected or restricted in production)
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
        // Find user by email and include password
        const user = await User.findOne({ email }).select('+password');

        if (!user || user.role !== 'admin') {
            return res.status(401).json({ success: false, message: 'Invalid credentials or not an admin' });
        }

        // Check password
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
