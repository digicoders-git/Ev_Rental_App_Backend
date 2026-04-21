const RentalPlan = require('../models/planModel');

// @desc    Create new Rental Plan
// @route   POST /api/plans
// @access  Private/Admin
exports.createPlan = async (req, res) => {
    try {
        const plan = await RentalPlan.create(req.body);
        res.status(201).json({ success: true, data: plan });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

// @desc    Get all Rental Plans
// @route   GET /api/plans
// @access  Public
exports.getAllPlans = async (req, res) => {
    try {
        const plans = await RentalPlan.find().sort('-createdAt');
        res.status(200).json({ success: true, count: plans.length, data: plans });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Get single Rental Plan
// @route   GET /api/plans/:id
// @access  Public
exports.getPlanById = async (req, res) => {
    try {
        const plan = await RentalPlan.findById(req.params.id);
        if (!plan) {
            return res.status(404).json({ success: false, message: 'Plan not found' });
        }
        res.status(200).json({ success: true, data: plan });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Update Rental Plan
// @route   PUT /api/plans/:id
// @access  Private/Admin
exports.updatePlan = async (req, res) => {
    try {
        const plan = await RentalPlan.findByIdAndUpdate(req.params.id, req.body, {
            new: true,
            runValidators: true
        });
        if (!plan) {
            return res.status(404).json({ success: false, message: 'Plan not found' });
        }
        res.status(200).json({ success: true, data: plan });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

// @desc    Delete Rental Plan
// @route   DELETE /api/plans/:id
// @access  Private/Admin
exports.deletePlan = async (req, res) => {
    try {
        const plan = await RentalPlan.findById(req.params.id);
        if (!plan) {
            return res.status(404).json({ success: false, message: 'Plan not found' });
        }
        await plan.deleteOne();
        res.status(200).json({ success: true, message: 'Plan deleted successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Update Plan Pricing only
// @route   PATCH /api/plans/:id/price
// @access  Private/Admin
exports.updatePlanPrice = async (req, res) => {
    try {
        const { price, late_fee_per_hour, security_deposit } = req.body;
        const plan = await RentalPlan.findById(req.params.id);

        if (!plan) {
            return res.status(404).json({ success: false, message: 'Plan not found' });
        }

        if (price !== undefined) plan.price = price;
        if (late_fee_per_hour !== undefined) plan.late_fee_per_hour = late_fee_per_hour;
        if (security_deposit !== undefined) plan.security_deposit = security_deposit;

        await plan.save();
        res.status(200).json({ success: true, message: 'Pricing updated', data: plan });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

// @desc    Toggle Rental Plan status (Activate/Deactivate)
// @route   PATCH /api/plans/:id/toggle-status
// @access  Private/Admin
exports.togglePlanStatus = async (req, res) => {
    try {
        const plan = await RentalPlan.findById(req.params.id);
        if (!plan) {
            return res.status(404).json({ success: false, message: 'Plan not found' });
        }

        plan.status = plan.status === 'active' ? 'inactive' : 'active';
        await plan.save();

        res.status(200).json({ 
            success: true, 
            message: `Plan ${plan.status === 'active' ? 'activated' : 'deactivated'} successfully`, 
            data: plan 
        });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};
