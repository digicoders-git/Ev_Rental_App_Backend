const mongoose = require('mongoose');

const franchiseStoreSchema = new mongoose.Schema({
    store_id: {
        type: String,
        unique: true
    },
    franchise_id: {
        type: String,
        unique: true,
        sparse: true
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
    gstin: {
        type: String,
        default: ""
    },
    bank_details: {
        account_holder_name: { type: String, default: "" },
        bank_name: { type: String, default: "" },
        account_number: { type: String, default: "" },
        ifsc_code: { type: String, default: "" },
        branch_name: { type: String, default: "" }
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
    },
    // Payment Configuration
    payment_model: {
        type: String,
        enum: ['platform', 'split', 'direct'],
        default: 'platform'
    },
    franchise_share_percentage: {
        type: Number,
        default: 80
    },
    total_gross_revenue: {
        type: Number,
        default: 0
    },
    wallet_balance: {
        type: Number,
        default: 0
    },
    fcm_token: {
        type: String,
        default: ''
    },
    admin_agreement_document: {
        type: String,
        default: ""
    },
    franchise_agreement_document: {
        type: String,
        default: ""
    },
    razorpay_linked_account_id: {
        type: String,
        default: ""
    },
    razorpay_key_id: {
        type: String,
        default: ""
    },
    razorpay_key_secret: {
        type: String,
        default: ''
    },
    latitude: {
        type: Number,
        default: null
    },
    longitude: {
        type: Number,
        default: null
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

// Generate unique store_id and franchise_id
franchiseStoreSchema.pre('save', async function () {
    if (!this.store_id) {
        const dateStr = Date.now().toString();
        this.store_id = `STORE-${dateStr.substring(dateStr.length - 6)}`;
    }

    if (!this.franchise_id) {
        try {
            // Find the franchise with the highest franchise_id
            const lastFranchise = await this.constructor.findOne(
                { franchise_id: { $exists: true, $ne: null } },
                'franchise_id',
                { sort: { franchise_id: -1 } }
            );

            if (lastFranchise && lastFranchise.franchise_id) {
                // Extract number, e.g. "FRN001" -> 1
                const match = lastFranchise.franchise_id.match(/^FRN(\d+)$/);
                if (match) {
                    const lastNumber = parseInt(match[1], 10);
                    this.franchise_id = `FRN${String(lastNumber + 1).padStart(3, '0')}`;
                } else {
                    this.franchise_id = 'FRN001';
                }
            } else {
                this.franchise_id = 'FRN001';
            }
        } catch (error) {
            throw error;
        }
    }
});

module.exports = mongoose.model('FranchiseStore', franchiseStoreSchema);
