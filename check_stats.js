const mongoose = require('mongoose');
const Booking = require('./models/bookingModel');
const User = require('./models/userModel');
const Vehicle = require('./models/vehicleModel');
const FranchiseStore = require('./models/franchiseStoreModel');
const Document = require('./models/documentModel');
const KYC = require('./models/kycModel');

const MONGO_URI = 'mongodb+srv://digicodersdevelopment_db_user:KoJGvdKsGU9IQQvk@cluster0.9ssqshr.mongodb.net/EV_RentalApp?retryWrites=true&w=majority';

async function checkStats() {
    try {
        await mongoose.connect(MONGO_URI);
        console.log('Connected to DB');

        const now = new Date();
        const startOfWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const startOfMonth = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        const startOfYear = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);

        const revenueStats = await Booking.aggregate([
            { $match: { payment_status: { $in: ['paid', 'partially_paid'] } } },
            {
                $group: {
                    _id: null,
                    total: { $sum: '$total_paid' },
                    weekly: {
                        $sum: {
                            $cond: [{ $gte: ['$updatedAt', startOfWeek] }, '$total_paid', 0]
                        }
                    },
                    monthly: {
                        $sum: {
                            $cond: [{ $gte: ['$updatedAt', startOfMonth] }, '$total_paid', 0]
                        }
                    },
                    yearly: {
                        $sum: {
                            $cond: [{ $gte: ['$updatedAt', startOfYear] }, '$total_paid', 0]
                        }
                    }
                }
            }
        ]);

        console.log('--- REVENUE STATS ---');
        console.log(JSON.stringify(revenueStats, null, 2));

        const recentPaid = await Booking.find({ payment_status: { $in: ['paid', 'partially_paid'] } })
            .select('booking_id total_paid updatedAt createdAt')
            .sort('-updatedAt')
            .limit(10);
            
        console.log('\n--- RECENT PAID BOOKINGS ---');
        recentPaid.forEach(b => {
            console.log(`ID: ${b.booking_id} | Paid: ${b.total_paid} | Updated: ${b.updatedAt} | Created: ${b.createdAt}`);
        });

        await mongoose.connection.close();
    } catch (error) {
        console.error(error);
        process.exit(1);
    }
}

checkStats();
