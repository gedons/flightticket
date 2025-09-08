// src/routes/airports.routes.js
const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/airports.controller');
const { authenticate } = require('../middlewares/auth.middleware');
const { isAdmin } = require('../middlewares/role.middleware');

// Public
router.get('/', ctrl.getAirports);            // list & search
router.get('/:idOrCode', ctrl.getAirport);    // get by id or IATA code

// Admin
router.post('/', authenticate, isAdmin, ctrl.createAirport);
router.put('/:id', authenticate, isAdmin, ctrl.updateAirport);
router.delete('/:id', authenticate, isAdmin, ctrl.deleteAirport);

module.exports = router;
