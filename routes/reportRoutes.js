const express = require('express');
const router = express.Router();
const {
    getDashboardStats,
    getRevenueAnalysis,
    getFranchisePerformance,
    exportBookingsCSV
} = require('../controller/reportController');
const { protect, admin } = require('../middleware/authMiddleware');

// All report routes are Admin Only
router.use(protect, admin);

router.get('/dashboard-stats', getDashboardStats);
router.get('/revenue-analysis', getRevenueAnalysis);
router.get('/franchise-performance', getFranchisePerformance);
router.get('/export/bookings', exportBookingsCSV);

module.exports = router;
