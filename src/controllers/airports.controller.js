// src/controllers/airports.controller.js
const Airport = require('../models/airport.model');
const mongoose = require('mongoose');

exports.createAirport = async (req, res, next) => {
  try {
    const { code, name, city, country, timezone, lat, lon, metadata } = req.body;
    if (!code || !name) return res.status(400).json({ message: 'code and name are required' });

    const existing = await Airport.findOne({ code: code.toUpperCase() });
    if (existing) return res.status(400).json({ message: 'Airport with this code already exists' });

    const airport = await Airport.create({
      code: code.toUpperCase(),
      name, city, country, timezone, lat, lon, metadata
    });

    res.status(201).json(airport);
  } catch (err) {
    next(err);
  }
};

exports.getAirports = async (req, res, next) => {
  try {
    // 1. Parse and set default values for pagination
    const { q, city, country } = req.query;
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;

    // 2. Define the filter based on query parameters
    const filter = {};
    if (q) {
      filter.$or = [
        { name: new RegExp(q, 'i') },
        { code: new RegExp(q, 'i') },
        { city: new RegExp(q, 'i') }
      ];
    }
    if (city) filter.city = city;
    if (country) filter.country = country;

    // 3. Calculate the number of documents to skip
    const skip = (page - 1) * limit;

    // 4. Execute both queries concurrently using Promise.all
    //    - list: to get the data for the current page
    //    - total: to get the total number of documents matching the filter
    const [airports, total] = await Promise.all([
      Airport.find(filter)
        .sort({ code: 1 })
        .limit(limit)
        .skip(skip),
      Airport.countDocuments(filter)
    ]);

    // 5. Calculate total pages
    const totalPages = Math.ceil(total / limit);

    // 6. Send a structured JSON response with pagination info
    res.json({
      data: airports,
      pagination: {
        totalItems: total,
        currentPage: page,
        totalPages: totalPages,
        limit: limit,
      },
    });

  } catch (err) {
    next(err);
  }
};

exports.getAirport = async (req, res, next) => {
  try {
    const { idOrCode } = req.params;
    let airport;
    if (mongoose.Types.ObjectId.isValid(idOrCode)) {
      airport = await Airport.findById(idOrCode);
    }
    if (!airport) {
      airport = await Airport.findOne({ code: idOrCode.toUpperCase() });
    }
    if (!airport) return res.status(404).json({ message: 'Airport not found' });
    res.json(airport);
  } catch (err) {
    next(err);
  }
};

exports.updateAirport = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid airport id' });

    const update = req.body;
    if (update.code) update.code = update.code.toUpperCase();

    const airport = await Airport.findByIdAndUpdate(id, update, { new: true });
    if (!airport) return res.status(404).json({ message: 'Airport not found' });
    res.json(airport);
  } catch (err) {
    next(err);
  }
};

exports.deleteAirport = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid airport id' });

    const airport = await Airport.findByIdAndDelete(id);
    if (!airport) return res.status(404).json({ message: 'Airport not found' });

    res.json({ message: 'Airport deleted' });
  } catch (err) {
    next(err);
  }
};
