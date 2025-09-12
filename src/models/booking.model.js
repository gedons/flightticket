// src/models/booking.model.js
const mongoose = require('mongoose');
const crypto = require('crypto');

const passengerSchema = new mongoose.Schema({
  name: { type: String, required: true },
  dob: { type: Date },
  passport: { type: String },
  email: { type: String },
  phone: { type: String }
}, { _id: false });

/**
 * Helper: generate a random 6-character uppercase alphanumeric PNR
 */
function generatePnr(len = 6) {
  const bytes = crypto.randomBytes(len);
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // avoid ambiguous chars
  let out = '';
  for (let i = 0; i < len; i++) {
    out += chars[bytes[i] % chars.length];
  }
  return out;
}

const bookingSchema = new mongoose.Schema({
  userId: { type: mongoose.Types.ObjectId, ref: 'User', required: true },
  flightId: { type: mongoose.Types.ObjectId, ref: 'Flight', required: true },
  fareClass: { type: String, required: true },              // e.g., economy
  passengers: { type: [passengerSchema], default: [] },
  seats: { type: [String], default: [] },                   // seat numbers if selected
  passengerCount: { type: Number, required: true, min: 1 },
  fare: { type: Number, required: true },

  // DEFAULT payment method changed to in_person; include 'physical' for backward compatibility
  paymentMethod: { type: String, enum: ['in_person','stripe','card','physical'], default: 'in_person' },
  paymentStatus: { type: String, enum: ['unpaid','paid','refunded'], default: 'unpaid' },
  status: { type: String, enum: ['pending','confirmed','cancelled'], default: 'pending' },

  // PNR: unique when present. Use sparse so multiple nulls allowed.
  pnr: { type: String, index: { unique: true, sparse: true } },

  // convenience: flag if a ticket was generated (optional)
  ticketGenerated: { type: Boolean, default: false },

  createdAt: { type: Date, default: Date.now }
}, { timestamps: true });

/**
 * Pre-save: ensure passengerCount matches passengers array,
 * uppercase and generate a PNR if missing.
 */
bookingSchema.pre('save', function (next) {
  try {
    // sync passengerCount
    if (Array.isArray(this.passengers)) {
      this.passengerCount = this.passengers.length || this.passengerCount || 1;
    }

    // normalize paymentMethod fallback
    if (!this.paymentMethod) this.paymentMethod = 'in_person';

    // generate PNR if missing
    if (!this.pnr) {
      this.pnr = generatePnr(6);
    } else {
      this.pnr = String(this.pnr).trim().toUpperCase();
    }

    next();
  } catch (err) {
    next(err);
  }
});

/**
 * Instance method: return a public-safe representation of the booking
 * Masks sensitive passenger fields (passport and email).
 */
bookingSchema.methods.toPublic = function () {
  const safe = {
    _id: this._id,
    pnr: this.pnr,
    status: this.status,
    paymentStatus: this.paymentStatus,
    passengerCount: this.passengerCount,
    seats: this.seats,
    fare: this.fare,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt
  };

  // shallow copy passengers with masked passport/email
  safe.passengers = (this.passengers || []).map((p) => {
    const maskedPassport = p.passport ? `${String(p.passport).slice(0,2)}****${String(p.passport).slice(-2)}` : undefined;
    const maskedEmail = p.email ? p.email.replace(/(.{2}).+(@.+)/, '$1****$2') : undefined;
    return {
      name: p.name,
      dob: p.dob,
      passport: maskedPassport,
      email: maskedEmail,
      phone: p.phone ? String(p.phone).replace(/.(?=.{2})/g, '*') : undefined
    };
  });

  return safe;
};

/**
 * Static helper: generate and reserve a unique PNR (attempts a few times)
 * Use this if you want to guarantee uniqueness before saving the full booking.
 */
bookingSchema.statics.generateUniquePnr = async function (tries = 5, len = 6) {
  const Booking = this;
  for (let i = 0; i < tries; i++) {
    const p = generatePnr(len);
    // check existence
    const exists = await Booking.findOne({ pnr: p }).lean().exec();
    if (!exists) return p;
  }
  throw new Error('Failed to generate unique PNR');
};

module.exports = mongoose.models.Booking || mongoose.model('Booking', bookingSchema);
