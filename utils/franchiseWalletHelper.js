const FranchiseStore = require('../models/franchiseStoreModel');
const FranchiseWalletTransaction = require('../models/franchiseWalletTransactionModel');
const Booking = require('../models/bookingModel');

exports.creditFranchiseWallet = async (bookingId, amountPaid) => {
    try {
        const booking = await Booking.findById(bookingId).populate('vehicle');
        if (!booking || !booking.vehicle || !booking.vehicle.franchise) return;

        const franchiseId = booking.vehicle.franchise;
        const franchise = await FranchiseStore.findById(franchiseId);

        if (!franchise) return;

        // As per user request: "Net Revenue wo amount hoga jo 8% Service Fee deduct karne ke baad bachta hai"
        const grossEarnings = amountPaid;
        const serviceFee = grossEarnings * 0.08;
        const netEarnings = grossEarnings - serviceFee;

        if (grossEarnings <= 0) return;

        // Add to wallet balance (Net) and total gross revenue
        franchise.total_gross_revenue = (franchise.total_gross_revenue || 0) + grossEarnings;
        franchise.wallet_balance = (franchise.wallet_balance || 0) + netEarnings;
        await franchise.save();

        // Create transaction record
        await FranchiseWalletTransaction.create({
            franchise: franchiseId,
            amount: netEarnings,
            type: 'credit',
            description: `Earnings from Booking ${booking.booking_id || bookingId} (Gross: ₹${grossEarnings}, Fee: 8%, Net: ₹${netEarnings})`,
            booking: bookingId
        });

    } catch (error) {
        console.error('Error crediting franchise wallet:', error);
    }
};
