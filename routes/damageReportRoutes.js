const express = require('express');
const router = express.Router();
const {
    submitDamageReport,
    getMyDamageReports,
    getAllDamageReports,
    updateDamageReportStatus
} = require('../controller/damageReportController');
const { protect, admin, anyProtect } = require('../middleware/authMiddleware');
const upload = require('../middleware/uploadMiddleware');

// Customer Route (Any authenticated user including franchise if needed)
router.post('/', anyProtect, upload.array('photos', 5), submitDamageReport);
router.get('/my', anyProtect, getMyDamageReports);

// Admin Routes
router.get('/admin', protect, admin, getAllDamageReports);
router.patch('/:id', protect, admin, updateDamageReportStatus);

module.exports = router;
