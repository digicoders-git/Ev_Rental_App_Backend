const mongoose = require('mongoose');

const gigCompanySchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    logo: {
        type: String,
        default: ""
    },
    isActive: {
        type: Boolean,
        default: true
    }
}, {
    timestamps: true
});

const GigCompany = mongoose.model('GigCompany', gigCompanySchema);

module.exports = GigCompany;
