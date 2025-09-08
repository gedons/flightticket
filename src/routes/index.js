const express = require('express');
const router = express.Router();

router.use('/auth', require('./auth.routes'));
router.use('/flights', require('./flights.routes'));
router.use('/airports', require('./airports.routes'));
router.use('/aircrafts', require('./aircrafts.routes'));
router.use('/bookings', require('./bookings.routes'));
router.use('/payments', require('./payments.routes'));
router.use('/tickets', require('./tickets.routes'));
router.use('/admin', require('./admin.routes'));

module.exports = router;
