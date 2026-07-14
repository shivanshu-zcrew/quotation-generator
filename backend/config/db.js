const mongoose = require('mongoose');
const logger = require('./logger');

const connectDB = async () => {
  try {
    const mongoURI = process.env.MONGODB_URI || 'mongodb+srv://shivanshu:QuotationCreation@cluster0.4wrhvft.mongodb.net/?appName=Cluster0';

    const conn = await mongoose.connect(mongoURI, {
      maxPoolSize: 10,
      minPoolSize: 2,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });

    logger.info(`MongoDB connected: ${conn.connection.host}`);
    return conn;
  } catch (error) {
    logger.error(`MongoDB connection error: ${error.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;