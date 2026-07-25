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

        // Calculate metrics


        const withdrawnResult = await FranchiseWithdrawal.aggregate([
            { $match: { franchise: franchise._id, status: 'approved' } },
            { $group: { _id: null, total: { $sum: '$amount' } } }
        ]);
        const totalWithdrawn = withdrawnResult.length > 0 ? withdrawnResult[0].total : 0;

        const pendingResult = await FranchiseWithdrawal.aggregate([
            { $match: { franchise: franchise._id, status: 'pending' } },
            { $group: { _id: null, total: { $sum: '$amount' } } }
        ]);
        const pendingWithdrawn = pendingResult.length > 0 ? pendingResult[0].total : 0;

        res.status(200).json({
            success: true,
            data: {
                balance: franchise.wallet_balance || 0,
                totalRevenue: (franchise.wallet_balance || 0) + totalWithdrawn + pendingWithdrawn,
                totalWithdrawn,
                pendingWithdrawn,
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

        if (amount > (franchise.wallet_balance || 0)) {
            return res.status(400).json({ success: false, message: 'Insufficient wallet balance' });
        }

        const withdrawal = await FranchiseWithdrawal.create({
            franchise: franchiseId,
            amount
        });

        // Deduct from wallet balance immediately
        franchise.wallet_balance -= amount;
        await franchise.save();

        await FranchiseWalletTransaction.create({
            franchise: franchiseId,
            amount: amount,
            type: 'debit',
            description: `Withdrawal Requested (${withdrawal.withdrawal_id})`
        });

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

        const withdrawal = await FranchiseWithdrawal.create({
            franchise: franchiseId,
            amount: withdrawAmount,
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
        withdrawal.status = status;
        withdrawal.admin_note = admin_note || withdrawal.admin_note;

        if (req.file) {
            withdrawal.payment_proof = `/uploads/${req.file.filename}`;
        }

        await withdrawal.save();

        const franchise = await FranchiseStore.findById(withdrawal.franchise);

        // Handle refund if moving to a failed/rejected state from a previously deducted state
        const isFailedState = ['failed', 'rejected'].includes(status);
        const wasNotFailedState = !['failed', 'rejected'].includes(oldStatus);

        if (isFailedState && wasNotFailedState && franchise) {
            franchise.wallet_balance += withdrawal.amount;
            await franchise.save();

            await FranchiseWalletTransaction.create({
                franchise: franchise._id,
                amount: withdrawal.amount,
                type: 'credit',
                description: `Settlement Failed Refund (${withdrawal.withdrawal_id})`
            });
        }
        
        // Handle deducting if moving from failed to a valid state
        if (!isFailedState && !wasNotFailedState && franchise) {
             if (franchise.wallet_balance >= withdrawal.amount) {
                 franchise.wallet_balance -= withdrawal.amount;
                 await franchise.save();

                 await FranchiseWalletTransaction.create({
                     franchise: franchise._id,
                     amount: withdrawal.amount,
                     type: 'debit',
                     description: `Settlement Re-initiated (${withdrawal.withdrawal_id})`
                 });
             } else {
                 return res.status(400).json({ success: false, message: 'Franchise does not have enough balance to retry this settlement' });
             }
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
