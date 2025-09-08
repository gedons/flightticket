// src/routes/flights.routes.js
const express = require('express');
const router = express.Router();
const flightsController = require('../controllers/flights.controller');
const { authenticate } = require('../middlewares/auth.middleware');
const { isAdmin } = require('../middlewares/role.middleware');

/**
 * Public
 * GET /api/flights           -> searchFlights (query params)
 * GET /api/flights/:id       -> getFlight
 */
router.get('/', flightsController.searchFlights);
router.get('/:id', flightsController.getFlight);

/**
 * Admin-only
 * POST /api/flights          -> createFlight
 * PUT  /api/flights/:id      -> updateFlight
 * DELETE /api/flights/:id    -> deleteFlight
 */
router.post('/', authenticate, isAdmin, flightsController.createFlight);
router.put('/:id', authenticate, isAdmin, flightsController.updateFlight);
router.delete('/:id', authenticate, isAdmin, flightsController.deleteFlight);

module.exports = router;
