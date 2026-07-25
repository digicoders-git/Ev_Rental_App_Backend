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
    verifyPayment,
    changeAssignedVehicle,
    unassignVehicle,
    requestVehicleSubmission,
    approveVehicleSubmission,
    rejectVehicleSubmission,
    initiateInstallmentOnline,
    verifyInstallmentOnline,
    payAllInstallmentsWithWallet,
    initiateAllInstallmentsOnline,
    verifyAllInstallmentsOnline,
    payLateSubmissionWithWallet,
    initiateLateSubmissionOnline,
    verifyLateSubmissionOnline
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
router.put('/:id/change-vehicle', anyProtect, changeAssignedVehicle);
router.put('/:id/unassign', anyProtect, unassignVehicle);

// Installment Routes
router.post('/:id/installments/setup', anyProtect, setupInstallments);
router.post('/:id/installments/pay-all-wallet', protect, payAllInstallmentsWithWallet);
router.post('/:id/installments/initiate-all-online', protect, initiateAllInstallmentsOnline);
router.post('/:id/installments/verify-all-online', protect, verifyAllInstallmentsOnline);
router.post('/:id/installments/:instId/pay', anyProtect, payInstallment);
router.post('/:id/installments/:instId/pay-with-wallet', protect, payInstallmentWithWallet);
router.post('/:id/installments/:instId/initiate-online', protect, initiateInstallmentOnline);
router.post('/:id/installments/:instId/verify-online', protect, verifyInstallmentOnline);

// Damage / Extra Charge Routes
router.post('/:id/damage-charge', anyProtect, addDamageCharge);

// Wallet Payments
router.post('/:id/pay-with-wallet', protect, payBookingWithWallet);

// Vehicle Submission Flow
router.post('/:id/submit-vehicle', protect, requestVehicleSubmission);
router.post('/:id/approve-submission', anyProtect, approveVehicleSubmission);
router.post('/:id/reject-submission', anyProtect, rejectVehicleSubmission);

// Late Vehicle Submission Payments
router.post('/:id/late-submission/pay-wallet', protect, payLateSubmissionWithWallet);
router.post('/:id/late-submission/initiate-online', protect, initiateLateSubmissionOnline);
router.post('/:id/late-submission/verify-online', protect, verifyLateSubmissionOnline);

module.exports = router;
