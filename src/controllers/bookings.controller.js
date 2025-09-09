// src/controllers/bookings.controller.js
const bookingService = require('../services/booking.service');
const Booking = require('../models/booking.model');
const Ticket = require('../models/ticket.model'); 
const { generatePNR } = require('../utils/pnr.util');

/**
 * POST /api/bookings
 * Body:
 *  {
 *    flightId, fareClass, passengerCount, passengers, seats, paymentMethod
 *  }
 */
exports.createBooking = async (req, res, next) => {
  try {
    const userId = req.user && req.user.userId;
    if (!userId) return res.status(401).json({ message: 'Authentication required' });

    const { flightId, fareClass, passengerCount = 1, passengers = [], seats = [], paymentMethod = 'in_person' } = req.body;

    const Flight = require('../models/flight.model');
    const flight = await Flight.findById(flightId);
    if (!flight) return res.status(404).json({ message: 'Flight not found' });

    const fc = flight.fareClasses.find(f => f.name === fareClass);
    if (!fc) return res.status(400).json({ message: 'Fare class not found' });

    const fare = (fc.price || 0) * passengerCount;

    const booking = await bookingService.createBookingWithHold({
      userId,
      flightId,
      fareClass,
      passengerCount,
      passengers,
      seats,
      fare,
      paymentMethod
    });

    // message clarifies default in-person flow
    const nextStep = paymentMethod === 'in_person'
      ? 'Pay at the counter or ask admin to mark as paid to confirm booking.'
      : 'Complete payment via the provided payment intent to confirm booking.';

    return res.status(201).json({
      bookingId: booking._id,
      fare: booking.fare,
      paymentMethod: booking.paymentMethod,
      paymentStatus: booking.paymentStatus,
      message: `Booking created (pending). ${nextStep}`
    });
  } catch (err) {
    return next(err);
  }
};

/**
 * GET /api/bookings/:id
 */
exports.getBooking = async (req, res, next) => {
  try {
    const { id } = req.params;
    const booking = await Booking.findById(id).populate('flightId').lean();
    if (!booking) return res.status(404).json({ message: 'Booking not found' });

    // ensure user owns or is admin
    if (req.user.role !== 'admin' && String(booking.userId) !== String(req.user.userId)) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    // attach ticket if exists
    const Ticket = require('../models/ticket.model');
    const ticket = await Ticket.findOne({ bookingId: booking._id }).lean();

    res.json({ booking, ticket });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/bookings (user's bookings)
 * Query: page, limit
 */
exports.listUserBookings = async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const { page = 1, limit = 20 } = req.query;
    const skip = (Math.max(1, parseInt(page, 10)) - 1) * parseInt(limit, 10);
    const bookings = await Booking.find({ userId }).sort({ createdAt: -1 }).limit(parseInt(limit,10)).skip(skip).lean();

    const Ticket = require('../models/ticket.model');
    // fetch tickets for these bookings
    const bookingIds = bookings.map(b => b._id);
    const tickets = await Ticket.find({ bookingId: { $in: bookingIds } }).lean();
    const ticketByBooking = tickets.reduce((acc, t) => { acc[String(t.bookingId)] = t; return acc; }, {});

    const enriched = bookings.map(b => ({ ...b, ticket: ticketByBooking[String(b._id)] || null }));
    res.json(enriched);
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/bookings/:id/confirm
 * Admin or payment webhook calls this to confirm booking after successful payment.
 *
 * Body (optional): { confirmByAdmin: true }  OR the payment webhook will confirm by booking id.
 */
exports.confirmBooking = async (req, res, next) => {
  try {
    const { id } = req.params;
    // Only admin allowed
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Admin only' });
    }

    const result = await bookingService.confirmBooking(id);
    // result: { booking, ticket }
    return res.json({
      message: 'Booking confirmed',
      booking: result.booking,
      ticket: result.ticket
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/bookings/:id/cancel
 * User or admin can cancel (subject to policy)
 */
exports.cancelBooking = async (req, res, next) => {
  try {
    const { id } = req.params;
    // You can add policies for who can cancel (user-owner within allowed time window, or admin)
    const booking = await bookingService.cancelBooking(id);
    res.json({ message: 'Booking cancelled', bookingId: booking._id });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/bookings/:id/mark-paid
 * Admin marks a booking as paid (does NOT auto-confirm).
 * Body (optional) { note: '...' }
 */
exports.markAsPaid = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Admin only' });
    }
    const booking = await Booking.findById(id);
    if (!booking) return res.status(404).json({ message: 'Booking not found' });

    booking.paymentStatus = 'paid';
    booking.meta = booking.meta || {};
    booking.meta.paidAt = new Date();
    booking.meta.paidBy = req.user.userId;
    if (req.body.note) booking.meta.paymentNote = req.body.note;
    await booking.save();

    res.json({ message: 'Booking marked as paid', bookingId: booking._id, paymentStatus: booking.paymentStatus });
  } catch (err) {
    next(err);
  }
};

/**
 * Public lookup by PNR:
 * GET /api/bookings/lookup?pnr=1JD13Y
 *
 * Returns { booking, ticket } only if booking exists and is confirmed/paid.
 */
exports.lookupByPnr = async (req, res, next) => {
  try {
    const pnrRaw = req.query.pnr;
    if (!pnrRaw) return res.status(400).json({ message: 'pnr is required' });

    const pnr = String(pnrRaw).trim();
    if (!pnr) return res.status(400).json({ message: 'pnr is required' });

    // find booking case-insensitively and populate flight
    const booking = await Booking.findOne({ pnr: { $regex: `^${pnr}$`, $options: 'i' } })
      .populate('flightId')
      .lean();

    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    // Only allow public viewing for confirmed/paid/issued bookings
    const status = String(booking.status || '').toLowerCase();
    const payment = String(booking.paymentStatus || '').toLowerCase();
    const isPublic = ['confirmed', 'paid', 'issued'].includes(status) || ['paid'].includes(payment);

    if (!isPublic) {
      return res.status(403).json({ message: 'Booking is not available for public viewing' });
    }

    // Find associated ticket, if any
    const ticket = await Ticket.findOne({ bookingId: booking._id }).lean();

    // Mask sensitive passenger fields for public view (optional — uncomment if you want)
    if (booking.passengers && Array.isArray(booking.passengers)) {
      booking.passengers = booking.passengers.map(p => ({
        name: p.name,
        passport: p.passport ? `${String(p.passport).slice(0, 2)}****${String(p.passport).slice(-2)}` : undefined,
        email: p.email ? p.email.replace(/(.{2}).+(@.+)/, '$1****$2') : undefined
      }));
    }

    return res.json({
      booking,
      ticket: ticket || null
    });
  } catch (err) {
    console.error('lookupByPnr error:', err && err.stack ? err.stack : err);
    return next(err);
  }
};
