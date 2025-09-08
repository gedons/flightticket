// src/routes/payments.routes.js
const express = require('express');
const router = express.Router();
const paymentsController = require('../controllers/payments.controller');
const { authenticate } = require('../middlewares/auth.middleware');
const validate = require('../middlewares/validate.middleware');
const { createIntentSchema } = require('../validators/payments.validator');

// Create payment intent (authenticated) - validate payload
router.post('/create-intent', authenticate, validate(createIntentSchema), paymentsController.createIntent);

// Webhook endpoint (public)
// Note: if using Stripe verify signature with express.raw() in app.js or here
router.post('/webhook', express.json(), paymentsController.webhook);

module.exports = router;
