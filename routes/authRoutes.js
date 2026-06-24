const express = require('express');
const router = express.Router();
const { sendOTP, verifyOTP, registerAdmin, adminLogin, directLogin } = require('../controller/authController');

router.post('/send-otp', sendOTP);
router.post('/verify-otp', verifyOTP);
router.post('/login', directLogin);

// Admin Routes
router.post('/admin/register', registerAdmin);
router.post('/admin/login', adminLogin);

module.exports = router;
