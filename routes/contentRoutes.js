const express = require('express');
const router = express.Router();
const {
    createContent,
    getAllContent,
    getContentBySlug,
    updateContent,
    deleteContent,
    toggleStatus
} = require('../controller/contentController');
const { protect, admin } = require('../middleware/authMiddleware');
const upload = require('../middleware/uploadMiddleware');

// Public Routes
router.get('/', getAllContent);
router.get('/:slug', getContentBySlug);

// Admin Routes (Protected)
router.post('/', protect, admin, upload.single('image'), createContent);
router.put('/:id', protect, admin, upload.single('image'), updateContent);
router.delete('/:id', protect, admin, deleteContent);
router.patch('/:id/toggle', protect, admin, toggleStatus);

module.exports = router;
