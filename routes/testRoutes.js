const express = require('express');
const router = express.Router();
const { runInstallmentNotifications } = require('../utils/installmentScheduler');

// @desc    Test route
// @route   GET /api/test
// @access  Public
router.get('/test', (req, res) => {
    res.json({ success: true, message: 'API is working correctly' });
});

// @desc    Manually trigger installment notifications (for testing)
// @route   POST /api/trigger-installment-notifications
// @access  Public (test only)
router.post('/trigger-installment-notifications', async (req, res) => {
    try {
        const force = req.query.force === 'true';
        const result = await runInstallmentNotifications(force);
        res.json({ success: true, ...result });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
