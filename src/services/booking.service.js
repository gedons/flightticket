// src/services/booking.service.js
const mongoose = require('mongoose');
const Flight = require('../models/flight.model');
const Booking = require('../models/booking.model');
const Hold = require('../models/hold.model');
const { generatePNR } = require('../utils/pnr.util');
const ticketService = require('./ticket.service');

/**
 * Try to reserve seats for a flight & create booking + hold.
 * Default paymentMethod is now 'in_person'.
 *
 * payload:
 *  - userId
 *  - flightId
 *  - fareClass
 *  - passengerCount
 *  - passengers (array)
 *  - seats (optional array)
 *  - fare (total fare)
 *  - paymentMethod
 */
exports.createBookingWithHold = async ({ userId, flightId, fareClass, passengerCount, passengers = [], seats = [], fare, paymentMethod = 'in_person' }) => {
  if (!mongoose.Types.ObjectId.isValid(flightId)) {
    throw new Error('Invalid flight id');
  }
  if (passengerCount < 1) throw new Error('passengerCount must be >= 1');

  // First, attempt transactional update
  const session = await mongoose.startSession();
  let booking;
  try {
    session.startTransaction();

    // load flight with session
    const flight = await Flight.findById(flightId).session(session);
    if (!flight) {
      throw new Error('Flight not found');
    }

    const fcIndex = flight.fareClasses.findIndex(fc => fc.name === fareClass);
    if (fcIndex === -1) {
      throw new Error('Fare class not found on flight');
    }

    const available = flight.fareClasses[fcIndex].seatsAvailable || 0;
    if (available < passengerCount) {
      throw new Error('Not enough seats available for requested fare class');
    }

    // decrement seatsAvailable
    flight.fareClasses[fcIndex].seatsAvailable = available - passengerCount;
    await flight.save({ session });

    // create booking (status pending)
    booking = await Booking.create([{
      userId,
      flightId,
      fareClass,
      passengerCount,
      passengers,
      seats,
      fare,
      paymentMethod,
      paymentStatus: 'unpaid',
      status: 'pending',
      pnr: null
    }], { session });

    // create hold doc (expire in X minutes)
    const holdMinutes = parseInt(process.env.BOOKING_HOLD_MINUTES || '10', 10);
    const expiresAt = new Date(Date.now() + holdMinutes * 60 * 1000);
    await Hold.create([{
      flightId,
      bookingId: booking[0]._id,
      fareClass,
      seats,
      count: passengerCount,
      expiresAt
    }], { session });

    await session.commitTransaction();
    session.endSession();
    return booking[0];
  } catch (err) {
    // abort transaction if started
    try { await session.abortTransaction(); } catch (_) {}
    session.endSession();

    // Transaction might fail if not in replica set. Fallback to optimistic update.
    const filter = {
      _id: flightId,
      'fareClasses.name': fareClass,
      'fareClasses.seatsAvailable': { $gte: passengerCount }
    };
    const update = { $inc: { 'fareClasses.$.seatsAvailable': -passengerCount } };
    const updatedFlight = await Flight.findOneAndUpdate(filter, update, { new: true });
    if (!updatedFlight) {
      throw new Error('Not enough seats available (concurrent) or flight not found');
    }

    // create booking and hold outside transaction
    booking = await Booking.create({
      userId,
      flightId,
      fareClass,
      passengerCount,
      passengers,
      seats,
      fare,
      paymentMethod,
      paymentStatus: 'unpaid',
      status: 'pending',
      pnr: null
    });

    const holdMinutes = parseInt(process.env.BOOKING_HOLD_MINUTES || '10', 10);
    const expiresAt = new Date(Date.now() + holdMinutes * 60 * 1000);
    await Hold.create({
      flightId,
      bookingId: booking._id,
      fareClass,
      seats,
      count: passengerCount,
      expiresAt
    });

    return booking;
  }
};

/**
 * Confirm a booking (called after payment success or admin mark-paid)
 */

exports.confirmBooking = async (bookingId, opts = {}) => {
  const booking = await Booking.findById(bookingId);
  if (!booking) throw new Error('Booking not found');

  if (booking.status === 'confirmed') {
    // Ensure ticket exists, return both booking and ticket if present
    const Ticket = require('../models/ticket.model');
    const existingTicket = await Ticket.findOne({ bookingId: booking._id });
    return { booking, ticket: existingTicket };
  }

  booking.paymentStatus = 'paid';
  booking.status = 'confirmed';
  if (!booking.pnr) booking.pnr = generatePNR();
  await booking.save();

  // remove any holds linked to this booking
  await Hold.deleteMany({ bookingId: booking._id }).catch(() => { /* ignore */ });

  // create ticket (QR, upload to Cloudinary) and attach to booking
  try {
    const ticket = await ticketService.createTicketForBooking(booking);
    return { booking, ticket };
  } catch (err) {
    // If ticket generation fails, we still consider booking confirmed.
    // Log and return booking (caller may retry ticket creation).
    console.error('Ticket generation failed for booking', booking._id, err);
    return { booking, ticket: null };
  }
};


/**
 * Cancel booking and release seats
 */
exports.cancelBooking = async (bookingId, reason) => {
  const booking = await Booking.findById(bookingId);
  if (!booking) throw new Error('Booking not found');
  if (booking.status === 'cancelled') return booking;

  // Return seats to flight (optimistic update)
  const filter = {
    _id: booking.flightId,
    'fareClasses.name': booking.fareClass
  };
  const update = { $inc: { 'fareClasses.$.seatsAvailable': booking.passengerCount } };
  await Flight.findOneAndUpdate(filter, update);

  booking.status = 'cancelled';
  booking.paymentStatus = booking.paymentStatus === 'paid' ? booking.paymentStatus : 'unpaid';
  await booking.save();

  // remove holds
  await Hold.deleteMany({ bookingId: booking._id }).catch(() => {});

  return booking;
};
