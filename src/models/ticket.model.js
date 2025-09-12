// src/models/ticket.model.js
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const TicketSchema = new Schema({
  bookingId: { type: Schema.Types.ObjectId, required: true, index: true, ref: 'Booking' },
  barcodeUrl: { type: String },
  eTicketPdfUrl: { type: String },
  issuedAt: { type: Date, default: Date.now },
  scanUrl: { type: String },
  pdfMetadata: { type: Schema.Types.Mixed, default: {} },
  ticketVersion: { type: Number, default: 1 }
}, { timestamps: true });

module.exports = mongoose.models.Ticket || mongoose.model('Ticket', TicketSchema);
