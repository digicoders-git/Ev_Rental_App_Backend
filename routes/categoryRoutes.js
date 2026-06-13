const express = require('express');
const router = express.Router();
const { 
    getCategories, 
    createCategory, 
    updateCategory, 
    deleteCategory 
} = require('../controller/categoryController');
const { protect, admin } = require('../middleware/authMiddleware');
const upload = require('../middleware/uploadMiddleware');

router.route('/')
    .get(getCategories)
    .post(upload.single('image'), createCategory); // Temporary remove protect, admin for testing

router.route('/:id')
    .put(protect, admin, upload.single('image'), updateCategory)
    .delete(protect, admin, deleteCategory);

module.exports = router;
