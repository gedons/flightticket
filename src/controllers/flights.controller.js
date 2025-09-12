// src/controllers/flights.controller.js
const Flight = require('../models/flight.model');
const mongoose = require('mongoose');



// Helper validator (same logic but with logs)
function validateFlightPayload(body) {
  const errors = [];

  if (!body || typeof body !== 'object') {
    errors.push('body');
    return errors;
  }

  if (!body.flightNumber || String(body.flightNumber).trim().length === 0) {
    errors.push('flightNumber');
  }

  if (!Array.isArray(body.segments) || body.segments.length === 0) {
    errors.push('segments (array, at least one element)');
  } else {
    body.segments.forEach((seg, idx) => {
      const prefix = `segments[${idx}]`;
      if (!seg || typeof seg !== 'object') {
        errors.push(`${prefix} (object required)`);
        return;
      }
      if (!seg.origin || !seg.origin.code) errors.push(`${prefix}.origin.code`);
      if (!seg.destination || !seg.destination.code) errors.push(`${prefix}.destination.code`);
      if (!seg.departureTime) errors.push(`${prefix}.departureTime`);
      if (!seg.arrivalTime) errors.push(`${prefix}.arrivalTime`);
    });
  }

  if (body.fareClasses && !Array.isArray(body.fareClasses)) {
    errors.push('fareClasses (must be an array)');
  }

  return errors;
}

exports.createFlight = async (req, res, next) => {
  try {
    // Diagnostic logging to confirm this code runs on the server
    console.log('--- createFlight called ---');
    console.log('Request body:', JSON.stringify(req.body && Object.keys(req.body).length ? req.body : '<EMPTY>'));

    const payload = req.body || {};
    const validationErrors = validateFlightPayload(payload);

    // Log validation details
    if (validationErrors.length) {
      console.log('createFlight validationErrors:', validationErrors);
      return res.status(400).json({
        message: 'Missing or invalid required flight fields',
        missing: validationErrors
      });
    }

    // Build flight doc
    const doc = {
      airline: payload.airline || {},
      flightNumber: String(payload.flightNumber).trim(),
      segments: payload.segments.map((s, i) => ({
        segmentIndex: s.segmentIndex ?? i + 1,
        origin: {
          code: (s.origin && s.origin.code) ? String(s.origin.code).trim().toUpperCase() : undefined,
          name: s.origin?.name || '',
          city: s.origin?.city || '',
          lat: s.origin?.lat,
          lon: s.origin?.lon
        },
        destination: {
          code: (s.destination && s.destination.code) ? String(s.destination.code).trim().toUpperCase() : undefined,
          name: s.destination?.name || '',
          city: s.destination?.city || '',
          lat: s.destination?.lat,
          lon: s.destination?.lon
        },
        departureTime: s.departureTime ? new Date(s.departureTime) : undefined,
        arrivalTime: s.arrivalTime ? new Date(s.arrivalTime) : undefined,
        departureTimezone: s.departureTimezone || '',
        arrivalTimezone: s.arrivalTimezone || '',
        terminalOrigin: s.terminalOrigin || '',
        terminalDestination: s.terminalDestination || '',
        gateOrigin: s.gateOrigin || '',
        gateDestination: s.gateDestination || '',
        travelTimeMinutes: s.travelTimeMinutes || null,
        distanceKm: s.distanceKm || null,
        aircraft: s.aircraft || '',
        cabin: s.cabin || '',
        stops: s.stops || 0
      })),
      fareClasses: Array.isArray(payload.fareClasses) ? payload.fareClasses : [],
      amenities: Array.isArray(payload.amenities) ? payload.amenities : [],
      totalSeats: payload.totalSeats || 0,
      status: payload.status || 'scheduled',
      metadata: payload.metadata || {}
    };

    // console.log('Creating flight with flightNumber:', doc.flightNumber, 'segments:', doc.segments.length);
    const flight = await Flight.create(doc);
    // console.log('Flight created:', flight._id);
    return res.status(201).json(flight);
  } catch (err) {
    console.error('createFlight error:', err && err.stack ? err.stack : err);
    if (err.name === 'ValidationError') {
      return res.status(400).json({ message: 'Flight validation failed', details: err.errors });
    }
    next(err);
  }
};


/**
 * Update a flight (admin)
 */
exports.updateFlight = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid flight id' });

    const update = req.body;
    if (update.departureTime) update.departureTime = new Date(update.departureTime);
    if (update.arrivalTime) update.arrivalTime = new Date(update.arrivalTime);

    const flight = await Flight.findByIdAndUpdate(id, update, { new: true });
    if (!flight) return res.status(404).json({ message: 'Flight not found' });

    return res.json(flight);
  } catch (err) {
    return next(err);
  }
};

/**
 * Delete a flight (admin)
 */
exports.deleteFlight = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid flight id' });

    const flight = await Flight.findByIdAndDelete(id);
    if (!flight) return res.status(404).json({ message: 'Flight not found' });

    return res.json({ message: 'Flight deleted' });
  } catch (err) {
    return next(err);
  }
};

/**
 * Get single flight (public)
 */
exports.getFlight = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid flight id' });

    const flight = await Flight.findById(id);
    if (!flight) return res.status(404).json({ message: 'Flight not found' });

    return res.json(flight);
  } catch (err) {
    return next(err);
  }
};

/**
 * Search flights (public)
 * Query params:
 * - origin (IATA)
 * - destination (IATA)
 * - date (YYYY-MM-DD)
 * - passengers (number)
 *
 * Returns flights with fare classes still having seatsAvailable >= passengers.
 */

exports.searchFlights = async (req, res, next) => {
  try {
    const { origin, destination, date, passengers, flightNumber, q } = req.query;
    const query = {};

    // allow searching by exact IATA codes case-insensitively
    if (origin) query['origin.code'] = { $regex: `^${String(origin).trim()}$`, $options: 'i' };
    if (destination) query['destination.code'] = { $regex: `^${String(destination).trim()}$`, $options: 'i' };

    // also allow searching by flightNumber or a general q param that matches flightNumber or airport codes/names
    if (flightNumber) {
      query.flightNumber = { $regex: `^${String(flightNumber).trim()}$`, $options: 'i' };
    }
    if (q) {
      const qre = new RegExp(String(q).trim(), 'i');
      query.$or = [
        { 'origin.code': qre },
        { 'destination.code': qre },
        { 'origin.name': qre },
        { 'destination.name': qre },
        { flightNumber: qre }
      ];
    }

    // date matching: keep original day-range behavior if provided
    if (date) {
      const dayStart = new Date(date);
      dayStart.setHours(0,0,0,0);
      const dayEnd = new Date(dayStart);
      dayEnd.setDate(dayEnd.getDate() + 1);
      query.departureTime = { $gte: dayStart, $lt: dayEnd };
    }

    // If no query was given above, leave query as {} to return all flights
    let flights = await Flight.find(query).lean();

    // passengers filter applies to fareClasses availability
    const pCount = passengers ? parseInt(passengers, 10) : 1;
    if (pCount > 1) {
      flights = flights.filter(f => {
        return f.fareClasses && f.fareClasses.some(fc => (fc.seatsAvailable || 0) >= pCount);
      });
    }

    // keep only fareClasses that satisfy the request (if passengers provided)
    const mapped = flights.map(f => {
      const copy = { ...f };
      if (pCount > 1 && copy.fareClasses) {
        copy.fareClasses = copy.fareClasses.filter(fc => (fc.seatsAvailable || 0) >= pCount);
      }
      return copy;
    });

    return res.json(mapped);
  } catch (err) {
    return next(err);
  }
};
