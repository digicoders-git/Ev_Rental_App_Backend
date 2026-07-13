const express = require('express');
const router = express.Router();
const { getSettings, updateSettings, cleanupOldRecords } = require('../controller/settingController');
const { protect, admin } = require('../middleware/authMiddleware');

router.use(protect, admin);

router.get('/', getSettings);
router.put('/', updateSettings);
router.delete('/cleanup', cleanupOldRecords);

module.exports = router;
