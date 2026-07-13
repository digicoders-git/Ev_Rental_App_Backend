const Invoice = require('../models/invoiceModel');
const Booking = require('../models/bookingModel');

// @desc    Get or Generate Invoice for a Booking
// @route   GET /api/invoices/booking/:bookingId
// @access  Private (Admin, Franchise, Rider)
exports.getInvoiceByBooking = async (req, res) => {
    try {
        const { bookingId } = req.params;

        // Check if invoice already exists
        let invoice = await Invoice.findOne({ booking: bookingId })
            .populate('booking')
            .populate('user', 'name mobile email')
            .populate('franchise', 'store_name owner_name mobile email address city state zip_code');

        if (!invoice) {
            // Fetch booking to generate invoice
            const booking = await Booking.findById(bookingId).populate('vehicle', 'vehicle_name registration_number type');
            if (!booking) {
                return res.status(404).json({ success: false, message: 'Booking not found' });
            }

            // Generate unique invoice number
            const count = await Invoice.countDocuments();
            const invNumber = `INV-${new Date().getFullYear()}-${String(count + 1).padStart(5, '0')}`;

            // Create new invoice
            invoice = await Invoice.create({
                invoice_number: invNumber,
                booking: booking._id,
                user: booking.user,
                franchise: booking.franchise, // Will be null if Platform
                amount: booking.total_amount,
                gst_amount: booking.gst_amount,
                discount_amount: booking.discount_amount,
                total_amount: booking.grand_total,
                status: booking.payment_status === 'paid' ? 'paid' : 'unpaid'
            });

            // Re-fetch with populations
            invoice = await Invoice.findById(invoice._id)
                .populate('booking')
                .populate('user', 'name mobile email')
                .populate('franchise', 'store_name owner_name mobile email address city state zip_code');
        }

        res.status(200).json({ success: true, data: invoice });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Get all invoices (Filters: Franchise)
// @route   GET /api/invoices
// @access  Private (Admin, Franchise)
exports.getAllInvoices = async (req, res) => {
    try {
        let query = {};
        
        // If franchise is logged in, restrict to their invoices
        if (req.user && req.user.role === 'franchise') {
            query.franchise = req.user.franchiseId;
        } else if (req.query.franchiseId) {
            // If admin filters by franchise
            query.franchise = req.query.franchiseId === 'platform' ? null : req.query.franchiseId;
        }

        const invoices = await Invoice.find(query)
            .populate('user', 'name mobile')
            .populate({ path: 'booking', populate: { path: 'vehicle', select: 'vehicle_name registration_number' } })
            .populate('franchise', 'store_name')
            .sort('-createdAt');

        res.status(200).json({ success: true, data: invoices });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
