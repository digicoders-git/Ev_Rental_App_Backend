const express = require('express');
const router = express.Router();
const {
    submitEnquiry,
    getAllEnquiries,
    getEnquiryById,
    updateEnquiryStatus,
    addFranchiseStore,
    getAllFranchiseStores,
    getFranchiseStoreById,
    updateFranchiseStore,
    deleteFranchiseStore,
    franchiseLogin,
    getFranchiseProfile,
    updateFranchiseProfile,
    changeFranchisePassword,
    getFranchiseRevenue,
    getAdminRevenueByFranchise
} = require('../controller/franchiseController');
const { protect, admin, franchiseProtect } = require('../middleware/authMiddleware');
const upload = require('../middleware/uploadMiddleware');

// Public route: Submit enquiry
router.post('/', submitEnquiry);

// Franchise Owner Routes
router.post('/login', franchiseLogin);
router.get('/profile', franchiseProtect, getFranchiseProfile);
router.put('/profile', franchiseProtect, upload.single('profile_image'), updateFranchiseProfile);
router.put('/change-password', franchiseProtect, changeFranchisePassword);
router.get('/revenue', franchiseProtect, getFranchiseRevenue);

// Admin routes: Store & Revenue Management
router.get('/admin/revenue/:id', protect, admin, getAdminRevenueByFranchise);
router.post('/stores', protect, admin, addFranchiseStore);
router.get('/stores', protect, admin, getAllFranchiseStores);
router.get('/stores/:id', protect, admin, getFranchiseStoreById);
router.put('/stores/:id', protect, admin, updateFranchiseStore);
router.delete('/stores/:id', protect, admin, deleteFranchiseStore);

// Admin routes: Enquiry Management
router.get('/', protect, admin, getAllEnquiries);
router.get('/:id', protect, admin, getEnquiryById);
router.patch('/:id/status', protect, admin, updateEnquiryStatus);

module.exports = router;
