const User = require('../models/userModel');
const jwt = require('jsonwebtoken');

// Generate JWT
const generateToken = (id) => {
    return jwt.sign({ id }, process.env.JWT_SECRET, {
        expiresIn: '30d',
    });
};

// @desc    Send OTP using Mobile Number and Name
// @route   POST /api/auth/send-otp
// @access  Public
exports.sendOTP = async (req, res) => {
    const { mobile, name, referralCode } = req.body;

    if (!mobile) {
        return res.status(400).json({ success: false, message: 'Please provide mobile number' });
    }

    if (!/^\d{10}$/.test(mobile)) {
        return res.status(400).json({ success: false, message: 'Please provide a valid 10-digit mobile number' });
    }

    try {
        const otp = '123456'; // TODO: replace with real SMS OTP service
        const otpExpire = new Date(Date.now() + 10 * 60 * 1000);

        let user = await User.findOne({ mobile });
        if (!user) {
            let referredBy = null;
            if (referralCode) {
                const parentUser = await User.findOne({ driver_id: referralCode });
                if (!parentUser) {
                    return res.status(400).json({ success: false, message: 'Invalid Referral Code' });
                }
                referredBy = parentUser._id;
            }
            user = await User.create({ mobile, name: name || "", referred_by: referredBy });
        } else if (name) {
            user.name = name;
        }

        user.otp = otp;
        user.otpExpire = otpExpire;
        await user.save();

        console.log(`OTP for Mobile ${mobile}: ${otp}`);

        res.status(200).json({
            success: true,
            message: 'OTP sent to your mobile number',
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
    const { mobile, otp, fcm_token } = req.body;

    if (!mobile || !otp) {
        return res.status(400).json({ success: false, message: 'Please provide mobile number and OTP' });
    }

    try {
        const user = await User.findOne({ mobile });

        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        if (user.otp !== otp || user.otpExpire < Date.now()) {
            return res.status(400).json({ success: false, message: 'Invalid or expired OTP' });
        }

        if (user.isLoggedIn) {
            return res.status(403).json({
                success: false,
                message: 'This account is already logged in on another device. Please logout from the existing device first.'
            });
        }

        user.otp = undefined;
        user.otpExpire = undefined;
        user.isVerified = true;
        user.isLoggedIn = true;
        if (fcm_token) user.fcm_token = fcm_token;
        await user.save();

        res.status(200).json({
            success: true,
            message: 'Login successful',
            user: {
                id: user._id,
                mobile: user.mobile,
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

// @desc    Direct Login / Signup (No OTP)
// @route   POST /api/auth/login
// @access  Public
exports.directLogin = async (req, res) => {
    const { mobile, name, fcm_token, referralCode } = req.body;

    if (!mobile) {
        return res.status(400).json({ success: false, message: 'Please provide mobile number' });
    }

    if (!/^\d{10}$/.test(mobile)) {
        return res.status(400).json({ success: false, message: 'Please provide a valid 10-digit mobile number' });
    }

    try {
        let user = await User.findOne({ mobile });
        if (user && user.isLoggedIn) {
            return res.status(403).json({
                success: false,
                message: 'This account is already logged in on another device. Please logout from the existing device first.'
            });
        }

        if (!user) {
            if (!name || name.trim() === '') {
                return res.status(404).json({ success: false, message: 'Account not found. Please register first.' });
            }
            let referredBy = null;
            if (referralCode) {
                const parentUser = await User.findOne({ driver_id: referralCode });
                if (!parentUser) {
                    return res.status(400).json({ success: false, message: 'Invalid Referral Code' });
                }
                referredBy = parentUser._id;
            }
            user = await User.create({ mobile, name: name || "", isVerified: true, isLoggedIn: true, referred_by: referredBy });
        } else {
            if (name) user.name = name;
            user.isVerified = true;
            user.isLoggedIn = true;
        }

        if (fcm_token) user.fcm_token = fcm_token;
        await user.save();

        res.status(200).json({
            success: true,
            message: 'Login successful',
            user: {
                id: user._id,
                mobile: user.mobile,
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

// @desc    Logout User & release device login restriction
// @route   POST /api/auth/logout
// @access  Public / Protected
exports.logout = async (req, res) => {
    try {
        const { userId, mobile } = req.body;
        let idToLogout = userId;

        if (!idToLogout && req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
            try {
                const token = req.headers.authorization.split(' ')[1];
                const decoded = jwt.verify(token, process.env.JWT_SECRET);
                idToLogout = decoded.id;
            } catch (err) {
                // Token invalid or expired
            }
        }

        let user = null;
        if (idToLogout) {
            user = await User.findById(idToLogout);
        } else if (mobile) {
            user = await User.findOne({ mobile });
        }

        if (user) {
            user.isLoggedIn = false;
            user.active_device = null;
            await user.save();
        }

        res.status(200).json({ success: true, message: 'Logged out successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

