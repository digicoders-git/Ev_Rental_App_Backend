const Support = require('../models/supportModel');
const { sendNotification } = require('../utils/notificationHelper');

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

        const ticket = await Support.create({
            user: req.user.id,
            category,
            subject,
            description,
            priority,
            booking,
            attachments: attachmentFiles
        });

        // Notify Admin
        await sendNotification({
            title: 'New Complaint/Ticket',
            message: `New ${category} ticket #${ticket.ticket_id} created by rider.`,
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
        const tickets = await Support.find({ user: req.user.id }).sort('-createdAt');
        res.status(200).json({ success: true, count: tickets.length, data: tickets });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Get all tickets (Admin only)
// @route   GET /api/support/admin/all
// @access  Private/Admin
exports.getAllTickets = async (req, res) => {
    try {
        const tickets = await Support.find().populate('user', 'name mobile email').sort('-createdAt');
        res.status(200).json({ success: true, count: tickets.length, data: tickets });
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
        await sendNotification({
            recipient: ticket.user,
            recipient_role: 'user',
            title: 'Support Ticket Update',
            message: `Your ticket #${ticket.ticket_id} has been ${status || 'updated'}. Reply: ${admin_reply || 'Check details'}`,
            type: 'system',
            related_id: ticket._id
        });

        res.status(200).json({
            success: true,
            message: 'Ticket updated successfully',
            data: ticket
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
