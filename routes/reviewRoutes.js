const express = require('express');
const router = express.Router();
const { addReview, getVehicleReviews } = require('../controller/reviewController');
const { protect } = require('../middleware/authMiddleware');

router.post('/', protect, addReview);
router.get('/vehicle/:vehicleId', getVehicleReviews);

module.exports = router;
