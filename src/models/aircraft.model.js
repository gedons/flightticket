// src/models/aircraft.model.js
const mongoose = require('mongoose');

const seatSchema = new mongoose.Schema({
  seatNo: String,
  class: String, // e.g., economy, business
  extra: Object
}, { _id: false });

const aircraftSchema = new mongoose.Schema({
  model: { type: String, required: true },            // e.g., Boeing 737-800
  registration: { type: String, required: true, unique: true, index: true }, // tail number
  totalSeats: { type: Number, required: true, min: 0 },
  seatMap: { type: [seatSchema], default: [] },       // optional detailed seat map
  metadata: { type: Object }
}, { timestamps: true });

module.exports = mongoose.model('Aircraft', aircraftSchema);
