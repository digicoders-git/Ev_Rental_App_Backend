const Booking = require('../models/bookingModel');
const { creditFranchiseWallet } = require('../utils/franchiseWalletHelper');
const Vehicle = require('../models/vehicleModel');
const RentalPlan = require('../models/planModel');
const User = require('../models/userModel');
const WalletTransaction = require('../models/walletTransactionModel');
const Invoice = require('../models/invoiceModel');
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

        // 1b. Check if this user already has an active booking
        if (bookingUserId) {
            const activeBooking = await Booking.findOne({
                user: bookingUserId,
                booking_status: { $in: ['pending', 'confirmed', 'ongoing'] }
            }).select('booking_id booking_status vehicle').populate('vehicle', 'vehicle_name registration_number');

            if (activeBooking) {
                return res.status(400).json({
                    success: false,
                    message: `You already have an active vehicle booking (${activeBooking.booking_id}). Please return or complete your current booking before booking another vehicle.`,
                    active_booking_id: activeBooking.booking_id,
                    active_booking_status: activeBooking.booking_status
                });
            }
        }

        // 1c. Check for Overlapping Bookings
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

        // 3. FULLY DYNAMIC CALCULATION based on plan pricing_type and duration
        const tmpStart = new Date(start_date);
        const tmpEnd = new Date(end_date);
        const durationMs = tmpEnd - tmpStart;
        
        let calculatedTotal = planData.price;
        if (planData.pricing_type === 'minute') {
            let minutes = Math.ceil(durationMs / (60 * 1000));
            calculatedTotal = planData.price * (minutes > 0 ? minutes : 1);
        } else if (planData.pricing_type === 'hourly') {
            let hours = Math.ceil(durationMs / (60 * 60 * 1000));
            calculatedTotal = planData.price * (hours > 0 ? hours : 1);
        } else if (planData.pricing_type === 'daily') {
            let days = Math.ceil(durationMs / (24 * 60 * 60 * 1000));
            calculatedTotal = planData.price * (days > 0 ? days : 1);
        } else if (planData.pricing_type === 'weekly') {
            let weeks = Math.ceil(durationMs / (7 * 24 * 60 * 60 * 1000));
            calculatedTotal = planData.price * (weeks > 0 ? weeks : 1);
        } else if (planData.pricing_type === 'monthly') {
            let months = Math.ceil(durationMs / (30 * 24 * 60 * 60 * 1000));
            calculatedTotal = planData.price * (months > 0 ? months : 1);
        }

        // If frontend didn't pass total_amount, or passed the base unit price by mistake, use the fully calculated dynamic total
        let plan_price_inclusive = req.body.total_amount !== undefined ? req.body.total_amount : calculatedTotal;
        if (plan_price_inclusive == planData.price && calculatedTotal > planData.price) {
            plan_price_inclusive = calculatedTotal;
        }
        const security_deposit = req.body.security_deposit !== undefined ? Number(req.body.security_deposit) : 0;
        const discount_amount = req.body.discount_amount || 0;
        
        // Rent includes 5% GST
        const base_rent = Number((plan_price_inclusive / 1.05).toFixed(2));
        const calculated_gst = Number((plan_price_inclusive - base_rent).toFixed(2));
        
        const total_amount = base_rent;
        const gst_amount = req.body.gst_amount !== undefined ? req.body.gst_amount : calculated_gst;
        
        // grand_total = what Flutter sent as total_amount + security_deposit (only if explicitly passed) - discount
        const grand_total = Math.round(plan_price_inclusive + security_deposit - discount_amount);

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
            
            let unitMs = 7 * 24 * 60 * 60 * 1000;
            if (planData.pricing_type === 'minute') unitMs = 60 * 1000;
            else if (planData.pricing_type === 'hourly') unitMs = 60 * 60 * 1000;
            else if (planData.pricing_type === 'daily') unitMs = 24 * 60 * 60 * 1000;
            else if (planData.pricing_type === 'monthly') unitMs = 30 * 24 * 60 * 60 * 1000;

            // Calculate units (minimum 1 unit)
            let units = Math.ceil((end - start) / unitMs);
            if (units < 1) units = 1;
            
            // Allow frontend to override units with installmentsCount if provided
            const requestedCount = req.body.installmentsCount ? parseInt(req.body.installmentsCount) : units;
            const finalCount = requestedCount > 0 ? requestedCount : 1;

            const baseAmount = Math.floor(grand_total / finalCount);
            const remainder = grand_total - (baseAmount * finalCount);

            for (let i = 0; i < finalCount; i++) {
                const dueDate = new Date(start.getTime() + (i * unitMs));
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
            payment_installments,
            auto_renew: true // Defaulted to true so auto-renew works automatically
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
        // booking_status stays 'pending' — Franchisee must approve before it becomes 'confirmed'
        booking.transaction_id = razorpay_payment_id;
        booking.razorpay_payment_id = razorpay_payment_id;
        booking.total_paid = booking.grand_total;
        await booking.save();

        res.status(200).json({
            success: true,
            message: 'Payment verified successfully. Booking is pending franchise approval.',
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
            .populate({
                path: 'user',
                select: 'name mobile referred_by',
                populate: { path: 'referred_by', select: 'driver_id' }
            })
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
            .populate({
                path: 'user',
                select: 'name mobile email city isKycVerified profile_picture referred_by notes status credit_score',
                populate: { path: 'referred_by', select: 'driver_id' }
            })
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
            .populate('vehicle', 'vehicle_name registration_number thumbnail_image brand')
            .populate('franchise', 'store_name address city')
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

        const doc = new PDFDocument({ margin: 0, size: 'A4' });
        res.setHeader('Content-disposition', 'attachment; filename=Invoice_' + booking.booking_id + '.pdf');
        res.setHeader('Content-type', 'application/pdf');
        doc.pipe(res);

        try {
            const watermarkPath = 'd:/Desktop/evRental/evRental/evbusiness/assets/app_icon.png';
            if (fs.existsSync(watermarkPath)) {
                doc.save();
                doc.opacity(0.1);
                doc.image(watermarkPath, (doc.page.width - 350) / 2, (doc.page.height - 350) / 2, { width: 350 });
                doc.opacity(1);
                doc.restore();
            }
        } catch (_) {}

        const pageWidth = doc.page.width;
        const pageHeight = doc.page.height;
        const isInstallment = booking.payment_method === 'installments';
        const allInstallments = isInstallment ? (booking.payment_installments || []) : [];
        const paidInstallments = allInstallments.filter(i => i.status === 'paid');
        const pendingInstallments = allInstallments.filter(i => i.status !== 'paid');

        // Header
        doc.moveTo(50, 40).lineTo(pageWidth - 50, 40).strokeColor('#333333').lineWidth(2).stroke();
        doc.fontSize(28).font('Helvetica-Bold').fillColor('#333333').text('INVOICE', 50, 60);
        doc.fontSize(10).font('Helvetica').fillColor('#666666').text('TRIS Electric - EV Rentals', 50, 95);

        // Billed To
        doc.fontSize(10).font('Helvetica-Bold').fillColor('#333333').text('Billed To:', 380, 60);
        doc.fontSize(12).text((booking.user && booking.user.name) ? booking.user.name : 'Customer', 380, 75);
        doc.fontSize(10).font('Helvetica').fillColor('#666666');
        doc.text((booking.user && booking.user.mobile) ? booking.user.mobile : '', 380, 90);
        doc.text((booking.user && booking.user.email) ? booking.user.email : '', 380, 105);

        // Meta
        doc.moveTo(50, 140).lineTo(pageWidth - 50, 140).strokeColor('#EEEEEE').lineWidth(1).stroke();
        doc.fontSize(10).font('Helvetica-Bold').fillColor('#333333');
        doc.text('BOOKING ID:', 50, 160);
        doc.font('Helvetica').fillColor('#666666').text(booking.booking_id, 130, 160);
        doc.font('Helvetica-Bold').fillColor('#333333').text('DATE:', 220, 160);
        doc.font('Helvetica').fillColor('#666666').text(new Date().toLocaleDateString(), 260, 160);
        doc.font('Helvetica-Bold').fillColor('#333333').text('TYPE:', 380, 160);
        doc.font('Helvetica').fillColor('#666666').text(isInstallment ? 'Installment Plan' : (booking.payment_method || 'Online'), 420, 160);

        // Table Header
        const tableTop = 200;
        doc.rect(50, tableTop, pageWidth - 100, 35).fill('#333333');
        doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(11);
        doc.text('DESCRIPTION', 70, tableTop + 12);
        doc.text('DUE DATE', 280, tableTop + 12);
        doc.text('PAID DATE', 380, tableTop + 12);
        doc.text('AMOUNT', 480, tableTop + 12, { width: 60, align: 'right' });

        let currentY = tableTop + 55;

        const drawRow = (desc, dueDate, paidDate, amount, isPaid) => {
            doc.font('Helvetica').fillColor(isPaid ? '#166534' : '#92400e').fontSize(10);
            doc.text(desc, 70, currentY, { width: 200 });
            doc.fillColor('#666666').text(dueDate, 280, currentY, { width: 95 });
            doc.text(paidDate, 380, currentY, { width: 95 });
            doc.fillColor(isPaid ? '#10b981' : '#f59e0b').font('Helvetica-Bold')
               .text('INR ' + Number(amount).toFixed(2), 480, currentY, { width: 60, align: 'right' });
            doc.moveTo(50, currentY + 22).lineTo(pageWidth - 50, currentY + 22).strokeColor('#EEEEEE').lineWidth(1).stroke();
            currentY += 38;
        };

        if (isInstallment) {
            allInstallments.forEach(inst => {
                const isPaid = inst.status === 'paid';
                const dueStr = inst.due_date ? new Date(inst.due_date).toLocaleDateString('en-IN') : '-';
                const paidStr = isPaid && inst.paid_date ? new Date(inst.paid_date).toLocaleDateString('en-IN') : (isPaid ? 'Paid' : 'Pending');
                drawRow('Week ' + inst.installment_no + ' - Installment', dueStr, paidStr, inst.amount, isPaid);
            });
        } else {
            const planName = booking.plan ? booking.plan.plan_name : 'Rental Plan';
            drawRow('EV Rental - ' + planName, new Date(booking.start_date).toLocaleDateString('en-IN'), new Date().toLocaleDateString('en-IN'), booking.total_amount || 0, true);
            if ((booking.gst_amount || 0) > 0) drawRow('GST (5%)', '-', '-', booking.gst_amount, true);
            if (booking.security_deposit > 0) drawRow('Security Deposit', '-', '-', booking.security_deposit, true);
            if (booking.late_fee > 0) drawRow('Late Fee', '-', '-', booking.late_fee, false);
            if ((booking.discount_amount || 0) > 0) drawRow('Discount Applied', '-', '-', -booking.discount_amount, true);
        }

        // Summary Box
        currentY += 10;
        if (isInstallment) {
            const totalPaid = paidInstallments.reduce((s, i) => s + Number(i.amount || 0), 0);
            const totalPending = pendingInstallments.reduce((s, i) => s + Number(i.amount || 0), 0);
            doc.rect(50, currentY, pageWidth - 100, 80).fill('#F8F9FA');
            doc.font('Helvetica-Bold').fillColor('#333333').fontSize(11);
            doc.text('Total Paid So Far:', 70, currentY + 12);
            doc.fillColor('#10b981').text('INR ' + totalPaid.toFixed(2), 200, currentY + 12);
            doc.fillColor('#333333').text('Remaining Due:', 70, currentY + 32);
            doc.fillColor('#ef4444').text('INR ' + totalPending.toFixed(2), 200, currentY + 32);
            doc.fillColor('#333333').text('Grand Total:', 70, currentY + 52);
            doc.fillColor('#1d4ed8').text('INR ' + booking.grand_total.toFixed(2), 200, currentY + 52);
        } else {
            doc.rect(380, currentY, 170, 40).fill('#F8F9FA');
            doc.font('Helvetica-Bold').fillColor('#333333').fontSize(14);
            doc.text('TOTAL PAID:', 395, currentY + 12);
            doc.fillColor('#10b981').text('INR ' + booking.grand_total.toFixed(2), 470, currentY + 12, { width: 70, align: 'right' });
        }

        // Footer
        const footerY = pageHeight - 80;
        doc.moveTo(50, footerY).lineTo(pageWidth - 50, footerY).strokeColor('#DDDDDD').lineWidth(1).stroke();
        doc.fontSize(9).font('Helvetica-Oblique').fillColor('#999999');
        doc.text('Thank you for choosing TRIS Electric.', 50, footerY + 15, { align: 'center' });
        doc.text('This is a computer-generated invoice and requires no physical signature.', 50, footerY + 30, { align: 'center' });

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

        // User cannot cancel if the booking is already approved (not pending)
        if (req.user && req.user.role === 'user' && booking.booking_status !== 'pending') {
            return res.status(400).json({ success: false, message: 'You cannot cancel a booking that has already been approved.' });
        }

        // Global check (Admin cannot cancel completed/ongoing)
        if (!['pending', 'confirmed'].includes(booking.booking_status)) {
            return res.status(400).json({ success: false, message: 'Cannot cancel an ongoing or completed booking' });
        }

        // Authorization
        const isUserOwner = req.user && req.user.role === 'user' && booking.user.toString() === req.user.id;
        const isAdmin = req.user && req.user.role === 'admin';
        const isFranchiseOwner = req.franchise && booking.franchise && booking.franchise.toString() === req.franchise.id;

        if (!isUserOwner && !isAdmin && !isFranchiseOwner) {
            return res.status(401).json({ success: false, message: 'Not authorized to cancel this booking' });
        }

        booking.booking_status = 'cancelled';
        booking.cancellation_reason = reason || "Cancelled by user or management";
        
        await booking.save();

        res.status(200).json({ success: true, message: 'Booking cancelled successfully', data: booking });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ─── Shared helper: derive weekly rate dynamically from booking's actual data ───
const getDynamicWeeklyRate = (booking, plan) => {
    // Step 1: Try to derive from actual booking amount (most accurate)
    // total_amount = base rent paid (excluding security deposit, discount already applied)
    // original weeks = (end_date - start_date) / 7 days
    const originalMs = new Date(booking.end_date) - new Date(booking.start_date);
    const originalWeeks = originalMs / (7 * 24 * 60 * 60 * 1000);

    // Only use booking-derived rate if original booking was at least 0.5 weeks
    // and total_amount is a valid positive number
    if (originalWeeks >= 0.5 && booking.total_amount > 0) {
        // total_amount is base rent (before GST). Add GST back to get inclusive weekly rate
        const inclusiveTotal = booking.total_amount + (booking.gst_amount || 0);
        const derivedWeeklyRate = Math.round(inclusiveTotal / originalWeeks);
        if (derivedWeeklyRate > 0) return derivedWeeklyRate;
    }

    // Step 2: Fallback — derive from plan price based on pricing_type
    switch (plan.pricing_type) {
        case 'weekly':  return Math.round(plan.price);
        case 'monthly': return Math.round(plan.price / 4);
        case 'daily':   return Math.round(plan.price * 7);
        case 'hourly':  return Math.round(plan.price * 24 * 7);
        default:        return Math.round(plan.price);
    }
};

const processExtension = async (booking, extensionUnits) => {
    const plan = booking.plan;
    let unitMs = 7 * 24 * 60 * 60 * 1000;
    let unitName = "week";
    
    if (plan.pricing_type === 'minute') {
        unitMs = 60 * 1000;
        unitName = "minute";
    } else if (plan.pricing_type === 'hourly') {
        unitMs = 60 * 60 * 1000;
        unitName = "hour";
    } else if (plan.pricing_type === 'daily') {
        unitMs = 24 * 60 * 60 * 1000;
        unitName = "day";
    } else if (plan.pricing_type === 'monthly') {
        unitMs = 30 * 24 * 60 * 60 * 1000;
        unitName = "month";
    }

    // Step 1: Derive the exact unit rate from the original booking
    const originalMs = new Date(booking.end_date) - new Date(booking.start_date);
    const originalUnits = originalMs / unitMs;

    let unitRate = 0;
    if (originalUnits >= 0.5 && booking.total_amount > 0) {
        const inclusiveTotal = booking.total_amount + (booking.gst_amount || 0);
        unitRate = Math.round(inclusiveTotal / originalUnits);
    }

    // Step 2: Fallback to base plan price if original booking is too short or weird
    if (unitRate <= 0) {
        if (plan.pricing_type === 'weekly') unitRate = Math.round(plan.price);
        else if (plan.pricing_type === 'monthly') unitRate = Math.round(plan.price);
        else if (plan.pricing_type === 'daily') unitRate = Math.round(plan.price);
        else if (plan.pricing_type === 'hourly') unitRate = Math.round(plan.price);
        else if (plan.pricing_type === 'minute') unitRate = Math.round(plan.price);
        else unitRate = Math.round(plan.price);
    }

    const totalExtraCost = unitRate * extensionUnits;
    const currentEnd = new Date(booking.end_date);

    const maxInstNo = (booking.payment_installments || []).reduce(
        (max, inst) => Math.max(max, inst.installment_no), 0
    );

    // One installment per unit — due dates are sequential
    for (let i = 0; i < extensionUnits; i++) {
        booking.payment_installments.push({
            installment_no: maxInstNo + i + 1,
            amount: unitRate,
            due_date: new Date(currentEnd.getTime() + i * unitMs),
            status: 'pending'
        });
    }

    currentEnd.setTime(currentEnd.getTime() + (extensionUnits * unitMs));
    booking.end_date = currentEnd;
    booking.total_amount += totalExtraCost;
    booking.grand_total += totalExtraCost;

    if (booking.grand_total > booking.total_paid) {
        booking.payment_status = booking.total_paid > 0 ? 'partially_paid' : 'pending';
    }

    await booking.save();

    await sendNotification({
        recipient: booking.user,
        recipient_role: 'user',
        title: '📅 Plan Extended',
        message: `Your booking #${booking.booking_id} has been extended by ${extensionUnits} ${unitName}${extensionUnits > 1 ? 's' : ''}. ${extensionUnits} new installment${extensionUnits > 1 ? 's' : ''} of ₹${unitRate} each added.`,
        type: 'booking',
        related_id: booking._id,
    });

    return { unitRate, totalExtraCost, unitName };
};

exports.processExtensionInternal = processExtension;

// @desc    Extend Booking — Weekly wise, fully dynamic installments
// @route   POST /api/bookings/:id/extend
// @access  Private (Admin / Franchise)
exports.extendBooking = async (req, res) => {
    try {
        const { extra_weeks, auto_renew } = req.body;
        const weeks = parseInt(extra_weeks);
        if (!weeks || weeks <= 0) {
            return res.status(400).json({ success: false, message: 'Please provide valid extra_weeks (minimum 1)' });
        }

        const booking = await Booking.findById(req.params.id).populate('plan');
        if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });

        if (['completed', 'cancelled'].includes(booking.booking_status)) {
            return res.status(400).json({ success: false, message: 'Cannot extend a completed or cancelled booking' });
        }

        if (auto_renew !== undefined) {
            booking.auto_renew = auto_renew === true || auto_renew === 'true';
            await booking.save(); // Save the auto_renew flag even if it's already saved by processExtension
        }

        const { unitRate, totalExtraCost, unitName } = await processExtension(booking, weeks);

        res.status(200).json({
            success: true,
            message: `Booking extended by ${weeks} ${unitName}${weeks > 1 ? 's' : ''}. ${weeks} installment${weeks > 1 ? 's' : ''} of ₹${unitRate} each added.`,
            weekly_rate: unitRate, // Kept for backwards compatibility
            unit_rate: unitRate,
            unit_name: unitName,
            weeks_added: weeks,
            units_added: weeks,
            total_extra_cost: totalExtraCost,
            new_end_date: booking.end_date,
            new_installments: booking.payment_installments.slice(-weeks),
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

        // Credit franchise wallet on approval (for online/wallet pre-paid bookings)
        if (booking.total_paid > 0) {
            await creditFranchiseWallet(booking._id, booking.total_paid);
        }

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

        // Generate Invoice for this specific installment
        const count = await Invoice.countDocuments();
        const invNumber = `INV-${new Date().getFullYear()}-${String(count + 1).padStart(5, '0')}`;
        await Invoice.create({
            invoice_number: invNumber,
            booking: booking._id,
            user: booking.user,
            franchise: booking.franchise,
            installment_id: inst._id,
            installment_no: inst.installment_no,
            amount: inst.amount,
            gst_amount: 0,
            discount_amount: 0,
            total_amount: inst.amount,
            status: 'paid'
        });

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

        const { creditFranchiseWallet } = require('../utils/franchiseWalletHelper');
        await creditFranchiseWallet(booking._id, amountToPay);

        // Generate Invoice for this specific installment
        const count = await Invoice.countDocuments();
        const invNumber = `INV-${new Date().getFullYear()}-${String(count + 1).padStart(5, '0')}`;
        await Invoice.create({
            invoice_number: invNumber,
            booking: booking._id,
            user: booking.user,
            franchise: booking.franchise,
            installment_id: inst._id,
            installment_no: inst.installment_no,
            amount: amountToPay,
            gst_amount: 0,
            discount_amount: 0,
            total_amount: amountToPay,
            status: 'paid'
        });

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
            const unpaidInst = booking.payment_installments.filter(i => i.status !== 'paid');
            if (unpaidInst.length > 0) {
                const instSum = unpaidInst.reduce((sum, i) => sum + i.amount, 0);
                if (instSum > totalDues) {
                    totalDues = instSum; // use highest required payment
                }
            }
        }

        if (booking.end_date && !booking.late_submission_paid && !(req.body && req.body.ignore_late_check)) {
            const dueDate = new Date(booking.end_date);
            const deadline = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate(), 19, 0, 0);
            const now = new Date();
            if (now > deadline) {
                return res.status(400).json({
                    success: false,
                    is_late_submission: true,
                    message: 'Vehicle submission deadline (7:00 PM on due date) has passed. An additional 1 day rental charge is applicable.'
                });
            }
        }

        if (totalDues > 0 || booking.payment_status !== 'paid') {
            return res.status(400).json({ 
                success: false, 
                message: `You cannot submit the vehicle. Pending Due: ₹${totalDues}. Please clear all dues before submitting the vehicle.` 
            });
        }

        booking.return_status = 'submission_pending';
        booking.submission_date = new Date();
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
        if (!booking.submission_date) {
            booking.submission_date = booking.actual_return_date;
        }

        if (booking.vehicle) {
            const Vehicle = require('../models/vehicleModel');
            await Vehicle.findByIdAndUpdate(booking.vehicle._id, { status: 'active' });
        }

        await booking.save();

        // ✅ Send Notifications (FCM Push + In-App DB + Socket Realtime)
        const customer = await User.findById(booking.user);
        const { sendPushNotification } = require('../utils/fcmHelper');
        const vehicleName = booking.vehicle?.vehicle_name || 'Electric Scooty';
        const vehicleReg = booking.vehicle?.registration_number || '';
        const displayVehicle = vehicleReg ? `${vehicleName} (${vehicleReg})` : vehicleName;

        if (customer && customer.fcm_token) {
            await sendPushNotification(
                customer.fcm_token,
                '🎉 Scooty Return Approved!',
                `Your return request for ${displayVehicle} has been approved. Your rental ride is now completed!`,
                {
                    type: 'return_approved',
                    booking_id: booking._id.toString(),
                    return_status: 'approved',
                    booking_status: 'completed'
                }
            ).catch(err => console.log('FCM Error on return approval:', err));
        }

        await sendNotification({
            recipient: booking.user,
            recipient_role: 'user',
            title: '🎉 Scooty Return Approved!',
            message: `Your return request for ${displayVehicle} has been approved. Your rental ride is officially completed!`,
            type: 'booking_return',
            related_id: booking._id
        });

        const io = req.app.get('io');
        if (io) {
            const userIdStr = (booking.user._id || booking.user).toString();
            io.to(userIdStr).emit('vehicle_return_approved', {
                booking_id: booking._id,
                title: '🎉 Scooty Return Approved!',
                message: `Your return request for ${displayVehicle} has been approved. Your rental ride is officially completed!`,
                return_status: 'approved',
                booking_status: 'completed'
            });
            io.emit('admin_data_changed', {});
        }

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
        const booking = await Booking.findById(req.params.id).populate('vehicle');
        if (!booking) {
            return res.status(404).json({ success: false, message: 'Booking not found' });
        }

        if (booking.return_status !== 'submission_pending') {
            return res.status(400).json({ success: false, message: 'No pending submission request for this booking' });
        }

        booking.return_status = 'rejected';
        await booking.save();

        // ✅ Send Notifications (FCM Push + In-App DB + Socket Realtime)
        const customer = await User.findById(booking.user);
        const { sendPushNotification } = require('../utils/fcmHelper');
        const vehicleName = booking.vehicle?.vehicle_name || 'Electric Scooty';
        const vehicleReg = booking.vehicle?.registration_number || '';
        const displayVehicle = vehicleReg ? `${vehicleName} (${vehicleReg})` : vehicleName;

        if (customer && customer.fcm_token) {
            await sendPushNotification(
                customer.fcm_token,
                '❌ Scooty Return Rejected',
                `Your return request for ${displayVehicle} was rejected by Admin/Franchise. Please contact the branch store or support team.`,
                {
                    type: 'return_rejected',
                    booking_id: booking._id.toString(),
                    return_status: 'rejected'
                }
            ).catch(err => console.log('FCM Error on return rejection:', err));
        }

        await sendNotification({
            recipient: booking.user,
            recipient_role: 'user',
            title: '❌ Scooty Return Rejected',
            message: `Your return request for ${displayVehicle} was rejected. Please contact your store or support team for verification.`,
            type: 'booking_return',
            related_id: booking._id
        });

        const io = req.app.get('io');
        if (io) {
            const userIdStr = (booking.user._id || booking.user).toString();
            io.to(userIdStr).emit('vehicle_return_rejected', {
                booking_id: booking._id,
                title: '❌ Scooty Return Rejected',
                message: `Your return request for ${displayVehicle} was rejected by Admin/Franchisee. Please check with support.`,
                return_status: 'rejected'
            });
            io.emit('admin_data_changed', {});
        }

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

// @desc    Pay all pending/overdue installments at once using wallet
// @route   POST /api/bookings/:id/installments/pay-all-wallet
// @access  Private/User
exports.payAllInstallmentsWithWallet = async (req, res) => {
    try {
        const bookingId = req.params.id;
        const userId = req.user.id;

        const booking = await Booking.findById(bookingId);
        if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });

        if (booking.user.toString() !== userId) {
            return res.status(403).json({ success: false, message: 'Not authorized' });
        }

        const pendingInsts = booking.payment_installments.filter(i => i.status !== 'paid');
        if (pendingInsts.length === 0) {
            return res.status(400).json({ success: false, message: 'No pending dues to clear' });
        }

        let totalAmountToPay = 0;
        pendingInsts.forEach(inst => {
            totalAmountToPay += (inst.amount || 0) + (inst.late_fee || 0);
        });

        const user = await User.findById(userId);
        if (user.wallet_balance < totalAmountToPay) {
            return res.status(400).json({ success: false, message: 'Insufficient wallet balance to clear all dues' });
        }

        // Deduct from wallet
        user.wallet_balance -= totalAmountToPay;
        await user.save();

        // Log transaction
        await WalletTransaction.create({
            user: userId,
            amount: totalAmountToPay,
            type: 'debit',
            description: `Clear All Dues (${pendingInsts.length} bills) for Booking #${booking.booking_id || booking._id}`,
            performed_by: 'user'
        });

        const now = new Date();
        pendingInsts.forEach(inst => {
            inst.status = 'paid';
            inst.paid_date = now;
            inst.payment_method = 'wallet';
        });

        booking.total_paid += totalAmountToPay;
        booking.payment_method = 'wallet';

        if (booking.total_paid >= booking.grand_total) {
            booking.payment_status = 'paid';
        } else if (booking.total_paid > 0) {
            booking.payment_status = 'partially_paid';
        }

        await booking.save();

        const { creditFranchiseWallet } = require('../utils/franchiseWalletHelper');
        await creditFranchiseWallet(booking._id, totalAmountToPay);

        // Generate Invoice for combined dues
        const count = await Invoice.countDocuments();
        const invNumber = `INV-${new Date().getFullYear()}-${String(count + 1).padStart(5, '0')}`;
        await Invoice.create({
            invoice_number: invNumber,
            booking: booking._id,
            user: booking.user,
            franchise: booking.franchise,
            amount: totalAmountToPay,
            gst_amount: 0,
            discount_amount: 0,
            total_amount: totalAmountToPay,
            status: 'paid'
        });

        res.status(200).json({
            success: true,
            message: `All pending dues (₹${totalAmountToPay}) cleared successfully via Wallet!`,
            data: booking.payment_installments
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Initiate online payment for all pending/overdue installments combined
// @route   POST /api/bookings/:id/installments/initiate-all-online
// @access  Private/User
exports.initiateAllInstallmentsOnline = async (req, res) => {
    try {
        const bookingId = req.params.id;
        const userId = req.user.id;

        const booking = await Booking.findById(bookingId).populate('vehicle');
        if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });

        if (booking.user.toString() !== userId) {
            return res.status(403).json({ success: false, message: 'Not authorized' });
        }

        const pendingInsts = booking.payment_installments.filter(i => i.status !== 'paid');
        if (pendingInsts.length === 0) {
            return res.status(400).json({ success: false, message: 'No pending dues to clear' });
        }

        let totalAmountToPay = 0;
        pendingInsts.forEach(inst => {
            totalAmountToPay += (inst.amount || 0) + (inst.late_fee || 0);
        });

        const amountInPaise = Math.round(totalAmountToPay * 100);

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
                                    action: "clear_all_dues"
                                },
                                linked_account_notes: ["booking_id", "action"]
                            }
                        ]
                    };
                }
            }
        }

        const Razorpay = require('razorpay');
        const razorpay = new Razorpay({
            key_id: rzpKeyId,
            key_secret: rzpKeySecret
        });

        const options = {
            amount: amountInPaise,
            currency: 'INR',
            receipt: `all_${booking._id.toString().substring(0, 20)}`,
            ...rzpOptionsExtras
        };

        let order;
        try {
            order = await razorpay.orders.create(options);
        } catch (rzpErr) {
            if (options.transfers) {
                console.warn("Razorpay Route failed for combined dues. Falling back to standard payment.");
                delete options.transfers;
                order = await razorpay.orders.create(options);
            } else {
                throw rzpErr;
            }
        }

        res.status(200).json({
            success: true,
            razorpay_order_id: order.id,
            razorpay_key: rzpKeyId,
            amount_in_paise: amountInPaise,
            total_amount: totalAmountToPay
        });
    } catch (error) {
        console.error("DEBUG INITIATE ALL DUES ERROR:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Verify online payment for all combined pending installments
// @route   POST /api/bookings/:id/installments/verify-all-online
// @access  Private/User
exports.verifyAllInstallmentsOnline = async (req, res) => {
    try {
        const { razorpay_payment_id, razorpay_order_id, razorpay_signature } = req.body;
        const bookingId = req.params.id;

        const booking = await Booking.findById(bookingId).populate('vehicle');
        if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });

        let rzpKeySecret = process.env.RAZORPAY_KEY_SECRET;
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

        const pendingInsts = booking.payment_installments.filter(i => i.status !== 'paid');
        let totalAmountPaid = 0;

        const now = new Date();
        pendingInsts.forEach(inst => {
            const amountPaid = inst.amount + (inst.late_fee || 0);
            totalAmountPaid += amountPaid;
            inst.status = 'paid';
            inst.paid_date = now;
            inst.payment_method = 'online';
            inst.transaction_id = razorpay_payment_id;
        });

        booking.total_paid += totalAmountPaid;
        if (booking.total_paid >= booking.grand_total) {
            booking.payment_status = 'paid';
        } else if (booking.total_paid > 0) {
            booking.payment_status = 'partially_paid';
        }

        await booking.save();

        const { creditFranchiseWallet } = require('../utils/franchiseWalletHelper');
        await creditFranchiseWallet(booking._id, totalAmountPaid);

        res.status(200).json({
            success: true,
            message: `All pending dues (₹${totalAmountPaid}) cleared successfully!`,
            data: booking.payment_installments
        });
    } catch (error) {
        console.error("DEBUG VERIFY ALL DUES ERROR:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Pay late vehicle submission fee via Wallet and submit vehicle
// @route   POST /api/bookings/:id/late-submission/pay-wallet
// @access  Private/User
exports.payLateSubmissionWithWallet = async (req, res) => {
    try {
        const booking = await Booking.findById(req.params.id);
        if (!booking) {
            return res.status(404).json({ success: false, message: 'Booking not found' });
        }
        if (booking.user.toString() !== req.user.id) {
            return res.status(403).json({ success: false, message: 'Not authorized' });
        }

        const amountToPay = Number(req.body && req.body.amount) || 0;
        if (amountToPay <= 0) {
            return res.status(400).json({ success: false, message: 'Invalid extra charge amount' });
        }

        const User = require('../models/userModel');
        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        if (user.wallet_balance < amountToPay) {
            return res.status(400).json({
                success: false,
                message: `Insufficient wallet balance (₹${user.wallet_balance}). Please pay online or recharge wallet.`
            });
        }

        user.wallet_balance -= amountToPay;
        user.wallet_history.push({
            type: 'debit',
            amount: amountToPay,
            description: `Late submission charge (1 Day) for booking ${booking.booking_id || booking._id}`,
            date: new Date()
        });
        await user.save();

        booking.additional_charges = (booking.additional_charges || 0) + amountToPay;
        booking.return_status = 'submission_pending';
        booking.submission_date = new Date();
        booking.late_submission_paid = true;
        await booking.save();

        const { creditFranchiseWallet } = require('../utils/franchiseWalletHelper');
        await creditFranchiseWallet(booking._id, amountToPay);

        res.status(200).json({
            success: true,
            message: `Paid late submission fee (₹${amountToPay}) and submitted vehicle successfully!`,
            data: booking
        });
    } catch (error) {
        console.error("DEBUG PAY LATE SUBMISSION WALLET ERROR:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Initiate Razorpay online payment for late vehicle submission fee
// @route   POST /api/bookings/:id/late-submission/initiate-online
// @access  Private/User
exports.initiateLateSubmissionOnline = async (req, res) => {
    try {
        const booking = await Booking.findById(req.params.id);
        if (!booking) {
            return res.status(404).json({ success: false, message: 'Booking not found' });
        }
        if (booking.user.toString() !== req.user.id) {
            return res.status(403).json({ success: false, message: 'Not authorized' });
        }

        const amountToPay = Number(req.body && req.body.amount) || 0;
        if (amountToPay <= 0) {
            return res.status(400).json({ success: false, message: 'Invalid extra charge amount' });
        }

        const GlobalSetting = require('../models/globalSettingModel');
        const FranchiseStore = require('../models/franchiseStoreModel');

        const modeSetting = await GlobalSetting.findOne({ key: 'razorpay_routing_mode' });
        const paymentMode = modeSetting && modeSetting.value === 'central' ? 'platform' : 'direct';

        let rzpKeyId = process.env.RAZORPAY_KEY_ID;
        let rzpKeySecret = process.env.RAZORPAY_KEY_SECRET;
        let rzpAccountId = null;

        if (booking.franchise) {
            const store = await FranchiseStore.findById(booking.franchise);
            if (store && store.razorpay) {
                if (paymentMode === 'direct' && store.razorpay.key_id && store.razorpay.key_secret) {
                    rzpKeyId = store.razorpay.key_id;
                    rzpKeySecret = store.razorpay.key_secret;
                } else if (paymentMode === 'platform' && store.razorpay.account_id) {
                    rzpAccountId = store.razorpay.account_id;
                }
            }
        }

        if (!rzpKeyId || !rzpKeySecret) {
            return res.status(500).json({ success: false, message: 'Payment gateway configuration missing' });
        }

        const Razorpay = require('razorpay');
        const rzp = new Razorpay({ key_id: rzpKeyId, key_secret: rzpKeySecret });

        const amountInPaise = Math.round(amountToPay * 100);
        const options = {
            amount: amountInPaise,
            currency: 'INR',
            receipt: `late_sub_${Date.now().toString().slice(-8)}`,
            notes: { booking_id: booking._id.toString(), type: 'late_submission' }
        };

        if (paymentMode === 'platform' && rzpAccountId) {
            options.transfers = [
                {
                    account: rzpAccountId,
                    amount: amountInPaise,
                    currency: "INR",
                    notes: { branch: booking.franchise ? booking.franchise.toString() : "Franchise" },
                    on_hold: 0
                }
            ];
        }

        const order = await rzp.orders.create(options);

        res.status(200).json({
            success: true,
            data: {
                order_id: order.id,
                amount: amountInPaise,
                currency: 'INR',
                key: rzpKeyId
            }
        });
    } catch (error) {
        console.error("DEBUG INITIATE LATE SUBMISSION ONLINE ERROR:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Verify Razorpay payment for late vehicle submission fee and submit vehicle
// @route   POST /api/bookings/:id/late-submission/verify-online
// @access  Private/User
exports.verifyLateSubmissionOnline = async (req, res) => {
    try {
        const booking = await Booking.findById(req.params.id);
        if (!booking) {
            return res.status(404).json({ success: false, message: 'Booking not found' });
        }
        if (booking.user.toString() !== req.user.id) {
            return res.status(403).json({ success: false, message: 'Not authorized' });
        }

        const { razorpay_payment_id, razorpay_order_id, razorpay_signature, amount } = req.body || {};
        const amountPaid = Number(amount) || 0;

        const GlobalSetting = require('../models/globalSettingModel');
        const FranchiseStore = require('../models/franchiseStoreModel');

        const modeSetting = await GlobalSetting.findOne({ key: 'razorpay_routing_mode' });
        const paymentMode = modeSetting && modeSetting.value === 'central' ? 'platform' : 'direct';

        let rzpKeySecret = process.env.RAZORPAY_KEY_SECRET;

        if (booking.franchise) {
            const store = await FranchiseStore.findById(booking.franchise);
            if (store && store.razorpay) {
                if (paymentMode === 'direct' && store.razorpay.key_secret) {
                    rzpKeySecret = store.razorpay.key_secret;
                }
            }
        }

        const crypto = require('crypto');
        const body = razorpay_order_id + "|" + razorpay_payment_id;
        const expectedSignature = crypto.createHmac('sha256', rzpKeySecret).update(body.toString()).digest('hex');

        if (expectedSignature !== razorpay_signature) {
            return res.status(400).json({ success: false, message: 'Invalid payment signature' });
        }

        booking.additional_charges = (booking.additional_charges || 0) + amountPaid;
        booking.return_status = 'submission_pending';
        booking.submission_date = new Date();
        booking.late_submission_paid = true;
        await booking.save();

        const { creditFranchiseWallet } = require('../utils/franchiseWalletHelper');
        await creditFranchiseWallet(booking._id, amountPaid);

        res.status(200).json({
            success: true,
            message: `Paid late submission fee (₹${amountPaid}) and submitted vehicle successfully!`,
            data: booking
        });
    } catch (error) {
        console.error("DEBUG VERIFY LATE SUBMISSION ONLINE ERROR:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

