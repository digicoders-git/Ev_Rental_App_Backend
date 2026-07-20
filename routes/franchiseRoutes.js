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
    getAdminRevenueByFranchise,
    getFranchiseHistory,
    getPublicFranchiseStores
} = require('../controller/franchiseController');
const {
    getWalletDetails,
    requestWithdrawal,
    getWithdrawals,
    getAllWithdrawals,
    approveWithdrawal,
    rejectWithdrawal,
    uploadAgreement,
    uploadFranchiseAgreement
} = require('../controller/franchiseWalletController');
const { protect, admin, franchiseProtect } = require('../middleware/authMiddleware');
const upload = require('../middleware/uploadMiddleware');

// Public route: Submit enquiry (with optional KYC doc upload)
const franchiseUploadFields = upload.fields([
    { name: 'aadharFront', maxCount: 1 },
    { name: 'aadharBack', maxCount: 1 },
    { name: 'panCard', maxCount: 1 },
    { name: 'selfie', maxCount: 1 }
]);
router.post('/', franchiseUploadFields, submitEnquiry);
router.get('/public/stores', getPublicFranchiseStores);

// Franchise Owner Routes
router.post('/login', franchiseLogin);
router.get('/profile', franchiseProtect, getFranchiseProfile);
router.put('/profile', franchiseProtect, upload.single('profile_image'), updateFranchiseProfile);
router.put('/change-password', franchiseProtect, changeFranchisePassword);
router.get('/revenue', franchiseProtect, getFranchiseRevenue);
router.put('/store/agreement', franchiseProtect, upload.single('franchise_agreement_document'), uploadFranchiseAgreement);

// Franchise Wallet Routes
router.get('/wallet', franchiseProtect, getWalletDetails);
router.post('/wallet/withdraw', franchiseProtect, requestWithdrawal);
router.get('/wallet/withdrawals', franchiseProtect, getWithdrawals);

// Admin routes: Store & Revenue Management
router.get('/admin/revenue/:id', protect, admin, getAdminRevenueByFranchise);
router.post('/stores', protect, admin, addFranchiseStore);
router.get('/stores', protect, admin, getAllFranchiseStores);
router.get('/stores/:id', protect, admin, getFranchiseStoreById);
router.get('/stores/:id/history', protect, admin, getFranchiseHistory);
router.put('/stores/:id', protect, admin, updateFranchiseStore);
router.delete('/stores/:id', protect, admin, deleteFranchiseStore);
router.put('/admin/stores/:id/agreement', protect, admin, upload.single('agreement_document'), uploadAgreement);

// Admin routes: Withdrawals Management
router.get('/admin/withdrawals', protect, admin, getAllWithdrawals);
router.put('/admin/withdrawals/:id/approve', protect, admin, upload.single('payment_proof'), approveWithdrawal);
router.put('/admin/withdrawals/:id/reject', protect, admin, rejectWithdrawal);

// Admin routes: Enquiry Management
router.get('/', protect, admin, getAllEnquiries);
router.get('/:id', protect, admin, getEnquiryById);
router.patch('/:id/status', protect, admin, updateEnquiryStatus);

module.exports = router;
