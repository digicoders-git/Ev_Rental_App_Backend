require('dotenv').config();
const mongoose = require('mongoose');

mongoose.connect(process.env.MONGO_URI).then(async () => {
    require('./models/userModel');
    const Booking = require('./models/bookingModel');
    const b = await Booking.findOne({ booking_id: 'BK-045909' }).populate('user', 'name mobile fcm_token');
    console.log('User name:', b.user.name);
    console.log('User mobile:', b.user.mobile);
    console.log('User _id:', b.user._id);
    console.log('FCM Token:', b.user.fcm_token ? 'SAVED: ' + b.user.fcm_token.substring(0, 40) + '...' : 'NOT SAVED');
    await mongoose.disconnect();
});
