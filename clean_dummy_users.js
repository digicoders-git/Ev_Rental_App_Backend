const mongoose = require('mongoose');
const User = require('./models/userModel');
const Booking = require('./models/bookingModel');
const KYC = require('./models/kycModel');
require('dotenv').config();

const cleanDummyUsers = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI);
        console.log('Connected to MongoDB');

        // Find all users with role 'user'
        const users = await User.find({ role: 'user' });
        console.log(`Found ${users.length} total users.`);

        let deletedCount = 0;

        for (const user of users) {
            // Check if the user has any bookings
            const bookingCount = await Booking.countDocuments({ user: user._id });
            
            if (bookingCount === 0) {
                // Delete associated KYC if exists
                await KYC.deleteOne({ user: user._id });
                // Delete the user
                await User.deleteOne({ _id: user._id });
                deletedCount++;
                console.log(`Deleted user: ${user.name} (${user.email || user.mobile})`);
            }
        }

        console.log(`\nCleanup Complete! Deleted ${deletedCount} dummy users who had 0 bookings.`);
        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
};

cleanDummyUsers();
