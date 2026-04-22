const express = require('express');
const router = express.Router();
const {
    submitKYC,
    getMyKYCStatus,
    getAllKYCSubmissions,
    updateKYCStatus,
    getKYCByMobile
} = require('../controller/kycController');
const { protect, admin } = require('../middleware/authMiddleware');
const upload = require('../middleware/uploadMiddleware');

// Multiparts fields for KYC documents
const kycUploadFields = upload.fields([
    { name: 'aadharFront', maxCount: 1 },
    { name: 'aadharBack', maxCount: 1 },
    { name: 'drivingLicenseFront', maxCount: 1 },
    { name: 'drivingLicenseBack', maxCount: 1 },
    { name: 'userPhoto', maxCount: 1 }
]);

// User routes
router.post('/submit', protect, kycUploadFields, submitKYC);
router.get('/my-status', protect, getMyKYCStatus);

// Admin routes
router.get('/admin/all', protect, admin, getAllKYCSubmissions);
router.get('/admin/track/:mobile', protect, admin, getKYCByMobile);
router.put('/admin/status/:id', protect, admin, updateKYCStatus);

module.exports = router;
