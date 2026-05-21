const Booking = require('../models/bookingModel');
const Vehicle = require('../models/vehicleModel');
const RentalPlan = require('../models/planModel');
const User = require('../models/userModel');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
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

        // 1b. Check for Overlapping Bookings
        const overlap = await Booking.findOne({
            vehicle,
            booking_status: { $in: ['confirmed', 'ongoing'] },
            $or: [
                {
                    start_date: { $lte: new Date(end_date) },
                    end_date: { $gte: new Date(start_date) }
                }
            ]
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
        const total_amount = req.body.total_amount !== undefined ? req.body.total_amount : planData.price;
        const security_deposit = req.body.security_deposit !== undefined ? req.body.security_deposit : planData.security_deposit;
        const discount_amount = req.body.discount_amount || 0;
        const grand_total = total_amount + security_deposit - discount_amount;

        let bookingUserId = req.user ? req.user.id : null;
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

        const booking = await Booking.create({
            user: bookingUserId,
            vehicle,
            franchise: vehicleData.franchise || null, // Stamp which franchise this booking belongs to
            plan,
            start_date,
            end_date,
            total_amount,
            discount_amount,
            security_deposit,
            grand_total,
            pickup_location,
            drop_location,
            payment_method
        });

        // Notify Admin
        await sendNotification({
            title: 'New Booking Created',
            message: `Booking #${booking.booking_id} has been created for ${creatorName}.`,
            type: 'booking',
            related_id: booking._id
        });

        res.status(201).json({ success: true, data: booking });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
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

        if (booking_status) booking.booking_status = booking_status;
        if (payment_status) {
            booking.payment_status = payment_status;
            // If marked as paid, assume the pending grand_total is paid
            if (payment_status === 'paid') {
                booking.total_paid = booking.grand_total;
            }
        }
        if (transaction_id) booking.transaction_id = transaction_id;

        await booking.save();

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

        let lateFee = 0;
        let hoursLate = 0;
        let diffInMins = 0;

        if (actualReturn > scheduledReturn) {
            const diffInMs = actualReturn - scheduledReturn;
            diffInMins = Math.floor(diffInMs / (1000 * 60));
            
            // Subtract grace period
            const effectiveLateMins = diffInMins - (booking.plan.grace_period || 30);
            
            if (effectiveLateMins > 0) {
                hoursLate = Math.ceil(effectiveLateMins / 60);
                lateFee = hoursLate * (booking.plan.late_fee_per_hour || 100);
            }
        }

        res.status(200).json({
            success: true,
            data: {
                minutes_late: diffInMins,
                hours_late_after_grace: hoursLate,
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

        let lateFee = 0;
        if (actualReturn > scheduledReturn) {
            const diffInMins = Math.floor((actualReturn - scheduledReturn) / (1000 * 60));
            const effectiveLateMins = diffInMins - (booking.plan.grace_period || 30);
            if (effectiveLateMins > 0) {
                const hoursLate = Math.ceil(effectiveLateMins / 60);
                lateFee = hoursLate * (booking.plan.late_fee_per_hour || 100);
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

        // Create PDF Document
        const doc = new PDFDocument({ margin: 50 });
        let filename = `Receipt_${booking.booking_id}.pdf`;

        // Set response headers
        res.setHeader('Content-disposition', `attachment; filename=${filename}`);
        res.setHeader('Content-type', 'application/pdf');

        // Pipe the PDF into the response
        doc.pipe(res);

        // --- PDF CONTENT DESIGN ---
        
        // Header
        doc.fontSize(25).bold = true;
        doc.text('EV RENTAL RECEIPT', { align: 'center' });
        doc.moveDown();
        doc.fontSize(12).text(`Receipt ID: ${booking.booking_id}`, { align: 'right' });
        doc.text(`Date: ${new Date().toLocaleDateString()}`, { align: 'right' });
        doc.moveDown();

        // Customer Details
        doc.fontSize(16).text('Customer Details', { underline: true });
        doc.fontSize(12).text(`Name: ${booking.user.name}`);
        doc.text(`Mobile: ${booking.user.mobile}`);
        doc.text(`Email: ${booking.user.email}`);
        doc.moveDown();

        // Vehicle Details
        doc.fontSize(16).text('Vehicle Details', { underline: true });
        doc.fontSize(12).text(`Vehicle: ${booking.vehicle.brand} ${booking.vehicle.vehicle_name}`);
        doc.text(`Registration: ${booking.vehicle.registration_number}`);
        doc.text(`Vehicle ID: ${booking.vehicle.vehicle_id}`);
        doc.moveDown();

        // Booking Period
        doc.fontSize(16).text('Rental Period', { underline: true });
        doc.fontSize(12).text(`Pickup: ${new Date(booking.start_date).toLocaleString()}`);
        doc.text(`Scheduled Return: ${new Date(booking.end_date).toLocaleString()}`);
        if(booking.actual_return_date) {
            doc.text(`Actual Return: ${new Date(booking.actual_return_date).toLocaleString()}`);
        }
        doc.moveDown();

        // Payment Summary Table Header
        doc.fontSize(16).text('Payment Summary', { underline: true });
        doc.moveDown(0.5);
        
        const startX = 50;
        let currentY = doc.y;

        doc.fontSize(12);
        doc.text('Description', startX, currentY);
        doc.text('Amount', startX + 350, currentY, { align: 'right' });
        doc.moveTo(startX, currentY + 15).lineTo(550, currentY + 15).stroke();
        currentY += 25;

        // Line Items
        const totalBase = booking.total_amount || 0;
        const security = booking.security_deposit || 0;
        const late = booking.late_fee || 0;
        const discount = booking.discount_amount || 0;

        const items = [
            { label: 'Rental Base Amount', value: totalBase },
            { label: 'Security Deposit', value: security },
            { label: 'Late Fee', value: late },
            { label: 'Discount', value: -discount }
        ];

        items.forEach(item => {
            doc.text(item.label, startX, currentY);
            doc.text(`INR ${item.value.toFixed(2)}`, startX + 350, currentY, { align: 'right' });
            currentY += 20;
        });

        // Total
        doc.moveTo(startX, currentY).lineTo(550, currentY).stroke();
        currentY += 10;
        doc.fontSize(14).text('Total Paid', startX, currentY);
        doc.text(`INR ${booking.grand_total.toFixed(2)}`, startX + 350, currentY, { align: 'right' });

        doc.moveDown(2);
        doc.fontSize(10).text('Thank you for choosing EV Rental!', { align: 'center', italic: true });

        // Finalize PDF
        doc.end();

    } catch (error) {
        console.error('PDF Generation Error:', error);
        res.status(500).json({ success: false, message: 'Could not generate receipt' });
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
            $or: [
                {
                    start_date: { $lte: booking.end_date },
                    end_date: { $gte: booking.start_date }
                }
            ]
        });

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
        const remaining = booking.grand_total - booking.total_paid;

        if (Math.round(totalInstallmentAmount) > Math.round(remaining)) {
            return res.status(400).json({ success: false, message: `Total installments (${totalInstallmentAmount}) cannot exceed due amount (${remaining})` });
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
        res.status(200).json({
            success: true,
            message: `Installment #${inst.installment_no} of ₹${inst.amount} marked as paid`,
            data: booking.payment_installments
        });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};
