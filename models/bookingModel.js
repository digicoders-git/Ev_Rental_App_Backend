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
        default: null
    },
    // Stamped at booking creation to isolate franchise data correctly
    franchise: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'FranchiseStore',
        default: null
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
    gst_amount: {
        type: Number,
        default: 0
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
        enum: ['pending', 'partially_paid', 'paid', 'failed'],
        default: 'pending'
    },
    payment_method: {
        type: String,
        enum: ['online', 'cash', 'wallet', 'installments', 'other'],
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
    razorpay_order_id: {
        type: String,
    },
    razorpay_payment_id: {
        type: String,
    },
    payment_gateway_used: {
        type: String,
        enum: ['platform', 'direct'],
        default: 'platform'
    },
    razorpay_key_used: {
        type: String,
        default: ""
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
    },
    payment_installments: [
        {
            installment_no: Number,
            amount: { type: Number, required: true },
            late_fee: { type: Number, default: 0 },
            due_date: { type: Date, required: true },
            paid_date: { type: Date, default: null },
            status: { type: String, enum: ['pending', 'paid', 'overdue'], default: 'pending' },
            transaction_id: { type: String, default: '' }
        }
    ],
    damage_charges: [
        {
            description: { type: String, required: true },
            amount: { type: Number, required: true },
            added_by: { type: String, enum: ['admin', 'franchise'], default: 'admin' },
            createdAt: { type: Date, default: Date.now }
        }
    ],
    return_status: {
        type: String,
        enum: ['none', 'submission_pending', 'approved', 'rejected'],
        default: 'none'
    },
    is_vehicle_released: {
        type: Boolean,
        default: false
    }
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

bookingSchema.virtual('due_amount').get(function() {
    return Math.max(0, this.grand_total - this.total_paid);
});

// Generate unique booking_id before saving
bookingSchema.pre('save', async function() {
    if (!this.booking_id) {
        const dateStr = Date.now().toString();
        this.booking_id = `BK-${dateStr.substring(dateStr.length - 6)}`;
    }
});

module.exports = mongoose.model('Booking', bookingSchema);
