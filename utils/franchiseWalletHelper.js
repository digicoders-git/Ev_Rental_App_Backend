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

        // If direct or split mode via Razorpay Route is strictly used, we might not want to credit the internal wallet 
        // to avoid double crediting. But for manual payments, we definitely need to credit.
        // For simplicity, we assume this internal wallet tracks all manual earnings or platform mode earnings.
        // As per user request: "sara earning show hona chahiye kux bhi nahi katna hai"
        // So we give 100% of the payment to the franchise wallet, deductions will be handled manually later.
        const earnings = amountPaid;

        if (earnings <= 0) return;

        // Add to wallet balance
        franchise.wallet_balance = (franchise.wallet_balance || 0) + earnings;
        await franchise.save();

        // Create transaction record
        await FranchiseWalletTransaction.create({
            franchise: franchiseId,
            amount: earnings,
            type: 'credit',
            description: `Earnings from Booking ${booking.booking_id || bookingId} (₹${amountPaid})`,
            booking: bookingId
        });

    } catch (error) {
        console.error('Error crediting franchise wallet:', error);
    }
};
