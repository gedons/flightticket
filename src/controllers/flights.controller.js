// src/controllers/flights.controller.js
const Flight = require('../models/flight.model');
const mongoose = require('mongoose');

/**
 * Create a flight (admin)
 */
exports.createFlight = async (req, res, next) => {
  try {
    const {
      flightNumber,
      origin,
      destination,
      departureTime,
      arrivalTime,
      aircraftId,
      fareClasses,
      totalSeats,
      metadata
    } = req.body;

    // basic validation
    if (!flightNumber || !origin || !destination || !departureTime || !arrivalTime || !totalSeats) {
      return res.status(400).json({ message: 'Missing required flight fields' });
    }

    const flight = await Flight.create({
      flightNumber,
      origin,
      destination,
      departureTime: new Date(departureTime),
      arrivalTime: new Date(arrivalTime),
      aircraftId,
      fareClasses: fareClasses || [],
      totalSeats,
      metadata
    });

    return res.status(201).json(flight);
  } catch (err) {
    return next(err);
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
