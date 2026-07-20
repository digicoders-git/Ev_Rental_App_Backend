const fs = require('fs');
const path = 'd:/Desktop/evRental/evRental/EV_Rental/backend/controller/bookingController.js';
let code = fs.readFileSync(path, 'utf8');

if (!code.includes('const { creditFranchiseWallet }')) {
    code = code.replace(
        "const Booking = require('../models/bookingModel');",
        "const Booking = require('../models/bookingModel');\nconst { creditFranchiseWallet } = require('../utils/franchiseWalletHelper');"
    );
}

// markPaymentPaid
code = code.replace(
    /booking\.total_paid \+= payAmount;\s+if \(payment_method\) booking\.payment_method = payment_method;\s+if \(transaction_id\) booking\.transaction_id = transaction_id;([\s\S]*?)await booking\.save\(\);/,
    `booking.total_paid += payAmount;
        if (payment_method) booking.payment_method = payment_method;
        if (transaction_id) booking.transaction_id = transaction_id;$1await booking.save();
        await creditFranchiseWallet(booking._id, payAmount);`
);

// payInstallment
code = code.replace(
    /installment\.status = 'paid';\s+booking\.total_paid \+= installment\.amount;([\s\S]*?)await booking\.save\(\);/,
    `installment.status = 'paid';
        booking.total_paid += installment.amount;$1await booking.save();
        await creditFranchiseWallet(booking._id, installment.amount);`
);

// verifyPayment
code = code.replace(
    /const amountPaid = invoice\?\.amount || \(\(payment_intent_data\?\.amount\)\/100\) || \(rzp_payload\?\.payment\?\.entity\?\.amount \/ 100\);([\s\S]*?)booking\.total_paid \+= amountPaid;([\s\S]*?)await booking\.save\(\);/,
    `const amountPaid = invoice?.amount || ((payment_intent_data?.amount)/100) || (rzp_payload?.payment?.entity?.amount / 100);$1booking.total_paid += amountPaid;$2await booking.save();
            await creditFranchiseWallet(booking._id, amountPaid);`
);

fs.writeFileSync(path, code);
console.log('Success');
