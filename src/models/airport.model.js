// src/models/airport.model.js
const mongoose = require('mongoose');

const airportSchema = new mongoose.Schema({
  code: { type: String, required: true, uppercase: true, unique: true, index: true }, // IATA code (e.g., LAG)
  name: { type: String, required: true }, // full airport name
  city: { type: String },
  country: { type: String },
  timezone: { type: String }, 
  lat: { type: Number },
  lon: { type: Number },
  metadata: { type: Object }
}, { timestamps: true });

module.exports = mongoose.model('Airport', airportSchema);
