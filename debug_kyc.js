const mongoose = require('mongoose');
const Booking = require('./models/bookingModel');
const User = require('./models/userModel');
const KYC = require('./models/kycModel');

async function debugBookings() {
    try {
        await mongoose.connect('mongodb+srv://digicodersdevelopment_db_user:KoJGvdKsGU9IQQvk@cluster0.9ssqshr.mongodb.net/EV_RentalApp?retryWrites=true&w=majority');
        
        const allKyc = await KYC.find().populate('user');
        for (const k of allKyc) {
            console.log(JSON.stringify(k, null, 2));
            console.log('-------------------------');
        }

    } catch (err) {
        console.error(err);
    } finally {
        mongoose.disconnect();
    }
}

debugBookings();
