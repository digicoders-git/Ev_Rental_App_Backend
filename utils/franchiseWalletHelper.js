const FranchiseStore = require('../models/franchiseStoreModel');
const FranchiseWalletTransaction = require('../models/franchiseWalletTransactionModel');
const Booking = require('../models/bookingModel');

const SERVICE_FEE_PERCENT = 8;

exports.creditFranchiseWallet = async (bookingId, amountPaid) => {
    try {
        if (!amountPaid || amountPaid <= 0) return;

        const booking = await Booking.findById(bookingId);
        if (!booking) return;

        // Use booking.franchise directly (stamped at creation) — more reliable than vehicle.franchise
        const franchiseId = booking.franchise;
        if (!franchiseId) return;

        const franchise = await FranchiseStore.findById(franchiseId);
        if (!franchise) return;

        const grossEarnings = Number(amountPaid);
        const serviceFee = Number((grossEarnings * SERVICE_FEE_PERCENT / 100).toFixed(2));
        const netEarnings = Number((grossEarnings - serviceFee).toFixed(2));

        franchise.total_gross_revenue = Number(((franchise.total_gross_revenue || 0) + grossEarnings).toFixed(2));
        franchise.wallet_balance = Number(((franchise.wallet_balance || 0) + netEarnings).toFixed(2));
        await franchise.save();

        await FranchiseWalletTransaction.create({
            franchise: franchiseId,
            amount: netEarnings,
            type: 'credit',
            description: `Booking ${booking.booking_id || bookingId} | Gross: ₹${grossEarnings} | Service Fee (${SERVICE_FEE_PERCENT}%): ₹${serviceFee} | Net: ₹${netEarnings}`,
            booking: bookingId
        });

    } catch (error) {
        console.error('Error crediting franchise wallet:', error);
    }
};
