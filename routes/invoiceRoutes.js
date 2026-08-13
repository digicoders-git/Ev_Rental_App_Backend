const express = require('express');
const router = express.Router();
const { getInvoiceByBooking, getAllInvoices, downloadInvoicePDF, downloadBulkInvoiceReport } = require('../controller/invoiceController');
const { protect, admin, anyProtect } = require('../middleware/authMiddleware');

router.get('/', anyProtect, getAllInvoices);
router.get('/booking/:bookingId', anyProtect, getInvoiceByBooking);
router.get('/report/download', anyProtect, downloadBulkInvoiceReport);
router.get('/:id/receipt', anyProtect, downloadInvoicePDF);

module.exports = router;
