const express = require('express');
const router = express.Router();
const { getSettings, updateSettings, cleanupOldRecords, exportDatabaseBackup, getTermsAndConditions } = require('../controller/settingController');
const { protect, admin } = require('../middleware/authMiddleware');

// PUBLIC: Terms & Conditions (no auth needed for Flutter app)
router.get('/terms', getTermsAndConditions);

router.use(protect, admin);

router.get('/', getSettings);
router.put('/', updateSettings);
router.delete('/cleanup', cleanupOldRecords);
router.get('/backup', exportDatabaseBackup);

module.exports = router;
