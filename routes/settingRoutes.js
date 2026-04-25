const express = require('express');
const router = express.Router();
const { getSettings, updateSettings } = require('../controller/settingController');
const { protect, admin } = require('../middleware/authMiddleware');

router.use(protect, admin);

router.get('/', getSettings);
router.put('/', updateSettings);

module.exports = router;
