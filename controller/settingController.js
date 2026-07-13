const GlobalSetting = require('../models/globalSettingModel');
const Booking = require('../models/bookingModel');
const Tracking = require('../models/trackingModel');
const KYC = require('../models/kycModel');
const User = require('../models/userModel');
const Vehicle = require('../models/vehicleModel');
const FranchiseStore = require('../models/franchiseStoreModel');
const WalletTransaction = require('../models/walletTransactionModel');
const SupportTicket = require('../models/supportModel');
const DamageReport = require('../models/damageReportModel');
const Review = require('../models/reviewModel');
const excel = require('exceljs');

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

// @desc    Get Terms & Conditions (public)
// @route   GET /api/settings/terms
// @access  Public
exports.getTermsAndConditions = async (req, res) => {
    try {
        const setting = await GlobalSetting.findOne({ key: 'terms_and_conditions' });
        const text = setting ? setting.value : '';
        res.status(200).json({ success: true, data: { terms_and_conditions: text } });
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

// @desc    Export database to Excel (Users, Vehicles, Bookings, Franchisees)
// @route   GET /api/settings/backup
// @access  Private/Admin
exports.exportDatabaseBackup = async (req, res) => {
    try {
        const workbook = new excel.Workbook();
        workbook.creator = 'Admin Panel';
        workbook.created = new Date();

        // 1. Users Sheet
        const users = await User.find({}).lean();
        const userSheet = workbook.addWorksheet('Users');
        userSheet.columns = [
            { header: 'User ID', key: '_id', width: 25 },
            { header: 'Name', key: 'name', width: 20 },
            { header: 'Mobile', key: 'mobile', width: 15 },
            { header: 'Email', key: 'email', width: 25 },
            { header: 'Role', key: 'role', width: 10 },
            { header: 'Credit Score', key: 'credit_score', width: 15 },
            { header: 'KYC Verified', key: 'isKycVerified', width: 15 },
            { header: 'Created At', key: 'createdAt', width: 20 }
        ];
        userSheet.addRows(users.map(u => ({
            ...u,
            _id: u._id?.toString() || '',
            isKycVerified: u.isKycVerified ? 'Yes' : 'No',
            createdAt: u.createdAt ? new Date(u.createdAt).toISOString() : ''
        })));

        // 2. Vehicles Sheet
        const vehicles = await Vehicle.find({}).populate('franchise', 'store_name').lean();
        const vehicleSheet = workbook.addWorksheet('Vehicles');
        vehicleSheet.columns = [
            { header: 'Vehicle ID', key: '_id', width: 25 },
            { header: 'Name', key: 'vehicle_name', width: 20 },
            { header: 'Reg Number', key: 'registration_number', width: 15 },
            { header: 'Status', key: 'status', width: 15 },
            { header: 'Price/Day', key: 'price_per_day', width: 10 },
            { header: 'Franchise', key: 'franchise', width: 20 },
            { header: 'Added By', key: 'added_by_franchise', width: 20 },
        ];
        vehicleSheet.addRows(vehicles.map(v => ({
            ...v,
            _id: v._id?.toString() || '',
            franchise: v.franchise ? v.franchise.store_name : 'Unassigned',
            added_by_franchise: v.added_by_franchise ? 'Franchise' : 'Admin'
        })));

        // 3. Bookings Sheet
        const bookings = await Booking.find({})
            .populate('user', 'name mobile')
            .populate('vehicle', 'vehicle_name registration_number')
            .populate('franchise', 'store_name')
            .lean();
        const bookingSheet = workbook.addWorksheet('Bookings');
        bookingSheet.columns = [
            { header: 'Booking ID', key: 'booking_id', width: 20 },
            { header: 'User Name', key: 'userName', width: 20 },
            { header: 'User Mobile', key: 'userMobile', width: 15 },
            { header: 'Vehicle Name', key: 'vehicleName', width: 20 },
            { header: 'Reg Number', key: 'regNumber', width: 15 },
            { header: 'Franchise', key: 'franchiseName', width: 20 },
            { header: 'Status', key: 'booking_status', width: 15 },
            { header: 'Total Paid', key: 'total_paid', width: 15 },
            { header: 'Grand Total', key: 'grand_total', width: 15 },
            { header: 'Start Date', key: 'start_date', width: 20 },
            { header: 'End Date', key: 'end_date', width: 20 }
        ];
        bookingSheet.addRows(bookings.map(b => ({
            ...b,
            userName: b.user ? b.user.name : 'Unknown',
            userMobile: b.user ? b.user.mobile : 'Unknown',
            vehicleName: b.vehicle ? b.vehicle.vehicle_name : 'Unknown',
            regNumber: b.vehicle ? b.vehicle.registration_number : 'Unknown',
            franchiseName: b.franchise ? b.franchise.store_name : 'Unknown',
            start_date: b.start_date ? new Date(b.start_date).toISOString() : '',
            end_date: b.end_date ? new Date(b.end_date).toISOString() : ''
        })));

        // 4. Franchises Sheet
        const franchises = await FranchiseStore.find({}).lean();
        const franchiseSheet = workbook.addWorksheet('Franchises');
        franchiseSheet.columns = [
            { header: 'Store ID', key: 'store_id', width: 15 },
            { header: 'Store Name', key: 'store_name', width: 25 },
            { header: 'Owner Name', key: 'owner_name', width: 20 },
            { header: 'Mobile', key: 'mobile', width: 15 },
            { header: 'Email', key: 'email', width: 25 },
            { header: 'City', key: 'city', width: 15 },
            { header: 'Status', key: 'status', width: 15 },
            { header: 'Created At', key: 'createdAt', width: 20 }
        ];
        franchiseSheet.addRows(franchises.map(f => ({
            ...f,
            createdAt: f.createdAt ? new Date(f.createdAt).toISOString() : ''
        })));

        // 5. Generic exports for remaining collections
        const addGenericSheet = async (Model, sheetName) => {
            const data = await Model.find({}).lean();
            if (data.length === 0) return;
            const sheet = workbook.addWorksheet(sheetName);
            const allKeys = Array.from(new Set(data.flatMap(obj => Object.keys(obj))));
            sheet.columns = allKeys.map(k => ({ header: k, key: k, width: 20 }));
            
            data.forEach(obj => {
                const row = {};
                allKeys.forEach(k => {
                    if (obj[k] instanceof Date) row[k] = obj[k].toISOString();
                    else if (typeof obj[k] === 'object' && obj[k] !== null) row[k] = JSON.stringify(obj[k]);
                    else row[k] = obj[k];
                });
                sheet.addRow(row);
            });
        };

        await addGenericSheet(KYC, 'KYC Records');
        await addGenericSheet(WalletTransaction, 'Wallet Transactions');
        await addGenericSheet(SupportTicket, 'Support Tickets');
        await addGenericSheet(DamageReport, 'Damage Reports');
        await addGenericSheet(Review, 'Reviews');
        await addGenericSheet(Tracking, 'Tracking Logs');

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename=EV_Rental_Backup.xlsx');

        await workbook.xlsx.write(res);
        res.end();
    } catch (error) {
        console.error('Backup Error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};
