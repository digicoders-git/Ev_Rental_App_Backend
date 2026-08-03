
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
                amount: booking.total_amount,
                gst_amount: booking.gst_amount,
                discount_amount: booking.discount_amount,
                total_amount: booking.grand_total,
                status: booking.payment_status === 'paid' ? 'paid' : 'unpaid'
            });
        } else {
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
    } catch (err) {
        console.error('Error syncing master invoice:', err);
    }
};
