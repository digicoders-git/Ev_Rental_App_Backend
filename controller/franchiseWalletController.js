const FranchiseStore = require('../models/franchiseStoreModel');
const FranchiseWithdrawal = require('../models/franchiseWithdrawalModel');
const FranchiseWalletTransaction = require('../models/franchiseWalletTransactionModel');
const User = require('../models/userModel');
const { sendNotification } = require('../utils/notificationHelper');
const { sendPushNotification } = require('../utils/fcmHelper');

// @desc    Get Franchise Wallet Balance & Transactions
// @route   GET /api/franchise-enquiry/wallet
// @access  Private (Franchise)
exports.getWalletDetails = async (req, res) => {
    try {
        const franchiseId = req.franchise._id;
        const franchise = await FranchiseStore.findById(franchiseId);
        
        if (!franchise) return res.status(404).json({ success: false, message: 'Franchise not found' });

        const transactions = await FranchiseWalletTransaction.find({ franchise: franchiseId })
            .populate('booking', 'booking_id')
            .sort({ createdAt: -1 });

        const withdrawnResult = await FranchiseWithdrawal.aggregate([
            { $match: { franchise: franchise._id, status: { $in: ['approved', 'released', 'completed'] } } },
            { $group: { _id: null, total: { $sum: '$amount' } } }
        ]);
        const totalWithdrawn = withdrawnResult.length > 0 ? withdrawnResult[0].total : 0;

        const pendingResult = await FranchiseWithdrawal.aggregate([
            { $match: { franchise: franchise._id, status: { $in: ['pending', 'processing'] } } },
            { $group: { _id: null, total: { $sum: '$amount' } } }
        ]);
        const pendingWithdrawn = pendingResult.length > 0 ? pendingResult[0].total : 0;

        const Booking = require('../models/bookingModel');
        const bookingsResult = await Booking.aggregate([
            { $match: { franchise: franchise._id, total_paid: { $gt: 0 } } },
            { $group: { _id: null, total: { $sum: '$total_paid' } } }
        ]);
        const totalGrossRevenue = bookingsResult.length > 0 ? Number(bookingsResult[0].total.toFixed(2)) : 0;

        const SERVICE_FEE_PERCENT = 8;
        // Service fee is exactly 8% of gross — this is the source of truth
        const serviceFee = Number((totalGrossRevenue * SERVICE_FEE_PERCENT / 100).toFixed(2));
        // Net revenue = gross - 8% service fee
        const totalNetRevenue = Number((totalGrossRevenue - serviceFee).toFixed(2));

        // Dynamically calculate the actual Available Balance
        // As per user request, pending withdrawals should NOT reduce the displayed available balance until approved by admin.
        // But we MUST check against (balance - pendingWithdrawn) when requesting a new withdrawal to prevent overdrawing.
        const calculatedBalance = totalNetRevenue - totalWithdrawn;
        const balance = Number((calculatedBalance > 0 ? calculatedBalance : 0).toFixed(2));

        // Auto-correct the franchise model cache if needed
        if (franchise.wallet_balance !== balance || franchise.total_gross_revenue !== totalGrossRevenue) {
            franchise.wallet_balance = balance;
            franchise.total_gross_revenue = totalGrossRevenue;
            await franchise.save();
        }

        res.status(200).json({
            success: true,
            data: {
                balance,
                totalGrossRevenue,
                serviceFee,
                serviceFeePercent: SERVICE_FEE_PERCENT,
                totalNetRevenue,
                totalWithdrawn: Number(totalWithdrawn.toFixed(2)),
                pendingWithdrawn: Number(pendingWithdrawn.toFixed(2)),
                transactions
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Request Withdrawal
// @route   POST /api/franchise-enquiry/wallet/withdraw
// @access  Private (Franchise)
exports.requestWithdrawal = async (req, res) => {
    try {
        const { amount } = req.body;
        const franchiseId = req.franchise._id;
        const franchise = await FranchiseStore.findById(franchiseId);

        if (!franchise) return res.status(404).json({ success: false, message: 'Franchise not found' });

        const pendingResult = await FranchiseWithdrawal.aggregate([
            { $match: { franchise: franchise._id, status: { $in: ['pending', 'processing'] } } },
            { $group: { _id: null, total: { $sum: '$amount' } } }
        ]);
        const pendingWithdrawn = pendingResult.length > 0 ? pendingResult[0].total : 0;
        
        const realAvailableBalance = (franchise.wallet_balance || 0) - pendingWithdrawn;

        if (amount > realAvailableBalance) {
            return res.status(400).json({ success: false, message: 'Insufficient available balance (You have pending withdrawal requests)' });
        }

        const service_fee_percentage = 8;
        // The requested amount is what gets deducted from the wallet (which already had the 8% removed)
        const net_amount = amount;
        const gross_amount = net_amount / (1 - (service_fee_percentage / 100));
        const service_fee_amount = gross_amount - net_amount;

        const withdrawal = await FranchiseWithdrawal.create({
            franchise: franchiseId,
            amount: net_amount, // Store net as the main amount so deductions work correctly
            service_fee_percentage,
            service_fee_amount,
            net_amount
        });

        // Payment is NOT deducted immediately. It will be deducted when admin approves it.
        // as per user requirement.

        const admins = await User.find({ role: 'admin' });
        for (const admin of admins) {
            await sendNotification({
                recipient: admin._id,
                recipient_role: 'admin',
                title: 'New Withdrawal Request',
                message: `Franchise ${franchise.store_name} has requested a withdrawal of ₹${amount}.`,
                type: 'payment',
                related_id: withdrawal._id
            });
            if (admin.fcm_token) {
                await sendPushNotification(admin.fcm_token, 'New Withdrawal Request', `Franchise ${franchise.store_name} has requested a withdrawal of ₹${amount}.`, { type: 'payment' });
            }
        }

        res.status(201).json({
            success: true,
            message: 'Withdrawal requested successfully',
            data: withdrawal
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Get Franchise's Withdrawal Requests
// @route   GET /api/franchise-enquiry/wallet/withdrawals
// @access  Private (Franchise)
exports.getWithdrawals = async (req, res) => {
    try {
        const withdrawals = await FranchiseWithdrawal.find({ franchise: req.franchise._id }).sort({ createdAt: -1 });
        res.status(200).json({ success: true, data: withdrawals });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Get All Withdrawal Requests (Admin)
// @route   GET /api/franchise-enquiry/admin/withdrawals
// @access  Private (Admin)
exports.getAllWithdrawals = async (req, res) => {
    try {
        const withdrawals = await FranchiseWithdrawal.find()
            .populate('franchise', 'store_name owner_name mobile email')
            .sort({ createdAt: -1 });
        res.status(200).json({ success: true, data: withdrawals });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Approve Withdrawal (Admin)
// @route   PUT /api/franchise-enquiry/admin/withdrawals/:id/approve
// @access  Private (Admin)
exports.approveWithdrawal = async (req, res) => {
    try {
        const { id } = req.params;
        const { admin_note } = req.body;
        const withdrawal = await FranchiseWithdrawal.findById(id);

        if (!withdrawal) return res.status(404).json({ success: false, message: 'Withdrawal not found' });
        if (withdrawal.status !== 'pending') return res.status(400).json({ success: false, message: 'Only pending requests can be approved' });

        const franchise = await FranchiseStore.findById(withdrawal.franchise);
        
        const existingTxn = await FranchiseWalletTransaction.findOne({
            franchise: franchise._id,
            description: `Withdrawal Requested (${withdrawal.withdrawal_id})`
        });

        if (!existingTxn) {
            // Backward compatibility for old pending requests
            if (franchise.wallet_balance < withdrawal.amount) {
                return res.status(400).json({ success: false, message: 'Franchise does not have enough balance' });
            }
            // Deduct from wallet
            franchise.wallet_balance -= withdrawal.amount;
            await franchise.save();

            // Add debit transaction
            await FranchiseWalletTransaction.create({
                franchise: franchise._id,
                amount: withdrawal.amount,
                type: 'debit',
                description: `Withdrawal Approved (${withdrawal.withdrawal_id})`
            });
        }

        // Update request status
        withdrawal.status = 'approved';
        withdrawal.admin_note = admin_note || '';
        
        if (req.file) {
            withdrawal.payment_proof = `/uploads/${req.file.filename}`;
        }
        await withdrawal.save();

        // Emit real-time event to franchise
        const io = req.app.get('io');
        if (io) {
            io.to(franchise._id.toString()).emit('withdrawal_status_updated', {
                withdrawalId: withdrawal._id,
                status: 'approved',
                admin_note: withdrawal.admin_note,
                payment_proof: withdrawal.payment_proof || null
            });
        }

        await sendNotification({
            recipient: franchise._id,
            recipient_role: 'franchise',
            title: 'Withdrawal Approved',
            message: `Your withdrawal request for ₹${withdrawal.amount} has been approved.`,
            type: 'payment',
            related_id: withdrawal._id
        });
        if (franchise.fcm_token) {
            await sendPushNotification(franchise.fcm_token, 'Withdrawal Approved', `Your withdrawal request for ₹${withdrawal.amount} has been approved.`, { type: 'payment' });
        }

        res.status(200).json({ success: true, message: 'Withdrawal approved successfully', data: withdrawal });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Reject Withdrawal (Admin)
// @route   PUT /api/franchise-enquiry/admin/withdrawals/:id/reject
// @access  Private (Admin)
exports.rejectWithdrawal = async (req, res) => {
    try {
        const { id } = req.params;
        const { admin_note } = req.body;
        const withdrawal = await FranchiseWithdrawal.findById(id);

        if (!withdrawal) return res.status(404).json({ success: false, message: 'Withdrawal not found' });
        if (withdrawal.status !== 'pending') return res.status(400).json({ success: false, message: 'Only pending requests can be rejected' });

        withdrawal.status = 'rejected';
        withdrawal.admin_note = admin_note || '';
        await withdrawal.save();

        const franchise = await FranchiseStore.findById(withdrawal.franchise);

        // Emit real-time event to franchise
        const io = req.app.get('io');
        if (io && franchise) {
            io.to(franchise._id.toString()).emit('withdrawal_status_updated', {
                withdrawalId: withdrawal._id,
                status: 'rejected',
                admin_note: withdrawal.admin_note
            });
        }

        // Refund if it was deducted on request
        if (franchise) {
            const existingTxn = await FranchiseWalletTransaction.findOne({
                franchise: franchise._id,
                description: `Withdrawal Requested (${withdrawal.withdrawal_id})`
            });

            if (existingTxn) {
                franchise.wallet_balance += withdrawal.amount;
                await franchise.save();

                await FranchiseWalletTransaction.create({
                    franchise: franchise._id,
                    amount: withdrawal.amount,
                    type: 'credit',
                    description: `Withdrawal Rejected Refund (${withdrawal.withdrawal_id})`
                });
            }
        }
        if (franchise) {
            await sendNotification({
                recipient: franchise._id,
                recipient_role: 'franchise',
                title: 'Withdrawal Rejected',
                message: `Your withdrawal request for ₹${withdrawal.amount} has been rejected. Reason: ${withdrawal.admin_note}`,
                type: 'payment',
                related_id: withdrawal._id
            });
            if (franchise.fcm_token) {
                await sendPushNotification(franchise.fcm_token, 'Withdrawal Rejected', `Your withdrawal request for ₹${withdrawal.amount} has been rejected.`, { type: 'payment' });
            }
        }

        res.status(200).json({ success: true, message: 'Withdrawal rejected', data: withdrawal });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Upload Agreement (Admin)
// @route   PUT /api/franchise-enquiry/admin/stores/:id/agreement
// @access  Private (Admin)
exports.uploadAgreement = async (req, res) => {
    try {
        const franchise = await FranchiseStore.findById(req.params.id);
        if (!franchise) return res.status(404).json({ success: false, message: 'Franchise not found' });

        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No file uploaded' });
        }

        franchise.admin_agreement_document = `/uploads/${req.file.filename}`;
        await franchise.save();

        res.status(200).json({ success: true, message: 'Admin agreement uploaded successfully', data: franchise });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Upload Agreement (Franchise)
// @route   PUT /api/franchise-enquiry/store/agreement
// @access  Private (Franchise)
exports.uploadFranchiseAgreement = async (req, res) => {
    try {
        const franchiseId = req.franchise.id;
        const franchise = await FranchiseStore.findById(franchiseId);
        if (!franchise) return res.status(404).json({ success: false, message: 'Franchise not found' });

        if (franchise.franchise_agreement_document || franchise.agreement_document || franchise.admin_agreement_document) {
            return res.status(400).json({ success: false, message: 'Agreement has already been uploaded and cannot be modified or replaced.' });
        }

        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No file uploaded' });
        }

        franchise.franchise_agreement_document = `/uploads/${req.file.filename}`;
        await franchise.save();

        res.status(200).json({ success: true, message: 'Franchise agreement uploaded successfully', data: franchise });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Admin manually releases funds for a franchise
// @route   POST /api/franchise-enquiry/admin/withdrawals/release
// @access  Private (Admin)
exports.releaseFundsAdmin = async (req, res) => {
    try {
        const { franchiseId, amount } = req.body;
        const franchise = await FranchiseStore.findById(franchiseId);

        if (!franchise) return res.status(404).json({ success: false, message: 'Franchise not found' });

        const withdrawAmount = amount ? Number(amount) : franchise.wallet_balance;

        if (withdrawAmount <= 0) {
            return res.status(400).json({ success: false, message: 'Wallet balance is empty or invalid amount' });
        }

        if (withdrawAmount > franchise.wallet_balance) {
            return res.status(400).json({ success: false, message: 'Insufficient wallet balance' });
        }

        const service_fee_percentage = 8;
        const net_amount = withdrawAmount;
        const gross_amount = net_amount / (1 - (service_fee_percentage / 100));
        const service_fee_amount = gross_amount - net_amount;

        const withdrawal = await FranchiseWithdrawal.create({
            franchise: franchiseId,
            amount: net_amount,
            service_fee_percentage,
            service_fee_amount,
            net_amount,
            status: 'processing'
        });

        // Deduct from wallet balance immediately
        franchise.wallet_balance -= withdrawAmount;
        await franchise.save();

        await FranchiseWalletTransaction.create({
            franchise: franchiseId,
            amount: withdrawAmount,
            type: 'debit',
            description: `Settlement Initiated (${withdrawal.withdrawal_id})`
        });

        await sendNotification({
            recipient: franchise._id,
            recipient_role: 'franchise',
            title: 'Settlement Initiated',
            message: `A settlement of ₹${withdrawAmount} has been initiated and is processing.`,
            type: 'payment',
            related_id: withdrawal._id
        });

        res.status(201).json({ success: true, message: 'Funds released successfully', data: withdrawal });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Update Withdrawal Status (Admin)
// @route   PUT /api/franchise-enquiry/admin/withdrawals/:id/status
// @access  Private (Admin)
exports.updateWithdrawalStatusAdmin = async (req, res) => {
    try {
        const { id } = req.params;
        const { status, admin_note } = req.body;
        const withdrawal = await FranchiseWithdrawal.findById(id);

        if (!withdrawal) return res.status(404).json({ success: false, message: 'Withdrawal not found' });
        
        const validStatuses = ['pending', 'processing', 'released', 'failed', 'approved', 'rejected'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ success: false, message: 'Invalid status' });
        }

        const oldStatus = withdrawal.status;
        const franchise = await FranchiseStore.findById(withdrawal.franchise);

        const isApprovedState = ['approved', 'released'].includes(status);
        const wasNotApprovedState = !['approved', 'released'].includes(oldStatus);

        const isFailedState = ['failed', 'rejected'].includes(status);
        const wasApprovedState = ['approved', 'released'].includes(oldStatus);

        // If moving to an approved state, deduct the balance
        if (isApprovedState && wasNotApprovedState && franchise) {
            if (franchise.wallet_balance < withdrawal.amount) {
                return res.status(400).json({ success: false, message: 'Franchise does not have enough balance for this withdrawal' });
            }
            franchise.wallet_balance -= withdrawal.amount;
            await franchise.save();

            await FranchiseWalletTransaction.create({
                franchise: franchise._id,
                amount: withdrawal.amount,
                type: 'debit',
                description: `Withdrawal Approved (${withdrawal.withdrawal_id})`
            });
        }

        // If moving from an approved state back to a failed state, refund the balance
        if (isFailedState && wasApprovedState && franchise) {
            franchise.wallet_balance += withdrawal.amount;
            await franchise.save();

            await FranchiseWalletTransaction.create({
                franchise: franchise._id,
                amount: withdrawal.amount,
                type: 'credit',
                description: `Settlement Failed Refund (${withdrawal.withdrawal_id})`
            });
        }

        withdrawal.status = status;
        withdrawal.admin_note = admin_note || withdrawal.admin_note;

        if (req.file) {
            withdrawal.payment_proof = `/uploads/${req.file.filename}`;
        }

        await withdrawal.save();

        // Emit real-time event to franchise
        const io = req.app.get('io');
        if (io && franchise) {
            io.to(franchise._id.toString()).emit('withdrawal_status_updated', {
                withdrawalId: withdrawal._id,
                status: withdrawal.status,
                admin_note: withdrawal.admin_note,
                payment_proof: withdrawal.payment_proof || null
            });
        }

        if (franchise) {
            let title = 'Settlement Status Updated';
            let message = `Your settlement status for ₹${withdrawal.amount} is now ${status}.`;
            if (status === 'released' || status === 'approved') {
                title = 'Payment Released';
                message = `Your payment of ₹${withdrawal.amount} has been successfully released.`;
            } else if (status === 'failed' || status === 'rejected') {
                title = 'Payment Failed';
                message = `Your payment of ₹${withdrawal.amount} has failed and was refunded to your wallet.`;
            }

            await sendNotification({
                recipient: franchise._id,
                recipient_role: 'franchise',
                title,
                message,
                type: 'payment',
                related_id: withdrawal._id
            });
        }

        res.status(200).json({ success: true, message: 'Withdrawal status updated', data: withdrawal });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
