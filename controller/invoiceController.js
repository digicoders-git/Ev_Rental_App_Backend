const Invoice = require('../models/invoiceModel');
const Booking = require('../models/bookingModel');
const PDFDocument = require('pdfkit');
const fs = require('fs');

// @desc    Get or Generate Invoice for a Booking
// @route   GET /api/invoices/booking/:bookingId
// @access  Private (Admin, Franchise, Rider)
exports.getInvoiceByBooking = async (req, res) => {
    try {
        const { bookingId } = req.params;

        // Fetch booking to check payment method
        const booking = await Booking.findById(bookingId).populate('vehicle', 'vehicle_name registration_number type');
        if (!booking) {
            return res.status(404).json({ success: false, message: 'Booking not found' });
        }

        // Fetch all existing invoices for this booking
        let invoices = await Invoice.find({ booking: bookingId })
            .populate('booking')
            .populate('user', 'name mobile email')
            .populate('franchise', 'store_name owner_name mobile email address city state zip_code')
            .sort('createdAt');

        // If no invoices exist AND it's either not installments, OR it's an old installments booking with payments made
        if (invoices.length === 0 && (booking.payment_method !== 'installments' || booking.total_paid > 0)) {
            // Generate unique invoice number
            const count = await Invoice.countDocuments();
            const invNumber = `INV-${new Date().getFullYear()}-${String(count + 1).padStart(5, '0')}`;

            const isOldInstallment = booking.payment_method === 'installments';

            // Create new master/fallback invoice
            const newInvoice = await Invoice.create({
                invoice_number: invNumber,
                booking: booking._id,
                user: booking.user,
                franchise: booking.franchise, // Will be null if Platform
                amount: isOldInstallment ? booking.total_paid : booking.total_amount,
                gst_amount: isOldInstallment ? 0 : booking.gst_amount,
                discount_amount: isOldInstallment ? 0 : booking.discount_amount,
                total_amount: isOldInstallment ? booking.total_paid : booking.grand_total,
                status: booking.payment_status === 'paid' ? 'paid' : (isOldInstallment ? 'paid' : 'unpaid')
            });

            // Re-fetch with populations
            const populatedInvoice = await Invoice.findById(newInvoice._id)
                .populate('booking')
                .populate('user', 'name mobile email')
                .populate('franchise', 'store_name owner_name mobile email address city state zip_code');
            
            invoices = [populatedInvoice];
        } 

        // Sync existing master invoice if booking amount/status changed (e.g. via extension or damage charges)
        const masterInvoice = invoices.find(inv => !inv.installment_id);
        if (masterInvoice) {
            const currentStatus = booking.payment_status === 'paid' ? 'paid' : 'unpaid';
            if (masterInvoice.total_amount !== booking.grand_total || masterInvoice.status !== currentStatus) {
                masterInvoice.amount = booking.total_amount;
                masterInvoice.gst_amount = booking.gst_amount;
                masterInvoice.discount_amount = booking.discount_amount;
                masterInvoice.total_amount = booking.grand_total;
                masterInvoice.status = currentStatus;
                await masterInvoice.save();
            }
        }

        // Return array of invoices
        res.status(200).json({ success: true, data: invoices });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Get all invoices for logged-in user (fully dynamic — one per booking)
// @route   GET /api/invoices
// @access  Private
exports.getAllInvoices = async (req, res) => {
    try {
        // ── User: return one invoice per booking (dynamic) ──
        if (req.user && req.user.role === 'user') {
            const bookings = await Booking.find({ user: req.user._id })
                .populate('vehicle', 'vehicle_name registration_number')
                .populate('plan', 'plan_name')
                .sort('-createdAt');

            const results = [];

            for (const booking of bookings) {
                // Find or create a master invoice for this booking
                let invoice = await Invoice.findOne({ booking: booking._id, installment_id: null });

                if (!invoice) {
                    const count = await Invoice.countDocuments();
                    const invNumber = `INV-${new Date().getFullYear()}-${String(count + 1).padStart(5, '0')}`;
                    invoice = await Invoice.create({
                        invoice_number: invNumber,
                        booking: booking._id,
                        user: booking.user,
                        franchise: booking.franchise || null,
                        amount: booking.payment_method === 'installments' ? booking.total_paid : booking.grand_total,
                        gst_amount: booking.payment_method === 'installments' ? 0 : (booking.gst_amount || 0),
                        discount_amount: booking.payment_method === 'installments' ? 0 : (booking.discount_amount || 0),
                        total_amount: booking.payment_method === 'installments' ? booking.total_paid : booking.grand_total,
                        status: booking.payment_status === 'paid' ? 'paid' : 'unpaid'
                    });
                }

                let currentStatus = invoice.status;
                if (booking.payment_method !== 'installments') {
                    currentStatus = booking.payment_status === 'paid' ? 'paid' : invoice.status;
                } else if (booking.total_paid >= booking.grand_total) {
                    currentStatus = 'paid';
                }

                if (invoice.status !== currentStatus) {
                    invoice.status = currentStatus;
                    await invoice.save();
                }

                results.push({
                    _id: invoice._id,
                    invoice_number: invoice.invoice_number,
                    amount: booking.payment_method === 'installments'
                        ? booking.payment_installments.filter(i => i.status === 'paid').reduce((s, i) => s + Number(i.amount || 0), 0)
                        : booking.grand_total,
                    status: currentStatus,
                    createdAt: invoice.createdAt,
                    booking: {
                        _id: booking._id,
                        booking_id: booking.booking_id,
                        booking_status: booking.booking_status,
                        payment_method: booking.payment_method,
                        grand_total: booking.grand_total,
                        total_paid: booking.total_paid,
                        payment_installments: booking.payment_installments,
                        vehicle: booking.vehicle,
                        plan: booking.plan,
                        start_date: booking.start_date,
                        end_date: booking.end_date
                    }
                });
            }

            return res.status(200).json({ success: true, data: results });
        }

        // ── Admin / Franchise: return from Invoice collection ──
        let query = {};
        if (req.franchise) {
            query.franchise = req.franchise._id;
        } else if (req.user && req.user.role === 'franchise') {
            query.franchise = req.user.franchiseId;
        } else if (req.query.franchiseId && req.query.franchiseId !== 'all') {
            query.franchise = req.query.franchiseId === 'platform' ? null : req.query.franchiseId;
        }

        if (req.query.status && req.query.status !== 'all') {
            query.status = req.query.status;
        }

        if (req.query.startDate && req.query.endDate) {
            query.createdAt = {
                $gte: new Date(req.query.startDate),
                $lte: new Date(new Date(req.query.endDate).setHours(23, 59, 59, 999))
            };
        }

        const invoices = await Invoice.find(query)
            .populate('user', 'name mobile')
            .populate({ path: 'booking', populate: [{ path: 'vehicle', select: 'vehicle_name registration_number' }, { path: 'plan', select: 'plan_name' }] })
            .populate('franchise', 'store_name')
            .sort('-createdAt');

        // Dynamically sync status for Franchise/Admin too
        for (let invoice of invoices) {
            const booking = invoice.booking;
            if (booking) {
                let currentStatus = invoice.status;
                if (booking.payment_method !== 'installments') {
                    currentStatus = booking.payment_status === 'paid' ? 'paid' : invoice.status;
                } else if (booking.total_paid >= booking.grand_total) {
                    currentStatus = 'paid';
                }

                if (invoice.status !== currentStatus) {
                    invoice.status = currentStatus;
                    await Invoice.findByIdAndUpdate(invoice._id, { status: currentStatus });
                }
            }
        }

        res.status(200).json({ success: true, data: invoices });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};


// @route   GET /api/invoices/:id/receipt
// @access  Private (Admin, Franchise, Rider)
exports.downloadInvoicePDF = async (req, res) => {
    try {
        const invoice = await Invoice.findById(req.params.id)
            .populate('user')
            .populate({ path: 'booking', populate: { path: 'plan' } });

        if (!invoice) {
            return res.status(404).json({ success: false, message: 'Invoice not found' });
        }

        const booking = invoice.booking;
        const isInstallment = invoice.installment_id != null;
        const allInstallments = isInstallment ? (booking.payment_installments || []) : [];
        const paidInstallments = allInstallments.filter(i => i.status === 'paid');
        const pendingInstallments = allInstallments.filter(i => i.status !== 'paid');

        const doc = new PDFDocument({ margin: 0, size: 'A4' });
        res.setHeader('Content-disposition', 'attachment; filename=' + invoice.invoice_number + '.pdf');
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

        // Header
        doc.moveTo(50, 40).lineTo(pageWidth - 50, 40).strokeColor('#333333').lineWidth(2).stroke();
        doc.fontSize(28).font('Helvetica-Bold').fillColor('#333333').text('INVOICE', 50, 60);
        doc.fontSize(10).font('Helvetica').fillColor('#666666').text('TRIS Electric - EV Rentals', 50, 95);

        // Billed To
        doc.fontSize(10).font('Helvetica-Bold').fillColor('#333333').text('Billed To:', 380, 60);
        doc.fontSize(12).text((invoice.user && invoice.user.name) ? invoice.user.name : 'Customer', 380, 75);
        doc.fontSize(10).font('Helvetica').fillColor('#666666');
        doc.text((invoice.user && invoice.user.mobile) ? invoice.user.mobile : '', 380, 90);
        doc.text((invoice.user && invoice.user.email) ? invoice.user.email : '', 380, 105);

        // Meta
        doc.moveTo(50, 140).lineTo(pageWidth - 50, 140).strokeColor('#EEEEEE').lineWidth(1).stroke();
        doc.fontSize(10).font('Helvetica-Bold').fillColor('#333333');
        doc.text('INVOICE NO:', 50, 160);
        doc.font('Helvetica').fillColor('#666666').text(invoice.invoice_number, 130, 160);
        doc.font('Helvetica-Bold').fillColor('#333333').text('DATE:', 240, 160);
        doc.font('Helvetica').fillColor('#666666').text(new Date(invoice.createdAt).toLocaleDateString(), 275, 160);
        doc.font('Helvetica-Bold').fillColor('#333333').text('TYPE:', 380, 160);
        doc.font('Helvetica').fillColor('#666666').text(isInstallment ? 'Installment Plan' : 'Full Payment', 415, 160);

        // Table Header
        const tableTop = 200;
        doc.rect(50, tableTop, pageWidth - 100, 35).fill('#333333');
        doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(11);
        doc.text('DESCRIPTION', 60, tableTop + 12);
        doc.text('DUE DATE', 210, tableTop + 12);
        doc.text('PAID DATE', 280, tableTop + 12);
        doc.text('RENT', 360, tableTop + 12);
        doc.text('GST (5%)', 420, tableTop + 12);
        doc.text('TOTAL', 480, tableTop + 12, { width: 60, align: 'right' });

        let currentY = tableTop + 55;

        const drawRow = (desc, dueDate, paidDate, rentStr, gstStr, amount, isPaid) => {
            doc.font('Helvetica').fillColor(isPaid ? '#166534' : '#92400e').fontSize(10);
            doc.text(desc, 60, currentY, { width: 140 });
            doc.fillColor('#666666').text(dueDate, 210, currentY, { width: 60 });
            doc.text(paidDate, 280, currentY, { width: 70 });
            doc.text(rentStr, 360, currentY, { width: 50 });
            doc.text(gstStr, 420, currentY, { width: 50 });
            doc.fillColor(isPaid ? '#10b981' : '#f59e0b').font('Helvetica-Bold')
               .text('INR ' + Number(amount).toFixed(2), 480, currentY, { width: 60, align: 'right' });
            doc.moveTo(50, currentY + 22).lineTo(pageWidth - 50, currentY + 22).strokeColor('#EEEEEE').lineWidth(1).stroke();
            currentY += 38;
        };

        if (isInstallment) {
            // Show only the specific installment for this invoice
            const currentInst = paidInstallments.find(inst => inst._id && invoice.installment_id && inst._id.toString() === invoice.installment_id.toString());
            
            if (currentInst) {
                const gst = Number(currentInst.amount) * 5 / 105;
                const rent = Number(currentInst.amount) - gst;
                const gstVal = 'INR ' + gst.toFixed(2);
                const rentVal = 'INR ' + rent.toFixed(2);
                const dueStr = currentInst.due_date ? new Date(currentInst.due_date).toLocaleDateString('en-IN') : '-';
                const paidStr = currentInst.paid_date ? new Date(currentInst.paid_date).toLocaleDateString('en-IN') : 'Paid';
                
                drawRow('Week ' + currentInst.installment_no + ' - Installment', dueStr, paidStr, rentVal, gstVal, currentInst.amount, true);
            } else {
                const gst = Number(invoice.amount) * 5 / 105;
                const rent = Number(invoice.amount) - gst;
                drawRow('Installment Payment', '-', new Date(invoice.createdAt).toLocaleDateString('en-IN'), 'INR ' + rent.toFixed(2), 'INR ' + gst.toFixed(2), invoice.amount, true);
            }
        } else {
            const planName = booking && booking.plan ? booking.plan.plan_name : 'Rental Plan';
            const gst = Number(invoice.amount) * 5 / 105;
            const rent = Number(invoice.amount) - gst;
            const gstVal = 'INR ' + gst.toFixed(2);
            const rentVal = 'INR ' + rent.toFixed(2);
            drawRow('EV Rental - ' + planName + ' (Booking #' + (booking && booking.booking_id ? booking.booking_id : '') + ')', '-', new Date(invoice.createdAt).toLocaleDateString('en-IN'), rentVal, gstVal, invoice.amount, true);
            if (invoice.gst_amount > 0) drawRow('GST', '-', '-', '-', '-', invoice.gst_amount, true);
            if (invoice.discount_amount > 0) drawRow('Discount Applied', '-', '-', '-', '-', -invoice.discount_amount, true);
        }

        // Summary Box
        currentY += 10;
        doc.rect(380, currentY, 170, 40).fill('#F8F9FA');
        doc.font('Helvetica-Bold').fillColor('#333333').fontSize(14);
        doc.text('INVOICE TOTAL:', 395, currentY + 15);
        doc.fillColor('#10b981').text('INR ' + Number(invoice.amount).toFixed(2), 470, currentY + 15, { width: 70, align: 'right' });

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

// Helper for Background Syncing (e.g. from Auto-Renew Cron)
exports.syncMasterInvoiceForBooking = async (booking) => {
    try {
        let masterInvoice = await Invoice.findOne({ booking: booking._id, installment_id: null });
        if (!masterInvoice) {
            const count = await Invoice.countDocuments();
            const invNumber = `INV-${new Date().getFullYear()}-${String(count + 1).padStart(5, '0')}`;
            masterInvoice = await Invoice.create({
                invoice_number: invNumber,
                booking: booking._id,
                user: booking.user,
                franchise: booking.franchise,
                amount: booking.grand_total,
                gst_amount: booking.gst_amount,
                discount_amount: booking.discount_amount,
                total_amount: booking.grand_total,
                status: booking.payment_status === 'paid' ? 'paid' : 'unpaid'
            });
        } else {
            const currentStatus = booking.payment_status === 'paid' ? 'paid' : 'unpaid';
            if (masterInvoice.total_amount !== booking.grand_total || masterInvoice.status !== currentStatus) {
                masterInvoice.amount = booking.grand_total;
                masterInvoice.gst_amount = booking.gst_amount;
                masterInvoice.discount_amount = booking.discount_amount;
                masterInvoice.total_amount = booking.grand_total;
                masterInvoice.status = currentStatus;
                await masterInvoice.save();
            }
        }
    } catch (err) {
        console.error('Error syncing master invoice:', err);
    }
};

// @desc    Download Bulk Invoice Report PDF
// @route   GET /api/invoices/report/download
// @access  Private (Admin, Franchise)
exports.downloadBulkInvoiceReport = async (req, res) => {
    try {
        let query = {};
        if (req.franchise) {
            query.franchise = req.franchise._id;
        } else if (req.user && req.user.role === 'franchise') {
            query.franchise = req.user.franchiseId;
        } else if (req.query.franchiseId && req.query.franchiseId !== 'all') {
            query.franchise = req.query.franchiseId === 'platform' ? null : req.query.franchiseId;
        }

        if (req.query.status && req.query.status !== 'all') {
            query.status = req.query.status;
        }

        if (req.query.startDate && req.query.endDate) {
            query.createdAt = {
                $gte: new Date(req.query.startDate),
                $lte: new Date(new Date(req.query.endDate).setHours(23, 59, 59, 999))
            };
        }

        const invoices = await Invoice.find(query)
            .populate('user', 'name mobile')
            .populate({ path: 'booking', populate: [{ path: 'vehicle', select: 'vehicle_name registration_number' }, { path: 'plan', select: 'plan_name' }] })
            .populate('franchise', 'store_name')
            .sort('-createdAt');

        const doc = new PDFDocument({ margin: 30, size: 'A4' });
        res.setHeader('Content-disposition', 'attachment; filename=Payment_History_Report.pdf');
        res.setHeader('Content-type', 'application/pdf');
        doc.pipe(res);

        const pageWidth = doc.page.width;
        
        doc.fontSize(24).font('Helvetica-Bold').fillColor('#333').text('Payment History Report', 30, 40, { align: 'center' });
        doc.fontSize(10).font('Helvetica').fillColor('#666').text(`Generated on: ${new Date().toLocaleString()}`, 30, 70, { align: 'center' });
        
        let filterText = [];
        if (req.query.startDate) filterText.push(`Date: ${new Date(req.query.startDate).toLocaleDateString()} to ${new Date(req.query.endDate).toLocaleDateString()}`);
        if (req.query.status && req.query.status !== 'all') filterText.push(`Status: ${req.query.status.toUpperCase()}`);
        if (filterText.length > 0) {
            doc.fontSize(10).fillColor('#444').text(`Filters applied: ${filterText.join(' | ')}`, 30, 90, { align: 'center' });
        }

        let paidRent = 0, paidGST = 0, paidTotal = 0;
        let unpaidRent = 0, unpaidGST = 0, unpaidTotal = 0;

        const tableTop = 130;
        doc.rect(30, tableTop, pageWidth - 60, 25).fill('#333');
        doc.fillColor('#FFF').font('Helvetica-Bold').fontSize(9);
        doc.text('INV NO', 40, tableTop + 8);
        doc.text('DATE', 110, tableTop + 8);
        doc.text('CUSTOMER', 170, tableTop + 8);
        doc.text('VEHICLE', 270, tableTop + 8);
        doc.text('STATUS', 360, tableTop + 8);
        doc.text('RENT', 410, tableTop + 8);
        doc.text('GST', 460, tableTop + 8);
        doc.text('TOTAL', 510, tableTop + 8);

        let currentY = tableTop + 35;

        invoices.forEach(inv => {
            if (currentY > 740) {
                doc.addPage();
                currentY = 40;
                doc.rect(30, currentY, pageWidth - 60, 25).fill('#333');
                doc.fillColor('#FFF').font('Helvetica-Bold').fontSize(9);
                doc.text('INV NO', 40, currentY + 8);
                doc.text('DATE', 110, currentY + 8);
                doc.text('CUSTOMER', 170, currentY + 8);
                doc.text('VEHICLE', 270, currentY + 8);
                doc.text('STATUS', 360, currentY + 8);
                doc.text('RENT', 410, currentY + 8);
                doc.text('GST', 460, currentY + 8);
                doc.text('TOTAL', 510, currentY + 8);
                currentY += 35;
            }

            const rent = Number(inv.amount || 0);
            const gst = Number(inv.gst_amount || 0);
            const total = Number(inv.total_amount || 0);

            if (inv.status === 'paid') {
                paidRent += rent;
                paidGST += gst;
                paidTotal += total;
            } else {
                unpaidRent += rent;
                unpaidGST += gst;
                unpaidTotal += total;
            }

            doc.font('Helvetica').fillColor('#333').fontSize(8);
            doc.text(inv.invoice_number, 40, currentY, { width: 65 });
            doc.text(new Date(inv.createdAt).toLocaleDateString(), 110, currentY);
            doc.text(inv.user ? inv.user.name : 'N/A', 170, currentY, { width: 90 });
            doc.text(inv.booking?.vehicle?.registration_number || 'N/A', 270, currentY, { width: 80 });
            
            doc.fillColor(inv.status === 'paid' ? '#16a34a' : '#ea580c');
            doc.text(inv.status.toUpperCase(), 360, currentY);
            
            doc.fillColor('#333');
            doc.text(rent.toFixed(2), 410, currentY);
            doc.text(gst.toFixed(2), 460, currentY);
            doc.font('Helvetica-Bold').text(total.toFixed(2), 510, currentY);

            doc.moveTo(30, currentY + 15).lineTo(pageWidth - 30, currentY + 15).strokeColor('#EEE').lineWidth(1).stroke();
            currentY += 25;
        });

        if (currentY > 700) {
            doc.addPage();
            currentY = 40;
        }

        currentY += 10;
        
        // Unpaid Summary
        doc.rect(30, currentY, 210, 80).fill('#f8fafc').stroke('#e2e8f0');
        doc.fillColor('#333').font('Helvetica-Bold').fontSize(10);
        doc.text('SUMMARY (Unpaid)', 40, currentY + 10);
        
        doc.font('Helvetica').fontSize(9);
        doc.text('Total Rent:', 40, currentY + 30);
        doc.text(`INR ${unpaidRent.toFixed(2)}`, 130, currentY + 30, { align: 'right', width: 100 });
        
        doc.text('Total GST (5%):', 40, currentY + 45);
        doc.text(`INR ${unpaidGST.toFixed(2)}`, 130, currentY + 45, { align: 'right', width: 100 });
        
        doc.font('Helvetica-Bold').fontSize(11);
        doc.text('GRAND TOTAL:', 40, currentY + 62);
        doc.fillColor('#ea580c').text(`INR ${unpaidTotal.toFixed(2)}`, 130, currentY + 62, { align: 'right', width: 100 });

        // Paid Summary
        doc.rect(350, currentY, 210, 80).fill('#f8fafc').stroke('#e2e8f0');
        
        doc.fillColor('#333').font('Helvetica-Bold').fontSize(10);
        doc.text('SUMMARY (Paid)', 360, currentY + 10);
        
        doc.font('Helvetica').fontSize(9);
        doc.text('Total Rent:', 360, currentY + 30);
        doc.text(`INR ${paidRent.toFixed(2)}`, 450, currentY + 30, { align: 'right', width: 100 });
        
        doc.text('Total GST (5%):', 360, currentY + 45);
        doc.text(`INR ${paidGST.toFixed(2)}`, 450, currentY + 45, { align: 'right', width: 100 });
        
        doc.font('Helvetica-Bold').fontSize(11);
        doc.text('GRAND TOTAL:', 360, currentY + 62);
        doc.fillColor('#16a34a').text(`INR ${paidTotal.toFixed(2)}`, 450, currentY + 62, { align: 'right', width: 100 });

        doc.end();
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
