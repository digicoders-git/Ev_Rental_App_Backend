const jwt = require('jsonwebtoken');
const User = require('../models/userModel');
const FranchiseStore = require('../models/franchiseStoreModel');

const protect = async (req, res, next) => {
    let token;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        try {
            // Get token from header
            token = req.headers.authorization.split(' ')[1];

            // Verify token
            const decoded = jwt.verify(token, process.env.JWT_SECRET);

            // Get user from the token
            req.user = await User.findById(decoded.id).select('-otp');

            if (!req.user) {
                return res.status(401).json({ success: false, message: 'Not authorized, user not found' });
            }

            // --- FULL FLOW: STATUS CHECK ---
            if (req.user.status === 'blocked') {
                return res.status(403).json({ 
                    success: false, 
                    message: `Account is blocked. Reason: ${req.user.block_reason || 'Violation of terms'}` 
                });
            }

            return next();
        } catch (error) {
            console.error('JWT Verification Error:', error.message);
            return res.status(401).json({ success: false, message: 'Not authorized, token failed' });
        }
    }

    if (!token) {
        return res.status(401).json({ success: false, message: 'Not authorized, no token' });
    }
};

const admin = (req, res, next) => {
    if (req.user && req.user.role === 'admin') {
        next();
    } else {
        res.status(403).json({ success: false, message: 'Not authorized as an admin' });
    }
};

const franchiseProtect = async (req, res, next) => {
    let token;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        try {
            token = req.headers.authorization.split(' ')[1];
            const decoded = jwt.verify(token, process.env.JWT_SECRET);

            req.franchise = await FranchiseStore.findById(decoded.id);

            if (!req.franchise) {
                return res.status(401).json({ success: false, message: 'Not authorized, franchise not found' });
            }

            return next();
        } catch (error) {
            return res.status(401).json({ success: false, message: 'Not authorized, token failed' });
        }
    }

    if (!token) {
        return res.status(401).json({ success: false, message: 'Not authorized, no token' });
    }
};

const anyProtect = async (req, res, next) => {
    let token;
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        try {
            token = req.headers.authorization.split(' ')[1];
            const decoded = jwt.verify(token, process.env.JWT_SECRET);

            // Try to find User
            req.user = await User.findById(decoded.id);
            // Try to find Franchise
            req.franchise = await FranchiseStore.findById(decoded.id);

            if (!req.user && !req.franchise) {
                return res.status(401).json({ success: false, message: 'Not authorized' });
            }

            // Block check for User
            if (req.user && req.user.status === 'blocked') {
                return res.status(403).json({ success: false, message: 'Your account is blocked' });
            }

            return next();
        } catch (error) {
            return res.status(401).json({ success: false, message: 'Not authorized, token failed' });
        }
    }
    if (!token) {
        return res.status(401).json({ success: false, message: 'Not authorized, no token' });
    }
};

module.exports = { protect, admin, franchiseProtect, anyProtect };
