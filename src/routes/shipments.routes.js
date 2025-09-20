// src/routes/shipments.routes.js
const express = require('express');
const router = express.Router();

// controllers
const shipmentsCtrl = require('../controllers/shipments.controller');
const uploadsCtrl = require('../controllers/uploads.controller');

// middlewares
const { authenticate } = require('../middlewares/auth.middleware');
const { isAdmin } = require('../middlewares/role.middleware');
// adapt these names to your project
const { upload } = require('../middlewares/upload.middleware'); // multer memory upload
// SSE stream
router.get('/stream/:code', shipmentsCtrl.sseStreamForCode);


// --- Upload helper route (admin-only) ---
// POST /api/shipments/uploads  (multipart/form-data, field name: "file")
router.post('/uploads', authenticate, isAdmin, upload.single('file'), uploadsCtrl.uploadFile);

// --- Admin protected CRUD routes ---
router.post('/', authenticate, isAdmin, shipmentsCtrl.adminCreateShipment);
router.get('/', authenticate, isAdmin, shipmentsCtrl.adminListShipments);
router.get('/:id', authenticate, isAdmin, shipmentsCtrl.adminGetShipment);
router.put('/:id', authenticate, isAdmin, shipmentsCtrl.adminUpdateShipment);
router.delete('/:id', authenticate, isAdmin, shipmentsCtrl.adminDeleteShipment);
router.post('/:id/locations', authenticate, isAdmin, shipmentsCtrl.adminAddLocation);

// --- Public routes ---
router.get('/public/lookup', shipmentsCtrl.publicLookupByCode);
router.get('/public/scan/:code', shipmentsCtrl.publicScan);

// Print PDF by DB id (admin or public depen0ding on  your policy )
 router.get('/:id/print', shipmentsCtrl.printShipmentPdf);


module.exports = router;
