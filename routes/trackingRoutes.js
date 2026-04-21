const express = require('express');
const router = express.Router();
const {
    updateLocation,
    getLiveLocation,
    getTrackingHistory,
    getBookingHistory,
    getFranchiseFleetLive,
    getFranchiseVehicleHistory
} = require('../controller/trackingController');
const { protect, admin, franchiseProtect } = require('../middleware/authMiddleware');

// Simulation/IOT Endpoint (Public or API Key)
router.post('/update', updateLocation);

// Franchise Tracking Routes
router.get('/franchise/fleet', franchiseProtect, getFranchiseFleetLive);
router.get('/franchise/history/:id', franchiseProtect, getFranchiseVehicleHistory);

// Protected routes (Admin/General)
router.get('/live/:id', protect, getLiveLocation);
router.get('/history/:vehicleId', protect, getTrackingHistory);
router.get('/booking/:bookingId', protect, getBookingHistory);

module.exports = router;
