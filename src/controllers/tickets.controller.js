// src/controllers/tickets.controller.js
const jwt = require('jsonwebtoken');
const Ticket = require('../models/ticket.model');
const Booking = require('../models/booking.model');
const Flight = require('../models/flight.model');

const BARCODE_SECRET = process.env.BARCODE_SIGNING_SECRET || process.env.JWT_SECRET;
const FRONTEND_BASE = (process.env.FRONTEND_BASE_URL || process.env.CLIENT_BASE_URL || '').replace(/\/+$/, '') || null;

/**
 * Public scan endpoint — verifies token and returns booking + ticket info.
 * If request appears to be from a browser (Accept: text/html) or query param redirect=true,
 * redirect to the frontend ticket view page: FRONTEND_BASE + `/tickets/<ticketId>/view?token=<token>`
 */
exports.scan = async (req, res, next) => {
  try {
    const { token } = req.params;
    if (!token) return res.status(400).json({ message: 'Token required' });

    // verify token
    let payload;
    try {
      payload = jwt.verify(token, BARCODE_SECRET);
    } catch (err) {
      return res.status(401).json({ message: 'Invalid or expired token' });
    }

    // find ticket and booking
    const ticket = await Ticket.findOne({ bookingId: payload.ticketId }).lean();
    if (!ticket) return res.status(404).json({ message: 'Ticket not found' });

    const booking = await Booking.findById(ticket.bookingId).populate('flightId').lean();
    if (!booking) return res.status(404).json({ message: 'Booking not found for ticket' });

    // If the request looks like a browser (Accept header) or user explicitly requested redirect,
    // and we have FRONTEND_BASE configured, redirect to the frontend ticket page with token query.
    const acceptHeader = String(req.headers.accept || '').toLowerCase();
    const wantsRedirect = req.query.redirect === 'true' || acceptHeader.includes('text/html');

    if (wantsRedirect && FRONTEND_BASE) {
      // prefer redirect to the UI page where the frontend can use the token to fetch ticket data.
      const ticketId = String(ticket.bookingId || ticket._id);
      const redirectUrl = `${FRONTEND_BASE}/tickets/${encodeURIComponent(ticketId)}/view?token=${encodeURIComponent(token)}`;
      return res.redirect(302, redirectUrl);
    }

    // Otherwise return JSON (used by API clients)
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
