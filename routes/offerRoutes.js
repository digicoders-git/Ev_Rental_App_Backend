const express = require('express');
const router = express.Router();
const {
    createOffer,
    getAllOffers,
    getOfferById,
    updateOffer,
    deleteOffer,
    validateCoupon,
    toggleOfferStatus,
    claimOffer,
    getMyClaimedOffers
} = require('../controller/offerController');
const { protect, admin } = require('../middleware/authMiddleware');

// Public routes
router.get('/', getAllOffers);
// Protected routes
router.get('/my-claims', protect, getMyClaimedOffers);
router.post('/validate', protect, validateCoupon);
router.post('/claim', protect, claimOffer);

// Public route with parameter (must come after specific routes)
router.get('/:id', getOfferById);

// Admin routes
router.post('/', protect, admin, createOffer);
router.put('/:id', protect, admin, updateOffer);
router.patch('/:id/toggle', protect, admin, toggleOfferStatus);
router.delete('/:id', protect, admin, deleteOffer);

module.exports = router;
