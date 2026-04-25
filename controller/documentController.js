const Document = require('../models/documentModel');
const path = require('path');
const fs = require('fs');

// @desc    Get all documents
// @route   GET /api/documents
// @access  Private/Admin
const getDocuments = async (req, res) => {
    try {
        const documents = await Document.find({}).sort({ createdAt: -1 });
        res.json(documents);
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Create a document
// @route   POST /api/documents
// @access  Private/Admin
const createDocument = async (req, res) => {
    try {
        const { category, entity, entityId, type, docNo, issueDate, expiryDate, status } = req.body;

        let filePath = '';
        if (req.file) {
            filePath = req.file.path.replace(/\\/g, "/");
        } else if (req.body.file) {
            filePath = req.body.file;
        }

        if (!filePath) {
            return res.status(400).json({ success: false, message: 'Document file is required' });
        }

        const document = await Document.create({
            category,
            entity,
            entityId,
            type,
            docNo,
            issueDate,
            expiryDate,
            file: filePath,
            status
        });

        res.status(201).json(document);
    } catch (error) {
        console.error("Create Document Error:", error);
        res.status(400).json({ 
            success: false, 
            message: error.message,
            errors: error.errors // This will include Mongoose validation details
        });
    }
};

// @desc    Update a document
// @route   PUT /api/documents/:id
// @access  Private/Admin
const updateDocument = async (req, res) => {
    try {
        const document = await Document.findById(req.params.id);

        if (document) {
            document.category = req.body.category || document.category;
            document.entity = req.body.entity || document.entity;
            document.entityId = req.body.entityId || document.entityId;
            document.type = req.body.type || document.type;
            document.docNo = req.body.docNo || document.docNo;
            document.issueDate = req.body.issueDate || document.issueDate;
            document.expiryDate = req.body.expiryDate || document.expiryDate;
            document.status = req.body.status || document.status;

            if (req.file) {
                document.file = req.file.path.replace(/\\/g, "/");
            }

            const updatedDocument = await document.save();
            res.json(updatedDocument);
        } else {
            res.status(404).json({ success: false, message: 'Document not found' });
        }
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

// @desc    Delete a document
// @route   DELETE /api/documents/:id
// @access  Private/Admin
const deleteDocument = async (req, res) => {
    try {
        const document = await Document.findById(req.params.id);

        if (document) {
            await document.deleteOne();
            res.json({ message: 'Document removed' });
        } else {
            res.status(404).json({ success: false, message: 'Document not found' });
        }
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Renew a document (Update expiry date and set status to Valid)
// @route   PUT /api/documents/:id/renew
// @access  Private/Admin
const renewDocument = async (req, res) => {
    try {
        const document = await Document.findById(req.params.id);

        if (document) {
            document.status = 'Valid';
            if (req.body.expiryDate) {
                document.expiryDate = req.body.expiryDate;
            } else {
                const nextYear = new Date();
                nextYear.setFullYear(nextYear.getFullYear() + 1);
                document.expiryDate = nextYear;
            }
            
            const updatedDocument = await document.save();
            res.json(updatedDocument);
        } else {
            res.status(404).json({ success: false, message: 'Document not found' });
        }
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

module.exports = {
    getDocuments,
    createDocument,
    updateDocument,
    deleteDocument,
    renewDocument
};
