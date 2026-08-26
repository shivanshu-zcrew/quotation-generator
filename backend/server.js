require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cloudinary = require('cloudinary').v2;
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');

const connectDB = require('./config/db');
const redisService = require('./config/redisService');
const ItemSyncService = require('./utils/itemsSync');
const logger = require('./config/logger');
const { httpLogger, requestLogger } = require('./middleware/httpLogger');

const app = express();

// nginx (see /etc/nginx/sites-available/quotation.megarme.com on the EC2
// host) sits directly in front of this process and sets X-Forwarded-For/
// X-Forwarded-Proto. Without this, Express ignores those headers and
// req.ip resolves to nginx's own loopback address for every request —
// which means every rate limiter below (the global 600/min limiter and
// authRoutes.js's 20-attempts/15min login limiter) keys off ONE shared
// "IP" for all users combined, instead of limiting each real client
// independently. `1` trusts exactly one hop (this nginx) rather than the
// whole X-Forwarded-For chain, since a client could otherwise forge extra
// hops to spoof req.ip.
app.set('trust proxy', 1);

// ── Logger setup ───────────────────────────────────────────────────
// Use HTTP logger middleware
app.use(httpLogger);
app.use(requestLogger);

// ── CORS Configuration ───────────────────────────────────────────────────
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : [];

const corsOptions = {
  origin: function (origin, callback) {
    
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    } else {
      logger.warn(`CORS blocked request from origin: ${origin}`);
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

app.use(helmet());
app.use(compression());
app.use(cors(corsOptions));
app.options('*', (req, res) => {
  res.sendStatus(200);
});

const limiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 600,
  handler: (req, res) => {
    logger.warn(`Rate limit exceeded for IP: ${req.ip}`);
    res.status(429).json({ message: 'Too many requests, please try again later.' });
  }
});

app.use(limiter);

// ── Body parsing middleware ──────────────────────────────────────────────
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ limit: '25mb', extended: true }));

// Strips any key starting with "$" or containing "." from req.body/req.query/
// req.params — closes a NoSQL operator-injection surface where several
// controllers assign a raw query-string value straight into a Mongo filter
// (e.g. ?status[$ne]=x would otherwise become { status: { $ne: 'x' } }).
app.use(mongoSanitize());

// ── Cloudinary config ─────────────────────────────────────────────────────
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// ── Routes ────────────────────────────────────────────────────────────────
const customerRoutes = require('./routes/customerRoutes');
const itemRoutes = require('./routes/itemRoutes');
const quotationRoutes = require('./routes/quotationRoutes');
const authRoutes = require('./routes/authRoutes');
const adminRoutes = require('./routes/adminRoutes');
const exchangeRateRoutes = require('./routes/exchangeRates');
const companyRoutes = require('./routes/companyRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const termsTemplateRoutes = require('./routes/termsTemplateRoutes');
const paymentTermRoutes = require('./routes/paymentTermRoutes');

app.use('/api/customers', customerRoutes);
app.use('/api/items', itemRoutes);
app.use('/api/quotations', quotationRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/exchange-rates', exchangeRateRoutes);
app.use('/api/companies', companyRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/terms-templates', termsTemplateRoutes);
app.use('/api/payment-terms', paymentTermRoutes);

// ── Root ──────────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  logger.info('API root accessed');
  res.json({ message: 'Quotation System API Running' });
});

// Health check endpoint. Registered at both paths because nginx
// (sites-available/quotation.megarme.com) only proxies /api/* to this
// process — bare /health falls through its `location /` block to the
// frontend's SPA instead, so an uptime monitor pointed at plain /health
// would only ever confirm the frontend is up, never this backend/its DB
// connection. /api/health is the one that actually reaches here.
const healthCheck = (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
};
app.get('/health', healthCheck);
app.get('/api/health', healthCheck);

// ── Global error handler ──────────────────────────────────────────────────
app.use((err, req, res, next) => {
  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json({
      message: 'CORS error: Origin not allowed',
      error: err.message
    });
  }
  next(err);
});

