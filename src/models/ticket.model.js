// src/models/ticket.model.js
const mongoose = require('mongoose');

const ticketSchema = new mongoose.Schema({
  bookingId: { type: mongoose.Types.ObjectId, ref: 'Booking', required: true, unique: true },
  barcodeUrl: { type: String },     // Cloudinary secure url to the QR image
  barcodeToken: { type: String },   // signed token (JWT/HMAC) embedded in QR
  issuedAt: { type: Date },
  eTicketPdfUrl: { type: String },  // future: PDF e-ticket
  meta: { type: Object }
}, { timestamps: true });

module.exports = mongoose.model('Ticket', ticketSchema);
