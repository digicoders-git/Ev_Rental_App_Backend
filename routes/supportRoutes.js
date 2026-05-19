const express = require('express');
const router = express.Router();
const {
    createTicket,
    getMyTickets,
    getAllTickets,
    updateTicket
} = require('../controller/supportController');
const { protect, admin, anyProtect } = require('../middleware/authMiddleware');
const upload = require('../middleware/uploadMiddleware');

// User & Franchise routes
router.post('/ticket', anyProtect, upload.array('attachments', 5), createTicket);
router.get('/my-tickets', anyProtect, getMyTickets);

// Admin routes
router.get('/admin/all', protect, admin, getAllTickets);
router.put('/admin/ticket/:id', protect, admin, updateTicket);

module.exports = router;
