const express = require('express');
const router = express.Router();
const { generateSettlement, getSettlements } = require('../controller/settlementController');
const { protect, admin, anyProtect } = require('../middleware/authMiddleware');

router.get('/', protect, anyProtect, getSettlements);
router.post('/generate', protect, admin, generateSettlement);

module.exports = router;
