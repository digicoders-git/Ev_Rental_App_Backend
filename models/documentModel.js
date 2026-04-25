const mongoose = require('mongoose');

const documentSchema = new mongoose.Schema({
    category: {
        type: String,
        enum: ['Vehicle', 'Franchise', 'User'],
        required: true
    },
    entity: {
        type: String,
        required: true
    },
    entityId: {
        type: String,
        required: true
    },
    type: {
        type: String,
        required: true
    },
    docNo: {
        type: String,
        required: true
    },
    issueDate: {
        type: Date
    },
    expiryDate: {
        type: Date,
        required: true
    },
    file: {
        type: String, // Path to file
        required: true
    },
    status: {
        type: String,
        enum: ['Valid', 'Expiring', 'Expired', 'Pending'],
        default: 'Valid'
    }
}, {
    timestamps: true
});

// Middleware to update status based on expiry date before saving
documentSchema.pre('save', async function() {
    if (this.expiryDate) {
        const today = new Date();
        const expiry = new Date(this.expiryDate);
        const diffDays = Math.ceil((expiry - today) / (1000 * 60 * 60 * 24));
        
        if (diffDays < 0) {
            this.status = 'Expired';
        } else if (diffDays < 30) {
            this.status = 'Expiring';
        } else {
            this.status = 'Valid';
        }
    }
});

const Document = mongoose.model('Document', documentSchema);

module.exports = Document;
