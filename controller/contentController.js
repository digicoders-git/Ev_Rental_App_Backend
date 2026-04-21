const Content = require('../models/contentModel');
const fs = require('fs');
const path = require('path');

// @desc    Create new Content (Admin)
// @route   POST /api/content
// @access  Private/Admin
exports.createContent = async (req, res) => {
    try {
        const { slug, title, description, type, category, order, isActive } = req.body;

        // Check if slug already exists
        const existingContent = await Content.findOne({ slug });
        if (existingContent) {
            return res.status(400).json({ success: false, message: 'Slug already exists. Please choose a unique slug.' });
        }

        let imageData = '';
        if (req.file) {
            imageData = `/uploads/${req.file.filename}`;
        }

        const content = await Content.create({
            slug,
            title,
            description,
            type,
            category,
            order,
            isActive,
            image: imageData
        });

        res.status(201).json({ success: true, data: content });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

// @desc    Get all Content (Public/Admin)
// @route   GET /api/content
// @access  Public
exports.getAllContent = async (req, res) => {
    try {
        const { type, category, isActive } = req.query;
        let query = {};

        if (type) query.type = type;
        if (category) query.category = category;
        if (isActive !== undefined) query.isActive = isActive === 'true';

        const content = await Content.find(query).sort('order -createdAt');

        res.status(200).json({ success: true, count: content.length, data: content });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Get Content by Slug (Public)
// @route   GET /api/content/:slug
// @access  Public
exports.getContentBySlug = async (req, res) => {
    try {
        const content = await Content.findOne({ slug: req.params.slug });

        if (!content) {
            return res.status(404).json({ success: false, message: 'Content not found' });
        }

        res.status(200).json({ success: true, data: content });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Update Content (Admin)
// @route   PUT /api/content/:id
// @access  Private/Admin
exports.updateContent = async (req, res) => {
    try {
        let content = await Content.findById(req.params.id);

        if (!content) {
            return res.status(404).json({ success: false, message: 'Content not found' });
        }

        const updateData = { ...req.body };

        // Handle Image Update
        if (req.file) {
            // Delete old image if exists
            if (content.image) {
                const oldImagePath = path.join(__dirname, '..', content.image);
                if (fs.existsSync(oldImagePath)) {
                    fs.unlinkSync(oldImagePath);
                }
            }
            updateData.image = `/uploads/${req.file.filename}`;
        }

        content = await Content.findByIdAndUpdate(req.params.id, updateData, {
            new: true,
            runValidators: true
        });

        res.status(200).json({ success: true, data: content });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

// @desc    Delete Content (Admin)
// @route   DELETE /api/content/:id
// @access  Private/Admin
exports.deleteContent = async (req, res) => {
    try {
        const content = await Content.findById(req.params.id);

        if (!content) {
            return res.status(404).json({ success: false, message: 'Content not found' });
        }

        // Delete associated image
        if (content.image) {
            const imagePath = path.join(__dirname, '..', content.image);
            if (fs.existsSync(imagePath)) {
                fs.unlinkSync(imagePath);
            }
        }

        await content.deleteOne();

        res.status(200).json({ success: true, message: 'Content deleted successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Toggle Content Status
// @route   PATCH /api/content/:id/toggle
// @access  Private/Admin
exports.toggleStatus = async (req, res) => {
    try {
        const content = await Content.findById(req.params.id);

        if (!content) {
            return res.status(404).json({ success: false, message: 'Content not found' });
        }

        content.isActive = !content.isActive;
        await content.save();

        res.status(200).json({ success: true, message: `Content status marked as ${content.isActive ? 'Active' : 'Inactive'}`, data: content });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
