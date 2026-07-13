const Settlement = require('../models/settlementModel');
const Booking = require('../models/bookingModel');
const FranchiseStore = require('../models/franchiseStoreModel');

// @desc    Generate Settlement for a Franchise
// @route   POST /api/settlements/generate
// @access  Private/Admin
exports.generateSettlement = async (req, res) => {
    try {
        const { franchiseId, dateFrom, dateTo } = req.body;

        if (!franchiseId || !dateFrom || !dateTo) {
            return res.status(400).json({ success: false, message: 'franchiseId, dateFrom, and dateTo are required' });
        }

        // Parse dates
        const start = new Date(dateFrom);
        start.setHours(0, 0, 0, 0);
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);

        // Fetch bookings paid within this period for this franchise that were paid to Platform
        // In the Split model, Razorpay handles it automatically, but for Platform model, Super Admin owes Franchisee.
        // We will sum up all 'paid' bookings.
        const bookings = await Booking.find({
            franchise: franchiseId,
            payment_status: 'paid',
            createdAt: { $gte: start, $lte: end },
            payment_gateway_used: 'platform' // Only platform payments need settlement from Super Admin
        });

        if (bookings.length === 0) {
            return res.status(400).json({ success: false, message: 'No eligible platform-paid bookings found for this period to settle.' });
        }

        const total_collected = bookings.reduce((sum, b) => sum + b.grand_total, 0);
        const platform_fee_percentage = 8;
        const commission_deducted = (total_collected * platform_fee_percentage) / 100;
        const final_payout = total_collected - commission_deducted;

        // Generate Settlement ID
        const count = await Settlement.countDocuments();
        const settlement_id = `STL-${new Date().getFullYear()}-${String(count + 1).padStart(5, '0')}`;

        const settlement = await Settlement.create({
            settlement_id,
            franchise: franchiseId,
            total_collected,
            platform_fee_percentage,
            commission_deducted,
            final_payout,
            date_from: start,
            date_to: end,
            status: 'completed', // Assuming it's generated when payout is done manually
            transaction_reference: req.body.transaction_reference || 'Manual Payout'
        });

        res.status(201).json({ success: true, data: settlement, message: 'Settlement generated successfully.' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Get all settlements
// @route   GET /api/settlements
// @access  Private (Admin, Franchise)
exports.getSettlements = async (req, res) => {
    try {
        let query = {};
        
        // If franchise is logged in, restrict to their settlements
        if (req.user && req.user.role === 'franchise') {
            query.franchise = req.user.franchiseId;
        } else if (req.query.franchiseId) {
            query.franchise = req.query.franchiseId;
        }

        const settlements = await Settlement.find(query)
            .populate('franchise', 'store_name owner_name bank_details')
            .sort('-createdAt');

        res.status(200).json({ success: true, data: settlements });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
