// src/models/flight.model.js
const mongoose = require('mongoose');

const fareClassSchema = new mongoose.Schema({
  name: { type: String, required: true },       // e.g., 'economy', 'business'
  price: { type: Number, required: true },
  seatsAvailable: { type: Number, required: true, min: 0 }
}, { _id: false });

const airportRefSchema = new mongoose.Schema({
  code: { type: String, required: true, uppercase: true }, // IATA code
  name: String,
  city: String,
  country: String
}, { _id: false });

const flightSchema = new mongoose.Schema({
  flightNumber: { type: String, required: true, index: true },
  origin: { type: airportRefSchema, required: true },
  destination: { type: airportRefSchema, required: true },
  departureTime: { type: Date, required: true, index: true },
  arrivalTime: { type: Date, required: true },
  aircraftId: { type: mongoose.Types.ObjectId, ref: 'Aircraft' },
  fareClasses: { type: [fareClassSchema], default: [] },
  totalSeats: { type: Number, required: true, min: 0 },
  status: { type: String, enum: ['scheduled','delayed','cancelled'], default: 'scheduled' },
  metadata: { type: Object }
}, { timestamps: true });

// compound index to support search
flightSchema.index({ 'origin.code': 1, 'destination.code': 1, departureTime: 1 });

module.exports = mongoose.model('Flight', flightSchema);
