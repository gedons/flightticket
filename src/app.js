const express = require('express');
const cors = require('cors'); // Import the cors middleware
const routes = require('./routes'); // should export an express.Router with all subroutes mounted
const { errorHandler } = require('./middlewares/error.middleware');
const { logger } = require('./config/logger');

const app = express();

// Built-in middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Enable CORS for all routes and origins
app.use(cors());

// Simple request logger (uses your logger)
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.originalUrl}`);
  next();
});

// Mount API routes
app.use('/api', routes);

// 404 handler for unknown API routes
app.use('/api/*', (req, res) => {
  res.status(404).json({ message: 'Not Found' });
});

// Global error handler (must be after routes)
app.use(errorHandler);

module.exports = app;
