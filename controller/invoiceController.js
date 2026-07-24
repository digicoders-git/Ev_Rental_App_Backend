const Invoice = require('../models/invoiceModel');
const Booking = require('../models/bookingModel');

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

        // Return array of invoices
        res.status(200).json({ success: true, data: invoices });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Get all invoices (Filters: Franchise)
// @route   GET /api/invoices
// @access  Private (Admin, Franchise)
exports.getAllInvoices = async (req, res) => {
    try {
        let query = {};
        
        // If franchise is logged in, restrict to their invoices
        if (req.franchise) {
            query.franchise = req.franchise._id;
        } else if (req.user && req.user.role === 'franchise') {
            query.franchise = req.user.franchiseId;
        } else if (req.user && req.user.role === 'user') {
            query.user = req.user._id;
        } else if (req.query.franchiseId) {
            // If admin filters by franchise
            query.franchise = req.query.franchiseId === 'platform' ? null : req.query.franchiseId;
        }

        const invoices = await Invoice.find(query)
            .populate('user', 'name mobile')
            .populate({ path: 'booking', populate: { path: 'vehicle', select: 'vehicle_name registration_number' } })
            .populate('franchise', 'store_name')
            .sort('-createdAt');

        res.status(200).json({ success: true, data: invoices });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

const PDFDocument = require('pdfkit');
const fs = require('fs');

// @desc    Download Invoice PDF
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

        // Create PDF Document (A4 size is default)
        const doc = new PDFDocument({ margin: 0, size: 'A4' });
        let filename = `${invoice.invoice_number}.pdf`;

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
        doc.fontSize(12).text(invoice.user?.name || 'Customer', 380, 75);
        doc.fontSize(10).font('Helvetica').fillColor('#666666');
        doc.text(invoice.user?.mobile || '', 380, 90);
        doc.text(invoice.user?.email || '', 380, 105);

        // 4. Invoice Meta Info
        doc.moveTo(50, 140).lineTo(pageWidth - 50, 140).strokeColor('#EEEEEE').lineWidth(1).stroke();
        
        doc.fontSize(10).font('Helvetica-Bold').fillColor('#333333');
        doc.text('INVOICE NO:', 50, 160);
        doc.font('Helvetica').fillColor('#666666').text(invoice.invoice_number, 120, 160);

        doc.font('Helvetica-Bold').fillColor('#333333').text('DATE:', 220, 160);
        doc.font('Helvetica').fillColor('#666666').text(new Date(invoice.createdAt).toLocaleDateString(), 260, 160);

        doc.font('Helvetica-Bold').fillColor('#333333').text('STATUS:', 380, 160);
        doc.font('Helvetica').fillColor(invoice.status === 'paid' ? 'green' : 'red').text(invoice.status.toUpperCase(), 440, 160);

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

        // If it's an installment invoice, show "Installment Payment"
        if (invoice.installment_id) {
            drawRow(`Installment #${invoice.installment_no} (Booking #${booking.booking_id})`, 1, invoice.amount, invoice.amount);
        } else {
            const planName = booking?.plan ? booking.plan.plan_name : 'Rental Plan';
            drawRow(`EV Rental - ${planName} (Booking #${booking?.booking_id})`, 1, invoice.amount, invoice.amount);
        }

        if (invoice.gst_amount > 0) {
            drawRow('GST', 1, invoice.gst_amount, invoice.gst_amount);
        }

        if (invoice.discount_amount > 0) {
            doc.text('Discount Applied', 70, currentY);
            doc.text('1', 320, currentY);
            doc.text(`-INR ${invoice.discount_amount.toFixed(2)}`, 400, currentY);
            doc.text(`-INR ${invoice.discount_amount.toFixed(2)}`, 480, currentY, { width: 60, align: 'right' });
            doc.moveTo(50, currentY + 20).lineTo(pageWidth - 50, currentY + 20).strokeColor('#EEEEEE').lineWidth(1).stroke();
            currentY += 40;
        }

        // 7. Grand Total Section
        const totalBoxTop = currentY + 20;
        doc.rect(380, totalBoxTop, 170, 40).fill('#F8F9FA');
        
        doc.font('Helvetica-Bold').fillColor('#333333').fontSize(14);
        doc.text('TOTAL PAID:', 395, totalBoxTop + 14);
        doc.fillColor('#10b981').text(`INR ${invoice.total_amount.toFixed(2)}`, 470, totalBoxTop + 14, { width: 70, align: 'right' });

        // 8. Footer
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
