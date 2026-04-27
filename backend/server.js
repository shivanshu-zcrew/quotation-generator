require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cloudinary = require('cloudinary').v2;

const connectDB = require('./config/db');
const redisService = require('./config/redisService');
const ItemSyncService = require('./utils/itemsSync');
const app = express();

// ── CORS Configuration ───────────────────────────────────────────────────
const allowedOrigins = [
  'http://localhost:3000',
  'http://13.234.239.26',
];

const corsOptions = {
  origin: function (origin, callback) {
    // allow requests with no origin (like Postman, curl)
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    } else {
      return callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'x-company-id',
    'X-Company-Id'
  ],
  exposedHeaders: ['x-company-id'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS']
};
app.use(cors(corsOptions));
app.options('*', (req, res) => {
  res.sendStatus(200);
});
// ── Body parsing middleware ──────────────────────────────────────────────
app.use(express.json({ limit: '200mb' }));
app.use(express.urlencoded({ limit: '200mb', extended: true }));

// TEMPORARY DEBUG — remove after fixing
console.log('CLOUDINARY CHECK:', {
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
    ? `${process.env.CLOUDINARY_API_SECRET.slice(0, 4)}...${process.env.CLOUDINARY_API_SECRET.slice(-4)} (len:${process.env.CLOUDINARY_API_SECRET.length})`
    : 'MISSING',
});

// ── Cloudinary config ─────────────────────────────────────────────────────
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});
app.use((req, res, next) => {
  console.log('➡️', req.method, req.url);
  next();
});

// ── Routes ────────────────────────────────────────────────────────────────
const customerRoutes = require('./routes/customerRoutes');
const itemRoutes = require('./routes/itemRoutes');
const quotationRoutes = require('./routes/quotationRoutes');
const authRoutes = require('./routes/authRoutes');
const adminRoutes = require('./routes/adminRoutes');
const exchangeRateRoutes = require('./routes/exchangeRates');
const companyRoutes = require('./routes/companyRoutes');

app.use('/api/customers', customerRoutes);
app.use('/api/items', itemRoutes);
app.use('/api/quotations', quotationRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/exchange-rates', exchangeRateRoutes);
app.use('/api/companies', companyRoutes);

// ── Root ──────────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({ message: 'Quotation System API Running' });
});

// ── Redis Health Check Endpoint ───────────────────────────────────────────
app.get('/api/health/redis', async (req, res) => {
  try {
    // Check connection status
    const status = redisService.getStatus();
    
    if (!status.isConnected) {
      // Try to reconnect
      await redisService.connect();
    }
    
    // Test Redis connection by setting and getting a test key
    await redisService.set('health_check', { status: 'ok', timestamp: Date.now() }, 10);
    const result = await redisService.get('health_check');
    
    res.json({
      success: true,
      status: redisService.getStatus(),
      test: result?.status === 'ok' ? 'passed' : 'failed',
      message: redisService.isConnected ? 'Redis is connected' : 'Redis is not connected'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      connected: false,
      status: redisService.getStatus(),
      error: error.message
    });
  }
});

// ── Global error handler ──────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err.stack);
  
  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json({
      message: 'CORS error: Origin not allowed',
      error: err.message
    });
  }
  
  res.status(500).json({ message: 'Something went wrong!', error: err.message });
});

// ── Initialize Application ────────────────────────────────────────────────
const initializeApp = async () => {
  try {
    // Connect to Database
    await connectDB();
    console.log('✅ Database connected');
    
    // Connect to Redis (non-blocking - don't crash if Redis fails)
    try {
      await redisService.connect();
      console.log('✅ Redis connected successfully');
      
      // Only flush cache if in development mode
      if (process.env.NODE_ENV !== 'production') {
        await redisService.flushAll();
        console.log('🧹 Redis cache cleared (development mode)');
      }
    } catch (redisError) {
      console.warn('⚠️ Redis connection failed, continuing without cache:', redisError.message);
      // Don't crash the app - Redis is optional for caching
    }
    
    // Initial sync from Zoho (non-blocking)
    try {
      const result = await ItemSyncService.syncFromZoho();
      if (result.success) {
        console.log('✅ Initial Zoho sync completed');
      } else {
        console.error('❌ Initial Zoho sync failed:', result.error);
      }
    } catch (syncError) {
      console.error('❌ Zoho sync error:', syncError.message);
    }
    
  } catch (error) {
    console.error('❌ Application initialization failed:', error.message);
    // Don't exit - let the app run even if initialization fails partially
  }
};

// ── Start Server (for local development only) ────────────────────────────
const PORT = process.env.PORT || 5000;

if (!process.env.VERCEL && !process.env.AWS_LAMBDA_FUNCTION_NAME) {
  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📡 Environment: ${process.env.NODE_ENV || 'development'}`);
  });
  
  // Initialize app after server starts
  initializeApp();
  
  // ── Graceful Shutdown ─────────────────────────────────────────────────
  const gracefulShutdown = async (signal) => {
    console.log(`\n⚠️ Received ${signal}, starting graceful shutdown...`);
    
    server.close(async () => {
      console.log('📡 HTTP server closed');
      
      // Disconnect Redis gracefully
      await redisService.disconnect();
      
      console.log('👋 Graceful shutdown completed');
      process.exit(0);
    });
    
    // Force shutdown after 10 seconds
    setTimeout(() => {
      console.error('⚠️ Could not close connections in time, forcefully shutting down');
      process.exit(1);
    }, 10000);
  };
  
  // Handle various shutdown signals
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGQUIT', () => gracefulShutdown('SIGQUIT'));
  
  // Handle uncaught errors
  process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error);
    gracefulShutdown('uncaughtException');
  });
  
  process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  });
} else {
  // Serverless environment (Vercel, AWS Lambda)
  module.exports = app;
  
  // Still initialize for serverless (but don't start server)
  initializeApp();
}