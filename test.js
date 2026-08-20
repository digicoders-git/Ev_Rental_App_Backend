const mongoose = require('mongoose');
require('dotenv').config();

const test = async () => {
    await mongoose.connect(process.env.MONGO_URI);
    const FranchiseWithdrawal = require('./models/franchiseWithdrawalModel.js');
    const withdrawnResult = await FranchiseWithdrawal.aggregate([
        { $match: { status: { $in: ['approved', 'released', 'completed'] } } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    console.log(withdrawnResult);
    
    const Booking = require('./models/bookingModel.js');
    const bookingsResult = await Booking.aggregate([
        { $match: { total_paid: { $gt: 0 }, status: { $ne: 'cancelled' } } },
        { $group: { _id: null, total: { $sum: '$total_paid' } } }
    ]);
    console.log(bookingsResult);
    process.exit();
}
test();
