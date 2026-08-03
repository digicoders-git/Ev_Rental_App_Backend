const mongoose = require('mongoose');
const Booking = require('./models/bookingModel');
const dotenv = require('dotenv');
dotenv.config();

mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/ev_rental').then(async () => {
    console.log('Connected to DB');
    const b = await Booking.findOne({ booking_status: { $in: ['confirmed', 'ongoing'] } }).sort('-createdAt');
    if (b) {
        b.auto_renew = true;
        b.end_date = new Date(Date.now() - 1000 * 60 * 60 * 24); // Set to yesterday
        await b.save();
        console.log('Forced booking', b.booking_id, 'to be auto_renew=true and expired.');
    } else {
        console.log('No active booking found to manipulate.');
    }
    process.exit(0);
});
