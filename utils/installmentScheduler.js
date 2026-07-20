const cron = require('node-cron');
const Booking = require('../models/bookingModel');
const User = require('../models/userModel');
const { sendPushNotification } = require('./fcmHelper');
const { sendNotification } = require('./notificationHelper');

const formatDate = (date) =>
    new Date(date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

const getMessage = (daysLeft, amount, bookingId, dueDate, lateFee) => {
    const amt = `₹${Number(amount).toLocaleString('en-IN')}`;
    const dateStr = formatDate(dueDate);
    
    if (daysLeft < 0) {
        return {
            title: '⚠️ OVERDUE Payment Alert',
            body: `Your installment of ${amt} (incl. ₹${lateFee || 0} late fee) for booking #${bookingId} is OVERDUE since ${dateStr}. Please pay immediately.`,
        };
    }
    
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
        }).populate('user', 'name fcm_token').populate('plan', 'late_fee_per_day');

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

                // Add Late Fee if 1+ day late and no late fee applied yet
                if (daysLeft <= -1 && (inst.late_fee === undefined || inst.late_fee === 0)) {
                    const lateFeeAmount = (booking.plan && booking.plan.late_fee_per_day) ? booking.plan.late_fee_per_day : 50;
                    
                    inst.late_fee = lateFeeAmount;
                    inst.amount += lateFeeAmount;
                    booking.grand_total += lateFeeAmount;
                    
                    bookingModified = true;
                }

                // Send notification if within 3 days or overdue
                if (!force && daysLeft > 3) continue;

                const notifyDays = force ? daysLeft : daysLeft;
                const { title, body } = force
                    ? getForceMessage(inst.amount, booking.booking_id, dueDate)
                    : getMessage(notifyDays, inst.amount, booking.booking_id, dueDate, inst.late_fee);

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
                    message: `Customer ${user.name || user.mobile} has a payment of ₹${inst.amount} due ${daysLeft === 0 ? 'TODAY' : daysLeft < 0 ? 'OVERDUE' : `in ${daysLeft} days`}.`,
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

// Run every 6 hours
const startInstallmentScheduler = (io) => {
    if (io) ioInstance = io;
    cron.schedule('0 */6 * * *', () => runInstallmentNotifications(false), { timezone: 'Asia/Kolkata' });
    console.log('[InstallmentScheduler] Started — runs every 6 hours');
};

module.exports = { startInstallmentScheduler, runInstallmentNotifications };
