// src/routes/admin.routes.js
const express = require('express');
const router = express.Router();
const adminController = require('../controllers/admin.controller');
const { authenticate } = require('../middlewares/auth.middleware');
const { isAdmin } = require('../middlewares/role.middleware');

// Admin bookings listing (all bookings)
router.get('/bookings', authenticate, isAdmin, adminController.listBookings);
router.get('/bookings/:id', authenticate, isAdmin, adminController.getBooking);

// (You can add other admin endpoints here later: users, reports, etc.)
module.exports = router;
