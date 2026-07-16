const cron = require('node-cron');
const Booking = require('../models/bookingModel');
const User = require('../models/userModel');
const { sendPushNotification } = require('./fcmHelper');
const { sendNotification } = require('./notificationHelper');

const formatDate = (date) =>
    new Date(date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

const getMessage = (daysLeft, amount, bookingId, dueDate) => {
    const amt = `₹${Number(amount).toLocaleString('en-IN')}`;
    const dateStr = formatDate(dueDate);
    if (daysLeft === 3) return {
        title: '📅 Payment Due in 3 Days',
        body: `Your installment of ${amt} for booking #${bookingId} is due on ${dateStr} (3 days left). Please arrange payment on time.`,
    };
    if (daysLeft === 1) return {
        title: '⏰ Payment Due Tomorrow!',
        body: `Reminder: Your installment of ${amt} for booking #${bookingId} is due tomorrow (${dateStr}). Pay now to avoid overdue charges.`,
    };
    return {
        title: '🔔 Payment Due Today!',
        body: `Your installment of ${amt} for booking #${bookingId} is due TODAY (${dateStr}). Pay immediately to keep your booking active.`,
    };
};

const getForceMessage = (amount, bookingId, dueDate) => {
    const amt = `₹${Number(amount).toLocaleString('en-IN')}`;
    const dateStr = formatDate(dueDate);
    return {
        title: '💳 Installment Payment Reminder',
        body: `Your installment of ${amt} for booking #${bookingId} is scheduled on ${dateStr}. Please ensure timely payment.`,
    };
};

let ioInstance = null;

const runInstallmentNotifications = async (force = false) => {
    try {
        const now = new Date();
        const bookings = await Booking.find({
            'payment_installments.status': { $in: ['pending', 'overdue'] },
            booking_status: { $nin: ['completed', 'cancelled'] },
        }).populate('user', 'name fcm_token');

        let sent = 0;

        for (const booking of bookings) {
            const user = booking.user;
            if (!user) continue;

            let bookingModified = false;

            for (const inst of booking.payment_installments) {
                if (inst.status === 'paid') continue;

                const dueDate = new Date(inst.due_date);
                const dueMidnight = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());
                const nowMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                const diffMs = dueMidnight - nowMidnight;
                const daysLeft = Math.round(diffMs / (1000 * 60 * 60 * 24));

                // Mark overdue if past due
                if (daysLeft < 0 && inst.status === 'pending') {
                    inst.status = 'overdue';
                    bookingModified = true;
                }

                // Normal mode: trigger exactly 3 days before and 0 days before (on due date)
                // Force mode: send to ALL pending installments regardless of date
                if (!force && ![0, 3].includes(daysLeft) && daysLeft >= 0) continue;

                const notifyDays = force ? daysLeft : (daysLeft <= 0 ? 0 : daysLeft);
                const { title, body } = force
                    ? getForceMessage(inst.amount, booking.booking_id, dueDate)
                    : getMessage(notifyDays <= 0 ? 0 : notifyDays, inst.amount, booking.booking_id, dueDate);

                if (user.fcm_token) {
                    await sendPushNotification(user.fcm_token, title, body, {
                        booking_id: booking.booking_id,
                        installment_id: String(inst._id),
                        amount: String(inst.amount),
                        due_date: inst.due_date.toISOString(),
                        type: 'installment_reminder',
                    });
                }

                await sendNotification({
                    recipient: user._id,
                    recipient_role: 'user',
                    title,
                    message: body,
                    type: 'payment',
                    related_id: booking._id,
                    due_date: inst.due_date,
                });

                // Send Admin Notification & Emit Socket Event
                await sendNotification({
                    recipient_role: 'admin',
                    title: `Payment Due Alert (Booking #${booking.booking_id})`,
                    message: `Customer ${user.name || user.mobile} has a payment of ₹${inst.amount} due ${daysLeft === 0 ? 'TODAY' : `in ${daysLeft} days`}.`,
                    type: 'payment',
                    related_id: booking._id,
                    due_date: inst.due_date,
                });
                
                if (ioInstance) {
                    ioInstance.emit('admin_data_changed', { type: 'payment_reminder', message: 'New payment due reminder' });
                }

                sent++;
            }

            if (bookingModified) await booking.save();
        }

        console.log(`[InstallmentScheduler] ${new Date().toISOString()} — Sent ${sent} notifications (force=${force})`);
        return { sent, bookingsChecked: bookings.length };
    } catch (err) {
        console.error('[InstallmentScheduler] Error:', err.message);
        throw err;
    }
};

// Run every day at 9:00 AM
const startInstallmentScheduler = (io) => {
    if (io) ioInstance = io;
    cron.schedule('0 9 * * *', () => runInstallmentNotifications(false), { timezone: 'Asia/Kolkata' });
    console.log('[InstallmentScheduler] Started — runs daily at 9:00 AM IST');
};

module.exports = { startInstallmentScheduler, runInstallmentNotifications };
