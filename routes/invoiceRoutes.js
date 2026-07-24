const express = require('express');
const router = express.Router();
const { getInvoiceByBooking, getAllInvoices, downloadInvoicePDF } = require('../controller/invoiceController');
const { protect, admin, anyProtect } = require('../middleware/authMiddleware');

router.get('/', anyProtect, getAllInvoices);
router.get('/booking/:bookingId', anyProtect, getInvoiceByBooking);
router.get('/:id/receipt', anyProtect, downloadInvoicePDF);

module.exports = router;
