const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
    mobile: {
        type: String,
        required: true,
        unique: true,
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
    role: {
        type: String,
        enum: ['user', 'admin'],
        default: 'user'
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
        default: "Administrator of VoltRent EV platform."
    },
    city: {
        type: String,
        default: "Bangalore"
    }
}, {
    timestamps: true
});

// Hash password before saving
userSchema.pre('save', async function () {
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
