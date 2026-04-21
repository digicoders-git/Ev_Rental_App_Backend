const express = require('express');
const router = express.Router();
const {
    createBooking,
    getMyBookings,
    getAllBookings,
    getBookingById,
    updateBookingStatus,
    calculateLateFee,
    returnVehicle,
    downloadReceipt,
    getFranchiseBookings,
    getMyDues,
    getAdminDues,
    markPaymentPaid,
    cancelBooking,
    extendBooking,
    approveBooking,
    rejectBooking
} = require('../controller/bookingController');
const { protect, admin, franchiseProtect, anyProtect } = require('../middleware/authMiddleware');

// Public/User Routes
router.post('/', protect, createBooking);
router.get('/my', protect, getMyBookings);
router.get('/dues/my', protect, getMyDues);

// Management & Admin
router.get('/admin/dues', protect, admin, getAdminDues);
router.post('/:id/pay-manual', protect, admin, markPaymentPaid);


// Franchise Specific
router.get('/franchise/my', franchiseProtect, getFranchiseBookings);

// Shared Detail/Action Routes
router.get('/:id', anyProtect, getBookingById);
router.get('/:id/calculate-late-fee', anyProtect, calculateLateFee);
router.post('/:id/return', anyProtect, returnVehicle);
router.get('/:id/receipt', anyProtect, downloadReceipt);
router.post('/:id/cancel', protect, cancelBooking);
router.post('/:id/extend', protect, extendBooking);

// Admin & Management
router.get('/', anyProtect, getAllBookings);
router.patch('/:id/approve', anyProtect, approveBooking);
router.patch('/:id/reject', anyProtect, rejectBooking);
router.patch('/:id/status', anyProtect, updateBookingStatus);

module.exports = router;
