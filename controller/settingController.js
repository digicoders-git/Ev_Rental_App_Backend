const GlobalSetting = require('../models/globalSettingModel');

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
