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

        if (req.app.get('io')) {
            req.app.get('io').emit('admin_data_changed');
        }

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
        const { franchiseId, category } = req.query;
        let query = {};
        
        if (franchiseId) {
            if (franchiseId === 'main') {
                query.franchise = null;
            } else {
                query.franchise = franchiseId;
            }
        }
        if (category) {
            query.category = category;
        }

        const Booking = require('../models/bookingModel');
        const busyBookings = await Booking.find({ 
            booking_status: { $in: ['confirmed', 'ongoing'] },
            is_vehicle_released: { $ne: true }
        }).select('vehicle');
        const busyVehicleIds = busyBookings.map(b => b.vehicle ? b.vehicle.toString() : '');

        const vehicles = await Vehicle.find(query)
            .populate('franchise', 'store_name')
            .populate('category', 'name')
            .sort('-createdAt');
        
        const data = vehicles.map(v => {
            const vObj = v.toObject();
            vObj.is_busy = busyVehicleIds.includes(v._id.toString());
            return vObj;
        });

        // Sort: Available (is_busy = false) at top, Booked (is_busy = true) at bottom
        data.sort((a, b) => {
            if (a.is_busy === b.is_busy) return 0;
            return a.is_busy ? 1 : -1;
        });

        res.status(200).json({ success: true, count: vehicles.length, data: data });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Get single EV
// @route   GET /api/vehicles/:id
// @access  Public
exports.getVehicleById = async (req, res) => {
    try {
        const vehicle = await Vehicle.findById(req.params.id).populate('category', 'name');
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

        if (req.app.get('io')) {
            req.app.get('io').emit('admin_data_changed');
        }

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

        if (req.app.get('io')) {
            req.app.get('io').emit('admin_data_changed');
        }

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

        if (req.app.get('io')) {
            req.app.get('io').emit('admin_data_changed');
        }

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
        const { category } = req.query;
        let query = { franchise: req.franchise.id };
        if (category) {
            query.category = category;
        }

        // req.franchise is set by franchiseProtect middleware
        const vehicles = await Vehicle.find(query).sort('-createdAt').populate('category', 'name');

        // Add is_busy flag based on active bookings
        const Booking = require('../models/bookingModel');
        const busyBookings = await Booking.find({
            booking_status: { $in: ['confirmed', 'ongoing'] },
            is_vehicle_released: { $ne: true }
        }).select('vehicle');
        const busyVehicleIds = busyBookings.map(b => b.vehicle ? b.vehicle.toString() : '');

        const data = vehicles.map(v => {
            const vObj = v.toObject();
            vObj.is_busy = busyVehicleIds.includes(v._id.toString());
            return vObj;
        });
        
        // Sort: Available (is_busy = false) at top, Booked (is_busy = true) at bottom
        data.sort((a, b) => {
            if (a.is_busy === b.is_busy) return 0;
            return a.is_busy ? 1 : -1;
        });
        
        res.status(200).json({ 
            success: true, 
            count: vehicles.length, 
            data: data
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

// @desc    Create new Vehicle by Franchise
// @route   POST /api/vehicles/franchise/create
// @access  Private/Franchise
exports.createFranchiseVehicle = async (req, res) => {
    try {
        const data = { ...req.body };

        // Auto-assign to logged-in franchise and mark as added_by_franchise
        data.franchise = req.franchise.id;
        data.added_by_franchise = true;

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

        if (req.app.get('io')) {
            req.app.get('io').emit('admin_data_changed');
        }

        res.status(201).json({ success: true, data: vehicle });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

// @desc    Update Vehicle Status only (Admin/Franchise) — with active-booking safety check
// @route   PATCH /api/vehicles/:id/status
// @access  Private/Admin or Franchise
exports.updateVehicleStatus = async (req, res) => {
    try {
        const { status, force } = req.body;

        // Map frontend status labels to DB enum values
        const statusMap = {
            'available': 'active',
            'active': 'active',
            'maintenance': 'maintenance',
            'inactive': 'inactive',
            'out_of_order': 'out_of_order',
            'out of order': 'out_of_order',
        };

        const dbStatus = statusMap[status?.toLowerCase()];
        if (!dbStatus) {
            return res.status(400).json({
                success: false,
                message: `Invalid status '${status}'. Allowed: available, maintenance, inactive, out_of_order`
            });
        }

        const vehicle = await Vehicle.findById(req.params.id);
        if (!vehicle) {
            return res.status(404).json({ success: false, message: 'Vehicle not found' });
        }

        // Authorization — Admin or the franchise that owns this vehicle
        const isAdmin = req.user && req.user.role === 'admin';
        const isFranchise = req.franchise && vehicle.franchise &&
                            vehicle.franchise.toString() === req.franchise.id;
        if (!isAdmin && !isFranchise) {
            return res.status(403).json({ success: false, message: 'Not authorized to update this vehicle status' });
        }

        // If trying to set Available (active), check for conflicting bookings
        if (dbStatus === 'active') {
            const Booking = require('../models/bookingModel');
            const activeBooking = await Booking.findOne({
                vehicle: req.params.id,
                booking_status: { $in: ['confirmed', 'ongoing'] },
                is_vehicle_released: { $ne: true }
            }).select('booking_id booking_status _id');

            if (activeBooking && !force) {
                // Return conflict info so frontend can show a warning
                return res.status(409).json({
                    success: false,
                    conflict: true,
                    message: `Vehicle has an active booking (${activeBooking.booking_status.toUpperCase()}, ID: ${activeBooking.booking_id}). Send force: true to override.`,
                    booking_id: activeBooking.booking_id,
                    booking_status: activeBooking.booking_status,
                    booking_db_id: activeBooking._id
                });
            }

            // Force override: release vehicle without cancelling booking
            if (activeBooking && force) {
                activeBooking.is_vehicle_released = true;
                await activeBooking.save();
            }
        }

        vehicle.status = dbStatus;
        await vehicle.save();

        if (req.app.get('io')) {
            req.app.get('io').emit('admin_data_changed');
        }

        res.status(200).json({
            success: true,
            message: `Vehicle status updated to '${dbStatus}' successfully`,
            data: vehicle
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
