const DamageReport = require('../models/damageReportModel');
const Booking = require('../models/bookingModel');
const path = require('path');

// @desc    Submit a damage report
// @route   POST /api/reports/damage
// @access  Private
exports.submitDamageReport = async (req, res) => {
    try {
        const { description } = req.body;
        
        let photos = [];
        if (req.files && req.files.length > 0) {
            photos = req.files.map(file => `/uploads/${file.filename}`);
        }

        // Try to find the user's ongoing or most recent booking to link the vehicle
        const booking = await Booking.findOne({ 
            user: req.user._id,
            booking_status: { $in: ['ongoing', 'confirmed', 'completed'] }
        }).sort({ createdAt: -1 });

        const report = await DamageReport.create({
            user: req.user._id,
            vehicle: booking ? booking.vehicle : null,
            booking: booking ? booking._id : null,
            description: description || '',
            photos
        });

        res.status(201).json({
            success: true,
            data: report,
            message: 'Damage report submitted successfully'
        });
    } catch (error) {
        console.error('Error submitting damage report:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    Get all damage reports for Admin
// @route   GET /api/reports/damage/admin
// @access  Private/Admin
exports.getAllDamageReports = async (req, res) => {
    try {
        const reports = await DamageReport.find()
            .populate('user', 'name email mobile')
            .populate('vehicle', 'brand vehicle_name registration_number')
            .populate('booking', 'booking_id start_date end_date')
            .sort({ createdAt: -1 });

        res.status(200).json({
            success: true,
            count: reports.length,
            data: reports
        });
    } catch (error) {
        console.error('Error fetching damage reports:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    Get my damage reports (Customer)
// @route   GET /api/reports/damage/my
// @access  Private
exports.getMyDamageReports = async (req, res) => {
    try {
        const reports = await DamageReport.find({ user: req.user._id })
            .populate('vehicle', 'brand vehicle_name registration_number')
            .sort({ createdAt: -1 });

        res.status(200).json({
            success: true,
            count: reports.length,
            data: reports
        });
    } catch (error) {
        console.error('Error fetching my damage reports:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    Update damage report status
// @route   PATCH /api/reports/damage/:id
// @access  Private/Admin
exports.updateDamageReportStatus = async (req, res) => {
    try {
        const { status, admin_notes } = req.body;
        
        const report = await DamageReport.findById(req.params.id);
        if (!report) {
            return res.status(404).json({ success: false, message: 'Report not found' });
        }

        if (status) report.status = status;
        if (admin_notes !== undefined) report.admin_notes = admin_notes;

        await report.save();

        const io = req.app.get('io');
        if (io && report.user) {
            io.to(report.user.toString()).emit('damage_report_updated', report);
        }

        res.status(200).json({
            success: true,
            data: report,
            message: 'Report updated successfully'
        });
    } catch (error) {
        console.error('Error updating damage report:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};
