const GlobalSetting = require('../models/globalSettingModel');
const Booking = require('../models/bookingModel');
const Tracking = require('../models/trackingModel');
const KYC = require('../models/kycModel');

// @desc    Get all global settings
// @route   GET /api/settings
// @access  Private/Admin
exports.getSettings = async (req, res) => {
    try {
        const settings = await GlobalSetting.find({});
        // Convert to object for easier frontend use
        const config = {};
        settings.forEach(s => config[s.key] = s.value);
        
        res.status(200).json({ success: true, data: config });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Update/Create global settings
// @route   PUT /api/settings
// @access  Private/Admin
exports.updateSettings = async (req, res) => {
    try {
        const { settings } = req.body; // Expecting an object { key: value }
        
        const promises = Object.keys(settings).map(key => {
            return GlobalSetting.findOneAndUpdate(
                { key },
                { key, value: settings[key] },
                { upsert: true, new: true }
            );
        });

        await Promise.all(promises);

        res.status(200).json({ success: true, message: 'Settings updated successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Delete old records (Bookings & Tracking)
// @route   DELETE /api/settings/cleanup
// @access  Private/Admin
exports.cleanupOldRecords = async (req, res) => {
    try {
        const { months } = req.query;
        if (!months || isNaN(months)) {
            return res.status(400).json({ success: false, message: 'Please provide a valid number of months' });
        }

        const cutoffDate = new Date();
        cutoffDate.setMonth(cutoffDate.getMonth() - parseInt(months));

        // Delete Tracking logs older than cutoff
        const trackingResult = await Tracking.deleteMany({
            createdAt: { $lt: cutoffDate }
        });

        // Delete Bookings older than cutoff ONLY if completed or cancelled
        const bookingResult = await Booking.deleteMany({
            createdAt: { $lt: cutoffDate },
            booking_status: { $in: ['completed', 'cancelled'] }
        });

        // Delete Approved KYCs older than cutoff
        const kycResult = await KYC.deleteMany({
            createdAt: { $lt: cutoffDate },
            status: 'approved'
        });

        res.status(200).json({
            success: true,
            message: `Cleanup successful. Deleted ${trackingResult.deletedCount} tracking logs, ${bookingResult.deletedCount} bookings, and ${kycResult.deletedCount} approved KYC records.`,
            data: {
                trackingDeleted: trackingResult.deletedCount,
                bookingsDeleted: bookingResult.deletedCount,
                kycDeleted: kycResult.deletedCount
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
