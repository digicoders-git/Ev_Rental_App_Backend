const express = require('express');
const router = express.Router();
const { 
    getProfile, 
    updateProfile, 
    getCreditScore, 
    changePassword,
    addRider,
    getAllUsers,
    getUserDetail,
    updateUserStatus,
    deleteUser,
    saveFcmToken,
    triggerInstallmentNotifications,
    getMyReferrals,
    getAllReferrals
} = require('../controller/userController');
const { protect, admin, anyProtect } = require('../middleware/authMiddleware');
const upload = require('../middleware/uploadMiddleware');

// User routes
router.get('/profile', protect, getProfile);
router.put('/profile', protect, upload.single('profile_picture'), updateProfile);
router.get('/credit-score', protect, getCreditScore);
router.put('/change-password', protect, changePassword);
router.post('/fcm-token', protect, saveFcmToken);
router.get('/my-referrals', protect, getMyReferrals);

// Admin routes
router.post('/trigger-installment-notifications', protect, admin, triggerInstallmentNotifications);
router.post('/admin/add-rider', anyProtect, addRider);
router.get('/admin/all', anyProtect, getAllUsers);
router.get('/admin/referrals', anyProtect, getAllReferrals);
router.get('/admin/:id', anyProtect, getUserDetail);
router.put('/admin/:id', anyProtect, updateUserStatus);
router.delete('/admin/:id', protect, admin, deleteUser);

module.exports = router;
