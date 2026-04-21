const Review = require('../models/reviewModel');
const Booking = require('../models/bookingModel');
const Vehicle = require('../models/vehicleModel');

// @desc    Add a review for a completed booking
// @route   POST /api/reviews
// @access  Private
exports.addReview = async (req, res) => {
    try {
        const { bookingId, rating, comment } = req.body;

        // Verify booking exists and belongs to user
        const booking = await Booking.findById(bookingId);
        
        if (!booking) {
            return res.status(404).json({ success: false, message: 'Booking not found' });
        }

        if (booking.user.toString() !== req.user.id) {
            return res.status(401).json({ success: false, message: 'You can only review your own bookings' });
        }

        if (booking.booking_status !== 'completed') {
            return res.status(400).json({ success: false, message: 'You can only review completed rides' });
        }

        // Check if already reviewed
        const alreadyReviewed = await Review.findOne({ booking: bookingId });
        if (alreadyReviewed) {
            return res.status(400).json({ success: false, message: 'You have already reviewed this booking' });
        }

        const review = await Review.create({
            user: req.user.id,
            vehicle: booking.vehicle,
            booking: bookingId,
            rating,
            comment
        });

        res.status(201).json({
            success: true,
            message: 'Review added successfully',
            data: review
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Get reviews for a vehicle
// @route   GET /api/reviews/vehicle/:vehicleId
// @access  Public
exports.getVehicleReviews = async (req, res) => {
    try {
        const reviews = await Review.find({ vehicle: req.params.vehicleId })
            .populate('user', 'name')
            .sort('-createdAt');

        res.status(200).json({
            success: true,
            count: reviews.length,
            data: reviews
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
