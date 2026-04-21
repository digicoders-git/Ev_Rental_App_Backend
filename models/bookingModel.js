const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema({
    booking_id: {
        type: String,
        unique: true
    },
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
    plan: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'RentalPlan',
        required: true
    },
    start_date: {
        type: Date,
        required: true
    },
    end_date: {
        type: Date,
        required: true
    },
    total_amount: {
        type: Number,
        required: true
    },
    discount_amount: {
        type: Number,
        default: 0
    },
    security_deposit: {
        type: Number,
        default: 0
    },
    grand_total: {
        type: Number,
        required: true
    },
    total_paid: {
        type: Number,
        default: 0
    },
    payment_status: {
        type: String,
        enum: ['pending', 'paid', 'failed'],
        default: 'pending'
    },
    payment_method: {
        type: String,
        enum: ['online', 'cash', 'wallet', 'other'],
        default: 'online'
    },
    booking_status: {
        type: String,
        enum: ['pending', 'confirmed', 'ongoing', 'completed', 'cancelled'],
        default: 'pending'
    },
    pickup_location: {
        type: String,
    },
    drop_location: {
        type: String,
    },
    transaction_id: {
        type: String,
    },
    actual_return_date: {
        type: Date
    },
    late_fee: {
        type: Number,
        default: 0
    },
    additional_charges: {
        type: Number,
        default: 0
    }
}, {
    timestamps: true
});

// Generate unique booking_id before saving
bookingSchema.pre('save', async function() {
    if (!this.booking_id) {
        const dateStr = Date.now().toString();
        this.booking_id = `BK-${dateStr.substring(dateStr.length - 6)}`;
    }
});

module.exports = mongoose.model('Booking', bookingSchema);
