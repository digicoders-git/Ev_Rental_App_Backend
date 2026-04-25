const express = require('express');
const router = express.Router();
const {
    getDocuments,
    createDocument,
    updateDocument,
    deleteDocument,
    renewDocument
} = require('../controller/documentController');
const { protect, admin } = require('../middleware/authMiddleware');
const upload = require('../middleware/uploadMiddleware');

router.route('/')
    .get(protect, admin, getDocuments)
    .post(protect, admin, upload.single('file'), createDocument);

router.route('/:id')
    .put(protect, admin, upload.single('file'), updateDocument)
    .delete(protect, admin, deleteDocument);

router.put('/:id/renew', protect, admin, renewDocument);

module.exports = router;
