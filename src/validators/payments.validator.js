// src/validators/payments.validator.js
const Joi = require('joi');

exports.createIntentSchema = Joi.object({
  body: Joi.object({
    bookingId: Joi.string().required(),
    paymentMethod: Joi.string().valid('in_person','stripe','card').optional()
  })
});
