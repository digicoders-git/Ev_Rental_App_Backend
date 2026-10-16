const Offer = require('../models/offerModel');
const User = require('../models/userModel');

// @desc    Create new Offer / Gift Card
// @route   POST /api/offers
// @access  Private/Admin
exports.createOffer = async (req, res) => {
    try {
        const data = { ...req.body };
        if (data.is_one_time) {
            data.usage_limit = 1;
        }
        const offer = await Offer.create(data);
        res.status(201).json({ success: true, data: offer });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

// @desc    Get all Offers (Filters out hidden gift cards for mobile app unless ?all=true)
// @route   GET /api/offers
// @access  Public
exports.getAllOffers = async (req, res) => {
    try {
        const query = {};
        // If not requested by admin with ?all=true, hide private gift cards from public app
        if (req.query.all !== 'true' && req.query.include_hidden !== 'true') {
            query.is_hidden = { $ne: true };
        }
        const offers = await Offer.find(query).sort('-createdAt');
        res.status(200).json({ success: true, count: offers.length, data: offers });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Get single Offer
// @route   GET /api/offers/:id
// @access  Public
exports.getOfferById = async (req, res) => {
    try {
        const offer = await Offer.findById(req.params.id);
        if (!offer) {
            return res.status(404).json({ success: false, message: 'Offer not found' });
        }
        res.status(200).json({ success: true, data: offer });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Update Offer
// @route   PUT /api/offers/:id
// @access  Private/Admin
exports.updateOffer = async (req, res) => {
    try {
        const data = { ...req.body };
        if (data.is_one_time) {
            data.usage_limit = 1;
        }
        const offer = await Offer.findByIdAndUpdate(req.params.id, data, {
            new: true,
            runValidators: true
        });
        if (!offer) {
            return res.status(404).json({ success: false, message: 'Offer not found' });
        }
        res.status(200).json({ success: true, data: offer });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

// @desc    Delete Offer
// @route   DELETE /api/offers/:id
// @access  Private/Admin
exports.deleteOffer = async (req, res) => {
    try {
        const offer = await Offer.findById(req.params.id);
        if (!offer) {
            return res.status(404).json({ success: false, message: 'Offer not found' });
        }
        await offer.deleteOne();
        res.status(200).json({ success: true, message: 'Offer deleted successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Validate a Coupon Code or Gift Card
// @route   POST /api/offers/validate
// @access  Private
exports.validateCoupon = async (req, res) => {
    try {
        const { code, amount, vehicle_id } = req.body;
        
        if (!code) {
            return res.status(400).json({ success: false, message: 'Please provide a coupon or gift card code' });
        }

        const offer = await Offer.findOne({ 
            coupon_code: code.trim().toUpperCase(),
            status: 'active',
            start_date: { $lte: new Date() },
            end_date: { $gte: new Date() }
        });

        if (!offer) {
            return res.status(404).json({ success: false, message: 'Coupon / gift card is invalid or expired' });
        }

        // Check one-time use or usage limit
        if ((offer.usage_limit > 0 && offer.usage_count >= offer.usage_limit) || (offer.is_one_time && offer.usage_count >= 1)) {
            return res.status(400).json({ success: false, message: 'This coupon/gift card has already been used' });
        }

        // Check if user already used this coupon
        if (req.user && offer.used_by && offer.used_by.some(uid => uid.toString() === req.user._id.toString())) {
            return res.status(400).json({ success: false, message: 'You have already redeemed this coupon/gift card' });
        }

        // Check minimum amount
        if (amount < offer.min_booking_amount) {
            return res.status(400).json({ success: false, message: `Minimum booking of INR ${offer.min_booking_amount} required` });
        }

        // Check if restricted to certain vehicles
        if (offer.applicable_vehicle_ids && offer.applicable_vehicle_ids.length > 0 && vehicle_id) {
            if (!offer.applicable_vehicle_ids.includes(vehicle_id)) {
                return res.status(400).json({ success: false, message: 'Coupon not applicable for this vehicle' });
            }
        }

        // Calculate discount
        let discount = 0;
        if (offer.offer_type === 'flat_discount') {
            discount = offer.discount_value;
        } else {
            discount = (amount * offer.discount_value) / 100;
            if (offer.max_discount_amount && discount > offer.max_discount_amount) {
                discount = offer.max_discount_amount;
            }
        }

        res.status(200).json({ 
            success: true, 
            message: 'Coupon applied successfully', 
            data: {
                offer_id: offer._id,
                coupon_code: offer.coupon_code,
                discount_amount: discount,
                final_amount: Math.max(0, amount - discount),
                title: offer.title,
                is_one_time: offer.is_one_time,
                is_hidden: offer.is_hidden
            } 
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Toggle Offer Status
// @route   PATCH /api/offers/:id/toggle
// @access  Private/Admin
exports.toggleOfferStatus = async (req, res) => {
    try {
        const offer = await Offer.findById(req.params.id);
        if (!offer) {
            return res.status(404).json({ success: false, message: 'Offer not found' });
        }

        offer.status = offer.status === 'active' ? 'inactive' : 'active';
        await offer.save();

        res.status(200).json({ success: true, message: `Offer ${offer.status}`, data: offer });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Claim an Offer
// @route   POST /api/offers/claim
// @access  Private
exports.claimOffer = async (req, res) => {
    try {
        const { offerId } = req.body;
        if (!offerId) {
            return res.status(400).json({ success: false, message: 'Please provide an offerId' });
        }

        const offer = await Offer.findById(offerId);
        if (!offer) {
            return res.status(404).json({ success: false, message: 'Offer not found' });
        }

        if (offer.status !== 'active') {
            return res.status(400).json({ success: false, message: 'Offer is not active' });
        }

        const user = await User.findById(req.user._id);
        
        // Check if already claimed
        const alreadyClaimed = user.claimed_offers.find(
            (c) => c.offer.toString() === offerId.toString()
        );

        if (alreadyClaimed) {
            return res.status(400).json({ success: false, message: 'You have already claimed this offer' });
        }

        user.claimed_offers.push({ offer: offerId, status: 'claimed' });
        await user.save();

        res.status(200).json({ success: true, message: 'Offer claimed successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Get My Claimed Offers
// @route   GET /api/offers/my-claims
// @access  Private
exports.getMyClaimedOffers = async (req, res) => {
    try {
        const user = await User.findById(req.user._id).populate({
            path: 'claimed_offers.offer',
            model: 'Offer'
        });

        res.status(200).json({ success: true, count: user.claimed_offers.length, data: user.claimed_offers });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
