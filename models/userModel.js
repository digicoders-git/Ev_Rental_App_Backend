const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
    mobile: {
        type: String,
        required: false,
        unique: true,
        sparse: true,
        trim: true
    },
    name: {
        type: String,
        default: ""
    },
    email: {
        type: String,
        default: ""
    },
    password: {
        type: String,
        select: false
    },
    profile_picture: {
        type: String,
        default: ""
    },
    role: {
        type: String,
        enum: ['user', 'admin'],
        default: 'user'
    },
    aadharNumber: {
        type: String,
        unique: true,
        sparse: true
    },
    otp: {
        type: String
    },
    otpExpire: {
        type: Date
    },
    isVerified: {
        type: Boolean,
        default: false
    },
    isKycVerified: {
        type: Boolean,
        default: false
    },
    credit_score: {
        type: Number,
        default: 700,
        min: 300,
        max: 900
    },
    status: {
        type: String,
        enum: ['active', 'blocked'],
        default: 'active'
    },
    block_reason: {
        type: String,
        default: ""
    },
    bio: {
        type: String,
        default: "Administrator of EVRental EV platform."
    },
    city: {
        type: String,
        default: ""
    },
    fcm_token: {
        type: String,
        default: null
    },
    wallet_balance: {
        type: Number,
        default: 0
    },
    claimed_offers: [{
        offer: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Offer'
        },
        status: {
            type: String,
            enum: ['claimed', 'used'],
            default: 'claimed'
        },
        claimedAt: {
            type: Date,
            default: Date.now
        }
    }],
    driver_id: {
        type: String,
        unique: true,
        sparse: true
    },
    profile_edited: {
        type: Boolean,
        default: false
    },
    referred_by: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    }
}, {
    timestamps: true
});

// Generate driver_id before saving
userSchema.pre('save', async function () {
    if (!this.driver_id) {
        // Generate a 6-digit random string for DRV-XXXXXX format
        const rand = Math.floor(100000 + Math.random() * 900000);
        this.driver_id = `DRV-${rand}`;
    }
    
    if (!this.isModified('password')) {
        return;
    }
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
});

// Compare password
userSchema.methods.matchPassword = async function (enteredPassword) {
    return await bcrypt.compare(enteredPassword, this.password);
};

const User = mongoose.model('User', userSchema);

module.exports = User;
