const Category = require('../models/categoryModel');
const Vehicle = require('../models/vehicleModel');

// @desc    Get all categories
// @route   GET /api/categories
// @access  Public
exports.getCategories = async (req, res) => {
    try {
        const categories = await Category.find().sort('name');
        res.status(200).json({ success: true, count: categories.length, data: categories });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Create new category
// @route   POST /api/categories
// @access  Private/Admin
exports.createCategory = async (req, res) => {
    try {
        console.log('Creating category with body:', req.body);
        let { name, description, image } = req.body;
        
        if (req.file) {
            image = req.file.path.replace(/\\/g, '/');
        }
        
        if (!name) {
            return res.status(400).json({ success: false, message: 'Category name is required' });
        }

        const categoryExists = await Category.findOne({ name });
        if (categoryExists) {
            return res.status(400).json({ success: false, message: 'Category already exists' });
        }

        const category = await Category.create({ name, description, image });
        console.log('Category created:', category);

        if (req.app.get('io')) {
            req.app.get('io').emit('admin_data_changed');
        }

        res.status(201).json({ success: true, data: category });
    } catch (error) {
        console.error('Error creating category:', error);
        res.status(400).json({ 
            success: false, 
            message: error.message || 'Error creating category. Please check if name is unique.' 
        });
    }
};

// @desc    Update category
// @route   PUT /api/categories/:id
// @access  Private/Admin
exports.updateCategory = async (req, res) => {
    try {
        let updateData = { ...req.body };
        if (req.file) {
            updateData.image = req.file.path.replace(/\\/g, '/');
        }

        const category = await Category.findByIdAndUpdate(req.params.id, updateData, {
            new: true,
            runValidators: true
        });

        if (!category) {
            return res.status(404).json({ success: false, message: 'Category not found' });
        }

        if (req.app.get('io')) {
            req.app.get('io').emit('admin_data_changed');
        }

        res.status(200).json({ success: true, data: category });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

// @desc    Delete category
// @route   DELETE /api/categories/:id
// @access  Private/Admin
exports.deleteCategory = async (req, res) => {
    try {
        const category = await Category.findById(req.params.id);

        if (!category) {
            return res.status(404).json({ success: false, message: 'Category not found' });
        }

        // Check if any vehicle is using this category
        const vehicleCount = await Vehicle.countDocuments({ category: req.params.id });
        if (vehicleCount > 0) {
            return res.status(400).json({ 
                success: false, 
                message: `Cannot delete category. It is being used by ${vehicleCount} vehicles.` 
            });
        }

        await category.deleteOne();

        if (req.app.get('io')) {
            req.app.get('io').emit('admin_data_changed');
        }

        res.status(200).json({ success: true, message: 'Category deleted' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
