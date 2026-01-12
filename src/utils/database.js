const mongoose = require('mongoose');
const logger = require('./logger');
require('dotenv').config();

const uri = process.env.MONGO_URI;
if (!uri) {
  logger.error('Environment variable MONGO_URI is missing.');
  process.exit(1);
}

async function connectDB() {
  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 5000,
      maxPoolSize: 5,
      retryWrites: true,
      w: 'majority'
    });
    logger.info('MongoDB connection established');
  } catch (err) {
    logger.error('MongoDB connection error', { error: err.message });
    throw err;
  }
}

module.exports = { connectDB };
