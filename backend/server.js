require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const cloudinary = require('cloudinary').v2;

const connectDB = require('./config/db');
const redisService = require('./config/redisService'); 
const ItemSyncService = require('./utils/itemsSync');
const app = express();

// ── CORS Configuration ───────────────────────────────────────────────────
const allowedOrigins = [
  'http://localhost:3000', 
  'http://13.232.90.158',
];

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  credentials: true,
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// ── Body parsing middleware ──────────────────────────────────────────────
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// TEMPORARY DEBUG — remove after fixing
console.log('CLOUDINARY CHECK:', {
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
    ? `${process.env.CLOUDINARY_API_SECRET.slice(0,4)}...${process.env.CLOUDINARY_API_SECRET.slice(-4)} (len:${process.env.CLOUDINARY_API_SECRET.length})`
    : 'MISSING',
});

// ── Cloudinary config ─────────────────────────────────────────────────────
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// ── Database ──────────────────────────────────────────────────────────────
connectDB();

// ── Routes ────────────────────────────────────────────────────────────────
const customerRoutes  = require('./routes/customerRoutes');
const itemRoutes      = require('./routes/itemRoutes');
const quotationRoutes = require('./routes/quotationRoutes');
const authRoutes      = require('./routes/authRoutes');
const adminRoutes     = require('./routes/adminRoutes');
const exchangeRateRoutes = require('./routes/exchangeRates'); 
const companyRoutes = require('./routes/companyRoutes');

app.use('/api/customers',  customerRoutes);
app.use('/api/items',      itemRoutes);
app.use('/api/quotations', quotationRoutes);
app.use('/api/auth',       authRoutes);
app.use('/api/admin',      adminRoutes);
app.use('/api/exchange-rates', exchangeRateRoutes);
app.use('/api/companies', companyRoutes); 

// ── Root ──────────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({ message: 'Quotation System API Running' });
});

// ── Zoho estimate proxy ───────────────────────────────────────────────────
app.post('/api/zoho/create-estimate', async (req, res) => {
  try {
    const zohoResponse = await fetch(
      'https://www.zohoapis.com/books/v3/estimates?organization_id=910990837',
      {
        method:  'POST',
        headers: {
          'Authorization': 'Zoho-oauthtoken 1000.18bf27ab6ed4bcca503ef2af32b07079.3ad120e038e8e2200390db5942d51ab4',
          'Content-Type':  'application/json',
        },
        body: JSON.stringify(req.body),
      }
    );
    const data = await zohoResponse.json();
    if (!zohoResponse.ok) return res.status(zohoResponse.status).json(data);
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to contact Zoho' });
  }
});

// ── Redis Health Check Endpoint ───────────────────────────────────────────
app.get('/api/health/redis', async (req, res) => {
  try {
    // Test Redis connection by setting and getting a test key
    await redisService.set('health_check', 'ok', 10);
    const result = await redisService.get('health_check');
    
    res.json({
      success: true,
      connected: redisService.isConnected,
      test: result === 'ok' ? 'passed' : 'failed',
      message: redisService.isConnected ? 'Redis is connected' : 'Redis is not connected'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      connected: false,
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

(async () => {
   
  const result = await ItemSyncService.syncFromZoho();
  if (result.success) {
     
  } else {
    console.error('❌ Initial sync failed:', result.error);
  }
})();

const cron = require('node-cron');
cron.schedule('*/30 * * * *', async () => {
   
  await ItemSyncService.syncFromZoho();
});


// ── Start Server (for local development only) ────────────────────────────
const PORT = process.env.PORT || 5000;

if (!process.env.VERCEL && !process.env.AWS_LAMBDA_FUNCTION_NAME) {
  const server = app.listen(PORT, '0.0.0.0', () => {
     
     
     
     
  });

  // ── Graceful Shutdown ─────────────────────────────────────────────────
  const gracefulShutdown = async (signal) => {
     
    
    server.close(async () => {
       
      
      // Disconnect Redis
      await redisService.disconnect();
      
       
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
}

module.exports = app;