// server.js
require('dotenv').config();
const mongoose = require('mongoose');
const app = require('./app');
const { logger } = require('./config/logger');

const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI;

async function start() {
  try {
    // Helpful Mongoose options. If running production with replica set, transactions will be available.
    const mongooseOptions = {
      w: 'majority'
    };

    await mongoose.connect(MONGO_URI, mongooseOptions);
    logger.info('MongoDB connected');

    const server = app.listen(PORT, () => {
      logger.info(`Server running on port ${PORT}`);
    });

    // Graceful shutdown
    const shutdown = async (signal) => {
      try {
        logger.info(`Received ${signal}. Closing server...`);
        server.close(async (err) => {
          if (err) {
            logger.error('Error closing server', err);
            process.exit(1);
          }
          // Close mongoose connection
          await mongoose.disconnect();
          logger.info('MongoDB disconnected');
          process.exit(0);
        });
      } catch (err) {
        logger.error('Shutdown error', err);
        process.exit(1);
      }
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('uncaughtException', (err) => {
      logger.error('Uncaught Exception', err);
      shutdown('uncaughtException');
    });
    process.on('unhandledRejection', (reason) => {
      logger.error('Unhandled Rejection', reason);
    });

  } catch (err) {
    logger.error('MongoDB connection error:', err);
    process.exit(1);
  }
}

start();
