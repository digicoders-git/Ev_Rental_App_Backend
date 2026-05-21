require('dotenv').config();
const mongoose = require('mongoose');

mongoose.connect(process.env.MONGO_URI).then(async () => {
    require('./models/userModel');
    const Booking = require('./models/bookingModel');

    // New query without booking_status filter
    const bookings = await Booking.find({
        'payment_installments.status': { $in: ['pending', 'overdue'] },
    }).populate('user', 'name mobile fcm_token');

    console.log('Scheduler will find:', bookings.length, 'bookings');
    bookings.forEach(b => {
        console.log(`\nBooking: ${b.booking_id} | Status: ${b.booking_status}`);
        console.log(`User: ${b.user?.name} | FCM: ${b.user?.fcm_token ? 'SAVED ✓' : 'NOT SAVED ✗'}`);
        b.payment_installments.forEach(inst => {
            const dueDate = new Date(inst.due_date);
            const now = new Date();
            const dueMidnight = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());
            const nowMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            const daysLeft = Math.round((dueMidnight - nowMidnight) / (1000 * 60 * 60 * 24));
            console.log(`  Installment #${inst.installment_no}: ₹${inst.amount} | Due: ${dueDate.toDateString()} | Days left: ${daysLeft} | Status: ${inst.status}`);
        });
    });

    await mongoose.disconnect();
});
