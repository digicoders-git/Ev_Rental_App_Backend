const express = require('express');
const router = express.Router();
const { getMyWallet, addFunds, deductFunds, addMyFunds, createWalletRechargeOrder, verifyWalletRechargePayment } = require('../controller/walletController');
const { protect, admin } = require('../middleware/authMiddleware');

router.get('/balance', protect, getMyWallet);
router.post('/add', protect, addMyFunds); // Legacy/testing
router.post('/recharge/create-order', protect, createWalletRechargeOrder);
router.post('/recharge/verify', protect, verifyWalletRechargePayment);

router.post('/admin/add', protect, admin, addFunds);
router.post('/admin/deduct', protect, admin, deductFunds);

module.exports = router;
