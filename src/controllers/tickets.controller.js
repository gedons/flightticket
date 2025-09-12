// src/controllers/tickets.controller.js (scan handler - always redirect unless ?format=json)
const jwt = require('jsonwebtoken');
const Ticket = require('../models/ticket.model');
const Booking = require('../models/booking.model');
const Flight = require('../models/flight.model');
const ticketService = require('../services/ticket.service');

const BARCODE_SECRET = process.env.BARCODE_SIGNING_SECRET || process.env.JWT_SECRET;
const FRONTEND_BASE = (process.env.FRONTEND_BASE_URL || process.env.CLIENT_BASE_URL || '').replace(/\/+$/, '') || null;

exports.scan = async (req, res, next) => {
  try {
    const { token } = req.params;
    if (!token) return res.status(400).json({ message: 'Token required' });

    // verify token payload
    let payload;
    try {
      payload = jwt.verify(token, BARCODE_SECRET);
    } catch (err) {
      return res.status(401).json({ message: 'Invalid or expired token' });
    }

    // find the ticket and its booking
    const ticket = await Ticket.findOne({ bookingId: payload.ticketId }).lean();
    if (!ticket) return res.status(404).json({ message: 'Ticket not found' });

    const booking = await Booking.findById(ticket.bookingId).populate('flightId').lean();
    if (!booking) return res.status(404).json({ message: 'Booking not found for ticket' });

    // If caller explicitly requested JSON, return JSON
    if (String(req.query.format || '').toLowerCase() === 'json') {
      return res.json({
        ticket: {
          barcodeUrl: ticket.barcodeUrl,
          issuedAt: ticket.issuedAt,
          eTicketPdfUrl: ticket.eTicketPdfUrl,
          meta: ticket.meta || {}
        },
        booking: {
          _id: booking._id,
          pnr: booking.pnr,
          status: booking.status,
          paymentStatus: booking.paymentStatus,
          flight: booking.flightId,
          passengers: booking.passengers,
          seats: booking.seats,
          fare: booking.fare
        }
      });
    }

    // Otherwise redirect to the frontend UI (if configured). This is the key change.
    if (FRONTEND_BASE) {
      const ticketId = String(ticket._id);
      const redirectUrl = `${FRONTEND_BASE}/tickets/${encodeURIComponent(ticketId)}/view`;
      return res.redirect(302, redirectUrl);
    }

    // Fallback: if no FRONTEND_BASE configured, return JSON.
    return res.json({
      ticket: {
        barcodeUrl: ticket.barcodeUrl,
        issuedAt: ticket.issuedAt,
        eTicketPdfUrl: ticket.eTicketPdfUrl,
        meta: ticket.meta || {}
      },
      booking: {
        _id: booking._id,
        pnr: booking.pnr,
        status: booking.status,
        paymentStatus: booking.paymentStatus,
        flight: booking.flightId,
        passengers: booking.passengers,
        seats: booking.seats,
        fare: booking.fare
      }
    });
  } catch (err) {
    next(err);
  }
};


/**
 * Admin: list all tickets
 */
exports.adminList = async (req, res, next) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const skip = (Math.max(1, parseInt(page, 10)) - 1) * parseInt(limit, 10);
    const list = await Ticket.find().sort({ createdAt: -1 }).limit(parseInt(limit, 10)).skip(skip).lean();
    res.json(list);
  } catch (err) {
    next(err);
  }
};

/**
 * Admin: get ticket by id
 */
exports.adminGet = async (req, res, next) => {
  try {
    const { id } = req.params;
    const ticket = await Ticket.findById(id).lean();
    if (!ticket) return res.status(404).json({ message: 'Ticket not found' });
    const booking = await Booking.findById(ticket.bookingId).populate('flightId').lean();
    return res.json({ ticket, booking });
  } catch (err) {
    next(err);
  }
};

/**
 * Admin: delete ticket (e.g., regenerate)
 */
exports.adminDelete = async (req, res, next) => {
  try {
    const { id } = req.params;
    const ticket = await Ticket.findByIdAndDelete(id);
    if (!ticket) return res.status(404).json({ message: 'Ticket not found' });
    // Optionally: delete cloudinary assets (not implemented here)
    res.json({ message: 'Ticket deleted' });
  } catch (err) {
    next(err);
  }
};

/**
 * User: list my tickets (based on bookings owned by user)
 */
exports.listMyTickets = async (req, res, next) => {
  try {
    const userId = req.user.userId;
    // find bookings then tickets
    const bookings = await Booking.find({ userId }).select('_id').lean();
    const bookingIds = bookings.map(b => b._id);
    const tickets = await Ticket.find({ bookingId: { $in: bookingIds } }).lean();
    res.json(tickets);
  } catch (err) {
    next(err);
  }
};

/**
 * User: get a ticket by ticketId if they own it
 */
exports.getMyTicket = async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;
    const ticket = await Ticket.findById(id).lean();
    if (!ticket) return res.status(404).json({ message: 'Ticket not found' });

    const booking = await Booking.findById(ticket.bookingId).lean();
    if (!booking) return res.status(404).json({ message: 'Booking not found' });

    if (String(booking.userId) !== String(userId) && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const flight = await Flight.findById(booking.flightId).lean();
    res.json({ ticket, booking: { ...booking, flight } });
  } catch (err) {
    next(err);
  }
};


exports.regeneratePdf = async (req, res, next) => {
  try {
    const ticketId = req.params.id;
    await ticketService.regeneratePdfForTicket(ticketId);
    const ticket = await require('../models/ticket.model').findById(ticketId).lean();
    return res.json({ ticket });
  } catch (err) {
    next(err);
  }
};
