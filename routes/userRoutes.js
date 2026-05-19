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
    deleteUser
} = require('../controller/userController');
const { protect, admin, anyProtect } = require('../middleware/authMiddleware');

// User routes
router.get('/profile', protect, getProfile);
router.put('/profile', protect, updateProfile);
router.get('/credit-score', protect, getCreditScore);
router.put('/change-password', protect, changePassword);

// Admin & Franchise routes
router.post('/admin/add-rider', anyProtect, addRider);
router.get('/admin/all', anyProtect, getAllUsers);
router.get('/admin/:id', protect, admin, getUserDetail);
router.put('/admin/:id', protect, admin, updateUserStatus);
router.delete('/admin/:id', protect, admin, deleteUser);

module.exports = router;
