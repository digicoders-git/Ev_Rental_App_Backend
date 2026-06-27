const RechargePlan = require('../models/rechargePlanModel');

// @desc    Get all active recharge plans (For App)
// @route   GET /api/recharge-plans
// @access  Public
exports.getPlans = async (req, res) => {
    try {
        const plans = await RechargePlan.find({ status: 'active' }).sort({ price: 1 });
        res.status(200).json({ success: true, count: plans.length, data: plans });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    Get all recharge plans (For Admin)
// @route   GET /api/recharge-plans/all
// @access  Private/Admin
exports.getAllPlans = async (req, res) => {
    try {
        const plans = await RechargePlan.find().sort({ price: 1 });
        res.status(200).json({ success: true, count: plans.length, data: plans });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    Create new recharge plan
// @route   POST /api/recharge-plans
// @access  Private/Admin
exports.createPlan = async (req, res) => {
    try {
        const plan = await RechargePlan.create(req.body);
        res.status(201).json({ success: true, data: plan });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
};

// @desc    Update recharge plan
// @route   PUT /api/recharge-plans/:id
// @access  Private/Admin
exports.updatePlan = async (req, res) => {
    try {
        let plan = await RechargePlan.findById(req.params.id);
        if (!plan) {
            return res.status(404).json({ success: false, message: 'Plan not found' });
        }
        plan = await RechargePlan.findByIdAndUpdate(req.params.id, req.body, {
            new: true,
            runValidators: true
        });
        res.status(200).json({ success: true, data: plan });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
};

// @desc    Delete recharge plan
// @route   DELETE /api/recharge-plans/:id
// @access  Private/Admin
exports.deletePlan = async (req, res) => {
    try {
        const plan = await RechargePlan.findById(req.params.id);
        if (!plan) {
            return res.status(404).json({ success: false, message: 'Plan not found' });
        }
        await plan.deleteOne();
        res.status(200).json({ success: true, data: {} });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};
