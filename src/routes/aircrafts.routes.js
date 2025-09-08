// src/routes/aircrafts.routes.js
const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/aircrafts.controller');
const { authenticate } = require('../middlewares/auth.middleware');
const { isAdmin } = require('../middlewares/role.middleware');

// Public
router.get('/', ctrl.getAircrafts);
router.get('/:id', ctrl.getAircraft);

// Admin
router.post('/', authenticate, isAdmin, ctrl.createAircraft);
router.put('/:id', authenticate, isAdmin, ctrl.updateAircraft);
router.delete('/:id', authenticate, isAdmin, ctrl.deleteAircraft);

module.exports = router;
