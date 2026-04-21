const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    vehicle: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Vehicle',
        required: true
    },
    booking: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Booking',
        required: true,
        unique: true // One review per booking
    },
    rating: {
        type: Number,
        required: true,
        min: 1,
        max: 5
    },
    comment: {
        type: String,
        trim: true
    }
}, {
    timestamps: true
});

// Calculate Average Rating for Vehicle after a review is saved
reviewSchema.statics.calculateAverageRating = async function(vehicleId) {
    const stats = await this.aggregate([
        { $match: { vehicle: vehicleId } },
        { 
            $group: { 
                _id: "$vehicle", 
                avgRating: { $avg: "$rating" },
                totalReviews: { $sum: 1 }
            } 
        }
    ]);

    try {
        if (stats.length > 0) {
            await mongoose.model('Vehicle').findByIdAndUpdate(vehicleId, {
                avgRating: stats[0].avgRating.toFixed(1),
                totalReviews: stats[0].totalReviews
            });
        }
    } catch (err) {
        console.error('Error updating vehicle rating:', err);
    }
};

// Call calculateAverageRating after save
reviewSchema.post('save', function() {
    this.constructor.calculateAverageRating(this.vehicle);
});

module.exports = mongoose.model('Review', reviewSchema);
