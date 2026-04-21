const mongoose = require('mongoose');

const franchiseStoreSchema = new mongoose.Schema({
    store_id: {
        type: String,
        unique: true
    },
    store_name: {
        type: String,
        required: [true, 'Please add store name'],
        trim: true
    },
    owner_name: {
        type: String,
        required: [true, 'Please add owner name']
    },
    mobile: {
        type: String,
        required: [true, 'Please add mobile number']
    },
    email: {
        type: String,
        required: [true, 'Please add email']
    },
    address: {
        type: String,
        required: [true, 'Please add full address']
    },
    city: {
        type: String,
        required: [true, 'Please add city']
    },
    state: {
        type: String,
        required: [true, 'Please add state']
    },
    password: {
        type: String,
        required: [true, 'Please add password'],
        select: false
    },
    profile_image: {
        type: String,
        default: ""
    },
    agreement_date: {
        type: Date
    },
    expiry_date: {
        type: Date
    },
    status: {
        type: String,
        enum: ['active', 'inactive', 'suspended'],
        default: 'active'
    }
}, {
    timestamps: true
});

const bcrypt = require('bcryptjs');

// Hash password before saving
franchiseStoreSchema.pre('save', async function () {
    if (!this.isModified('password')) {
        return;
    }
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
});

// Compare password
franchiseStoreSchema.methods.matchPassword = async function (enteredPassword) {
    return await bcrypt.compare(enteredPassword, this.password);
};

// Generate unique store_id
franchiseStoreSchema.pre('save', async function() {
    if (!this.store_id) {
        const dateStr = Date.now().toString();
        this.store_id = `STORE-${dateStr.substring(dateStr.length - 6)}`;
    }
});

module.exports = mongoose.model('FranchiseStore', franchiseStoreSchema);
