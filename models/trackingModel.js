const mongoose = require('mongoose');

const trackingSchema = new mongoose.Schema({
    vehicle: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Vehicle',
        required: true
    },
    booking: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Booking',
        // Optional because we might track vehicle even when not booked
    },
    location: {
        lat: { type: Number, required: true },
        lng: { type: Number, required: true },
        address: { type: String }
    },
    battery_level: {
        type: Number
    },
    speed: {
        type: Number // km/h
    },
    timestamp: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

// Index for faster history lookups
trackingSchema.index({ vehicle: 1, timestamp: -1 });

module.exports = mongoose.model('Tracking', trackingSchema);
