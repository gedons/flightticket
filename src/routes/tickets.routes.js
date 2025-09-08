// src/routes/tickets.routes.js
const express = require('express');
const router = express.Router();
const ticketsController = require('../controllers/tickets.controller');
const { authenticate } = require('../middlewares/auth.middleware');
const { isAdmin } = require('../middlewares/role.middleware');

// Public scan endpoint (the token is signed)
router.get('/scan/:token', ticketsController.scan);

// User endpoints (authenticated)
router.get('/me', authenticate, ticketsController.listMyTickets);
router.get('/:id', authenticate, ticketsController.getMyTicket);

// Admin endpoints
router.get('/', authenticate, isAdmin, ticketsController.adminList);
router.get('/admin/:id', authenticate, isAdmin, ticketsController.adminGet);
router.delete('/admin/:id', authenticate, isAdmin, ticketsController.adminDelete);

module.exports = router;
