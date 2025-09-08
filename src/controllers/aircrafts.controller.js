// src/controllers/aircrafts.controller.js
const Aircraft = require('../models/aircraft.model');
const mongoose = require('mongoose');

exports.createAircraft = async (req, res, next) => {
  try {
    const { model, registration, totalSeats, seatMap, metadata } = req.body;
    if (!model || !registration || totalSeats == null) return res.status(400).json({ message: 'model, registration and totalSeats are required' });

    const existing = await Aircraft.findOne({ registration });
    if (existing) return res.status(400).json({ message: 'Aircraft with this registration already exists' });

    const aircraft = await Aircraft.create({ model, registration, totalSeats, seatMap: seatMap || [], metadata });
    res.status(201).json(aircraft);
  } catch (err) {
    next(err);
  }
};

exports.getAircrafts = async (req, res, next) => {
  try {
    // 1. Parse and set default values for pagination
    const { q } = req.query;
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;

    // 2. Define the filter
    const filter = {};
    if (q) {
      filter.$or = [
        { model: new RegExp(q, 'i') },
        { registration: new RegExp(q, 'i') }
      ];
    }

    // 3. Calculate the number of documents to skip
    const skip = (page - 1) * limit;

    // 4. Execute both queries concurrently using Promise.all
    //    - list: to get the data for the current page
    //    - total: to get the total number of documents matching the filter
    const [list, total] = await Promise.all([
      Aircraft.find(filter)
        .sort({ model: 1 })
        .limit(limit)
        .skip(skip),
      Aircraft.countDocuments(filter)
    ]);

    // 5. Calculate total pages
    const totalPages = Math.ceil(total / limit);

    // 6. Send the structured JSON response
    res.json({
      data: list,
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

exports.getAircraft = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid aircraft id' });
    const aircraft = await Aircraft.findById(id);
    if (!aircraft) return res.status(404).json({ message: 'Aircraft not found' });
    res.json(aircraft);
  } catch (err) {
    next(err);
  }
};

exports.updateAircraft = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid aircraft id' });

    const update = req.body;
    const aircraft = await Aircraft.findByIdAndUpdate(id, update, { new: true });
    if (!aircraft) return res.status(404).json({ message: 'Aircraft not found' });
    res.json(aircraft);
  } catch (err) {
    next(err);
  }
};

exports.deleteAircraft = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid aircraft id' });

    const aircraft = await Aircraft.findByIdAndDelete(id);
    if (!aircraft) return res.status(404).json({ message: 'Aircraft not found' });

    res.json({ message: 'Aircraft deleted' });
  } catch (err) {
    next(err);
  }
};
