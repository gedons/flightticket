// src/routes/bookings.routes.js
const express = require('express');
const router = express.Router();
const bookingsController = require('../controllers/bookings.controller');
const { authenticate } = require('../middlewares/auth.middleware');
const { isAdmin } = require('../middlewares/role.middleware');
const validate = require('../middlewares/validate.middleware');
const { bookingCreateSchema } = require('../validators/booking.validator');

// Create booking (authenticated user)
router.post('/', authenticate, validate(bookingCreateSchema), bookingsController.createBooking);

// Get booking (authenticated, owner or admin)
router.get('/:id', authenticate, bookingsController.getBooking);

// List user's bookings
router.get('/', authenticate, bookingsController.listUserBookings);

// Admin mark as paid (separate from confirm)
router.post('/:id/mark-paid', authenticate, isAdmin, bookingsController.markAsPaid);

// Admin confirm (after payment or manual)
router.post('/:id/confirm', authenticate, isAdmin, bookingsController.confirmBooking);

// Cancel booking (owner or admin)
router.post('/:id/cancel', authenticate, bookingsController.cancelBooking);

router.post('/lookup', bookingsController.lookupByPnr);

module.exports = router;
