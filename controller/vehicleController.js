const Vehicle = require('../models/vehicleModel');
const fs = require('fs');
const path = require('path');

// Helper to delete files
const deleteFile = (filePath) => {
    if (filePath) {
        const fullPath = path.join(__dirname, '..', filePath);
        if (fs.existsSync(fullPath)) {
            fs.unlinkSync(fullPath);
        }
    }
};

// @desc    Create new EV
// @route   POST /api/vehicles
// @access  Private/Admin
exports.createVehicle = async (req, res) => {
    try {
        const data = { ...req.body };

        // Handle File Uploads
        if (req.files) {
            if (req.files.thumbnail_image) {
                data.thumbnail_image = `uploads/${req.files.thumbnail_image[0].filename}`;
            }
            if (req.files.images) {
                data.images = req.files.images.map(file => `uploads/${file.filename}`);
            }
            if (req.files.rc_document) {
                data.rc_document = `uploads/${req.files.rc_document[0].filename}`;
            }
        }

        // Handle Array fields from form-data
        if (typeof data.features === 'string') {
            data.features = data.features.split(',').map(f => f.trim());
        }

        const vehicle = await Vehicle.create(data);

        res.status(201).json({ success: true, data: vehicle });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

// @desc    Get all EVs
// @route   GET /api/vehicles
// @access  Public
exports.getAllVehicles = async (req, res) => {
    try {
        const { franchiseId } = req.query;
        let query = {};
        
        if (franchiseId) {
            query.franchise = franchiseId;
        }

        const vehicles = await Vehicle.find(query).sort('-createdAt');
        res.status(200).json({ success: true, count: vehicles.length, data: vehicles });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Get single EV
// @route   GET /api/vehicles/:id
// @access  Public
exports.getVehicleById = async (req, res) => {
    try {
        const vehicle = await Vehicle.findById(req.params.id);
        if (!vehicle) {
            return res.status(404).json({ success: false, message: 'Vehicle not found' });
        }
        res.status(200).json({ success: true, data: vehicle });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Update EV
// @route   PUT /api/vehicles/:id
// @access  Private/Admin
exports.updateVehicle = async (req, res) => {
    try {
        let vehicle = await Vehicle.findById(req.params.id);

        if (!vehicle) {
            return res.status(404).json({ success: false, message: 'Vehicle not found' });
        }

        const updateData = { ...req.body };

        // Handle File Overwrites
        if (req.files) {
            if (req.files.thumbnail_image) {
                deleteFile(vehicle.thumbnail_image);
                updateData.thumbnail_image = `uploads/${req.files.thumbnail_image[0].filename}`;
            }
            if (req.files.images) {
                vehicle.images.forEach(img => deleteFile(img));
                updateData.images = req.files.images.map(file => `uploads/${file.filename}`);
            }
            if (req.files.rc_document) {
                deleteFile(vehicle.rc_document);
                updateData.rc_document = `uploads/${req.files.rc_document[0].filename}`;
            }
        }

        // Handle Array fields from form-data
        if (typeof updateData.features === 'string') {
            updateData.features = updateData.features.split(',').map(f => f.trim());
        }

        vehicle = await Vehicle.findByIdAndUpdate(req.params.id, updateData, {
            new: true,
            runValidators: true
        });

        res.status(200).json({ success: true, data: vehicle });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

// @desc    Delete EV
// @route   DELETE /api/vehicles/:id
// @access  Private/Admin
exports.deleteVehicle = async (req, res) => {
    try {
        const vehicle = await Vehicle.findById(req.params.id);

        if (!vehicle) {
            return res.status(404).json({ success: false, message: 'Vehicle not found' });
        }

        // Delete all associated files
        deleteFile(vehicle.thumbnail_image);
        deleteFile(vehicle.rc_document);
        vehicle.images.forEach(img => deleteFile(img));

        await vehicle.deleteOne();

        res.status(200).json({ success: true, message: 'Vehicle and its data deleted successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// --- FRANCHISE ASSIGNMENT CONTROLLERS ---

// @desc    Assign Vehicle to Franchise
// @route   PUT /api/vehicles/:id/assign
// @access  Private/Admin
exports.assignVehicle = async (req, res) => {
    try {
        const { franchiseId } = req.body;
        
        const vehicle = await Vehicle.findById(req.params.id);
        if (!vehicle) {
            return res.status(404).json({ success: false, message: 'Vehicle not found' });
        }

        // If franchiseId is null, it unassigns
        vehicle.franchise = franchiseId || null;
        await vehicle.save();

        res.status(200).json({ 
            success: true, 
            message: franchiseId ? 'Vehicle assigned to franchise successfully' : 'Vehicle unassigned from franchise',
            data: vehicle 
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Get Vehicles Assigned to a Franchise
// @route   GET /api/vehicles/franchise/my
// @access  Private/Franchise
exports.getMyFranchiseVehicles = async (req, res) => {
    try {
        // req.franchise is set by franchiseProtect middleware
        const vehicles = await Vehicle.find({ franchise: req.franchise.id }).sort('-createdAt');
        
        res.status(200).json({ 
            success: true, 
            count: vehicles.length, 
            data: vehicles 
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Check Vehicle Availability for specific dates
// @route   GET /api/vehicles/:id/availability
// @access  Public
exports.checkAvailability = async (req, res) => {
    try {
        const { start_date, end_date } = req.query;
        if (!start_date || !end_date) {
            return res.status(400).json({ success: false, message: 'Please provide start_date and end_date' });
        }

        const vehicle = await Vehicle.findById(req.params.id);
        if (!vehicle) {
            return res.status(404).json({ success: false, message: 'Vehicle not found' });
        }

        // Check for overlapping bookings
        const Booking = require('../models/bookingModel');
        const overlap = await Booking.findOne({
            vehicle: req.params.id,
            booking_status: { $in: ['confirmed', 'ongoing'] },
            $or: [
                {
                    start_date: { $lte: new Date(end_date) },
                    end_date: { $gte: new Date(start_date) }
                }
            ]
        });

        const isAvailable = vehicle.status === 'active' && !overlap;

        res.status(200).json({
            success: true,
            is_available: isAvailable,
            reason: !isAvailable ? (vehicle.status !== 'active' ? `Vehicle status is ${vehicle.status}` : 'Already booked for these dates') : 'Vehicle is free'
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
