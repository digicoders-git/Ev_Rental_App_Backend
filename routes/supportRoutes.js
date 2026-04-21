const express = require('express');
const router = express.Router();
const {
    createTicket,
    getMyTickets,
    getAllTickets,
    updateTicket
} = require('../controller/supportController');
const { protect, admin } = require('../middleware/authMiddleware');
const upload = require('../middleware/uploadMiddleware');

// All routes are protected
router.use(protect);

// User routes
router.post('/ticket', upload.array('attachments', 5), createTicket);
router.get('/my-tickets', getMyTickets);

// Admin routes
router.get('/admin/all', admin, getAllTickets);
router.put('/admin/ticket/:id', admin, updateTicket);

module.exports = router;
