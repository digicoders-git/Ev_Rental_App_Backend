const express = require('express');
const router = express.Router();
const {
    submitKYC,
    getMyKYCStatus,
    getAllKYCSubmissions,
    updateKYCStatus,
    getKYCByMobile,
    createFeeOrder
} = require('../controller/kycController');
const { protect, admin, franchiseProtect, anyProtect } = require('../middleware/authMiddleware');
const upload = require('../middleware/uploadMiddleware');

const kycUploadFields = upload.fields([
    { name: 'aadharFront', maxCount: 1 },
    { name: 'aadharBack', maxCount: 1 },
    { name: 'panCard', maxCount: 1 },
    { name: 'selfie', maxCount: 1 }
]);

// User routes
router.post('/submit', protect, kycUploadFields, submitKYC);
router.post('/create-fee-order', protect, createFeeOrder);
router.get('/my-status', protect, getMyKYCStatus);

// Admin routes
router.get('/admin/all', protect, admin, getAllKYCSubmissions);
router.get('/admin/track/:mobile', protect, admin, getKYCByMobile);
router.put('/admin/status/:id', protect, admin, updateKYCStatus);

module.exports = router;
