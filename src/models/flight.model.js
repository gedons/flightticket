// src/models/flight.model.js
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const LocationSchema = new Schema({
  code: { type: String },
  name: { type: String },
  city: { type: String },
  lat: { type: Number },
  lon: { type: Number }
}, { _id: false });

const SegmentSchema = new Schema({
  segmentIndex: { type: Number, default: 0 },
  origin: { type: LocationSchema, required: true },
  destination: { type: LocationSchema, required: true },
  departureTime: { type: Date },
  arrivalTime: { type: Date },
  departureTimezone: { type: String },
  arrivalTimezone: { type: String },
  terminalOrigin: { type: String },
  terminalDestination: { type: String },
  gateOrigin: { type: String },
  gateDestination: { type: String },
  travelTimeMinutes: { type: Number }, 
  distanceKm: { type: Number },      
  aircraft: { type: String },
  cabin: { type: String },
  stops: { type: Number, default: 0 }
}, { _id: false });

const AirlineSchema = new Schema({
  name: String,
  code: String,
  logoUrl: String
}, { _id: false });

const FlightSchema = new Schema({
  airline: { type: AirlineSchema, default: {} },
  flightNumber: { type: String, required: true },
  segments: { type: [SegmentSchema], default: [] },
  fareClasses: { type: Array, default: [] },
  totalSeats: { type: Number, default: 0 },
  amenities: { type: [String], default: [] }, 
  status: { type: String, default: 'scheduled' },
  metadata: { type: Schema.Types.Mixed, default: {} }
}, { timestamps: true });

module.exports = mongoose.models.Flight || mongoose.model('Flight', FlightSchema);
