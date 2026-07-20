const Booking = require('../models/bookingModel');
const { creditFranchiseWallet } = require('../utils/franchiseWalletHelper');
const Vehicle = require('../models/vehicleModel');
const RentalPlan = require('../models/planModel');
const User = require('../models/userModel');
const WalletTransaction = require('../models/walletTransactionModel');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Razorpay = require('razorpay');
const { sendNotification } = require('../utils/notificationHelper');

// @desc    Create new Booking
// @route   POST /api/bookings
// @access  Private
exports.createBooking = async (req, res) => {
    try {
        const { vehicle, plan, start_date, end_date, pickup_location, drop_location, payment_method } = req.body;

        // 1. Check if vehicle exists and is active
        const vehicleData = await Vehicle.findById(vehicle);
        if (!vehicleData || vehicleData.status !== 'active') {
            return res.status(404).json({ success: false, message: 'Vehicle not found or not active' });
        }

        // 1a. Check KYC Status
        let bookingUserId = req.user ? req.user.id : null;
        if (req.franchise || (req.user && req.user.role === 'admin')) {
            if (req.body.user) bookingUserId = req.body.user;
        }

        if (bookingUserId) {
            const KYC = require('../models/kycModel');
            const kyc = await KYC.findOne({ user: bookingUserId });
            if (!kyc || kyc.status !== 'approved') {
                return res.status(403).json({ 
                    success: false, 
                    message: 'Booking not allowed. Your KYC documents must be approved by the admin first.' 
                });
            }
        }

        // 1b. Check for Overlapping Bookings
        const overlap = await Booking.findOne({
            vehicle,
            booking_status: { $in: ['confirmed', 'ongoing'] },
            is_vehicle_released: { $ne: true },
            start_date: { $lt: new Date(end_date) },
            end_date: { $gt: new Date(start_date) }
        });

        if (overlap) {
            return res.status(400).json({ 
                success: false, 
                message: 'Vehicle is already booked/on a ride for the selected time period.' 
            });
        }

        // 2. Check if plan exists
        const planData = await RentalPlan.findById(plan);
        if (!planData || planData.status !== 'active') {
            return res.status(404).json({ success: false, message: 'Rental plan not found or not active' });
        }

        // 3. Simple calculation (In a real app, calculate based on days)
        // For now, take amounts from body or use defaults if not provided
        const plan_price_inclusive = req.body.total_amount !== undefined ? req.body.total_amount : planData.price;
        const security_deposit = req.body.security_deposit !== undefined ? req.body.security_deposit : planData.security_deposit;
        const discount_amount = req.body.discount_amount || 0;
        
        // Rent includes 5% GST
        const base_rent = Number((plan_price_inclusive / 1.05).toFixed(2));
        const calculated_gst = Number((plan_price_inclusive - base_rent).toFixed(2));
        
        const total_amount = base_rent;
        const gst_amount = req.body.gst_amount !== undefined ? req.body.gst_amount : calculated_gst;
        
        // Since base_rent + calculated_gst = plan_price_inclusive
        const grand_total = Math.round(total_amount + gst_amount + security_deposit - discount_amount);

        bookingUserId = req.user ? req.user.id : null;
        let creatorName = req.user ? (req.user.name || 'User') : 'Franchise/Admin';

        if (req.franchise || (req.user && req.user.role === 'admin')) {
            if (req.body.user) {
                bookingUserId = req.body.user;
                const client = await User.findById(bookingUserId);
                if (client) creatorName = client.name;
            }
        }

        if (!bookingUserId) {
            return res.status(400).json({ success: false, message: 'Customer ID is required to create a booking' });
        }

        let payment_installments = [];
        let initial_payment_status = 'pending';

        if (payment_method === 'installments') {
            const start = new Date(start_date);
            const end = new Date(end_date);
            
            // Calculate weeks (minimum 1 week)
            let weeks = Math.ceil((end - start) / (7 * 24 * 60 * 60 * 1000));
            if (weeks < 1) weeks = 1;
            
            // Allow frontend to override weeks with installmentsCount if provided
            const requestedCount = req.body.installmentsCount ? parseInt(req.body.installmentsCount) : weeks;
            const finalCount = requestedCount > 0 ? requestedCount : 1;

            const baseAmount = Math.floor(grand_total / finalCount);
            const remainder = grand_total - (baseAmount * finalCount);

            for (let i = 0; i < finalCount; i++) {
                const dueDate = new Date(start.getTime() + (i * 7 * 24 * 60 * 60 * 1000));
                payment_installments.push({
                    installment_no: i + 1,
                    amount: i === 0 ? baseAmount + remainder : baseAmount, // Add remainder to first installment
                    due_date: dueDate,
                    status: 'pending'
                });
            }
        }

        const booking = await Booking.create({
            user: bookingUserId,
            vehicle,
            franchise: vehicleData.franchise || null, // Stamp which franchise this booking belongs to
            plan,
            start_date,
            end_date,
            total_amount,
            gst_amount,
            discount_amount,
            security_deposit,
            grand_total,
            pickup_location,
            drop_location,
            payment_method,
            payment_status: initial_payment_status,
            payment_installments
        });

        // Notify Admin
        await sendNotification({
            title: 'New Booking Created',
            message: `Booking #${booking.booking_id} has been created for ${creatorName}.`,
            type: 'booking',
            related_id: booking._id
        });

        let razorpayOrderData = null;

        if (payment_method === 'online') {
            let rzpKeyId = process.env.RAZORPAY_KEY_ID;
            let rzpKeySecret = process.env.RAZORPAY_KEY_SECRET;
            let paymentGatewayUsed = 'platform';
            let rzpOptionsExtras = {};

            if (vehicleData.franchise) {
                const FranchiseStore = require('../models/franchiseStoreModel');
                const franchiseData = await FranchiseStore.findById(vehicleData.franchise);

                if (franchiseData) {
                    const GlobalSetting = require('../models/globalSettingModel');
                    const globalSettingObj = await GlobalSetting.findOne({ key: 'global_payment_mode' });
                    const globalPaymentMode = globalSettingObj ? globalSettingObj.value : 'central';

                    if (globalPaymentMode === 'direct' && franchiseData.razorpay_key_id && franchiseData.razorpay_key_secret) {
                        // Direct Settlement Mode
                        rzpKeyId = franchiseData.razorpay_key_id;
                        rzpKeySecret = franchiseData.razorpay_key_secret;
                        paymentGatewayUsed = 'direct';
                    } else if (globalPaymentMode === 'central' && franchiseData.razorpay_linked_account_id) {
                        // Central Collection Mode with Auto Payout (Razorpay Route Split)
                        const amountInPaise = Math.round(grand_total * 100);
                        const franchiseShare = Math.round(amountInPaise * ((franchiseData.franchise_share_percentage || 80) / 100));
                        rzpOptionsExtras = {
                            transfers: [
                                {
                                    account: franchiseData.razorpay_linked_account_id,
                                    amount: franchiseShare,
                                    currency: 'INR',
                                    notes: {
                                        booking_id: booking._id.toString()
                                    },
                                    linked_account_notes: ["booking_id"]
                                }
                            ]
                        };
                    }
                }
            }

            const razorpay = new Razorpay({
                key_id: rzpKeyId,
                key_secret: rzpKeySecret
            });

            const amountInPaise = Math.round(grand_total * 100);
            const options = {
                amount: amountInPaise,
                currency: 'INR',
                receipt: booking._id.toString(),
                ...rzpOptionsExtras
            };

            let order;
            try {
                order = await razorpay.orders.create(options);
            } catch (rzpErr) {
                if (options.transfers) {
                    console.warn("Razorpay Route failed. Falling back to standard payment.", rzpErr.error ? rzpErr.error.description : rzpErr);
                    delete options.transfers;
                    order = await razorpay.orders.create(options);
                } else {
                    throw rzpErr;
                }
            }
            booking.razorpay_order_id = order.id;
            booking.payment_gateway_used = paymentGatewayUsed;
            booking.razorpay_key_used = rzpKeyId;
            await booking.save();

            razorpayOrderData = {
                razorpay_order_id: order.id,
                razorpay_key: rzpKeyId,
                amount_in_paise: amountInPaise
            };
        }

        res.status(201).json({ 
            success: true, 
            data: booking,
            ...razorpayOrderData
        });
    } catch (error) {
        console.error("DEBUG BOOKING ERROR:", error);
        
        let errorMsg = error.message;
        if (error.error && error.error.description) {
            errorMsg = error.error.description;
        } else if (typeof error === 'string') {
            errorMsg = error;
        } else if (!errorMsg) {
            errorMsg = "An unknown error occurred during booking creation.";
        }

        res.status(400).json({ success: false, message: errorMsg });
    }
};

