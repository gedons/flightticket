// src/models/booking.model.js
const mongoose = require('mongoose');

const passengerSchema = new mongoose.Schema({
  name: String,
  dob: Date,
  passport: String,
  email: String,
  phone: String
}, { _id: false });

const bookingSchema = new mongoose.Schema({
  userId: { type: mongoose.Types.ObjectId, ref: 'User', required: true },
  flightId: { type: mongoose.Types.ObjectId, ref: 'Flight', required: true },
  fareClass: { type: String, required: true },              // e.g., economy
  passengers: { type: [passengerSchema], default: [] },
  seats: { type: [String], default: [] },                   // seat numbers if selected
  passengerCount: { type: Number, required: true, min: 1 },
  fare: { type: Number, required: true },
  // DEFAULT payment method changed to in_person
  paymentMethod: { type: String, enum: ['in_person','stripe','card'], default: 'in_person' },
  paymentStatus: { type: String, enum: ['unpaid','paid','refunded'], default: 'unpaid' },
  status: { type: String, enum: ['pending','confirmed','cancelled'], default: 'pending' },
  pnr: { type: String, index: true },
  createdAt: { type: Date, default: Date.now }
}, { timestamps: true });

module.exports = mongoose.model('Booking', bookingSchema);
