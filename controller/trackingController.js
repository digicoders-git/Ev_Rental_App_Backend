const Tracking = require('../models/trackingModel');
const Vehicle = require('../models/vehicleModel');
const Booking = require('../models/bookingModel');

// @desc    Update Vehicle Location (Simulation/IOT Endpoint)
// @route   POST /api/tracking/update
// @access  Public (Should be secured in production with API Key/Token)
exports.updateLocation = async (req, res) => {
    try {
        const { vehicle_id, lat, lng, address, battery_level, speed } = req.body;

        const vehicle = await Vehicle.findOne({ vehicle_id });
        if (!vehicle) {
            return res.status(404).json({ success: false, message: 'Vehicle not found' });
        }

        // Update Vehicle current state
        vehicle.current_location = { lat, lng, address };
        vehicle.current_battery = battery_level || vehicle.current_battery;
        vehicle.last_gps_update = Date.now();
        await vehicle.save();

        // Find active booking for this vehicle to link history
        const activeBooking = await Booking.findOne({ 
            vehicle: vehicle._id, 
            booking_status: 'ongoing' 
        });

        // Add to history
        await Tracking.create({
            vehicle: vehicle._id,
            booking: activeBooking ? activeBooking._id : null,
            location: { lat, lng, address },
            battery_level,
            speed,
            timestamp: Date.now()
        });

        res.status(200).json({ success: true, message: 'Location updated' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Get Current Location of a vehicle
// @route   GET /api/tracking/live/:id
// @access  Private
exports.getLiveLocation = async (req, res) => {
    try {
        const id = req.params.id;
        let vehicle;

        // Check if ID is a valid MongoDB ObjectId
        if (id.match(/^[0-9a-fA-F]{24}$/)) {
            vehicle = await Vehicle.findById(id);
        } else {
            // Otherwise search by vehicle_id or registration_number
            vehicle = await Vehicle.findOne({
                $or: [
                    { vehicle_id: id },
                    { registration_number: id }
                ]
            });
        }
        
        if (!vehicle) {
            return res.status(404).json({ success: false, message: 'Vehicle not found with this ID/Reg Number' });
        }

        res.status(200).json({ success: true, data: vehicle });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Get Tracking History for a vehicle/booking
// @route   GET /api/tracking/history/:vehicleId
// @access  Private
exports.getTrackingHistory = async (req, res) => {
    try {
        const id = req.params.vehicleId;
        const { start_date, end_date } = req.query;
        
        let targetVehicleId;

        if (id.match(/^[0-9a-fA-F]{24}$/)) {
            targetVehicleId = id;
        } else {
            const v = await Vehicle.findOne({
                $or: [{ vehicle_id: id }, { registration_number: id }]
            });
            if (!v) return res.status(404).json({ success: false, message: 'Vehicle not found' });
            targetVehicleId = v._id;
        }

        let query = { vehicle: targetVehicleId };

        if (start_date && end_date) {
            query.timestamp = { $gte: new Date(start_date), $lte: new Date(end_date) };
        }

        const history = await Tracking.find(query).sort('-timestamp').limit(100);

        res.status(200).json({ 
            success: true, 
            count: history.length, 
            data: history 
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Get History linked to a specific Booking
// @route   GET /api/tracking/booking/:bookingId
// @access  Private
exports.getBookingHistory = async (req, res) => {
    try {
        const id = req.params.bookingId;
        let targetBookingId;

        if (id.match(/^[0-9a-fA-F]{24}$/)) {
            targetBookingId = id;
        } else {
            const b = await Booking.findOne({ booking_id: id });
            if (!b) return res.status(404).json({ success: false, message: 'Booking not found' });
            targetBookingId = b._id;
        }

        const history = await Tracking.find({ booking: targetBookingId }).sort('timestamp');

        res.status(200).json({ 
            success: true, 
            count: history.length, 
            data: history 
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// --- FRANCHISE TRACKING CONTROLLERS ---

// @desc    Get Live Status of all vehicles in Franchise Fleet
// @route   GET /api/tracking/franchise/fleet
// @access  Private/Franchise
exports.getFranchiseFleetLive = async (req, res) => {
    try {
        // req.franchise is set by franchiseProtect middleware
        const fleet = await Vehicle.find({ franchise: req.franchise.id })
            .select('vehicle_name vehicle_id registration_number current_location current_battery last_gps_update status');

        res.status(200).json({
            success: true,
            count: fleet.length,
            data: fleet
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Get Tracking History for a specific Franchise vehicle
// @route   GET /api/tracking/franchise/history/:id
// @access  Private/Franchise
exports.getFranchiseVehicleHistory = async (req, res) => {
    try {
        const { id } = req.params;
        const { start_date, end_date } = req.query;

        // Verify vehicle belongs to this franchise
        const vehicle = await Vehicle.findOne({ _id: id, franchise: req.franchise.id });
        if (!vehicle) {
            return res.status(403).json({ success: false, message: 'Not authorized to track this vehicle' });
        }

        let query = { vehicle: vehicle._id };
        if (start_date && end_date) {
            query.timestamp = { $gte: new Date(start_date), $lte: new Date(end_date) };
        }

        const history = await Tracking.find(query).sort('-timestamp').limit(500);

        res.status(200).json({
            success: true,
            count: history.length,
            data: history
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

