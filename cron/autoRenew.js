const cron = require('node-cron');
const Booking = require('../models/bookingModel');
const { processExtensionInternal } = require('../controller/bookingController');
const { syncMasterInvoiceForBooking } = require('../controller/invoiceController');
const { sendNotification } = require('../utils/notificationHelper');
const User = require('../models/userModel');

// Run every day at 12:01 AM
const runAutoRenewLogic = async () => {
    console.log('🔄 Running Auto-Renew Job...');
    try {
        // Find bookings that are active, have auto_renew enabled, and end_date has passed (i.e. 1 week is completed)
        const now = new Date();

        const bookingsToRenew = await Booking.find({
            booking_status: { $in: ['confirmed', 'ongoing'] },
            auto_renew: true,
            end_date: { $lte: now }
        }).populate('plan').populate('user');

        if (bookingsToRenew.length === 0) {
            console.log('✅ No bookings require auto-renewal today.');
            return { message: 'No bookings require auto-renewal today.', count: 0 };
        }

        console.log(`Found ${bookingsToRenew.length} bookings to auto-renew.`);
        let renewedCount = 0;

        for (const booking of bookingsToRenew) {
            try {
                // Check if already renewed for this specific period (to prevent double-renewing on same day if job runs twice)
                // If end_date is now greater than now, it was already renewed.
                if (booking.end_date > now) continue;

                console.log(`🔄 Auto-renewing booking ${booking.booking_id}...`);
                
                // Extend by 1 week
                const { weeklyRate, totalExtraCost } = await processExtensionInternal(booking, 1);
                
                console.log(`✅ Booking ${booking.booking_id} auto-renewed successfully. Added ${totalExtraCost}`);
                renewedCount++;
                
                // Note: The invoice syncing is handled automatically in the invoiceController when an invoice is requested.
                // However, to be fully dynamic, we can forcefully sync the master invoice right now so it reflects in Admin Panel immediately.
                if (syncMasterInvoiceForBooking) {
                    await syncMasterInvoiceForBooking(booking);
                }

                // Notify Admins
                const admins = await User.find({ role: 'admin' });
                for (const admin of admins) {
                    await sendNotification({
                        recipient: admin._id,
                        recipient_role: 'admin',
                        title: '🔄 Booking Auto-Renewed',
                        message: `Booking #${booking.booking_id} for ${booking.user.name || 'User'} has been automatically renewed for 1 week at exactly ₹${weeklyRate}.`,
                        type: 'booking',
                        related_id: booking._id,
                    });
                }

                // Notify Franchise (if applicable)
                if (booking.franchise) {
                    await sendNotification({
                        recipient: booking.franchise,
                        recipient_role: 'franchise',
                        title: '🔄 Booking Auto-Renewed',
                        message: `Booking #${booking.booking_id} for your store has been automatically renewed for 1 week.`,
                        type: 'booking',
                        related_id: booking._id,
                    });
                }
            } catch (err) {
                console.error(`❌ Error auto-renewing booking ${booking.booking_id}:`, err);
            }
        }
        return { message: `Auto-renewed ${renewedCount} bookings.`, count: renewedCount };
    } catch (error) {
        console.error('❌ Failed to run Auto-Renew Job:', error);
        throw error;
    }
};

const autoRenewJob = cron.schedule('1 0 * * *', runAutoRenewLogic);

module.exports = { autoRenewJob, runAutoRenewLogic };
