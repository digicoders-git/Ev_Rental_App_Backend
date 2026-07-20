const express = require('express');
const router = express.Router();
const { getInvoiceByBooking, getAllInvoices } = require('../controller/invoiceController');
const { protect, admin, anyProtect } = require('../middleware/authMiddleware');

router.get('/', anyProtect, getAllInvoices);
router.get('/booking/:bookingId', anyProtect, getInvoiceByBooking);

module.exports = router;
