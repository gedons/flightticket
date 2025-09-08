// src/controllers/payments.controller.js
const stripeSecret = process.env.STRIPE_SECRET_KEY;
let stripe = null;
if (stripeSecret) {
  const Stripe = require('stripe');
  stripe = new Stripe(stripeSecret, { apiVersion: '2022-11-15' });
}
const Booking = require('../models/booking.model');

/**
 * POST /api/payments/create-intent
 * Body: { bookingId, paymentMethod }  (paymentMethod: in_person|stripe|card)
 */
exports.createIntent = async (req, res, next) => {
  try {
    const { bookingId, paymentMethod = 'in_person' } = req.body;
    if (!bookingId) return res.status(400).json({ message: 'bookingId required' });

    const booking = await Booking.findById(bookingId);
    if (!booking) return res.status(404).json({ message: 'Booking not found' });
    if (booking.status !== 'pending') return res.status(400).json({ message: 'Booking must be pending' });

    // If in_person, return immediate instructions / reference
    if (paymentMethod === 'in_person') {
      return res.json({
        bookingId: booking._id,
        paymentMethod: 'in_person',
        paymentStatus: booking.paymentStatus,
        message: 'In-person payment selected (default). Pay at the counter to complete booking or request admin to mark payment as received.'
      });
    }

    // If using Stripe
    if (stripe) {
      const amount = Math.round((booking.fare || 0) * 100); // cents
      const paymentIntent = await stripe.paymentIntents.create({
        amount,
        currency: process.env.CURRENCY || 'usd',
        metadata: { bookingId: String(booking._id) },
      });
      return res.json({ clientSecret: paymentIntent.client_secret, paymentIntentId: paymentIntent.id });
    }

    // Fallback mock client secret for dev/test
    return res.json({ clientSecret: `mock_client_secret_for_${booking._id}`, mock: true });
  } catch (err) {
    next(err);
  }
};


exports.webhook = async (req, res, next) => {
  try {
    // If using Stripe, verify signature:
    if (stripe && process.env.STRIPE_WEBHOOK_SECRET) {
      const sig = req.headers['stripe-signature'];
      let event;
      try {
        event = stripe.webhooks.constructEvent(req.rawBody || req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
      } catch (err) {
        console.error('Stripe webhook signature verification failed', err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
      }
      // handle event
      if (event.type === 'payment_intent.succeeded') {
        const bookingId = event.data.object.metadata && event.data.object.metadata.bookingId;
        if (bookingId) {
          // confirm booking
          const bookingSvc = require('../services/booking.service');
          await bookingSvc.confirmBooking(bookingId);
        }
      }
      return res.json({ received: true });
    }

    // Non-Stripe simplified webhook (for local testing)
    const { type, bookingId } = req.body;
    if (type === 'payment_intent.succeeded' && bookingId) {
      const bookingSvc = require('../services/booking.service');
      await bookingSvc.confirmBooking(bookingId);
      return res.json({ success: true });
    }
    const result = await bookingSvc.confirmBooking(bookingId);
    console.log('Booking confirmed, ticket URL:', result.ticket && result.ticket.barcodeUrl);

    return res.status(400).json({ message: 'Unrecognized webhook' });
  } catch (err) {
    next(err);
  }
};
