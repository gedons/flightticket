// src/models/shipment.model.js
const mongoose = require('mongoose');

const locationPointSchema = new mongoose.Schema({
  coords: {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number], default: [0, 0] } // [lng, lat]
  },
  note: String,
  recordedAt: { type: Date, default: Date.now },
  etaArrival: Date // optional arrival estimate for this location
}, { _id: false });

const shipmentSchema = new mongoose.Schema({
  trackingCode: { type: String, index: true, unique: true, required: true },

  shipmentDate: { type: Date, default: Date.now },
  serviceType: { type: String, default: 'Air cargo' },

  consignor: {
    fullName: String,
    address: String
  },

  consignee: {
    fullName: String,
    address: String
  },

  image: {
    url: String,
    public_id: String,
    bytes: Number,
    format: String,
    raw: mongoose.Schema.Types.Mixed
  },

  contentDetails: String, // e.g., "cash funds"
  quantity: { type: Number, default: 1 },
  receiver: String, // receiver contact or note

  currentLocationText: String,
  destination: {
    address: String,
    coords: { type: { type: String, enum: ['Point'], default: 'Point' }, coordinates: [Number] }
  },

  // history of locations (newest first)
  locations: { type: [locationPointSchema], default: [] },

  lastSeenAt: Date,

  // QR / barcode
  qrUrl: String,          // Cloudinary QR image url
  barcodeToken: String,   // signed token if needed

  createdBy: { type: mongoose.Types.ObjectId, ref: 'User' },

}, { timestamps: true });

shipmentSchema.index({ 'destination.coords': '2dsphere', 'locations.coords': '2dsphere' });

module.exports = mongoose.model('Shipment', shipmentSchema);
