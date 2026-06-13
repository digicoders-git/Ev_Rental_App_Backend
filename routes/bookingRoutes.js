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
    rejectBooking,
    setupInstallments,
    payInstallment,
    addDamageCharge,
    payBookingWithWallet,
    payInstallmentWithWallet,
    verifyPayment
} = require('../controller/bookingController');
const { protect, admin, franchiseProtect, anyProtect } = require('../middleware/authMiddleware');

// Public/User Routes
router.post('/', anyProtect, createBooking);
router.post('/verify-payment', anyProtect, verifyPayment);
router.get('/my', protect, getMyBookings);
router.get('/dues/my', protect, getMyDues);

// Management & Admin
router.get('/admin/dues', protect, admin, getAdminDues);
router.post('/:id/pay-manual', anyProtect, markPaymentPaid);


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

// Installment Routes
router.post('/:id/installments/setup', anyProtect, setupInstallments);
router.post('/:id/installments/:instId/pay', anyProtect, payInstallment);
router.post('/:id/installments/:instId/pay-with-wallet', protect, payInstallmentWithWallet);

// Damage / Extra Charge Routes
router.post('/:id/damage-charge', anyProtect, addDamageCharge);

// Wallet Payments
router.post('/:id/pay-with-wallet', protect, payBookingWithWallet);

module.exports = router;
