require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const cloudinary = require('cloudinary').v2;

const connectDB = require('./config/db');

const app = express();

// ── CORS Configuration ───────────────────────────────────────────────────
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://51.20.109.158:5000',
  'https://your-production-domain.com' 
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

// Handle preflight requests
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

app.use('/api/customers',  customerRoutes);
app.use('/api/items',      itemRoutes);
app.use('/api/quotations', quotationRoutes);
app.use('/api/auth',       authRoutes);
app.use('/api/admin',      adminRoutes);

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

// ── Global error handler ──────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err.stack);
  
  // Handle CORS errors specifically
  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json({ 
      message: 'CORS error: Origin not allowed',
      error: err.message 
    });
  }
  
  res.status(500).json({ message: 'Something went wrong!', error: err.message });
});

// ── Start (for local development only) ────────────────────────────────────
const PORT = process.env.PORT || 5000;

// Only start the server if we're not in a serverless environment
if (!process.env.VERCEL && !process.env.AWS_LAMBDA_FUNCTION_NAME) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`CORS enabled for origins:`, allowedOrigins);
  });
}

// Export the app for serverless environments
module.exports = app;