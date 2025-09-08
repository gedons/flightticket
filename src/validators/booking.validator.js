// src/validators/booking.validator.js
const Joi = require('joi');

const passengerSchema = Joi.object({
  name: Joi.string().required(),
  dob: Joi.date().optional(),
  passport: Joi.string().optional(),
  email: Joi.string().email().optional(),
  phone: Joi.string().optional()
});

exports.bookingCreateSchema = Joi.object({
  body: Joi.object({
    flightId: Joi.string().required(),
    fareClass: Joi.string().required(),
    passengerCount: Joi.number().integer().min(1).required(),
    passengers: Joi.array().items(passengerSchema).min(1).required(),
    seats: Joi.array().items(Joi.string()).optional(),
    paymentMethod: Joi.string().valid('in_person','stripe','card').optional()
  })
});
