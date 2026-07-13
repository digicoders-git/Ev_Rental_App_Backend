const Booking = require('../models/bookingModel');
const User = require('../models/userModel');
const Vehicle = require('../models/vehicleModel');
const FranchiseStore = require('../models/franchiseStoreModel');
const Support = require('../models/supportModel');
const Document = require('../models/documentModel');

// @desc    Get Overall Dashboard Stats (Admin)
// @route   GET /api/reports/dashboard-stats
// @access  Private/Admin
exports.getDashboardStats = async (req, res) => {
    try {
        // 1. Calculate Revenue Stats
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

        const KYC = require('../models/kycModel');
        const ongoingBookings = await Booking.find({ booking_status: { $in: ['confirmed', 'ongoing'] } }).select('vehicle');
        const busyVehicleIds = ongoingBookings.map(b => b.vehicle.toString());

        const categoryStats = await Vehicle.aggregate([
            {
                $group: {
                    _id: '$category',
                    count: { $sum: 1 }
                }
            },
            {
                $lookup: {
                    from: 'vehiclecategories',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'category_details'
                }
            },
            { $unwind: { path: '$category_details', preserveNullAndEmptyArrays: true } },
            {
                $project: {
                    name: { $ifNull: ['$category_details.name', 'Uncategorized'] },
                    count: 1
                }
            }
        ]);

        const stats = {
            revenue: {
                total: revenueStats.length > 0 ? revenueStats[0].total : 0,
                weekly: revenueStats.length > 0 ? revenueStats[0].weekly : 0,
                monthly: revenueStats.length > 0 ? revenueStats[0].monthly : 0,
                yearly: revenueStats.length > 0 ? revenueStats[0].yearly : 0,
            },
            categories: categoryStats,
            bookings: {
                total: await Booking.countDocuments(),
                active: await Booking.countDocuments({ booking_status: { $in: ['confirmed', 'ongoing'] } }),
                completed: await Booking.countDocuments({ booking_status: 'completed' }),
                pending: await Booking.countDocuments({ booking_status: 'pending' }),
                cancelled: await Booking.countDocuments({ booking_status: 'cancelled' })
            },
            users: {
                total: await User.countDocuments({ role: 'user' }),
                kyc_verified: await User.countDocuments({ isKycVerified: true }),
                kyc_pending: await KYC.countDocuments({ status: 'pending' }),
                blocked: await User.countDocuments({ status: 'blocked' })
            },
            fleet: {
                total: await Vehicle.countDocuments(),
                active: await Vehicle.countDocuments({ status: 'active' }),
                available: await Vehicle.countDocuments({ 
                    status: 'active', 
                    _id: { $nin: busyVehicleIds } 
                }),
                maintenance: await Vehicle.countDocuments({ status: 'maintenance' })
            },
            franchise: {
                total_stores: await FranchiseStore.countDocuments(),
                riderStats: await Booking.aggregate([
                    { $match: { franchise: { $ne: null } } },
                    {
                        $group: {
                            _id: { franchise: '$franchise', user: '$user' },
                            statuses: { $addToSet: '$booking_status' }
                        }
                    },
                    {
                        $project: {
                            franchise: '$_id.franchise',
                            user: '$_id.user',
                            isActive: {
                                $cond: [
                                    { $gt: [{ $size: { $setIntersection: [['ongoing', 'confirmed'], '$statuses'] } }, 0] },
                                    true,
                                    false
                                ]
                            },
                            isOffboarded: {
                                $cond: [
                                    {
                                        $and: [
                                            { $in: ['completed', '$statuses'] },
                                            { $eq: [{ $size: { $setIntersection: [['ongoing', 'confirmed'], '$statuses'] } }, 0] }
                                        ]
                                    },
                                    true,
                                    false
                                ]
                            }
                        }
                    },
                    {
                        $group: {
                            _id: '$franchise',
                            activeRiders: { $sum: { $cond: ['$isActive', 1, 0] } },
                            offboardedRiders: { $sum: { $cond: ['$isOffboarded', 1, 0] } }
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
                            activeRiders: 1,
                            offboardedRiders: 1,
                            totalRiders: { $add: [{ $cond: [{ $gt: ['$activeRiders', null] }, '$activeRiders', 0] }, { $cond: [{ $gt: ['$offboardedRiders', null] }, '$offboardedRiders', 0] }] }
                        }
                    },
                    { $sort: { activeRiders: -1, totalRiders: -1 } }
                ])
            },
            documents: {
                total: await Document.countDocuments(),
                expiring: await Document.countDocuments({ status: 'Expiring' }),
                expired: await Document.countDocuments({ status: 'Expired' })
            }
        };

        // Recent Bookings for Dashboard
        const recentBookings = await Booking.find()
            .limit(5)
            .sort('-createdAt')
            .populate('user', 'name')
            .populate('vehicle', 'vehicle_name');

        res.status(200).json({ 
            success: true, 
            data: { 
                ...stats, 
                recentBookings: recentBookings.map(b => ({
                    id: b.booking_id,
                    user: b.user?.name || 'Unknown',
                    vehicle: b.vehicle?.vehicle_name || 'N/A',
                    status: b.booking_status === 'confirmed' ? 'Active' :
                            b.booking_status === 'ongoing' ? 'Ongoing' :
                            b.booking_status === 'completed' ? 'Completed' :
                            b.booking_status === 'pending' ? 'Pending' : 'Cancelled'
                }))
            } 
        });
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
            { $match: { payment_status: { $in: ['paid', 'partially_paid'] } } },
            {
                $group: {
                    _id: groupId,
                    total_revenue: { $sum: "$total_paid" },
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
            { $match: { payment_status: { $in: ['paid', 'partially_paid'] } } },
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
                    total_revenue: { $sum: '$total_paid' },
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
        const { timeframe } = req.query;

        // Build date filter based on timeframe
        let dateFilter = {};
        let periodLabel = 'AllTime';

        if (timeframe === 'weekly') {
            const start = new Date();
            start.setDate(start.getDate() - 7);
            dateFilter = { createdAt: { $gte: start } };
            periodLabel = 'Weekly';
        } else if (timeframe === 'monthly') {
            const start = new Date();
            start.setDate(start.getDate() - 30);
            dateFilter = { createdAt: { $gte: start } };
            periodLabel = 'Monthly';
        } else if (timeframe === 'yearly') {
            const start = new Date();
            start.setDate(start.getDate() - 365);
            dateFilter = { createdAt: { $gte: start } };
            periodLabel = 'Yearly';
        }

        const bookings = await Booking.find(dateFilter)
            .populate('user', 'name mobile')
            .populate('vehicle', 'vehicle_name registration_number')
            .populate('franchise', 'store_name')
            .sort('-createdAt');

        let csv = 'BookingID,User,Mobile,Vehicle,RegNo,Franchise,Start,End,Amount,PaymentStatus,BookingStatus\n';
        
        bookings.forEach(b => {
            const startDate = b.start_date ? new Date(b.start_date).toLocaleDateString('en-IN') : 'N/A';
            const endDate   = b.end_date   ? new Date(b.end_date).toLocaleDateString('en-IN')   : 'N/A';
            csv += `${b.booking_id},${b.user?.name || ''},${b.user?.mobile || ''},${b.vehicle?.vehicle_name || ''},${b.vehicle?.registration_number || ''},${b.franchise?.store_name || 'Platform'},${startDate},${endDate},${b.grand_total},${b.payment_status},${b.booking_status}\n`;
        });

        const filename = `bookings_${periodLabel}_${new Date().toISOString().slice(0, 10)}.csv`;
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
        res.status(200).send(csv);
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Get Comprehensive Revenue Report
// @route   GET /api/reports/revenue-report
// @access  Private/Admin
exports.getRevenueReport = async (req, res) => {
    try {
        const { timeframe } = req.query; // 'weekly', 'monthly', 'yearly'
        
        // 1. Chart Data (Revenue vs Refunds)
        let daysToLookBack = timeframe === 'monthly' ? 30 : timeframe === 'yearly' ? 365 : timeframe === 'all' ? 36500 : 7;
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - daysToLookBack);

        const chartStats = await Booking.aggregate([
            { $match: { createdAt: { $gte: startDate }, payment_status: 'paid' } },
            {
                $group: {
                    _id: {
                        day: { $dayOfMonth: "$createdAt" },
                        month: { $month: "$createdAt" },
                        year: { $year: "$createdAt" }
                    },
                    revenue: { $sum: "$grand_total" },
                    refunds: { $sum: 0 }, // Assuming refunds logic is not yet implemented, setting to 0
                    bookings: { $sum: 1 }
                }
            },
            { $sort: { "_id.year": 1, "_id.month": 1, "_id.day": 1 } }
        ]);

        // Format chart data for frontend (e.g., labels like "Mon", "Jan")
        const formattedChartData = chartStats.map(stat => ({
            period: timeframe === 'weekly' ? new Date(stat._id.year, stat._id.month - 1, stat._id.day).toLocaleDateString('en-US', { weekday: 'short' }) :
                    timeframe === 'monthly' ? `${stat._id.day}/${stat._id.month}` :
                    new Date(stat._id.year, stat._id.month - 1, 1).toLocaleDateString('en-US', { month: 'short', year: timeframe === 'all' ? '2-digit' : undefined }),
            revenue: stat.revenue,
            refunds: stat.refunds,
            bookings: stat.bookings
        }));

        // 2. Franchise Performance (Already exists in other function but including here for unified response)
        const franchiseData = await Booking.aggregate([
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
                    revenue: { $sum: '$grand_total' },
                    bookings: { $sum: 1 }
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
                    name: '$franchise_details.store_name',
                    revenue: 1,
                    bookings: 1
                }
            },
            { $sort: { revenue: -1 } }
        ]);

        // 3. Payment Methods Share
        const paymentMethods = await Booking.aggregate([
            { $match: { payment_status: 'paid' } },
            {
                $group: {
                    _id: '$payment_method',
                    value: { $sum: 1 }
                }
            }
        ]);
        const totalPaidBookings = await Booking.countDocuments({ payment_status: 'paid' });
        const formattedMethods = paymentMethods.map(m => ({
            name: m._id === 'online' ? 'UPI' : m._id.toUpperCase(),
            value: totalPaidBookings ? Math.round((m.value / totalPaidBookings) * 100) : 0,
            color: m._id === 'online' ? '#10b981' : m._id === 'card' ? '#3b82f6' : '#f59e0b'
        }));

        // 4. Plan-wise Revenue
        const planData = await Booking.aggregate([
            { $match: { payment_status: 'paid' } },
            {
                $group: {
                    _id: '$plan',
                    revenue: { $sum: '$grand_total' },
                    count: { $sum: 1 }
                }
            },
            {
                $lookup: {
                    from: 'rentalplans',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'plan_details'
                }
            },
            { $unwind: '$plan_details' },
            {
                $project: {
                    plan: '$plan_details.plan_name',
                    revenue: 1,
                    count: 1
                }
            },
            { $sort: { revenue: -1 } }
        ]);

        // 5. Recent Transactions
        const recentTx = await Booking.find({ payment_status: 'paid' })
            .limit(5)
            .sort('-createdAt')
            .populate('user', 'name')
            .populate({
                path: 'vehicle',
                populate: { path: 'franchise', select: 'store_name' }
            });

        const formattedTx = recentTx.map(tx => ({
            id: tx.booking_id,
            user: tx.user?.name || 'Unknown',
            amount: tx.grand_total,
            method: tx.payment_method === 'online' ? 'UPI' : tx.payment_method.toUpperCase(),
            franchise: tx.vehicle?.franchise?.store_name || 'N/A',
            date: new Date(tx.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
            type: 'Payment'
        }));

        res.status(200).json({
            success: true,
            data: {
                chartData: formattedChartData,
                franchiseRevenue: franchiseData,
                methodData: formattedMethods.length ? formattedMethods : [
                    { name: 'UPI', value: 0, color: '#10b981' },
                    { name: 'Card', value: 0, color: '#3b82f6' },
                    { name: 'Wallet', value: 0, color: '#f59e0b' }
                ],
                planRevenue: planData,
                recentTx: formattedTx
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
