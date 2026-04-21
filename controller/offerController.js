const Offer = require('../models/offerModel');

// @desc    Create new Offer
// @route   POST /api/offers
// @access  Private/Admin
exports.createOffer = async (req, res) => {
    try {
        const offer = await Offer.create(req.body);
        res.status(201).json({ success: true, data: offer });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

// @desc    Get all Offers
// @route   GET /api/offers
// @access  Public
exports.getAllOffers = async (req, res) => {
    try {
        const offers = await Offer.find().sort('-createdAt');
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
        const offer = await Offer.findByIdAndUpdate(req.params.id, req.body, {
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

// @desc    Validate a Coupon Code
// @route   POST /api/offers/validate
// @access  Private
exports.validateCoupon = async (req, res) => {
    try {
        const { code, amount, vehicle_id } = req.body;
        
        if (!code) {
            return res.status(400).json({ success: false, message: 'Please provide a coupon code' });
        }

        const offer = await Offer.findOne({ 
            coupon_code: code.toUpperCase(),
            status: 'active',
            start_date: { $lte: new Date() },
            end_date: { $gte: new Date() }
        });

        if (!offer) {
            return res.status(404).json({ success: false, message: 'Coupon invalid or expired' });
        }

        // Check usage limit
        if (offer.usage_limit > 0 && offer.usage_count >= offer.usage_limit) {
            return res.status(400).json({ success: false, message: 'Coupon usage limit reached' });
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
                discount_amount: discount,
                final_amount: amount - discount,
                title: offer.title
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
