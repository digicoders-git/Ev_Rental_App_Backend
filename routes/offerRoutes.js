const express = require('express');
const router = express.Router();
const {
    createOffer,
    getAllOffers,
    getOfferById,
    updateOffer,
    deleteOffer,
    validateCoupon,
    toggleOfferStatus
} = require('../controller/offerController');
const { protect, admin } = require('../middleware/authMiddleware');

// Public routes
router.get('/', getAllOffers);
router.get('/:id', getOfferById);

// Protected routes
router.post('/validate', protect, validateCoupon);

// Admin routes
router.post('/', protect, admin, createOffer);
router.put('/:id', protect, admin, updateOffer);
router.patch('/:id/toggle', protect, admin, toggleOfferStatus);
router.delete('/:id', protect, admin, deleteOffer);

module.exports = router;