const errorHandler = require('./middleware/errorHandler');
app.use(errorHandler);

// ── Initialize Application ────────────────────────────────────────────────
const initializeApp = async () => {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    console.error('FATAL: JWT_SECRET env var is missing or shorter than 32 characters. Refusing to start.');
    process.exit(1);
  }

  try {
    logger.info('Starting application initialization...');
    
    // Connect to Database
    await connectDB();
    logger.info('Database connected successfully');
    
    // Connect to Redis (non-blocking - don't crash if Redis fails)
    try {
      await redisService.connect();
      logger.info('Redis connected successfully');
      
      // Only flush cache if in development mode
      if (process.env.NODE_ENV !== 'production') {
        await redisService.flushAll();
        logger.info('Redis cache cleared (development mode)');
      }
    } catch (redisError) {
      logger.warn(`Redis connection failed, continuing without cache: ${redisError.message}`);
    }
    
    // Initial sync from Zoho (non-blocking)
    try {
      const result = await ItemSyncService.syncFromZoho();
      if (result.success) {
        logger.info('Initial Zoho sync completed successfully');
      } else {
        logger.error(`Initial Zoho sync failed: ${result.error}`);
      }
    } catch (syncError) {
      logger.error(`Zoho sync error: ${syncError.message}`);
    }
    
    logger.info('Application initialization completed');
    
  } catch (error) {
    logger.error(`Application initialization failed: ${error.message}`, { stack: error.stack });
  }
};


// ── Start Server (for local development only) ────────────────────────────
const PORT = process.env.PORT || 5000;

if (!process.env.VERCEL && !process.env.AWS_LAMBDA_FUNCTION_NAME) {
  const server = app.listen(PORT, '0.0.0.0', () => {
    logger.info(`🚀 Server running on port ${PORT}`);
    logger.info(`📡 Environment: ${process.env.NODE_ENV || 'development'}`);
  });

  // Node's default keepAliveTimeout (5s) is shorter than the idle-connection
  // timeout most reverse proxies/load balancers use in front of this server
  // (commonly 60s, e.g. AWS ALB's default). When the proxy reuses a
  // keep-alive connection Node has already silently closed on its end, the
  // proxy sees the connection reset/timeout on an otherwise-healthy request
  // and returns a bare 502/504 to the client — intermittent, hard to
  // reproduce, and this is exactly that class of bug. keepAliveTimeout must
  // exceed the proxy's idle timeout, and Node requires headersTimeout to
  // exceed keepAliveTimeout.
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 66_000;

  initializeApp().then(() => {
    require('./cron/trnExpiryJob').start();
  });

  // if (true) {
  //   require('./cron/trnExpiryJob')
  //     .runTrnExpiryDeactivation()
  //     .then((r) => logger.info('Manual TRN run result', r))
  //     .catch((e) => logger.error('Manual TRN run error', e));
  // }
  
  // ── Graceful Shutdown ─────────────────────────────────────────────────
  const gracefulShutdown = async (signal) => {
    logger.warn(`Received ${signal}, starting graceful shutdown...`);
    
    server.close(async () => {
      logger.info('HTTP server closed');
      
      // Disconnect Redis gracefully
      await redisService.disconnect();
      
      // Close logger
      logger.info('👋 Graceful shutdown completed');
      
      // Give logger time to flush
      setTimeout(() => {
        process.exit(0);
      }, 1000);
    });
    
    // Force shutdown after 10 seconds
    setTimeout(() => {
      logger.error('Could not close connections in time, forcefully shutting down');
      process.exit(1);
    }, 10000);
  };
  
  // Handle various shutdown signals
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGQUIT', () => gracefulShutdown('SIGQUIT'));
  
  // Handle uncaught errors
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception:', error);
    gracefulShutdown('uncaughtException');
  });
  
  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  });
} else {
  module.exports = app;
  initializeApp();
}