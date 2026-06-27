const express = require('express');
const {
    getPlans,
    getAllPlans,
    createPlan,
    updatePlan,
    deletePlan
} = require('../controller/rechargePlanController');

const { protect, admin } = require('../middleware/authMiddleware');

const router = express.Router();

// Public route for app
router.get('/', getPlans);

// Admin routes
router.get('/all', protect, admin, getAllPlans);
router.post('/', protect, admin, createPlan);
router.put('/:id', protect, admin, updatePlan);
router.delete('/:id', protect, admin, deletePlan);

module.exports = router;
