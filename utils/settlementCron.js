const cron = require('node-cron');
const Booking = require('../models/bookingModel');
const Settlement = require('../models/settlementModel');
const FranchiseStore = require('../models/franchiseStoreModel');

const generateDailySettlements = async () => {
    try {
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        
        const start = new Date(yesterday);
        start.setHours(0, 0, 0, 0);
        
        const end = new Date(yesterday);
        end.setHours(23, 59, 59, 999);

        // Find all active franchises
        const franchises = await FranchiseStore.find({ status: 'active' });

        for (const store of franchises) {
            const bookings = await Booking.find({
                franchise: store._id,
                total_paid: { $gt: 0 },
                createdAt: { $gte: start, $lte: end },
                payment_gateway_used: 'platform'
            });

            if (bookings.length > 0) {
                const total_collected = bookings.reduce((sum, b) => sum + (b.total_paid || 0), 0);
                const platform_fee_percentage = 8;
                const commission_deducted = (total_collected * platform_fee_percentage) / 100;
                const final_payout = total_collected - commission_deducted;

                const count = await Settlement.countDocuments();
                const settlement_id = `STL-${today.getFullYear()}-${String(count + 1).padStart(5, '0')}`;

                await Settlement.create({
                    settlement_id,
                    franchise: store._id,
                    total_collected,
                    platform_fee_percentage,
                    commission_deducted,
                    final_payout,
                    date_from: start,
                    date_to: end,
                    status: 'completed',
                    transaction_reference: 'Auto-Generated Daily Settlement'
                });
            }
        }
        console.log(`Daily settlements checked/generated for ${yesterday.toDateString()}`);
    } catch (error) {
        console.error('Error in daily settlement cron:', error);
    }
};

const startSettlementCron = () => {
    // Run at 00:05 every day
    cron.schedule('5 0 * * *', generateDailySettlements);
    console.log('Settlement cron scheduler started');
};

module.exports = { startSettlementCron, generateDailySettlements };
