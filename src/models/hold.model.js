// src/models/hold.model.js
const mongoose = require('mongoose');

const holdSchema = new mongoose.Schema({
  flightId: { type: mongoose.Types.ObjectId, ref: 'Flight', required: true },
  bookingId: { type: mongoose.Types.ObjectId, ref: 'Booking' }, 
  fareClass: { type: String, required: true },
  seats: { type: [String], default: [] },    // if seat numbers selected
  count: { type: Number, required: true },   // how many seats held
  expiresAt: { type: Date, required: true, index: { expires: 0 } } // TTL index
}, { timestamps: true });

module.exports = mongoose.model('Hold', holdSchema);
