const express = require('express');
const router = express.Router();
const {
    createVehicle,
    getAllVehicles,
    getVehicleById,
    updateVehicle,
    deleteVehicle,
    assignVehicle,
    getMyFranchiseVehicles,
    checkAvailability,
    createFranchiseVehicle
} = require('../controller/vehicleController');
const { protect, admin, franchiseProtect } = require('../middleware/authMiddleware');
const upload = require('../middleware/uploadMiddleware');

// Define file fields for upload
const uploadFields = upload.fields([
    { name: 'thumbnail_image', maxCount: 1 },
    { name: 'images', maxCount: 10 },
    { name: 'rc_document', maxCount: 1 }
]);

// Public routes
router.get('/', getAllVehicles);

// Franchise owner routes (Get / Add own vehicles)
router.get('/franchise/my', franchiseProtect, getMyFranchiseVehicles);
router.post('/franchise/create', franchiseProtect, uploadFields, createFranchiseVehicle);
router.put('/franchise/:id', franchiseProtect, uploadFields, updateVehicle);

router.get('/:id', getVehicleById);
router.get('/:id/availability', checkAvailability);

// Admin routes
router.post('/', protect, admin, uploadFields, createVehicle);
router.put('/:id', protect, admin, uploadFields, updateVehicle);
router.delete('/:id', protect, admin, deleteVehicle);

// Assign vehicle to store
router.put('/:id/assign', protect, admin, assignVehicle);

module.exports = router;
