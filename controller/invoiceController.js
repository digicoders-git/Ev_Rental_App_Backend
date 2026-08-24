const Invoice = require('../models/invoiceModel');
const Booking = require('../models/bookingModel');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

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
            .populate('franchise', 'store_name owner_name mobile email address city state zip_code franchise_id store_id')
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
                .populate('franchise', 'store_name owner_name mobile email address city state zip_code franchise_id store_id');
            
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
            .populate('franchise', 'store_name state franchise_id store_id')
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
            .populate('franchise')
            .populate({ path: 'booking', populate: [{ path: 'plan' }, { path: 'vehicle' }] });

        if (!invoice) {
            return res.status(404).json({ success: false, message: 'Invoice not found' });
        }

        const booking = invoice.booking;
        const isPaid = invoice.status === 'paid';
        
        const doc = new PDFDocument({ margin: 30, size: 'A4' });
        res.setHeader('Content-disposition', 'attachment; filename=' + invoice.invoice_number + '.pdf');
        res.setHeader('Content-type', 'application/pdf');
        doc.pipe(res);

        const numToWords = (n) => {
            const a = ['','One ','Two ','Three ','Four ', 'Five ','Six ','Seven ','Eight ','Nine ','Ten ','Eleven ','Twelve ','Thirteen ','Fourteen ','Fifteen ','Sixteen ','Seventeen ','Eighteen ','Nineteen '];
            const b = ['', '', 'Twenty','Thirty','Forty','Fifty', 'Sixty','Seventy','Eighty','Ninety'];
            if ((n = n.toString()).length > 9) return 'overflow';
            let str = ('000000000' + n).substr(-9).match(/^(\d{2})(\d{2})(\d{2})(\d{1})(\d{2})$/);
            if (!str) return; let text = '';
            text += (str[1] != 0) ? (a[Number(str[1])] || b[str[1][0]] + ' ' + a[str[1][1]]) + 'Crore ' : '';
            text += (str[2] != 0) ? (a[Number(str[2])] || b[str[2][0]] + ' ' + a[str[2][1]]) + 'Lakh ' : '';
            text += (str[3] != 0) ? (a[Number(str[3])] || b[str[3][0]] + ' ' + a[str[3][1]]) + 'Thousand ' : '';
            text += (str[4] != 0) ? (a[Number(str[4])] || b[str[4][0]] + ' ' + a[str[4][1]]) + 'Hundred ' : '';
            text += (str[5] != 0) ? ((text != '') ? 'and ' : '') + (a[Number(str[5])] || b[str[5][0]] + ' ' + a[str[5][1]]) + 'Only' : 'Only';
            return text;
        };

        const pageWidth = doc.page.width;

        // Left Header: TRIS ELECTRIC
        doc.fontSize(20).font('Helvetica-Bold').fillColor('#000').text('TRIS ELECTRIC', 30, 40);
        doc.fontSize(12).fillColor('#1e3a8a').text('JUNGLEBAN ENTERPRISES', 30, 62);
        doc.fontSize(10).fillColor('#334155').font('Helvetica');
        doc.text('Jungleban Enterprises, Alambagh, Lucknow', 30, 80);
        doc.text('Uttar Pradesh - 226005', 30, 95);
        doc.text('GSTIN : 09DTTPS1540G1Z7', 30, 110);

        // Right Header: TAX INVOICE
        doc.fontSize(20).font('Helvetica').fillColor('#1e3a8a').text('TAX INVOICE', 0, 40, { align: 'right', width: pageWidth - 30 });
        
        doc.fontSize(10).fillColor('#334155');
        const rightColX = pageWidth - 210;
        const startY = 70;
        doc.text('Invoice No.', rightColX, startY); doc.text(': ' + invoice.invoice_number, rightColX + 75, startY);
        doc.text('Invoice Date', rightColX, startY + 15); doc.text(': ' + new Date(invoice.createdAt).toLocaleDateString('en-IN'), rightColX + 75, startY + 15);
        doc.text('Terms', rightColX, startY + 30); doc.text(': Due on Receipt', rightColX + 75, startY + 30);
        doc.text('Due Date', rightColX, startY + 45); doc.text(': ' + new Date(invoice.createdAt).toLocaleDateString('en-IN'), rightColX + 75, startY + 45);
        doc.text('P.O. #', rightColX, startY + 60); doc.text(': ' + invoice.invoice_number, rightColX + 75, startY + 60);
        doc.text('Place Of Supply', rightColX, startY + 75); doc.text(': Uttar Pradesh (09)', rightColX + 75, startY + 75);

        // Separator Line
        doc.moveTo(30, 160).lineTo(pageWidth - 30, 160).strokeColor('#2563eb').lineWidth(2).stroke();

        // Buyer (Bill To)
        doc.fontSize(11).font('Helvetica-Bold').fillColor('#1e3a8a').text('Buyer (Bill To)', 30, 175);
        let customerName = invoice.user && invoice.user.name ? invoice.user.name : 'Customer';
        let customerPhone = invoice.user && invoice.user.mobile ? invoice.user.mobile : '';
        doc.fontSize(10).font('Helvetica').fillColor('#000').text(customerName + (customerPhone ? ' - ' + customerPhone : ''), 30, 190);

        // Items Table Header
        const tableTop = 220;
        doc.rect(30, tableTop, pageWidth - 60, 30).fill('#f8fafc').strokeColor('#000').lineWidth(1).stroke();
        
        doc.moveTo(70, tableTop).lineTo(70, tableTop + 30).stroke(); // SL NO
        doc.moveTo(270, tableTop).lineTo(270, tableTop + 30).stroke(); // DESC
        doc.moveTo(330, tableTop).lineTo(330, tableTop + 30).stroke(); // HSN
        doc.moveTo(390, tableTop).lineTo(390, tableTop + 30).stroke(); // QTY
        doc.moveTo(470, tableTop).lineTo(470, tableTop + 30).stroke(); // RATE
        
        doc.fillColor('#000').font('Helvetica-Bold').fontSize(9);
        doc.text('SL NO.', 30, tableTop + 10, { width: 40, align: 'center' });
        doc.text('SERVICES & DESCRIPTION', 70, tableTop + 10, { width: 200, align: 'center' });
        doc.text('HSN/SAC', 270, tableTop + 10, { width: 60, align: 'center' });
        doc.text('QTY', 330, tableTop + 10, { width: 60, align: 'center' });
        doc.text('RATE (Rs)', 390, tableTop + 10, { width: 80, align: 'center' });
        doc.text('AMOUNT (Rs)', 470, tableTop + 10, { width: pageWidth - 470 - 30, align: 'center' });

        // Table Row
        const rowTop = tableTop + 30;
        const rowHeight = 40;
        doc.rect(30, rowTop, pageWidth - 60, rowHeight).stroke();
        doc.moveTo(70, rowTop).lineTo(70, rowTop + rowHeight).stroke();
        doc.moveTo(270, rowTop).lineTo(270, rowTop + rowHeight).stroke();
        doc.moveTo(330, rowTop).lineTo(330, rowTop + rowHeight).stroke();
        doc.moveTo(390, rowTop).lineTo(390, rowTop + rowHeight).stroke();
        doc.moveTo(470, rowTop).lineTo(470, rowTop + rowHeight).stroke();

        doc.font('Helvetica').fontSize(9);
        doc.text('1', 30, rowTop + 10, { width: 40, align: 'center' });
        
        let planName = 'Rental Plan';
        let asset = '';
        if (booking) {
            if (booking.plan && booking.plan.plan_name) planName = booking.plan.plan_name;
            if (booking.vehicle && booking.vehicle.registration_number) asset = booking.vehicle.registration_number;
        }
        const orderId = booking && booking.booking_id ? booking.booking_id : '';
        
        let taxableAmount = Number(invoice.amount) * 100 / 105;
        if (invoice.gst_amount === 0 && invoice.discount_amount === 0 && Number(invoice.amount) === booking?.grand_total) {
            taxableAmount = Number(invoice.amount) * 100 / 105;
        }
        const gstAmount = taxableAmount * 0.025;
        const totalAmount = Number(invoice.amount);
        
        doc.font('Helvetica-Bold').text(planName, 75, rowTop + 10, { width: 190 });
        doc.font('Helvetica').text('Order #' + orderId + ' - Asset: ' + asset, 75, rowTop + 22, { width: 190 });
        
        doc.text('997311', 270, rowTop + 10, { width: 60, align: 'center' });
        doc.text('1 Nos', 330, rowTop + 10, { width: 60, align: 'center' });
        doc.text(taxableAmount.toFixed(2), 390, rowTop + 10, { width: 75, align: 'right' });
        doc.text(taxableAmount.toFixed(2), 470, rowTop + 10, { width: pageWidth - 470 - 35, align: 'right' });

        // Bottom section
        const botTop = rowTop + rowHeight + 20;

        // Bottom Left
        doc.rect(30, botTop, 250, 30).strokeColor('#93c5fd').stroke();
        doc.text('Quantity in Total', 40, botTop + 10);
        doc.font('Helvetica-Bold').text(':   1 Nos', 130, botTop + 10);

        doc.rect(30, botTop + 40, 250, 40).strokeColor('#93c5fd').stroke();
        doc.fillColor('#1e3a8a').text('Total In Words', 40, botTop + 50);
        doc.font('Helvetica').fillColor('#475569').text('Indian Rupee ' + numToWords(Math.round(totalAmount)), 40, botTop + 65);

        doc.rect(30, botTop + 90, 250, 70).strokeColor('#93c5fd').stroke();
        doc.rect(30, botTop + 90, 130, 20).fill('#1e3a8a');
        doc.fillColor('#fff').font('Helvetica-Bold').text("Company's Bank Details", 35, botTop + 96);
        doc.fillColor('#334155').font('Helvetica').text('Bank Name', 35, botTop + 120); doc.text(': Canara Bank', 105, botTop + 120);
        doc.text('A/c No.', 35, botTop + 135); doc.text(': 120024164312', 105, botTop + 135);
        doc.text('Branch & IFSC', 35, botTop + 150); doc.text(': Alambagh Branch & CNRB0001258', 105, botTop + 150);

        doc.rect(30, botTop + 170, 250, 80).strokeColor('#93c5fd').stroke();
        doc.rect(30, botTop + 170, 80, 20).fill('#1e3a8a');
        doc.fillColor('#fff').font('Helvetica-Bold').text("Declaration :", 35, botTop + 176);
        doc.fillColor('#475569').font('Helvetica').text('We declare that this invoice shows the actual price of the Services described and that all particulars are true and correct.', 35, botTop + 198, { width: 235 });

        // Bottom Right
        const rightX = 310;
        const rw = pageWidth - 30 - 310;
        
        const franchiseState = (invoice.franchise?.state || invoice.booking?.franchise?.state || 'uttar pradesh').toLowerCase().trim();
        const isUP = ['uttar pradesh', 'up', 'u.p.', 'u p'].includes(franchiseState);

        doc.fillColor('#000').font('Helvetica').text('Total Taxable Amount', rightX, botTop);
        doc.text(taxableAmount.toFixed(2), rightX, botTop, { align: 'right', width: rw });

        doc.moveTo(rightX, botTop + 15).lineTo(pageWidth - 30, botTop + 15).strokeColor('#cbd5e1').lineWidth(1).stroke();
        
        if (isUP) {
            doc.font('Helvetica-Bold').text('CGST 2.5%', rightX, botTop + 25);
            doc.font('Helvetica').text(gstAmount.toFixed(2), rightX, botTop + 25, { align: 'right', width: rw });

            doc.moveTo(rightX, botTop + 40).lineTo(pageWidth - 30, botTop + 40).stroke();
            doc.font('Helvetica-Bold').text('SGST 2.5%', rightX, botTop + 50);
            doc.font('Helvetica').text(gstAmount.toFixed(2), rightX, botTop + 50, { align: 'right', width: rw });
        } else {
            const igstAmount = gstAmount * 2;
            doc.font('Helvetica-Bold').text('IGST 5%', rightX, botTop + 25);
            doc.font('Helvetica').text(igstAmount.toFixed(2), rightX, botTop + 25, { align: 'right', width: rw });

            doc.moveTo(rightX, botTop + 40).lineTo(pageWidth - 30, botTop + 40).stroke();
        }

        doc.moveTo(rightX, botTop + 65).lineTo(pageWidth - 30, botTop + 65).strokeColor('#000').stroke();
        doc.fontSize(12).font('Helvetica-Bold').text('Total', rightX, botTop + 80);
        doc.text('Rs ' + totalAmount.toFixed(2), rightX, botTop + 80, { align: 'right', width: rw });

        doc.moveTo(rightX, botTop + 100).lineTo(pageWidth - 30, botTop + 100).strokeColor('#cbd5e1').stroke();
        doc.fontSize(9).font('Helvetica').text('Payment Made (-)', rightX, botTop + 115);
        doc.text(isPaid ? totalAmount.toFixed(2) : '0.00', rightX, botTop + 115, { align: 'right', width: rw });

        doc.moveTo(rightX, botTop + 130).lineTo(pageWidth - 30, botTop + 130).strokeColor('#000').stroke();
        doc.fontSize(11).font('Helvetica-Bold').text('Balance Due', rightX, botTop + 145);
        doc.text(isPaid ? 'Rs 0.00' : 'Rs ' + totalAmount.toFixed(2), rightX, botTop + 145, { align: 'right', width: rw });

        // Signature
        doc.fontSize(10).font('Helvetica').text('for ', rightX, botTop + 210, { continued: true }).font('Helvetica-Bold').text('TRIS ELECTRIC', { align: 'center', width: rw });
        doc.fillColor('#1e3a8a').text('JUNGLEBAN ENTERPRISES', rightX, botTop + 225, { align: 'center', width: rw });
        
        // Stamp Circle — moved down so it doesn't overlap text above
        doc.circle(rightX + rw/2, botTop + 310, 35).lineWidth(2).strokeColor('#1e3a8a').stroke();
        doc.circle(rightX + rw/2, botTop + 310, 30).lineWidth(1).strokeColor('#1e3a8a').stroke();
        
        doc.save();
        doc.translate(rightX + rw/2, botTop + 310);
        doc.rotate(-20);
        doc.fontSize(6).fillColor('#1e3a8a').font('Helvetica-Bold');
        doc.text('TRIS ELECTRIC', -28, -20, { width: 56, align: 'center', lineBreak: false });
        doc.text('JUNGLEBAN', -28, -7, { width: 56, align: 'center', lineBreak: false });
        doc.text('ENTERPRISES', -28, 6, { width: 56, align: 'center', lineBreak: false });
        doc.restore();

        const signaturePath = path.join(__dirname, '../assets/signature.png');
        if (fs.existsSync(signaturePath)) {
            doc.image(signaturePath, rightX + (rw/2) - 30, botTop + 315, { width: 60 });
        }

        doc.moveTo(rightX + 40, botTop + 360).lineTo(rightX + rw - 40, botTop + 360).dash(2, {space: 2}).strokeColor('#000').stroke();
        doc.undash();
        doc.fillColor('#000').fontSize(10).font('Helvetica').text('Authorized signatory', rightX, botTop + 365, { align: 'center', width: rw });

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
            .populate('franchise', 'store_name state franchise_id store_id')
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
