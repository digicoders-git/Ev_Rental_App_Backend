const mongoose = require('mongoose');
const Booking = require('./models/bookingModel');
const { runInstallmentNotifications } = require('./utils/installmentScheduler');
require('dotenv').config();

const testNotification = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('MongoDB Connected');

        // Find one active booking with pending installments
        const booking = await Booking.findOne({
            'payment_installments.status': 'pending',
            booking_status: { $in: ['confirmed', 'ongoing'] }
        });

        if (!booking) {
            console.log('No active bookings with pending installments found.');
            process.exit(0);
        }

        // Set the due date of the first pending installment to 3 days from now
        const now = new Date();
        const in3Days = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 3, 10, 0, 0);
        
        let modified = false;
        for (const inst of booking.payment_installments) {
            if (inst.status === 'pending') {
                inst.due_date = in3Days;
                modified = true;
                break;
            }
        }

        if (modified) {
            await booking.save();
            console.log(`Updated Booking ${booking.booking_id} next due date to exactly 3 days from now (${in3Days.toISOString()})`);
        }

        // Trigger the notification logic
        console.log('Triggering installment scheduler...');
        const result = await runInstallmentNotifications();
        console.log('Scheduler Result:', result);

        console.log('Test complete! Check the Admin Panel for the browser notification.');
        process.exit(0);
    } catch (error) {
        console.error('Test Failed:', error);
        process.exit(1);
    }
};

testNotification();