// @desc    Verify Razorpay Payment
// @route   POST /api/bookings/verify-payment
// @access  Private
exports.verifyPayment = async (req, res) => {
    try {
        const { booking_id, razorpay_payment_id, razorpay_order_id, razorpay_signature } = req.body;

        const booking = await Booking.findById(booking_id).populate('vehicle');
        if (!booking) {
            return res.status(404).json({ success: false, message: 'Booking not found' });
        }

        let rzpKeySecret = process.env.RAZORPAY_KEY_SECRET;

        if (booking.payment_gateway_used === 'direct' && booking.vehicle && booking.vehicle.franchise) {
            const FranchiseStore = require('../models/franchiseStoreModel');
            const franchiseData = await FranchiseStore.findById(booking.vehicle.franchise);
            if (franchiseData && franchiseData.razorpay_key_secret) {
                rzpKeySecret = franchiseData.razorpay_key_secret;
            }
        }

        const body = razorpay_order_id + "|" + razorpay_payment_id;
        const expectedSignature = crypto
            .createHmac("sha256", rzpKeySecret)
            .update(body.toString())
            .digest("hex");

        if (expectedSignature !== razorpay_signature) {
            return res.status(400).json({ success: false, message: 'Invalid signature. Payment verification failed.' });
        }

        booking.payment_status = 'paid';
        booking.booking_status = 'confirmed';
        booking.transaction_id = razorpay_payment_id;
        booking.razorpay_payment_id = razorpay_payment_id;
        booking.total_paid = booking.grand_total;
        await booking.save();
        await creditFranchiseWallet(booking._id, booking.grand_total);

        res.status(200).json({
            success: true,
            message: 'Payment verified and booking confirmed successfully',
            data: booking
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Get logged in user bookings
// @route   GET /api/bookings/my
// @access  Private
exports.getMyBookings = async (req, res) => {
    try {
        const bookings = await Booking.find({ user: req.user.id })
            .populate('vehicle', 'vehicle_name brand thumbnail_image')
            .populate('plan', 'plan_name pricing_type')
            .sort('-createdAt');
        
        res.status(200).json({ success: true, count: bookings.length, data: bookings });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Get all bookings (Admin/Franchise)
// @route   GET /api/bookings
// @access  Private/Admin
exports.getAllBookings = async (req, res) => {
    try {
        const { franchiseId, status } = req.query;
        let query = {};

        if (status) {
            query.booking_status = status;
        }

        if (franchiseId) {
            const vehicles = await Vehicle.find({ franchise: franchiseId }).select('_id');
            const vehicleIds = vehicles.map(v => v._id);
            query.vehicle = { $in: vehicleIds };
        }

        const bookings = await Booking.find(query)
            .populate('user', 'name mobile')
            .populate('vehicle', 'vehicle_name registration_number franchise')
            .populate('franchise', 'store_name')
            .populate('plan', 'plan_name')
            .sort('-createdAt');

        const now = new Date();
        const result = bookings.map(b => {
            const obj = b.toObject({ virtuals: true });
            if (obj.payment_installments && obj.payment_installments.length > 0) {
                // auto-mark overdue
                obj.payment_installments.forEach(inst => {
                    if (inst.status === 'pending' && new Date(inst.due_date) < now) inst.status = 'overdue';
                });
                const pending = obj.payment_installments
                    .filter(i => i.status !== 'paid')
                    .sort((a, b) => new Date(a.due_date) - new Date(b.due_date));
                obj.next_installment = pending.length > 0 ? pending[0] : null;
            } else {
                obj.next_installment = null;
            }
            return obj;
        });

        res.status(200).json({ success: true, count: result.length, data: result });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Get Bookings for current Franchise
// @route   GET /api/bookings/franchise/my
// @access  Private/Franchise
exports.getFranchiseBookings = async (req, res) => {
    try {
        const franchiseId = req.franchise.id;

        // Filter directly by booking.franchise field (stamped at creation)
        // This ensures only bookings made AFTER the vehicle was assigned to this
        // franchise are returned — not historical admin bookings for the same vehicle.
        const bookings = await Booking.find({ franchise: franchiseId })
            .populate('user', 'name mobile email')
            .populate('vehicle', 'vehicle_name registration_number')
            .populate('plan', 'plan_name')
            .sort('-createdAt');

        const now = new Date();
        const result = bookings.map(b => {
            const obj = b.toObject({ virtuals: true });
            if (obj.payment_installments && obj.payment_installments.length > 0) {
                obj.payment_installments.forEach(inst => {
                    if (inst.status === 'pending' && new Date(inst.due_date) < now) inst.status = 'overdue';
                });
                const pending = obj.payment_installments
                    .filter(i => i.status !== 'paid')
                    .sort((a, b) => new Date(a.due_date) - new Date(b.due_date));
                obj.next_installment = pending.length > 0 ? pending[0] : null;
            } else {
                obj.next_installment = null;
            }
            return obj;
        });

        res.status(200).json({ success: true, count: result.length, data: result });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};


// @desc    Get single booking details
// @route   GET /api/bookings/:id
// @access  Private
exports.getBookingById = async (req, res) => {
    try {
        const booking = await Booking.findById(req.params.id)
            .populate('user', 'name mobile email')
            .populate('vehicle')
            .populate('plan');

        if (!booking) {
            return res.status(404).json({ success: false, message: 'Booking not found' });
        }

        // Only user who booked or admin can see details
        if (booking.user._id.toString() !== req.user.id && req.user.role !== 'admin') {
            return res.status(401).json({ success: false, message: 'Not authorized' });
        }

        const now = new Date();
        const due_amount = Math.max(0, booking.grand_total - booking.total_paid);

        // Mark overdue installments on the fly
        let next_installment = null;
        let overdue_installments = [];

        if (booking.payment_installments && booking.payment_installments.length > 0) {
            booking.payment_installments.forEach(inst => {
                if (inst.status === 'pending' && new Date(inst.due_date) < now) {
                    inst.status = 'overdue';
                }
            });

            // Next upcoming pending/overdue installment (earliest due_date)
            const pending = booking.payment_installments
                .filter(i => i.status !== 'paid')
                .sort((a, b) => new Date(a.due_date) - new Date(b.due_date));

            if (pending.length > 0) {
                next_installment = {
                    installment_no: pending[0].installment_no,
                    amount: pending[0].amount,
                    due_date: pending[0].due_date,
                    status: pending[0].status,
                    _id: pending[0]._id
                };
            }

            overdue_installments = booking.payment_installments
                .filter(i => i.status === 'overdue')
                .map(i => ({ installment_no: i.installment_no, amount: i.amount, due_date: i.due_date, _id: i._id }));

            await booking.save();
        }

        const paid_installments_count = (booking.payment_installments || []).filter(i => i.status === 'paid').length;
        const total_installments_count = (booking.payment_installments || []).length;

        res.status(200).json({
            success: true,
            data: booking,
            payment_summary: {
                grand_total: booking.grand_total,
                total_paid: booking.total_paid,
                due_amount,
                payment_status: booking.payment_status,
                payment_progress_percent: booking.grand_total > 0
                    ? Math.round((booking.total_paid / booking.grand_total) * 100)
                    : 0,
                total_installments: total_installments_count,
                paid_installments: paid_installments_count,
                pending_installments: total_installments_count - paid_installments_count,
                next_installment,
                overdue_installments
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Update booking status (Admin/Franchise)
// @route   PATCH /api/bookings/:id/status
// @access  Private
exports.updateBookingStatus = async (req, res) => {
    try {
        const { booking_status, payment_status, transaction_id } = req.body;
        
        const booking = await Booking.findById(req.params.id).populate('vehicle');

        if (!booking) {
            return res.status(404).json({ success: false, message: 'Booking not found' });
        }

        // Authorization check
        const isAdmin = req.user && req.user.role === 'admin';
        const isFranchiseOwner = req.franchise && booking.vehicle.franchise && booking.vehicle.franchise.toString() === req.franchise.id;

        if (!isAdmin && !isFranchiseOwner) {
            return res.status(403).json({ success: false, message: 'Not authorized to update this booking' });
        }

        if (booking_status && booking.booking_status !== booking_status) {
            booking.booking_status = booking_status;
            
            // Send push notification to the customer
            const customer = await User.findById(booking.user);
            if (customer && customer.fcm_token) {
                const { sendPushNotification } = require('../utils/fcmHelper');
                
                let pushTitle = 'Booking Update';
                let pushMessage = `Your booking status has been updated to: ${booking_status}`;
                
                if (booking_status === 'confirmed') {
                    pushTitle = '🎉 Booking Confirmed!';
                    pushMessage = 'Your vehicle booking has been confirmed by the admin.';
                } else if (booking_status === 'ongoing') {
                    pushTitle = '🚗 Ride Started';
                    pushMessage = 'Your ride is now active. Drive safe!';
                } else if (booking_status === 'completed') {
                    pushTitle = '🏁 Ride Completed';
                    pushMessage = 'Your ride has been marked as completed. Thank you for riding with us!';
                } else if (booking_status === 'cancelled') {
                    pushTitle = '❌ Booking Cancelled';
                    pushMessage = 'Your booking was cancelled.';
                }

                await sendPushNotification(customer.fcm_token, pushTitle, pushMessage, {
                    type: 'booking_status',
                    booking_id: booking._id.toString(),
                    status: booking_status
                }).catch(err => console.log('FCM Error in booking:', err));
            }
        }

        let amountToCredit = 0;
        if (payment_status) {
            booking.payment_status = payment_status;
            // If marked as paid, assume the pending grand_total is paid
            if (payment_status === 'paid' && (booking.total_paid || 0) < booking.grand_total) {
                amountToCredit = booking.grand_total - (booking.total_paid || 0);
                booking.total_paid = booking.grand_total;
            }
        }
        if (transaction_id) booking.transaction_id = transaction_id;

        await booking.save();
        
        if (amountToCredit > 0) {
            const { creditFranchiseWallet } = require('../utils/franchiseWalletHelper');
            await creditFranchiseWallet(booking._id, amountToCredit);
        }

        res.status(200).json({ success: true, message: 'Booking status updated', data: booking });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

// --- DUE PAYMENT TRACKING ---

// @desc    Get logged in user due payments
// @route   GET /api/bookings/dues/my
// @access  Private
exports.getMyDues = async (req, res) => {
    try {
        // Find bookings where grand_total > total_paid
        const dues = await Booking.find({
            user: req.user.id,
            $expr: { $gt: ["$grand_total", "$total_paid"] }
        }).populate('vehicle', 'vehicle_name registration_number');

        let totalDueAmount = 0;
        const dueList = dues.map(b => {
            const due = b.grand_total - b.total_paid;
            totalDueAmount += due;
            return {
                booking_id: b.booking_id,
                vehicle: b.vehicle,
                grand_total: b.grand_total,
                total_paid: b.total_paid,
                due_amount: due,
                late_fee: b.late_fee,
                status: b.booking_status
            };
        });

        res.status(200).json({
            success: true,
            count: dueList.length,
            total_due_summary: totalDueAmount,
            data: dueList
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Get all due payments (Admin)
// @route   GET /api/bookings/admin/dues
// @access  Private/Admin
exports.getAdminDues = async (req, res) => {
    try {
        const { mobile } = req.query;
        let query = { $expr: { $gt: ["$grand_total", "$total_paid"] } };

        if (mobile) {
            const User = require('../models/userModel');
            const user = await User.findOne({ mobile });
            if (!user) return res.status(404).json({ success: false, message: 'User not found' });
            query.user = user._id;
        }

        const dues = await Booking.find(query)
            .populate('user', 'name mobile')
            .populate('vehicle', 'vehicle_name registration_number');

        const dueList = dues.map(b => ({
            booking_id: b.booking_id,
            user: b.user,
            vehicle: b.vehicle,
            grand_total: b.grand_total,
            total_paid: b.total_paid,
            due_amount: b.grand_total - b.total_paid,
            late_fee: b.late_fee,
            status: b.booking_status
        }));

        res.status(200).json({
            success: true,
            count: dueList.length,
            data: dueList
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Calculate Late Fee for a booking
// @route   GET /api/bookings/:id/calculate-late-fee
// @access  Private
exports.calculateLateFee = async (req, res) => {
    try {
        const booking = await Booking.findById(req.params.id).populate('plan');
        if (!booking) {
            return res.status(404).json({ success: false, message: 'Booking not found' });
        }

        const scheduledReturn = new Date(booking.end_date);
        const actualReturn = new Date(); // Current time

        const GlobalSetting = require('../models/globalSettingModel');
        const globalLateFeeSetting = await GlobalSetting.findOne({ key: 'late_fee_per_day' });
        const globalLateFee = globalLateFeeSetting ? Number(globalLateFeeSetting.value) : 200;

        let lateFee = 0;
        let diffInMins = 0;

        if (actualReturn > scheduledReturn) {
            const diffInMs = actualReturn - scheduledReturn;
            diffInMins = Math.floor(diffInMs / (1000 * 60));
            
            // Subtract grace period
            const effectiveLateMins = diffInMins - (booking.plan.grace_period || 30);
            
            if (effectiveLateMins > 0) {
                const daysLate = Math.ceil(effectiveLateMins / (60 * 24));
                lateFee = daysLate * globalLateFee;
            }
        }

        res.status(200).json({
            success: true,
            data: {
                minutes_late: diffInMins,
                days_late_after_grace: Math.ceil((diffInMins - (booking.plan.grace_period || 30)) > 0 ? (diffInMins - (booking.plan.grace_period || 30)) / (60 * 24) : 0),
                late_fee: lateFee,
                scheduled_return: scheduledReturn,
                actual_return_current: actualReturn,
                grace_period_mins: booking.plan.grace_period || 30
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Return vehicle and complete booking
// @route   POST /api/bookings/:id/return
// @access  Private
exports.returnVehicle = async (req, res) => {
    try {
        const booking = await Booking.findById(req.params.id).populate('plan');
        if (!booking) {
            return res.status(404).json({ success: false, message: 'Booking not found' });
        }

        if (booking.booking_status === 'completed') {
            return res.status(400).json({ success: false, message: 'Booking is already completed' });
        }

        const scheduledReturn = new Date(booking.end_date);
        const actualReturn = new Date(); // Current time

        const GlobalSetting = require('../models/globalSettingModel');
        const globalLateFeeSetting = await GlobalSetting.findOne({ key: 'late_fee_per_day' });
        const globalLateFee = globalLateFeeSetting ? Number(globalLateFeeSetting.value) : 200;

        let lateFee = 0;
        if (actualReturn > scheduledReturn) {
            const diffInMins = Math.floor((actualReturn - scheduledReturn) / (1000 * 60));
            const effectiveLateMins = diffInMins - (booking.plan.grace_period || 30);
            if (effectiveLateMins > 0) {
                const daysLate = Math.ceil(effectiveLateMins / (60 * 24));
                lateFee = daysLate * globalLateFee;
            }
        }

        booking.actual_return_date = actualReturn;
        booking.late_fee = lateFee;
        booking.grand_total += lateFee; // Add late fee to total
        booking.booking_status = 'completed';
        
        await booking.save();

        res.status(200).json({
            success: true,
            message: 'Vehicle returned and booking completed',
            late_fee_applied: lateFee,
            data: booking
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Manually mark payment as paid
// @route   POST /api/bookings/:id/pay-manual
// @access  Private/Admin
exports.markPaymentPaid = async (req, res) => {
    try {
        const { amount, payment_method, transaction_id } = req.body;
        const booking = await Booking.findById(req.params.id);

        if (!booking) {
            return res.status(404).json({ success: false, message: 'Booking not found' });
        }

        const remainingDue = booking.grand_total - booking.total_paid;
        const payAmount = amount || remainingDue;

        if (payAmount <= 0) {
            return res.status(400).json({ success: false, message: 'No due amount to pay' });
        }

        booking.total_paid += payAmount;
        if (payment_method) booking.payment_method = payment_method;
        if (transaction_id) booking.transaction_id = transaction_id;

        // Auto-update status
        if (booking.total_paid >= booking.grand_total) {
            booking.payment_status = 'paid';
        } else if (booking.total_paid > 0) {
            booking.payment_status = 'partially_paid';
        } else {
            booking.payment_status = 'pending';
        }

        await booking.save();
        await creditFranchiseWallet(booking._id, payAmount);

        res.status(200).json({
            success: true,
            message: `Payment of INR ${payAmount} recorded successfully`,
            data: booking
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};


// @desc    Download Booking Receipt (PDF)
// @route   GET /api/bookings/:id/receipt
// @access  Private
exports.downloadReceipt = async (req, res) => {
    try {
        const booking = await Booking.findById(req.params.id)
            .populate('user')
            .populate('vehicle')
            .populate('plan');

        if (!booking) {
            return res.status(404).json({ success: false, message: 'Booking not found' });
        }

        // Create PDF Document (A4 size is default)
        const doc = new PDFDocument({ margin: 0, size: 'A4' });
        let filename = `Invoice_${booking.booking_id}.pdf`;

        res.setHeader('Content-disposition', `attachment; filename=${filename}`);
        res.setHeader('Content-type', 'application/pdf');
        doc.pipe(res);

        // Add Watermark
        try {
            const watermarkPath = 'd:/Desktop/evRental/evRental/evbusiness/assets/app_icon.png';
            if (fs.existsSync(watermarkPath)) {
                doc.save();
                doc.opacity(0.1);
                const imgWidth = 350;
                doc.image(watermarkPath, (doc.page.width - imgWidth) / 2, (doc.page.height - imgWidth) / 2, { width: imgWidth });
                doc.opacity(1);
                doc.restore();
            }
        } catch (error) {
            // Ignore if watermark fails to load
        }

        // --- PDF CONTENT DESIGN (Simple & Clean) ---

        const pageWidth = doc.page.width;
        const pageHeight = doc.page.height;

        // 1. Simple Header Line
        doc.moveTo(50, 40).lineTo(pageWidth - 50, 40).strokeColor('#333333').lineWidth(2).stroke();

        // 2. INVOICE Title & TRIS Electric Branding
        doc.fontSize(28).font('Helvetica-Bold').fillColor('#333333').text('INVOICE', 50, 60);
        doc.fontSize(10).font('Helvetica').fillColor('#666666').text('TRIS Electric - EV Rentals', 50, 95);

        // 3. Billed To
        doc.fontSize(10).font('Helvetica-Bold').fillColor('#333333').text('Billed To:', 380, 60);
        doc.fontSize(12).text(booking.user?.name || 'Customer', 380, 75);
        doc.fontSize(10).font('Helvetica').fillColor('#666666');
        doc.text(booking.user?.mobile || '', 380, 90);
        doc.text(booking.user?.email || '', 380, 105);

        // 4. Invoice Meta Info
        doc.moveTo(50, 140).lineTo(pageWidth - 50, 140).strokeColor('#EEEEEE').lineWidth(1).stroke();
        
        doc.fontSize(10).font('Helvetica-Bold').fillColor('#333333');
        doc.text('INVOICE NO:', 50, 160);
        doc.font('Helvetica').fillColor('#666666').text(booking.booking_id, 120, 160);

        doc.font('Helvetica-Bold').fillColor('#333333').text('DATE:', 220, 160);
        doc.font('Helvetica').fillColor('#666666').text(new Date().toLocaleDateString(), 260, 160);

        doc.font('Helvetica-Bold').fillColor('#333333').text('DUE DATE:', 380, 160);
        doc.font('Helvetica').fillColor('#666666').text(new Date(booking.end_date).toLocaleDateString(), 440, 160);

        // 5. Service Table Header
        const tableTop = 200;
        doc.rect(50, tableTop, pageWidth - 100, 35).fill('#333333');
        
        doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(11);
        doc.text('SERVICE', 70, tableTop + 12);
        doc.text('QTY', 320, tableTop + 12);
        doc.text('PRICE', 400, tableTop + 12);
        doc.text('TOTAL', 480, tableTop + 12, { width: 60, align: 'right' });

        // 6. Service Line Items
        let currentY = tableTop + 55;
        doc.font('Helvetica').fillColor('#666666').fontSize(11);

        const drawRow = (service, qty, price, total) => {
            doc.text(service, 70, currentY);
            doc.text(qty.toString(), 320, currentY);
            doc.text(`INR ${price.toFixed(2)}`, 400, currentY); 
            doc.text(`INR ${total.toFixed(2)}`, 480, currentY, { width: 60, align: 'right' });
            
            // Draw a light bottom line
            doc.moveTo(50, currentY + 20).lineTo(pageWidth - 50, currentY + 20).strokeColor('#EEEEEE').lineWidth(1).stroke();
            currentY += 40;
        };

        // Base Plan
        const planName = booking.plan ? booking.plan.plan_name : 'Rental Plan';
        const baseAmount = booking.total_amount || 0;
        drawRow(`EV Rental - ${planName}`, 1, baseAmount, baseAmount);

        const gstAmount = booking.gst_amount || 0;
        if (gstAmount > 0) {
            drawRow('GST (5%)', 1, gstAmount, gstAmount);
        }

        if (booking.security_deposit > 0) {
            drawRow('Security Deposit', 1, booking.security_deposit, booking.security_deposit);
        }
        
        if (booking.late_fee > 0) {
            drawRow('Late Fee', 1, booking.late_fee, booking.late_fee);
        }

        if (booking.discount_amount > 0) {
            doc.text('Discount Applied', 70, currentY);
            doc.text('1', 320, currentY);
            doc.text(`-INR ${booking.discount_amount.toFixed(2)}`, 400, currentY);
            doc.text(`-INR ${booking.discount_amount.toFixed(2)}`, 480, currentY, { width: 60, align: 'right' });
            doc.moveTo(50, currentY + 20).lineTo(pageWidth - 50, currentY + 20).strokeColor('#EEEEEE').lineWidth(1).stroke();
            currentY += 40;
        }

        // 7. Total Section
        currentY += 20;
        doc.font('Helvetica-Bold').fillColor('#333333').fontSize(14);
        doc.text('TOTAL', 400, currentY);
        doc.text(`INR ${booking.grand_total.toFixed(2)}`, 480, currentY, { width: 60, align: 'right' });

        // 8. Footer (Notes & Payment Method)
        currentY += 60;
        doc.fontSize(11);
        doc.font('Helvetica-Bold').text('Payment method: ', 50, currentY, { continued: true })
           .font('Helvetica').fillColor('#666666').text(booking.payment_method || 'Online / Wallet');
        
        currentY += 20;
        doc.font('Helvetica-Bold').fillColor('#333333').text('Note: ', 50, currentY, { continued: true })
           .font('Helvetica').fillColor('#666666').text('Thank you for choosing TRIS Electric!');

        // Finalize PDF
        doc.end();

    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Cancel Booking
// @route   POST /api/bookings/:id/cancel
// @access  Private
exports.cancelBooking = async (req, res) => {
    try {
        const { reason } = req.body;
        const booking = await Booking.findById(req.params.id);

        if (!booking) {
            return res.status(404).json({ success: false, message: 'Booking not found' });
        }

        // Only allow cancellation if not completed or ongoing
        if (!['pending', 'confirmed'].includes(booking.booking_status)) {
            return res.status(400).json({ success: false, message: 'Cannot cancel an ongoing or completed booking' });
        }

        // Authorization
        if (booking.user.toString() !== req.user.id && (req.user && req.user.role !== 'admin')) {
            return res.status(401).json({ success: false, message: 'Not authorized' });
        }

        booking.booking_status = 'cancelled';
        booking.cancellation_reason = reason || "User cancelled";
        
        await booking.save();

        res.status(200).json({ success: true, message: 'Booking cancelled successfully', data: booking });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Extend Booking
// @route   POST /api/bookings/:id/extend
// @access  Private
exports.extendBooking = async (req, res) => {
    try {
        const { extra_days } = req.body; // Number of days to extend
        if (!extra_days || extra_days <= 0) {
            return res.status(400).json({ success: false, message: 'Please provide valid extra_days' });
        }

        const booking = await Booking.findById(req.params.id).populate('plan');
        if (!booking) {
            return res.status(404).json({ success: false, message: 'Booking not found' });
        }

        if (booking.booking_status === 'completed' || booking.booking_status === 'cancelled') {
            return res.status(400).json({ success: false, message: 'Cannot extend a completed or cancelled booking' });
        }

        // Calculate new end date
        const currentEnd = new Date(booking.end_date);
        currentEnd.setDate(currentEnd.getDate() + parseInt(extra_days));
        
        // Calculate extra cost
        const extraCost = (booking.plan.price) * extra_days; 

        booking.end_date = currentEnd;
        booking.total_amount += extraCost;
        booking.grand_total += extraCost;
        
        await booking.save();

        res.status(200).json({ 
            success: true, 
            message: `Booking extended by ${extra_days} days. New total amount applied.`, 
            data: booking 
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Approve Booking (Admin/Franchise)
// @route   PATCH /api/bookings/:id/approve
// @access  Private
exports.approveBooking = async (req, res) => {
    try {
        const booking = await Booking.findById(req.params.id)
            .populate('user')
            .populate('vehicle');

        if (!booking) {
            return res.status(404).json({ success: false, message: 'Booking not found' });
        }

        if (booking.booking_status !== 'pending') {
            return res.status(400).json({ success: false, message: `Cannot approve. Current status is ${booking.booking_status}` });
        }

        // --- ROBUST KYC CHECK ---
        const KYC = require('../models/kycModel');
        const kycRecord = await KYC.findOne({ user: booking.user._id });

        // Bypass KYC check if user is an ADMIN (useful for owner testing)
        const isVerified = booking.user.isKycVerified || 
                          (kycRecord && kycRecord.status === 'approved') ||
                          (booking.user.role === 'admin');

        if (!isVerified) {
            return res.status(400).json({ 
                success: false, 
                message: `User KYC is not verified for account (${booking.user.mobile}). Please approve KYC documents for this specific account first.` 
            });
        }

        // --- FINAL AVAILABILITY CHECK ---
        const overlap = await Booking.findOne({
            _id: { $ne: booking._id }, // Exclude current booking
            vehicle: booking.vehicle._id,
            booking_status: { $in: ['confirmed', 'ongoing'] },
            start_date: { $lt: booking.end_date },
            end_date: { $gt: booking.start_date }
        });

        console.log('DEBUG: Approving booking', booking._id, 'for vehicle', booking.vehicle._id);
        console.log('DEBUG: Found overlap?', overlap ? overlap._id : 'null');
        if (overlap) {
            console.log('DEBUG: Overlap details:', overlap.booking_status, overlap.start_date, overlap.end_date);
        }

        if (overlap) {
            return res.status(400).json({ 
                success: false, 
                message: 'This vehicle is already assigned to another confirmed/ongoing booking for this time period.' 
            });
        }

        // Authorization
        const isAdmin = req.user && req.user.role === 'admin';
        const isFranchiseOwner = req.franchise && booking.vehicle.franchise && booking.vehicle.franchise.toString() === req.franchise.id;

        if (!isAdmin && !isFranchiseOwner) {
            return res.status(403).json({ success: false, message: 'Not authorized' });
        }

        booking.booking_status = 'confirmed';
        
        // Sync the user model flag if it was missing but KYC was approved
        if (!booking.user.isKycVerified && isVerified) {
            booking.user.isKycVerified = true;
            await booking.user.save();
        }

        await booking.save();

        res.status(200).json({ success: true, message: 'Booking approved and confirmed', data: booking });
    } catch (error) {
        console.error('Approval Error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Reject Booking (Admin/Franchise)
// @route   PATCH /api/bookings/:id/reject
// @access  Private
exports.rejectBooking = async (req, res) => {
    try {
        const { reason } = req.body;
        const booking = await Booking.findById(req.params.id).populate('vehicle');

        if (!booking) {
            return res.status(404).json({ success: false, message: 'Booking not found' });
        }

        // Authorization
        const isAdmin = req.user && req.user.role === 'admin';
        const isFranchiseOwner = req.franchise && booking.vehicle.franchise && booking.vehicle.franchise.toString() === req.franchise.id;

        if (!isAdmin && !isFranchiseOwner) {
            return res.status(403).json({ success: false, message: 'Not authorized' });
        }

        booking.booking_status = 'cancelled';
        booking.cancellation_reason = reason || "Rejected by store/admin";
        
        await booking.save();

        res.status(200).json({ success: true, message: 'Booking rejected and cancelled', data: booking });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Add damage / extra charge to a booking
// @route   POST /api/bookings/:id/damage-charge
// @access  Private/Admin or Franchise
exports.addDamageCharge = async (req, res) => {
    try {
        const { description, amount } = req.body;
        if (!description || !amount || Number(amount) <= 0) {
            return res.status(400).json({ success: false, message: 'description and a valid amount are required' });
        }

        const booking = await Booking.findById(req.params.id);
        if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });

        const added_by = req.user?.role === 'admin' ? 'admin' : 'franchise';

        booking.damage_charges.push({ description, amount: Number(amount), added_by });
        booking.grand_total += Number(amount);
        booking.additional_charges = (booking.additional_charges || 0) + Number(amount);

        // re-evaluate payment_status
        if (booking.total_paid >= booking.grand_total) {
            booking.payment_status = 'paid';
        } else if (booking.total_paid > 0) {
            booking.payment_status = 'partially_paid';
        } else {
            booking.payment_status = 'pending';
        }

        await booking.save();

        res.status(200).json({
            success: true,
            message: `Extra charge of ₹${amount} added for "${description}"`,
            grand_total: booking.grand_total,
            damage_charges: booking.damage_charges
        });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

// @desc    Set installment schedule for a booking (Admin)
// @route   POST /api/bookings/:id/installments/setup
// @access  Private/Admin
exports.setupInstallments = async (req, res) => {
    try {
        const { installments } = req.body; // [{ amount, due_date }]
        if (!installments || !Array.isArray(installments) || installments.length === 0) {
            return res.status(400).json({ success: false, message: 'Provide installments array with amount and due_date' });
        }

        const booking = await Booking.findById(req.params.id);
        if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });

        const totalInstallmentAmount = installments.reduce((sum, i) => sum + Number(i.amount), 0);
        
        // Dynamically update grand_total if the new installments exceed the current due amount.
        // This allows fully dynamic 2-3 months extensions via weekly installments.
        const requiredGrandTotal = booking.total_paid + totalInstallmentAmount;
        if (requiredGrandTotal > booking.grand_total) {
            booking.grand_total = requiredGrandTotal;
        }

        booking.payment_installments = installments.map((inst, idx) => ({
            installment_no: idx + 1,
            amount: Number(inst.amount),
            due_date: new Date(inst.due_date),
            status: 'pending'
        }));

        await booking.save();
        res.status(200).json({ success: true, message: 'Installment schedule saved', data: booking.payment_installments });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

// @desc    Pay a specific installment (Admin)
// @route   POST /api/bookings/:id/installments/:instId/pay
// @access  Private/Admin
exports.payInstallment = async (req, res) => {
    try {
        const { transaction_id, payment_method } = req.body;
        const booking = await Booking.findById(req.params.id);
        if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });

        const inst = booking.payment_installments.id(req.params.instId);
        if (!inst) return res.status(404).json({ success: false, message: 'Installment not found' });
        if (inst.status === 'paid') return res.status(400).json({ success: false, message: 'Installment already paid' });

        inst.status = 'paid';
        inst.paid_date = new Date();
        if (transaction_id) inst.transaction_id = transaction_id;
        if (payment_method) booking.payment_method = payment_method;

        booking.total_paid += inst.amount;

        if (booking.total_paid >= booking.grand_total) {
            booking.payment_status = 'paid';
        } else if (booking.total_paid > 0) {
            booking.payment_status = 'partially_paid';
        }

        const now = new Date();
        booking.payment_installments.forEach(i => {
            if (i.status === 'pending' && new Date(i.due_date) < now) i.status = 'overdue';
        });

        await booking.save();
        await creditFranchiseWallet(booking._id, inst.amount);

        res.status(200).json({
            success: true,
            message: `Installment #${inst.installment_no} of ₹${inst.amount} marked as paid`,
            data: booking.payment_installments
        });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

// @desc    Pay full or partial booking amount via Wallet (Customer)
// @route   POST /api/bookings/:id/pay-with-wallet
// @access  Private/User
exports.payBookingWithWallet = async (req, res) => {
    try {
        const { amount } = req.body;
        const bookingId = req.params.id;
        const userId = req.user.id;

        if (!amount || Number(amount) <= 0) {
            return res.status(400).json({ success: false, message: 'Please provide a valid positive amount' });
        }

        const booking = await Booking.findById(bookingId);
        if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });
        
        if (booking.user.toString() !== userId) {
            return res.status(403).json({ success: false, message: 'Not authorized to pay for this booking' });
        }

        const user = await User.findById(userId);
        if (user.wallet_balance < Number(amount)) {
            return res.status(400).json({ success: false, message: 'Insufficient wallet balance' });
        }

        // Deduct from wallet
        user.wallet_balance -= Number(amount);
        await user.save();

        // Record wallet transaction
        await WalletTransaction.create({
            user: userId,
            amount: Number(amount),
            type: 'debit',
            description: `Payment for Booking #${booking.booking_id}`,
            performed_by: 'user'
        });

        // Update booking
        booking.total_paid += Number(amount);
        booking.payment_method = 'wallet';

        if (booking.total_paid >= booking.grand_total) {
            booking.payment_status = 'paid';
        } else if (booking.total_paid > 0) {
            booking.payment_status = 'partially_paid';
        }

        await booking.save();
        await creditFranchiseWallet(booking._id, Number(amount));

        res.status(200).json({
            success: true,
            message: `Payment of ₹${amount} made successfully via Wallet`,
            data: booking
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Pay a specific installment via Wallet (Customer)
// @route   POST /api/bookings/:id/installments/:instId/pay-with-wallet
// @access  Private/User
exports.payInstallmentWithWallet = async (req, res) => {
    try {
        const bookingId = req.params.id;
        const instId = req.params.instId;
        const userId = req.user.id;

        const booking = await Booking.findById(bookingId);
        if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });

        if (booking.user.toString() !== userId) {
            return res.status(403).json({ success: false, message: 'Not authorized' });
        }

        const inst = booking.payment_installments.id(instId);
        if (!inst) return res.status(404).json({ success: false, message: 'Installment not found' });
        
        if (inst.status === 'paid') {
            return res.status(400).json({ success: false, message: 'Installment already paid' });
        }

        const amountToPay = inst.amount;
        const user = await User.findById(userId);

        if (user.wallet_balance < amountToPay) {
            return res.status(400).json({ success: false, message: 'Insufficient wallet balance to pay this installment' });
        }

        // Deduct from wallet
        user.wallet_balance -= amountToPay;
        await user.save();

        // Log transaction
        await WalletTransaction.create({
            user: userId,
            amount: amountToPay,
            type: 'debit',
            description: `Installment #${inst.installment_no} payment for Booking #${booking.booking_id}`,
            performed_by: 'user'
        });

        // Mark Installment Paid
        inst.status = 'paid';
        inst.paid_date = new Date();
        inst.payment_method = 'wallet';
        
        booking.total_paid += amountToPay;
        booking.payment_method = 'wallet';

        if (booking.total_paid >= booking.grand_total) {
            booking.payment_status = 'paid';
        } else if (booking.total_paid > 0) {
            booking.payment_status = 'partially_paid';
        }

        // Recalculate overdue statuses
        const now = new Date();
        booking.payment_installments.forEach(i => {
            if (i.status === 'pending' && new Date(i.due_date) < now) i.status = 'overdue';
        });

        await booking.save();

        res.status(200).json({
            success: true,
            message: `Installment #${inst.installment_no} of ₹${amountToPay} paid via Wallet`,
            data: booking.payment_installments
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Change Assigned Vehicle for a Booking
// @route   PUT /api/bookings/:id/change-vehicle
// @access  Private/Admin/Franchise
exports.changeAssignedVehicle = async (req, res) => {
    try {
        const { newVehicleId } = req.body;
        const booking = await Booking.findById(req.params.id).populate('vehicle');

        if (!booking) {
            return res.status(404).json({ success: false, message: 'Booking not found' });
        }

        if (['completed', 'cancelled'].includes(booking.booking_status)) {
            return res.status(400).json({ success: false, message: 'Cannot change vehicle for completed or cancelled bookings.' });
        }

        // Verify new vehicle exists and is active
        const newVehicle = await Vehicle.findById(newVehicleId);
        if (!newVehicle || newVehicle.status !== 'active') {
            return res.status(400).json({ success: false, message: 'Selected vehicle is not available or inactive.' });
        }

        // Check overlapping for new vehicle
        const overlap = await Booking.findOne({
            _id: { $ne: booking._id },
            vehicle: newVehicleId,
            booking_status: { $in: ['confirmed', 'ongoing'] },
            start_date: { $lte: booking.end_date },
            end_date: { $gte: booking.start_date }
        });

        if (overlap) {
            return res.status(400).json({ success: false, message: 'Selected vehicle is already booked for these dates.' });
        }

        // Change the vehicle
        booking.vehicle = newVehicleId;
        await booking.save();

        res.status(200).json({
            success: true,
            message: 'Vehicle successfully changed/swapped.',
            data: booking
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Unassign Vehicle from a Booking
// @route   PUT /api/bookings/:id/unassign
// @access  Private/Admin/Franchise
exports.unassignVehicle = async (req, res) => {
    try {
        const booking = await Booking.findById(req.params.id);

        if (!booking) {
            return res.status(404).json({ success: false, message: 'Booking not found' });
        }

        if (['completed', 'cancelled'].includes(booking.booking_status)) {
            return res.status(400).json({ success: false, message: 'Cannot unassign vehicle for completed or cancelled bookings.' });
        }

        // Remove the vehicle assignment and revert status to pending if it was confirmed
        booking.vehicle = null;
        if (booking.booking_status === 'confirmed' || booking.booking_status === 'ongoing') {
            booking.booking_status = 'pending';
        }
        
        await booking.save();

        res.status(200).json({
            success: true,
            message: 'Vehicle successfully unassigned from this booking.',
            data: booking
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Request vehicle submission (Driver/User)
// @route   POST /api/bookings/:id/submit-vehicle
// @access  Private/User
exports.requestVehicleSubmission = async (req, res) => {
    try {
        const booking = await Booking.findById(req.params.id);
        if (!booking) {
            return res.status(404).json({ success: false, message: 'Booking not found' });
        }
        
        if (booking.user.toString() !== req.user.id) {
            return res.status(403).json({ success: false, message: 'Not authorized' });
        }

        // Check for dues
        let totalDues = booking.due_amount || 0;
        
        if (booking.payment_installments && booking.payment_installments.length > 0) {
            const unpaidInst = booking.payment_installments.filter(i => i.status === 'pending' || i.status === 'overdue');
            if (unpaidInst.length > 0) {
                const instSum = unpaidInst.reduce((sum, i) => sum + i.amount, 0);
                if (instSum > totalDues) {
                    totalDues = instSum; // use highest required payment
                }
            }
        }

        if (totalDues > 0 || booking.payment_status !== 'paid') {
            return res.status(400).json({ 
                success: false, 
                message: `You cannot submit the vehicle. Pending Due: ₹${totalDues}. Please clear all dues before submitting the vehicle.` 
            });
        }

        booking.return_status = 'submission_pending';
        await booking.save();

        res.status(200).json({
            success: true,
            message: 'Vehicle submission request sent successfully. Please hand over the vehicle. Your submission will be confirmed after Admin verifies the vehicle.',
            data: booking
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Approve vehicle submission (Admin/Franchisee)
// @route   POST /api/bookings/:id/approve-submission
// @access  Private/Admin
exports.approveVehicleSubmission = async (req, res) => {
    try {
        const booking = await Booking.findById(req.params.id).populate('vehicle');
        if (!booking) {
            return res.status(404).json({ success: false, message: 'Booking not found' });
        }

        if (booking.return_status !== 'submission_pending') {
            return res.status(400).json({ success: false, message: 'No pending submission request for this booking' });
        }

        booking.return_status = 'approved';
        booking.booking_status = 'completed';
        booking.actual_return_date = new Date();

        if (booking.vehicle) {
            const Vehicle = require('../models/vehicleModel');
            await Vehicle.findByIdAndUpdate(booking.vehicle._id, { status: 'available' });
        }

        await booking.save();

        res.status(200).json({
            success: true,
            message: 'Vehicle submission approved successfully.',
            data: booking
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Reject vehicle submission (Admin/Franchisee)
// @route   POST /api/bookings/:id/reject-submission
// @access  Private/Admin
exports.rejectVehicleSubmission = async (req, res) => {
    try {
        const booking = await Booking.findById(req.params.id);
        if (!booking) {
            return res.status(404).json({ success: false, message: 'Booking not found' });
        }

        if (booking.return_status !== 'submission_pending') {
            return res.status(400).json({ success: false, message: 'No pending submission request for this booking' });
        }

        booking.return_status = 'rejected';
        await booking.save();

        res.status(200).json({
            success: true,
            message: 'Vehicle submission rejected.',
            data: booking
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Initiate online payment for a specific installment
// @route   POST /api/bookings/:id/installments/:instId/initiate-online
// @access  Private/User
exports.initiateInstallmentOnline = async (req, res) => {
    try {
        const bookingId = req.params.id;
        const instId = req.params.instId;
        const userId = req.user.id;

        const booking = await Booking.findById(bookingId).populate('vehicle');
        if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });

        if (booking.user.toString() !== userId) {
            return res.status(403).json({ success: false, message: 'Not authorized' });
        }

        const inst = booking.payment_installments.id(instId);
        if (!inst) return res.status(404).json({ success: false, message: 'Installment not found' });
        
        if (inst.status === 'paid') {
            return res.status(400).json({ success: false, message: 'Installment already paid' });
        }

        // Amount includes late fee if any
        const amountToPay = inst.amount + (inst.late_fee || 0);
        const amountInPaise = Math.round(amountToPay * 100);

        let rzpKeyId = process.env.RAZORPAY_KEY_ID;
        let rzpKeySecret = process.env.RAZORPAY_KEY_SECRET;
        let paymentGatewayUsed = 'platform';
        let rzpOptionsExtras = {};

        const vehicleData = booking.vehicle;
        if (vehicleData && vehicleData.franchise) {
            const FranchiseStore = require('../models/franchiseStoreModel');
            const franchiseData = await FranchiseStore.findById(vehicleData.franchise);

            if (franchiseData) {
                const GlobalSetting = require('../models/globalSettingModel');
                const globalSettingObj = await GlobalSetting.findOne({ key: 'global_payment_mode' });
                const globalPaymentMode = globalSettingObj ? globalSettingObj.value : 'central';

                if (globalPaymentMode === 'direct' && franchiseData.razorpay_key_id && franchiseData.razorpay_key_secret) {
                    rzpKeyId = franchiseData.razorpay_key_id;
                    rzpKeySecret = franchiseData.razorpay_key_secret;
                    paymentGatewayUsed = 'direct';
                } else if (globalPaymentMode === 'central' && franchiseData.razorpay_linked_account_id) {
                    const franchiseShare = Math.round(amountInPaise * ((franchiseData.franchise_share_percentage || 80) / 100));
                    rzpOptionsExtras = {
                        transfers: [
                            {
                                account: franchiseData.razorpay_linked_account_id,
                                amount: franchiseShare,
                                currency: 'INR',
                                notes: {
                                    booking_id: booking._id.toString(),
                                    installment_id: instId.toString()
                                },
                                linked_account_notes: ["booking_id", "installment_id"]
                            }
                        ]
                    };
                }
            }
        }

        const razorpay = new Razorpay({
            key_id: rzpKeyId,
            key_secret: rzpKeySecret
        });

        const options = {
            amount: amountInPaise,
            currency: 'INR',
            receipt: instId.toString(),
            ...rzpOptionsExtras
        };

        let order;
        try {
            order = await razorpay.orders.create(options);
        } catch (rzpErr) {
            if (options.transfers) {
                console.warn("Razorpay Route failed for installment. Falling back to standard payment.");
                delete options.transfers;
                order = await razorpay.orders.create(options);
            } else {
                throw rzpErr;
            }
        }

        // Save order details to installment
        // Note: we can reuse transaction_id to temporarily store order.id before it's paid
        // or just let the frontend pass it back. Let's just store it in transaction_id for now
        inst.transaction_id = order.id;
        await booking.save();

        res.status(200).json({
            success: true,
            razorpay_order_id: order.id,
            razorpay_key: rzpKeyId,
            amount_in_paise: amountInPaise
        });
    } catch (error) {
        console.error("DEBUG INSTALLMENT INITIATE ERROR:", error);
        let errorMsg = error.message;
        if (error.error && error.error.description) {
            errorMsg = error.error.description;
        }
        res.status(500).json({ success: false, message: errorMsg });
    }
};

// @desc    Verify online payment for a specific installment
// @route   POST /api/bookings/:id/installments/:instId/verify-online
// @access  Private/User
exports.verifyInstallmentOnline = async (req, res) => {
    try {
        const { razorpay_payment_id, razorpay_order_id, razorpay_signature } = req.body;
        const bookingId = req.params.id;
        const instId = req.params.instId;

        const booking = await Booking.findById(bookingId).populate('vehicle');
        if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });

        const inst = booking.payment_installments.id(instId);
        if (!inst) return res.status(404).json({ success: false, message: 'Installment not found' });

        if (inst.status === 'paid') {
            return res.status(400).json({ success: false, message: 'Installment already paid' });
        }

        let rzpKeySecret = process.env.RAZORPAY_KEY_SECRET;

        // Figure out if direct payment gateway was used
        if (booking.vehicle && booking.vehicle.franchise) {
            const FranchiseStore = require('../models/franchiseStoreModel');
            const franchiseData = await FranchiseStore.findById(booking.vehicle.franchise);
            if (franchiseData && franchiseData.razorpay_key_secret) {
                const GlobalSetting = require('../models/globalSettingModel');
                const globalSettingObj = await GlobalSetting.findOne({ key: 'global_payment_mode' });
                if (globalSettingObj && globalSettingObj.value === 'direct') {
                    rzpKeySecret = franchiseData.razorpay_key_secret;
                }
            }
        }

        const crypto = require('crypto');
        const body = razorpay_order_id + "|" + razorpay_payment_id;
        const expectedSignature = crypto.createHmac('sha256', rzpKeySecret).update(body.toString()).digest('hex');

        if (expectedSignature !== razorpay_signature) {
            return res.status(400).json({ success: false, message: 'Invalid payment signature' });
        }

        // Amount includes late fee if any
        const amountPaid = inst.amount + (inst.late_fee || 0);

        // Mark as paid
        inst.status = 'paid';
        inst.paid_date = new Date();
        inst.payment_method = 'online';
        inst.transaction_id = razorpay_payment_id;

        booking.total_paid += amountPaid;
        
        if (booking.total_paid >= booking.grand_total) {
            booking.payment_status = 'paid';
        } else if (booking.total_paid > 0) {
            booking.payment_status = 'partially_paid';
        }

        // Recalculate overdue statuses
        const now = new Date();
        booking.payment_installments.forEach(i => {
            if (i.status === 'pending' && new Date(i.due_date) < now) i.status = 'overdue';
        });

        await booking.save();

        const { creditFranchiseWallet } = require('../utils/franchiseWalletHelper');
        await creditFranchiseWallet(booking._id, amountPaid);

        res.status(200).json({
            success: true,
            message: `Payment successful for Installment #${inst.installment_no}`,
            data: booking.payment_installments
        });

    } catch (error) {
        console.error("DEBUG INSTALLMENT VERIFY ERROR:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};
