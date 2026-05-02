const mongoose = require('mongoose');
const Booking = require('./models/bookingModel');
const User = require('./models/userModel');
const KYC = require('./models/kycModel');

async function debugBookings() {
    try {
        await mongoose.connect('mongodb+srv://digicodersdevelopment_db_user:KoJGvdKsGU9IQQvk@cluster0.9ssqshr.mongodb.net/EV_RentalApp?retryWrites=true&w=majority');
        
        const allKyc = await KYC.find().populate('user');
        console.log('--- ALL KYC RECORDS ---');
        for (const k of allKyc) {
            console.log(`User: ${k.user?.name} (Mobile: ${k.user?.mobile}, ID: ${k.user?._id})`);
            console.log(`Status: ${k.status}`);
            console.log('-------------------------');
        }

    } catch (err) {
        console.error(err);
    } finally {
        mongoose.disconnect();
    }
}

debugBookings();
