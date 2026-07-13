const FranchiseEnquiry = require('../models/franchiseModel');
const FranchiseStore = require('../models/franchiseStoreModel');
const Vehicle = require('../models/vehicleModel');
const Booking = require('../models/bookingModel');
const jwt = require('jsonwebtoken');
const cloudinary = require('cloudinary').v2;
const mongoose = require('mongoose');

// Generate JWT for Franchise
const generateToken = (id) => {
    return jwt.sign({ id }, process.env.JWT_SECRET, {
        expiresIn: '30d',
    });
};

// --- FRANCHISE AUTH & PROFILE ---

// @desc    Franchise Login
// @route   POST /api/franchise-enquiry/login
// @access  Public
exports.franchiseLogin = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ success: false, message: 'Please provide email and password' });
        }

        const store = await FranchiseStore.findOne({ email }).select('+password');

        if (!store) {
            return res.status(401).json({ success: false, message: 'Invalid credentials' });
        }

        const isMatch = await store.matchPassword(password);
        if (!isMatch) {
            return res.status(401).json({ success: false, message: 'Invalid credentials' });
        }

        res.status(200).json({
            success: true,
            message: 'Franchise login successful',
            data: {
                _id: store._id,
                store_name: store.store_name,
                owner_name: store.owner_name,
                email: store.email,
                mobile: store.mobile,
                address: store.address,
                city: store.city,
                state: store.state,
                store_id: store.store_id,
                status: store.status,
                profile_image: store.profile_image,
            },
            token: generateToken(store._id)
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Get Franchise Profile
// @route   GET /api/franchise-enquiry/profile
// @access  Private (Franchise Owner)
exports.getFranchiseProfile = async (req, res) => {
    try {
        // req.user will be populated by middleware (we'll need to update middleware or handle both)
        // For now assume middleware puts franchise id in req.franchise or similar
        const franchise = await FranchiseStore.findById(req.franchise.id);
        if (!franchise) {
            return res.status(404).json({ success: false, message: 'Franchise not found' });
        }
        res.status(200).json({ success: true, data: franchise });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Update Franchise Profile
// @route   PUT /api/franchise-enquiry/profile
// @access  Private (Franchise Owner)
exports.updateFranchiseProfile = async (req, res) => {
    try {
        const store = await FranchiseStore.findById(req.franchise.id);
        if (!store) {
            return res.status(404).json({ success: false, message: 'Franchise not found' });
        }

        const { store_name, owner_name, mobile, address, city, state } = req.body;

        if (store_name) store.store_name = store_name;
        if (owner_name) store.owner_name = owner_name;
        if (mobile) store.mobile = mobile;
        if (address) store.address = address;
        if (city) store.city = city;
        if (state) store.state = state;

        if (req.file) {
            store.profile_image = `/uploads/franchise/${req.file.filename}`;
        }

        const updatedStore = await store.save();

        res.status(200).json({
            success: true,
            message: 'Profile updated successfully',
            data: updatedStore
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Change Franchise Password
// @route   PUT /api/franchise-enquiry/change-password
// @access  Private (Franchise Owner)
exports.changeFranchisePassword = async (req, res) => {
    try {
        const { oldPassword, newPassword } = req.body;
        const store = await FranchiseStore.findById(req.franchise.id).select('+password');

        const isMatch = await store.matchPassword(oldPassword);
        if (!isMatch) {
            return res.status(401).json({ success: false, message: 'Current password is incorrect' });
        }

        store.password = newPassword;
        await store.save();

        res.status(200).json({ success: true, message: 'Password changed successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// --- FRANCHISE ENQUIRY CONTROLLERS ---

// @desc    Submit Franchise Enquiry
// @route   POST /api/franchise-enquiry
// @access  Public
// @desc    Submit Franchise Enquiry (with KYC doc + ₹50 registration fee)
// @route   POST /api/franchise-enquiry
// @access  Public
exports.submitEnquiry = async (req, res) => {
    try {
        const {
            full_name, phone_number, email, city, state,
            investment_budget, message, registration_fee_txn_id
        } = req.body;

        // Build enquiry data
        const enquiryData = {
            full_name, phone_number, email,
            city, state, investment_budget, message,
        };

        // If registration fee txn_id provided, mark as paid
        if (registration_fee_txn_id) {
            enquiryData.registration_fee_paid = true;
            enquiryData.registration_fee_txn_id = registration_fee_txn_id;
        }

        // Upload KYC documents if provided
        if (req.files) {
            if (req.files['aadharFront']) {
                const res = await cloudinary.uploader.upload(req.files['aadharFront'][0].path, { folder: 'franchise_kyc', resource_type: 'auto' });
                enquiryData.aadharFront = res.secure_url;
            }
            if (req.files['aadharBack']) {
                const res = await cloudinary.uploader.upload(req.files['aadharBack'][0].path, { folder: 'franchise_kyc', resource_type: 'auto' });
                enquiryData.aadharBack = res.secure_url;
            }
            if (req.files['panCard']) {
                const res = await cloudinary.uploader.upload(req.files['panCard'][0].path, { folder: 'franchise_kyc', resource_type: 'auto' });
                enquiryData.panCard = res.secure_url;
            }
            if (req.files['selfie']) {
                const res = await cloudinary.uploader.upload(req.files['selfie'][0].path, { folder: 'franchise_kyc', resource_type: 'auto' });
                enquiryData.selfie = res.secure_url;
            }
        }

        const enquiry = await FranchiseEnquiry.create(enquiryData);
        res.status(201).json({ success: true, message: 'Enquiry submitted successfully', data: enquiry });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

// @desc    Get All Enquiries (Admin)
// @route   GET /api/franchise-enquiry
// @access  Private/Admin
exports.getAllEnquiries = async (req, res) => {
    try {
        const { status, city, start_date, end_date } = req.query;
        let query = {};

        // Filters
        if (status) query.status = status;
        if (city) query.city = { $regex: city, $options: 'i' };
        
        // Date Filter
        if (start_date || end_date) {
            query.createdAt = {};
            if (start_date) query.createdAt.$gte = new Date(start_date);
            if (end_date) query.createdAt.$lte = new Date(end_date);
        }

        const enquiries = await FranchiseEnquiry.find(query).sort('-createdAt');
        res.status(200).json({ success: true, count: enquiries.length, data: enquiries });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Update Enquiry Status and Follow-up (Admin)
// @route   PATCH /api/franchise-enquiry/:id/status
// @access  Private/Admin
exports.updateEnquiryStatus = async (req, res) => {
    try {
        const { status, notes, follow_up_date } = req.body;
        
        const enquiry = await FranchiseEnquiry.findById(req.params.id);

        if (!enquiry) {
            return res.status(404).json({ success: false, message: 'Enquiry not found' });
        }

        if (status) enquiry.status = status;
        if (notes) enquiry.notes = notes;
        if (follow_up_date) enquiry.follow_up_date = follow_up_date;

        await enquiry.save();

        res.status(200).json({ success: true, message: 'Enquiry updated successfully', data: enquiry });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

// @desc    Get Single Enquiry Details
// @route   GET /api/franchise-enquiry/:id
// @access  Private/Admin
exports.getEnquiryById = async (req, res) => {
    try {
        const enquiry = await FranchiseEnquiry.findById(req.params.id);
        if (!enquiry) {
            return res.status(404).json({ success: false, message: 'Enquiry not found' });
        }
        res.status(200).json({ success: true, data: enquiry });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// --- FRANCHISE STORE MANAGEMENT (ADMIN) ---

// @desc    Add New Franchise Store
// @route   POST /api/franchise-enquiry/stores
// @access  Private/Admin
exports.addFranchiseStore = async (req, res) => {
    try {
        const store = await FranchiseStore.create(req.body);
        res.status(201).json({
            success: true,
            message: 'Franchise Store added successfully',
            data: store
        });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

// @desc    Get All Franchise Stores
// @route   GET /api/franchise-enquiry/stores
// @access  Private/Admin
exports.getAllFranchiseStores = async (req, res) => {
    try {
        const stores = await FranchiseStore.find().sort('-createdAt');
        res.status(200).json({
            success: true,
            count: stores.length,
            data: stores
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Get Single Franchise Store
// @route   GET /api/franchise-enquiry/stores/:id
// @access  Private/Admin
exports.getFranchiseStoreById = async (req, res) => {
    try {
        const store = await FranchiseStore.findById(req.params.id);
        if (!store) {
            return res.status(404).json({ success: false, message: 'Store not found' });
        }

        // Fetch vehicles assigned to this store
        const vehicles = await Vehicle.find({ franchise: store._id });

        res.status(200).json({ 
            success: true, 
            data: {
                store,
                assigned_vehicles: vehicles
            } 
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Update Franchise Store
// @route   PUT /api/franchise-enquiry/stores/:id
// @access  Private/Admin
exports.updateFranchiseStore = async (req, res) => {
    try {
        const store = await FranchiseStore.findByIdAndUpdate(req.params.id, req.body, {
            new: true,
            runValidators: true
        });

        if (!store) {
            return res.status(404).json({ success: false, message: 'Store not found' });
        }

        res.status(200).json({
            success: true,
            message: 'Store updated successfully',
            data: store
        });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

// @desc    Delete Franchise Store
// @route   DELETE /api/franchise-enquiry/stores/:id
// @access  Private/Admin
exports.deleteFranchiseStore = async (req, res) => {
    try {
        const storeId = req.params.id;
        
        const store = await FranchiseStore.findById(storeId);
        if (!store) {
            return res.status(404).json({ success: false, message: 'Store not found' });
        }

        // Unassign vehicles from this franchise
        await Vehicle.updateMany(
            { franchise: storeId },
            { $unset: { franchise: 1 } }
        );

        // Delete the store
        await FranchiseStore.findByIdAndDelete(storeId);

        res.status(200).json({ success: true, message: 'Store deleted and related vehicles unassigned successfully.' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// --- FRANCHISE REVENUE TRACKING ---

// @desc    Get Franchise Revenue Stats
// @route   GET /api/franchise-enquiry/revenue
// @access  Private/Franchise
exports.getFranchiseRevenue = async (req, res) => {
    try {
        const { start_date, end_date } = req.query;
        const franchiseId = req.franchise.id;

        // Filter by booking.franchise (stamped at creation) so we only count
        // bookings that were made WHILE the vehicle was assigned to this franchise.
        // This prevents pre-assignment historical bookings from leaking into franchise stats.
        let dateFilter = {};
        if (start_date && end_date) {
            dateFilter = { createdAt: { $gte: new Date(start_date), $lte: new Date(end_date) } };
        }

        const stats = await Booking.aggregate([
            {
                $match: {
                    franchise: new mongoose.Types.ObjectId(franchiseId),
                    booking_status: { $ne: 'cancelled' },
                    ...dateFilter
                }
            },
            {
                $group: {
                    _id: null,
                    totalRevenue: { $sum: '$total_paid' },
                    totalBookings: { $sum: 1 },
                    totalLateFees: { $sum: '$late_fee' },
                    averageBookingValue: { $avg: '$grand_total' }
                }
            }
        ]);

        const summary = stats.length > 0 ? stats[0] : { totalRevenue: 0, totalBookings: 0, totalLateFees: 0, averageBookingValue: 0 };

        res.status(200).json({
            success: true,
            data: {
                franchise_id: franchiseId,
                period: start_date && end_date ? `${start_date} to ${end_date}` : 'All Time',
                stats: summary
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Get Revenue for specific franchise (Admin Only)
// @route   GET /api/franchise-enquiry/admin/revenue/:id
// @access  Private/Admin
exports.getAdminRevenueByFranchise = async (req, res) => {
    try {
        const { id } = req.params; // Franchise Store ID
        const { start_date, end_date } = req.query;

        const vehicles = await Vehicle.find({ franchise: id }).select('_id');
        const vehicleIds = vehicles.map(v => v._id);

        let dateFilter = {};
        if (start_date && end_date) {
            dateFilter = { createdAt: { $gte: new Date(start_date), $lte: new Date(end_date) } };
        }

        const stats = await Booking.aggregate([
            {
                $match: {
                    franchise: new mongoose.Types.ObjectId(id),
                    booking_status: { $ne: 'cancelled' },
                    ...dateFilter
                }
            },
            {
                $group: {
                    _id: null,
                    totalRevenue: { $sum: '$total_paid' },
                    totalBookings: { $sum: 1 },
                    totalLateFees: { $sum: '$late_fee' }
                }
            }
        ]);

        res.status(200).json({
            success: true,
            data: stats.length > 0 ? stats[0] : { totalRevenue: 0, totalBookings: 0, totalLateFees: 0 }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Get Franchise History Details (Admin Only)
// @route   GET /api/franchise-enquiry/stores/:id/history
// @access  Private/Admin
exports.getFranchiseHistory = async (req, res) => {
    try {
        const storeId = req.params.id;

        const store = await FranchiseStore.findById(storeId);
        if (!store) {
            return res.status(404).json({ success: false, message: 'Store not found' });
        }

        // 1. Vehicles
        const totalVehicles = await Vehicle.countDocuments({ franchise: storeId });
        const assignedVehicles = await Vehicle.countDocuments({ franchise: storeId, added_by_franchise: { $ne: true } });
        const ownedVehicles = await Vehicle.countDocuments({ franchise: storeId, added_by_franchise: true });

        // 2. Bookings
        const totalBookings = await Booking.countDocuments({ franchise: storeId });
        const pendingBookings = await Booking.countDocuments({ franchise: storeId, booking_status: 'pending' });
        const completedBookings = await Booking.countDocuments({ franchise: storeId, booking_status: 'completed' });
        const ongoingBookings = await Booking.countDocuments({ franchise: storeId, booking_status: 'ongoing' });
        const cancelledBookings = await Booking.countDocuments({ franchise: storeId, booking_status: 'cancelled' });

        // 3. Revenue
        const revenueStats = await Booking.aggregate([
            {
                $match: {
                    franchise: new mongoose.Types.ObjectId(storeId),
                    booking_status: { $ne: 'cancelled' }
                }
            },
            {
                $group: {
                    _id: null,
                    totalRevenue: { $sum: '$total_paid' },
                    grandTotal: { $sum: '$grand_total' },
                    lateFee: { $sum: '$late_fee' }
                }
            }
        ]);

        const totalRevenue = revenueStats.length > 0 ? revenueStats[0].totalRevenue : 0;
        const grandTotal = revenueStats.length > 0 ? revenueStats[0].grandTotal : 0;
        const totalLateFee = revenueStats.length > 0 ? revenueStats[0].lateFee : 0;

        // Fetch list of recent bookings with user/vehicle details
        const recentBookings = await Booking.find({ franchise: storeId })
            .populate('user', 'name email mobile')
            .populate('vehicle', 'vehicle_name registration_number')
            .sort('-createdAt')
            .limit(10);

        // Fetch list of vehicles with status
        const vehicleList = await Vehicle.find({ franchise: storeId }).select('vehicle_name registration_number status added_by_franchise price_per_day');

        res.status(200).json({
            success: true,
            data: {
                store,
                vehicles: {
                    total: totalVehicles,
                    assigned: assignedVehicles,
                    owned: ownedVehicles,
                    list: vehicleList
                },
                bookings: {
                    total: totalBookings,
                    pending: pendingBookings,
                    completed: completedBookings,
                    ongoing: ongoingBookings,
                    cancelled: cancelledBookings,
                    recent: recentBookings
                },
                revenue: {
                    totalPaid: totalRevenue,
                    grandTotal: grandTotal,
                    totalLateFee: totalLateFee
                }
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};


// @desc    Get Public Franchise Stores (Hubs)
// @route   GET /api/franchise-enquiry/public/stores
// @access  Public
exports.getPublicFranchiseStores = async (req, res) => {
    try {
        const stores = await FranchiseStore.find({ status: 'active' })
            .select('store_id store_name address city state mobile email profile_image')
            .sort('-createdAt');
        res.status(200).json({
            success: true,
            count: stores.length,
            data: stores
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

