const Support = require('../models/supportModel');
const Booking = require('../models/bookingModel');
const Vehicle = require('../models/vehicleModel');
const FranchiseStore = require('../models/franchiseStoreModel');
const { sendNotification } = require('../utils/notificationHelper');

// Helper to enrich ticket list with accurate vehicle registration numbers and franchise store names
const enrichTickets = async (tickets) => {
    const results = [];
    for (const t of tickets) {
        let ticketObj = t.toObject ? t.toObject() : { ...t };

        let vehicleNumber = ticketObj.vehicle?.registration_number || ticketObj.booking?.vehicle?.registration_number || '';
        let franchiseName = ticketObj.franchise?.store_name || ticketObj.franchise?.name || ticketObj.franchise?.city || 
                            ticketObj.booking?.franchise?.store_name || ticketObj.booking?.franchise?.city || '';
        let franchiseId = ticketObj.franchise?._id?.toString() || ticketObj.franchise?.toString() || 
                          ticketObj.booking?.franchise?._id?.toString() || ticketObj.booking?.franchise?.toString() || '';

        // If missing vehicle or franchise info, search latest booking for this user
        if ((!vehicleNumber || !franchiseName || !franchiseId) && ticketObj.user) {
            const userId = ticketObj.user._id || ticketObj.user;
            const userBooking = await Booking.findOne({ user: userId }).sort('-createdAt').populate('vehicle franchise');
            if (userBooking) {
                if (!vehicleNumber && userBooking.vehicle) {
                    vehicleNumber = userBooking.vehicle.registration_number || '';
                }
                if (!franchiseId && userBooking.franchise) {
                    franchiseId = userBooking.franchise._id?.toString() || userBooking.franchise.toString() || '';
                    franchiseName = userBooking.franchise.store_name || userBooking.franchise.name || userBooking.franchise.city || '';
                }
            }
        }

        if (!franchiseName && franchiseId) {
            try {
                const storeDoc = await FranchiseStore.findById(franchiseId);
                if (storeDoc) franchiseName = storeDoc.store_name || storeDoc.city || 'Franchise';
            } catch (e) {}
        }

        ticketObj.vehicle_number = vehicleNumber || 'N/A';
        ticketObj.franchise_name = franchiseName || 'Direct / Super Admin';
        ticketObj.franchise_id = franchiseId || null;

        results.push(ticketObj);
    }
    return results;
};

