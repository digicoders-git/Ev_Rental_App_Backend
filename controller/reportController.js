const Booking = require('../models/bookingModel');
const User = require('../models/userModel');
const Vehicle = require('../models/vehicleModel');
const FranchiseStore = require('../models/franchiseStoreModel');
const Support = require('../models/supportModel');

// @desc    Get Overall Dashboard Stats (Admin)
// @route   GET /api/reports/dashboard-stats
// @access  Private/Admin
exports.getDashboardStats = async (req, res) => {
    try {
        const totalRevenue = await Booking.aggregate([
            { $match: { payment_status: 'paid' } },
            { $group: { _id: null, total: { $sum: '$grand_total' } } }
        ]);

        const stats = {
            revenue: totalRevenue.length > 0 ? totalRevenue[0].total : 0,
            bookings: {
                total: await Booking.countDocuments(),
                completed: await Booking.countDocuments({ booking_status: 'completed' }),
                ongoing: await Booking.countDocuments({ booking_status: 'ongoing' }),
                pending: await Booking.countDocuments({ booking_status: 'pending' }),
                cancelled: await Booking.countDocuments({ booking_status: 'cancelled' })
            },
            users: {
                total: await User.countDocuments({ role: 'user' }),
                kyc_verified: await User.countDocuments({ isKycVerified: true }),
                blocked: await User.countDocuments({ status: 'blocked' })
            },
            fleet: {
                total: await Vehicle.countDocuments(),
                active: await Vehicle.countDocuments({ status: 'active' }),
                maintenance: await Vehicle.countDocuments({ status: 'maintenance' })
            },
            franchise: {
                total_stores: await FranchiseStore.countDocuments(),
            }
        };

        res.status(200).json({ success: true, data: stats });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Get Revenue Analysis (Daily/Monthly)
// @route   GET /api/reports/revenue-analysis
// @access  Private/Admin
exports.getRevenueAnalysis = async (req, res) => {
    try {
        const { timeframe } = req.query; // 'daily' or 'monthly'
        
        let groupId = { day: { $dayOfMonth: "$createdAt" }, month: { $month: "$createdAt" }, year: { $year: "$createdAt" } };
        if (timeframe === 'monthly') {
            groupId = { month: { $month: "$createdAt" }, year: { $year: "$createdAt" } };
        }

        const analysis = await Booking.aggregate([
            { $match: { payment_status: 'paid' } },
            {
                $group: {
                    _id: groupId,
                    total_revenue: { $sum: "$grand_total" },
                    bookings_count: { $sum: 1 }
                }
            },
            { $sort: { "_id.year": -1, "_id.month": -1, "_id.day": -1 } }
        ]);

        res.status(200).json({ success: true, data: analysis });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Get Franchise Performance Report
// @route   GET /api/reports/franchise-performance
// @access  Private/Admin
exports.getFranchisePerformance = async (req, res) => {
    try {
        const performance = await Booking.aggregate([
            { $match: { payment_status: 'paid' } },
            {
                $lookup: {
                    from: 'vehicles',
                    localField: 'vehicle',
                    foreignField: '_id',
                    as: 'vehicle_details'
                }
            },
            { $unwind: '$vehicle_details' },
            {
                $group: {
                    _id: '$vehicle_details.franchise',
                    total_revenue: { $sum: '$grand_total' },
                    total_bookings: { $sum: 1 }
                }
            },
            {
                $lookup: {
                    from: 'franchisestores',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'franchise_details'
                }
            },
            { $unwind: '$franchise_details' },
            {
                $project: {
                    store_name: '$franchise_details.store_name',
                    owner_name: '$franchise_details.owner_name',
                    total_revenue: 1,
                    total_bookings: 1
                }
            },
            { $sort: { total_revenue: -1 } }
        ]);

        res.status(200).json({ success: true, data: performance });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Export Bookings to CSV
// @route   GET /api/reports/export/bookings
// @access  Private/Admin
exports.exportBookingsCSV = async (req, res) => {
    try {
        const bookings = await Booking.find()
            .populate('user', 'name mobile')
            .populate('vehicle', 'vehicle_name registration_number')
            .sort('-createdAt');

        let csv = 'BookingID,User,Mobile,Vehicle,RegNo,Start,End,Amount,Status\n';
        
        bookings.forEach(b => {
            csv += `${b.booking_id},${b.user?.name},${b.user?.mobile},${b.vehicle?.vehicle_name},${b.vehicle?.registration_number},${b.start_date.toISOString()},${b.end_date.toISOString()},${b.grand_total},${b.booking_status}\n`;
        });

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=bookings_report.csv');
        res.status(200).send(csv);
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
