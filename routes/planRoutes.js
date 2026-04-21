const express = require('express');
const router = express.Router();
const {
    createPlan,
    getAllPlans,
    getPlanById,
    updatePlan,
    deletePlan,
    updatePlanPrice,
    togglePlanStatus
} = require('../controller/planController');
const { protect, admin } = require('../middleware/authMiddleware');

// Public routes
router.get('/', getAllPlans);
router.get('/:id', getPlanById);

// Protected routes (Admin)
router.post('/', protect, admin, createPlan);
router.put('/:id', protect, admin, updatePlan);
router.patch('/:id/price', protect, admin, updatePlanPrice);
router.patch('/:id/toggle-status', protect, admin, togglePlanStatus);
router.delete('/:id', protect, admin, deletePlan);

module.exports = router;
