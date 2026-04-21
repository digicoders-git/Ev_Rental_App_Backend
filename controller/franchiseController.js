const FranchiseEnquiry = require('../models/franchiseModel');
const FranchiseStore = require('../models/franchiseStoreModel');
const Vehicle = require('../models/vehicleModel');
const Booking = require('../models/bookingModel');
const jwt = require('jsonwebtoken');
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
            data: store,
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
exports.submitEnquiry = async (req, res) => {
    try {
        const enquiry = await FranchiseEnquiry.create(req.body);
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
        const store = await FranchiseStore.findByIdAndDelete(req.params.id);
        if (!store) {
            return res.status(404).json({ success: false, message: 'Store not found' });
        }
        res.status(200).json({ success: true, message: 'Store deleted successfully' });
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

        // 1. Get all vehicles for this franchise
        const vehicles = await Vehicle.find({ franchise: franchiseId }).select('_id');
        const vehicleIds = vehicles.map(v => v._id);

        // 2. Aggregate bookings for these vehicles
        let dateFilter = {};
        if (start_date && end_date) {
            dateFilter = { createdAt: { $gte: new Date(start_date), $lte: new Date(end_date) } };
        }

        const stats = await Booking.aggregate([
            {
                $match: {
                    vehicle: { $in: vehicleIds },
                    booking_status: 'completed',
                    payment_status: 'paid',
                    ...dateFilter
                }
            },
            {
                $group: {
                    _id: null,
                    totalRevenue: { $sum: '$grand_total' },
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
                    vehicle: { $in: vehicleIds },
                    booking_status: 'completed',
                    payment_status: 'paid',
                    ...dateFilter
                }
            },
            {
                $group: {
                    _id: null,
                    totalRevenue: { $sum: '$grand_total' },
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
