const User = require('../models/userModel');
const WalletTransaction = require('../models/walletTransactionModel');

// @desc    Get user's wallet balance and history
// @route   GET /api/wallet/balance
// @access  Private/User
exports.getMyWallet = async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('wallet_balance');
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        const transactions = await WalletTransaction.find({ user: req.user.id }).sort('-createdAt');

        res.status(200).json({
            success: true,
            data: {
                balance: user.wallet_balance,
                transactions
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Add funds to own wallet (User Recharge Simulation)
// @route   POST /api/wallet/add
// @access  Private/User
exports.addMyFunds = async (req, res) => {
    try {
        const { amount } = req.body;
        const userId = req.user.id;

        if (!amount || amount <= 0) {
            return res.status(400).json({ success: false, message: 'Please provide a valid positive amount' });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        user.wallet_balance += Number(amount);
        await user.save();

        const transaction = await WalletTransaction.create({
            user: userId,
            amount: Number(amount),
            type: 'credit',
            description: 'Wallet Recharge',
            performed_by: 'user'
        });

        res.status(200).json({
            success: true,
            message: `Successfully recharged wallet with ₹${amount}`,
            data: {
                balance: user.wallet_balance,
                transaction
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Add funds to a user's wallet (Admin)
// @route   POST /api/wallet/admin/add
// @access  Private/Admin
exports.addFunds = async (req, res) => {
    try {
        const { userId, amount, description } = req.body;

        if (!userId || !amount || amount <= 0) {
            return res.status(400).json({ success: false, message: 'Please provide valid user ID and positive amount' });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        user.wallet_balance += Number(amount);
        await user.save();

        const transaction = await WalletTransaction.create({
            user: userId,
            amount: Number(amount),
            type: 'credit',
            description: description || 'Funds added by Admin',
            performed_by: 'admin'
        });

        res.status(200).json({
            success: true,
            message: `Successfully added ₹${amount} to user's wallet`,
            data: {
                balance: user.wallet_balance,
                transaction
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Deduct funds from a user's wallet (Admin)
// @route   POST /api/wallet/admin/deduct
// @access  Private/Admin
exports.deductFunds = async (req, res) => {
    try {
        const { userId, amount, description } = req.body;

        if (!userId || !amount || amount <= 0) {
            return res.status(400).json({ success: false, message: 'Please provide valid user ID and positive amount' });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        if (user.wallet_balance < amount) {
            return res.status(400).json({ success: false, message: 'Insufficient wallet balance' });
        }

        user.wallet_balance -= Number(amount);
        await user.save();

        const transaction = await WalletTransaction.create({
            user: userId,
            amount: Number(amount),
            type: 'debit',
            description: description || 'Funds deducted by Admin',
            performed_by: 'admin'
        });

        res.status(200).json({
            success: true,
            message: `Successfully deducted ₹${amount} from user's wallet`,
            data: {
                balance: user.wallet_balance,
                transaction
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
