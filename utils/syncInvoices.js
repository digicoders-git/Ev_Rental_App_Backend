const mongoose = require('mongoose');
const dotenv = require('dotenv');
const Booking = require('../models/bookingModel');
const Invoice = require('../models/invoiceModel');
const connectDB = require('../config/db');

dotenv.config({ path: '.env' });

const syncInvoices = async () => {
    try {
        await connectDB();
        console.log('Database connected. Starting invoice sync...');

        const bookings = await Booking.find({});
        let createdCount = 0;

        for (const booking of bookings) {
            // Check if Master Invoice exists
            let masterInvoice = await Invoice.findOne({ booking: booking._id, installment_id: null });

            if (!masterInvoice) {
                const count = await Invoice.countDocuments();
                const invNumber = `INV-${new Date().getFullYear()}-${String(count + 1).padStart(5, '0')}`;
                
                const isInstallments = booking.payment_method === 'installments';
                masterInvoice = await Invoice.create({
                    invoice_number: invNumber,
                    booking: booking._id,
                    user: booking.user,
                    franchise: booking.franchise || null,
                    amount: isInstallments ? booking.total_paid : booking.total_amount,
                    gst_amount: isInstallments ? 0 : booking.gst_amount,
                    discount_amount: isInstallments ? 0 : booking.discount_amount,
                    total_amount: isInstallments ? booking.total_paid : booking.grand_total,
                    status: booking.payment_status === 'paid' ? 'paid' : (isInstallments ? 'paid' : 'unpaid'),
                    createdAt: booking.createdAt,
                    issue_date: booking.createdAt
                });
                createdCount++;
            }

            // Sync child invoices for paid installments
            if (booking.payment_method === 'installments' && booking.payment_installments && booking.payment_installments.length > 0) {
                for (const inst of booking.payment_installments) {
                    if (inst.status === 'paid') {
                        let childInvoice = await Invoice.findOne({ booking: booking._id, installment_id: inst._id });
                        if (!childInvoice) {
                            const count = await Invoice.countDocuments();
                            const invNumber = `INV-${new Date().getFullYear()}-${String(count + 1).padStart(5, '0')}`;
                            await Invoice.create({
                                invoice_number: invNumber,
                                booking: booking._id,
                                user: booking.user,
                                franchise: booking.franchise || null,
                                installment_id: inst._id,
                                installment_no: inst.installment_number,
                                amount: inst.amount - (inst.amount * 5 / 105), // Reverse calculate basic rent
                                gst_amount: inst.amount * 5 / 105,
                                discount_amount: 0,
                                total_amount: inst.amount,
                                status: 'paid',
                                createdAt: inst.paid_at || booking.createdAt,
                                issue_date: inst.paid_at || booking.createdAt
                            });
                            createdCount++;
                        }
                    }
                }
            }
        }

        console.log(`Invoice sync completed. ${createdCount} invoices generated.`);
        process.exit();
    } catch (error) {
        console.error('Error during sync:', error);
        process.exit(1);
    }
};

syncInvoices();