// @desc    Create a new support ticket
// @route   POST /api/support/ticket
// @access  Private
exports.createTicket = async (req, res) => {
    try {
        const { category, subject, description, priority, booking } = req.body;

        let attachmentFiles = [];
        if (req.files && req.files.length > 0) {
            attachmentFiles = req.files.map(file => `/uploads/support/${file.filename}`);
        }

        let targetBooking = booking || null;
        let targetVehicle = null;
        let targetFranchise = req.franchise ? req.franchise.id : null;

        if (req.user) {
            let userBooking = null;
            if (targetBooking) {
                userBooking = await Booking.findById(targetBooking).populate('vehicle franchise');
            }
            if (!userBooking) {
                userBooking = await Booking.findOne({ user: req.user.id, status: { $in: ['active', 'confirmed', 'completed'] } }).sort('-createdAt').populate('vehicle franchise');
            }
            if (!userBooking) {
                userBooking = await Booking.findOne({ user: req.user.id }).sort('-createdAt').populate('vehicle franchise');
            }
            if (userBooking) {
                targetBooking = userBooking._id;
                targetVehicle = userBooking.vehicle ? (userBooking.vehicle._id || userBooking.vehicle) : null;
                targetFranchise = userBooking.franchise ? (userBooking.franchise._id || userBooking.franchise) : (userBooking.vehicle ? userBooking.vehicle.franchise : null);
            } else {
                // Try to find if user is assigned to any vehicle
                const assignedVeh = await Vehicle.findOne({ current_driver: req.user.id });
                if (assignedVeh) {
                    targetVehicle = assignedVeh._id;
                    targetFranchise = assignedVeh.franchise || null;
                }
            }
        }

        const ticket = await Support.create({
            user: req.user ? req.user.id : null,
            franchise: targetFranchise,
            vehicle: targetVehicle,
            category,
            subject,
            description: description || req.body.message || '',
            priority,
            booking: targetBooking,
            attachments: attachmentFiles
        });

        // Notify Admin
        await sendNotification({
            title: 'New Complaint/Ticket',
            message: `New ${category} ticket #${ticket.ticket_id} created.`,
            type: 'enquiry',
            related_id: ticket._id
        });

        res.status(201).json({
            success: true,
            message: 'Support ticket created successfully',
            data: ticket
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Get logged in user's tickets
// @route   GET /api/support/my-tickets
// @access  Private
exports.getMyTickets = async (req, res) => {
    try {
        const query = {};
        if (req.user) query.user = req.user.id;
        else if (req.franchise) query.franchise = req.franchise.id;
        else return res.status(401).json({ success: false, message: 'Not authorized' });

        const tickets = await Support.find(query)
            .populate('user', 'name mobile email')
            .populate('franchise', 'store_name owner_name city')
            .populate('vehicle', 'registration_number vehicle_name')
            .populate({
                path: 'booking',
                populate: [
                    { path: 'vehicle', select: 'registration_number' },
                    { path: 'franchise', select: 'store_name city' }
                ]
            })
            .sort('-createdAt');

        const enrichedTickets = await enrichTickets(tickets);
        res.status(200).json({ success: true, count: enrichedTickets.length, data: enrichedTickets });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Get tickets for a franchise's drivers/assigned vehicles
// @route   GET /api/support/franchise/tickets
// @access  Private/Franchise
exports.getFranchiseTickets = async (req, res) => {
    try {
        const storeId = req.franchise ? req.franchise.id : null;
        if (!storeId) {
            return res.status(401).json({ success: false, message: 'Not authorized as franchise' });
        }

        // Find all bookings and vehicles for this franchise to capture any relevant users or tickets
        const franchiseBookings = await Booking.find({ franchise: storeId });
        const userIds = [...new Set(franchiseBookings.map(b => b.user))];
        const bookingIds = franchiseBookings.map(b => b._id);

        const franchiseVehicles = await Vehicle.find({ franchise: storeId });
        const vehicleIds = franchiseVehicles.map(v => v._id);

        // Fetch candidates
        const tickets = await Support.find({
            $or: [
                { franchise: storeId },
                { vehicle: { $in: vehicleIds } },
                { booking: { $in: bookingIds } },
                { user: { $in: userIds } }
            ]
        })
            .populate('user', 'name mobile email')
            .populate('franchise', 'store_name owner_name city')
            .populate('vehicle', 'registration_number vehicle_name')
            .populate({
                path: 'booking',
                populate: [
                    { path: 'vehicle', select: 'registration_number' },
                    { path: 'franchise', select: 'store_name city' }
                ]
            })
            .sort('-createdAt');

        const enrichedTickets = await enrichTickets(tickets);
        
        // Filter strictly to only show tickets matching this franchise ID (or where the franchise user themselves submitted)
        const filteredTickets = enrichedTickets.filter(t => 
            (t.franchise_id && t.franchise_id.toString() === storeId.toString()) ||
            (t.franchise && (t.franchise._id || t.franchise).toString() === storeId.toString())
        );

        res.status(200).json({ success: true, count: filteredTickets.length, data: filteredTickets });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Get all tickets (Admin only)
// @route   GET /api/support/admin/all
// @access  Private/Admin
exports.getAllTickets = async (req, res) => {
    try {
        const tickets = await Support.find()
            .populate('user', 'name mobile email')
            .populate('franchise', 'store_name owner_name city')
            .populate('vehicle', 'registration_number vehicle_name')
            .populate({
                path: 'booking',
                populate: [
                    { path: 'vehicle', select: 'registration_number' },
                    { path: 'franchise', select: 'store_name city' }
                ]
            })
            .sort('-createdAt');

        const enrichedTickets = await enrichTickets(tickets);
        res.status(200).json({ success: true, count: enrichedTickets.length, data: enrichedTickets });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Update ticket status and reply (Admin only)
// @route   PUT /api/support/admin/ticket/:id
// @access  Private/Admin
exports.updateTicket = async (req, res) => {
    try {
        const { status, admin_reply } = req.body;

        const ticket = await Support.findById(req.params.id);
        if (!ticket) {
            return res.status(404).json({ success: false, message: 'Ticket not found' });
        }

        ticket.status = status || ticket.status;
        ticket.admin_reply = admin_reply || ticket.admin_reply;

        if (status === 'resolved') {
            ticket.resolved_at = Date.now();
        }

        await ticket.save();

        // Notify User
        const messageStr = `Your ticket #${ticket.ticket_id} has been ${status || 'updated'}. Reply: ${admin_reply || 'Check details'}`;
        await sendNotification({
            recipient: ticket.user,
            recipient_role: 'user',
            title: 'Support Ticket Update',
            message: messageStr,
            type: 'system',
            related_id: ticket._id
        });

        if (ticket.user) {
            const User = require('../models/userModel');
            const customer = await User.findById(ticket.user);
            if (customer && customer.fcm_token) {
                const { sendPushNotification } = require('../utils/fcmHelper');
                await sendPushNotification(customer.fcm_token, 'Support Ticket Update', messageStr, {
                    type: 'ticket_update',
                    ticket_id: ticket._id.toString()
                }).catch(err => console.log('FCM Error in support:', err));
            }
        }

        res.status(200).json({
            success: true,
            message: 'Ticket updated successfully',
            data: ticket
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
