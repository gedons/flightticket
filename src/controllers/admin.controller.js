// src/controllers/admin.controller.js
const Booking = require('../models/booking.model');
const Flight = require('../models/flight.model');
const User = require('../models/user.model');
const mongoose = require('mongoose');

/**
 * GET /api/admin/bookings
 * Admin-only: list all bookings with user and flight populated.
 * Optional query: q (search PNR, user email, passenger name), page, limit
 */
exports.listBookings = async (req, res, next) => {
  try {
    const { q, page = 1, limit = 100 } = req.query;
    const skip = (Math.max(1, parseInt(page, 10)) - 1) * parseInt(limit, 10);

    const filter = {};
    if (q) {
      const re = new RegExp(String(q).trim(), 'i');
      filter.$or = [
        { pnr: re },
        { 'passengers.name': re },
        { paymentStatus: re },
        { status: re },
        // attempt to match ObjectId-ish strings to booking._id
        ...(mongoose.Types.ObjectId.isValid(q) ? [{ _id: q }] : [])
      ];
    }

    const bookings = await Booking.find(filter)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit, 10))
      .skip(skip)
      .populate('userId', 'name email phone role')   // include user info
      .populate('flightId');                         // include flight info

    return res.json(bookings);
  } catch (err) {
    return next(err);
  }
};

/**
 * GET /api/admin/bookings/:id
 * Admin-only: get a booking with user & flight populated
 */
exports.getBooking = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid booking id' });

    const booking = await Booking.findById(id)
      .populate('userId', 'name email phone role')
      .populate('flightId');

    if (!booking) return res.status(404).json({ message: 'Booking not found' });

    return res.json({ booking });
  } catch (err) {
    return next(err);
  }
};
