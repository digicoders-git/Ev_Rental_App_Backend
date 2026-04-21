const express = require('express');
const router = express.Router();

// @desc    Test route
// @route   GET /api/test
// @access  Public
router.get('/test', (req, res) => {
    res.json({ success: true, message: 'API is working correctly' });
});

module.exports = router;
