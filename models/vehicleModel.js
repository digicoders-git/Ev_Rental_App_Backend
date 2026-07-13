const mongoose = require('mongoose');

const vehicleSchema = new mongoose.Schema({
    // Basic Details
    vehicle_name: {
        type: String,
        required: [true, 'Please add a vehicle name'],
        trim: true
    },
    brand: {
        type: String,
        required: [true, 'Please add a brand'],
    },
    model: {
        type: String,
    },
    vehicle_type: {
        type: String,
        enum: ['car', 'bike', 'scooter'],
        required: [true, 'Please add a vehicle type'],
    },
    category: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'VehicleCategory',
        default: null
    },
    year: {
        type: Number,
    },
    color: {
        type: String,
    },

    // Identification
    registration_number: {
        type: String,
        unique: true,
        trim: true
    },
    vehicle_id: {
        type: String,
        unique: true,
        trim: true
    },

    // EV Info
    battery_capacity: {
        type: String,
    },
    range_per_charge: {
        type: String,
    },
    charging_time: {
        type: String,
    },
    charger_type: {
        type: String,
    },

    // Media
    thumbnail_image: {
        type: String, // Single path
    },
    images: [{
        type: String, // Array of paths
    }],

    // Documents
    insurance_valid_till: {
        type: Date,
    },
    rc_document: {
        type: String, // Path to document
    },

    status: {
        type: String,
        enum: ['active', 'inactive', 'maintenance', 'out_of_order'],
        default: 'active'
    },
    vehicle_condition: {
        type: String,
    },

    // Extra
    description: {
        type: String,
    },
    features: [{
        type: String,
    }],
    
    // Price (Adding back as it was in original but not in user list, likely needed for rental)
    price_per_day: {
        type: Number,
        default: 0
    },

    // GPS & Tracking
    current_location: {
        lat: { type: Number, default: 0 },
        lng: { type: Number, default: 0 },
        address: { type: String, default: "" }
    },
    current_battery: {
        type: Number,
        default: 100 // Percentage
    },
    last_gps_update: {
        type: Date,
        default: Date.now
    },

    // Ratings
    avgRating: {
        type: Number,
        default: 0
    },
    totalReviews: {
        type: Number,
        default: 0
    },
    franchise: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'FranchiseStore',
        default: null
    },
    added_by_franchise: {
        type: Boolean,
        default: false
    }
}, {
    timestamps: true
});

// Generate unique vehicle_id before saving
vehicleSchema.pre('save', async function() {
    if (!this.vehicle_id) {
        const dateStr = Date.now().toString();
        this.vehicle_id = `VEH-${dateStr.substring(dateStr.length - 6)}`;
    }
});

module.exports = mongoose.model('Vehicle', vehicleSchema);
