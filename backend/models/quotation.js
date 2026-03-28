const mongoose = require('mongoose');
const axios = require('axios');

// ===========================================
// CURRENCY CONFIGURATION
// ===========================================

const CURRENCIES = {
  AED: { symbol: 'د.إ', code: 'AED', name: 'UAE Dirham', decimalPlaces: 2, flag: '🇦🇪' },
  SAR: { symbol: '﷼', code: 'SAR', name: 'Saudi Riyal', decimalPlaces: 2, flag: '🇸🇦' },
  QAR: { symbol: '﷼', code: 'QAR', name: 'Qatari Riyal', decimalPlaces: 2, flag: '🇶🇦' },
  KWD: { symbol: 'د.ك', code: 'KWD', name: 'Kuwaiti Dinar', decimalPlaces: 3, flag: '🇰🇼' },
  BHD: { symbol: '.د.ب', code: 'BHD', name: 'Bahraini Dinar', decimalPlaces: 3, flag: '🇧🇭' },
  OMR: { symbol: '﷼', code: 'OMR', name: 'Omani Rial', decimalPlaces: 3, flag: '🇴🇲' },
  USD: { symbol: '$', code: 'USD', name: 'US Dollar', decimalPlaces: 2, flag: '🇺🇸' }
};

// ===========================================
// COMPANY SCHEMA (New separate collection)
// ===========================================

const companySchema = new mongoose.Schema({
  code: { 
    type: String, 
    required: true, 
    unique: true,
    uppercase: true,
    trim: true
  },
  name: { 
    type: String, 
    required: true,
    trim: true
  },
  slug: { 
    type: String, 
    required: true,
    unique: true,
    lowercase: true
  },
  address: {
    street: String,
    city: String,
    country: { type: String, default: 'UAE' },
    poBox: String
  },
  phone: String,
  email: String,
  website: String,
  logo: String,
  vatNumber: String,
  crNumber: String,
  taxRate: { type: Number, default: 5 },
  baseCurrency: { 
    type: String, 
    default: 'AED',
    enum: Object.keys(CURRENCIES)
  },
  acceptedCurrencies: [{
    type: String,
    enum: Object.keys(CURRENCIES)
  }],
  bankDetails: {
    bankName: String,
    accountName: String,
    accountNumber: String,
    iban: String,
    swift: String
  },
  isActive: { type: Boolean, default: true }
}, {
  timestamps: true
});

// Pre-save middleware for company
companySchema.pre('save', function(next) {
  if (this.isModified('name') && !this.slug) {
    this.slug = this.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }
  next();
});

const Company = mongoose.models.Company || mongoose.model('Company', companySchema);

// ===========================================
// EXCHANGE RATE CACHE SCHEMA
// ===========================================

const exchangeRateSchema = new mongoose.Schema({
  baseCurrency: { 
    type: String, 
    required: true, 
    default: 'AED' 
  },
  rates: { 
    type: Map, 
    of: Number, 
    required: true 
  },
  fetchedAt: { 
    type: Date, 
    default: Date.now,
    expires: 3600 // Auto-delete after 1 hour (TTL index)
  }
});

exchangeRateSchema.index({ fetchedAt: 1 }, { expireAfterSeconds: 3600 });

const ExchangeRate = mongoose.models.ExchangeRate || mongoose.model('ExchangeRate', exchangeRateSchema);

// ===========================================
// EXCHANGE RATE SERVICE
// ===========================================

class ExchangeRateService {
  static async getRates(baseCurrency = 'AED') {
    try {
      const cached = await ExchangeRate.findOne({ baseCurrency })
        .sort({ fetchedAt: -1 })
        .limit(1);
  
      try {
        console.log(`[ExchangeRateService] Fetching fresh rates for ${baseCurrency}...`);
        
        const response = await axios.get(`https://open.er-api.com/v6/latest/${baseCurrency}`, {
          timeout: 5000
        });
        
        if (response.data && response.data.rates) {
          const rates = {
            ...response.data.rates,
            [baseCurrency]: 1
          };
  
          console.log(`[ExchangeRateService] Fresh rates fetched successfully`);
          return rates;
        }
        
        throw new Error('Invalid API response');
        
      } catch (apiError) {
        console.error(`[ExchangeRateService] API fetch failed:`, apiError.message);
        
        if (cached) {
          const age = Date.now() - new Date(cached.fetchedAt).getTime();
          console.log(`[ExchangeRateService] Using cached rates from ${Math.floor(age / 1000)} seconds ago`);
          return cached.rates;
        }
        
        console.log(`[ExchangeRateService] No cache available, using fallback rates`);
        return this.getFallbackRates();
      }
      
    } catch (error) {
      console.error(`[ExchangeRateService] Fatal error:`, error);
      return this.getFallbackRates();
    }
  }
  
  static getFallbackRates() {
    return {
      AED: 1,
      USD: 0.2723,
      EUR: 0.2512,
      GBP: 0.2154,
      SAR: 1.0215,
      QAR: 0.9912,
      KWD: 0.0837,
      BHD: 0.1026,
      OMR: 0.1048,
      INR: 22.65,
      PKR: 75.89,
      EGP: 8.42
    };
  }

  static async convert(amount, fromCurrency, toCurrency = 'AED') {
    if (fromCurrency === toCurrency) return amount;
    
    try {
      const rates = await this.getRates(fromCurrency);
      const rate = rates[toCurrency];
      
      if (rate) {
        return amount * rate;
      }
      
      throw new Error(`Rate not found for ${toCurrency}`);
      
    } catch (error) {
      console.error(`[ExchangeRateService] Conversion failed:`, error.message);
      
      try {
        const aedRates = await this.getRates('AED');
        const fromToAED = 1 / aedRates[fromCurrency];
        const aedToTarget = aedRates[toCurrency];
        
        const result = amount * fromToAED * aedToTarget;
        
        if (!isNaN(result) && result > 0) {
          return result;
        }
        
        throw new Error('Invalid conversion result');
        
      } catch (fallbackError) {
        console.error(`[ExchangeRateService] Fallback conversion failed:`, fallbackError.message);
        
        const approxRates = {
          'AED': 1,
          'USD': 0.27,
          'SAR': 1.02,
          'QAR': 0.99,
          'KWD': 0.084,
          'BHD': 0.103,
          'OMR': 0.105
        };
        
        const rate = approxRates[toCurrency] / approxRates[fromCurrency];
        return amount * rate;
      }
    }
  }
}

// ===========================================
// QUOTATION DOCUMENT SCHEMA
// ===========================================

const quotationDocumentSchema = new mongoose.Schema({
  fileName: { type: String, required: true },
  fileType: { type: String, required: true },  
  fileSize: { type: Number, required: true },  
  fileUrl: { type: String, required: true },
  publicId: { type: String, required: true },
  uploadedAt: { type: Date, default: Date.now },
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  description: { type: String, default: '' }
}, { _id: true });


// ===========================================
// QUOTATION ITEM SCHEMA
// ===========================================

const quotationItemSchema = new mongoose.Schema(
  {
    itemId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Item',
      required: true,
    },
    description: { 
      type: String, 
      default: '' 
    },
    quantity: {
      type: Number,
      required: [true, 'Please provide quantity'],
      min: [1, 'Quantity must be at least 1'],
    },
    unitPrice: {
      type: Number,
      required: [true, 'Please provide unit price'],
      min: [0, 'Price cannot be negative'],
      set: v => Math.round(v * 100) / 100
    },
    unitPriceInBaseCurrency: {
      type: Number,
      required: true,
      set: v => Math.round(v * 100) / 100
    },
    totalPrice: {
      type: Number,
      required: true,
      set: v => Math.round(v * 100) / 100
    },
    totalPriceInBaseCurrency: {
      type: Number,
      required: true,
      set: v => Math.round(v * 100) / 100
    },
    imagePaths: [{ 
      type: String 
    }],
    imagePublicIds: [{ 
      type: String 
    }],
  },
  { _id: false }
);

// ===========================================
// MAIN QUOTATION SCHEMA (UPDATED)
// ===========================================

const quotationSchema = new mongoose.Schema(
  {
    // ===== COMPANY REFERENCE (CRITICAL FOR FILTERING) =====
    companyId: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'Company', 
      required: [true, 'Quotation must belong to a company'],
      index: true 
    },
    
    // Company snapshot (store company details at time of creation)
    companySnapshot: {
      code: String,
      name: String,
      address: String,
      phone: String,
      email: String,
      vatNumber: String,
      crNumber: String,
      logo: String,
      bankDetails: {
        bankName: String,
        accountName: String,
        accountNumber: String,
        iban: String,
        swift: String
      }
    },

    // ===== CURRENCY SNAPSHOT =====
    currency: {
      code: { 
        type: String, 
        required: true,
        enum: Object.keys(CURRENCIES)
      },
      symbol: { 
        type: String, 
        required: true 
      },
      name: { 
        type: String, 
        required: true 
      },
      decimalPlaces: { 
        type: Number, 
        default: 2 
      },
      exchangeRate: {
        rate: { 
          type: Number, 
          required: true,
          min: 0
        },
        baseCurrency: { 
          type: String, 
          required: true,
          default: 'AED'
        },
        fetchedAt: { 
          type: Date, 
          required: true,
          default: Date.now 
        }
      }
    },

    // Core identification
    quotationNumber: { 
      type: String, 
      required: true,
      index: true 
    },

    // Customer information
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      required: true,
      index: true
    },
    customerSnapshot: {
      name: { 
        type: String, 
        required: true 
      },
      email: String,
      phone: String,
      address: String,
      country: { 
        type: String, 
        default: 'UAE' 
      },
      vatNumber: String
    },
    contact: { 
      type: String, 
      default: '' 
    },

    // Dates
    date: { 
      type: Date, 
      default: Date.now, 
      index: true 
    },
    expiryDate: { 
      type: Date, 
      required: true, 
      index: true 
    },
    queryDate: { 
      type: Date, 
      default: null 
    },

    // Reference fields
    ourRef: { 
      type: String, 
      default: '' 
    },
    ourContact: { 
      type: String, 
      default: '' 
    },
    salesOffice: { 
      type: String, 
      default: '' 
    },
    paymentTerms: { 
      type: String, 
      default: '' 
    },
    deliveryTerms: { 
      type: String, 
      default: '' 
    },
    tl:{
      type: String, 
      default: '' 
    },
    trn: { 
      type: String, 
      default: '' 
    },
    projectName:{
      type: String, 
      // required: true,
      index: true 
    },
    // Items
    items: [quotationItemSchema],

    // Tax and discount percentages
    taxPercent: { 
      type: Number, 
      default: 0, 
      min: 0, 
      max: 100 
    },
    discountPercent: { 
      type: Number, 
      default: 0, 
      min: 0, 
      max: 100 
    },

    // Financial totals (in selected currency)
    subtotal: { 
      type: Number, 
      required: true,
      set: v => Math.round(v * 100) / 100
    },
    taxAmount: { 
      type: Number, 
      required: true,
      set: v => Math.round(v * 100) / 100
    },
    discountAmount: { 
      type: Number, 
      required: true,
      set: v => Math.round(v * 100) / 100
    },
    total: { 
      type: Number, 
      required: true,
      index: true,
      set: v => Math.round(v * 100) / 100
    },

    // Financial totals in company base currency (usually AED)
    subtotalInBaseCurrency: { 
      type: Number, 
      required: true,
      set: v => Math.round(v * 100) / 100
    },
    taxAmountInBaseCurrency: { 
      type: Number, 
      required: true,
      set: v => Math.round(v * 100) / 100
    },
    discountAmountInBaseCurrency: { 
      type: Number, 
      required: true,
      set: v => Math.round(v * 100) / 100
    },
    totalInBaseCurrency: { 
      type: Number, 
      required: true,
      index: true,
      set: v => Math.round(v * 100) / 100
    },

    // Additional fields
    notes: { 
      type: String, 
      default: '' 
    },
    termsAndConditions: { 
      type: String, 
      default: '' 
    },
    termsImage: { 
      type: String, 
      default: null 
    },
    termsImagePublicId: { 
      type: String, 
      default: null 
    },
    internalDocuments: [quotationDocumentSchema],
    // Workflow status
    status: {
      type: String,
      enum: [
        'draft', 'pending', 'ops_approved', 'ops_rejected',
        'approved', 'rejected', 'awarded', 'not_awarded', 'sent'
      ],
      default: 'pending',
      index: true
    },

    // User references
    createdBy: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'User', 
      required: true,
      index: true 
    },
    createdBySnapshot: {
      name: String,
      email: String
    },

    // Ops review
    opsApprovedBy: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'User' 
    },
    opsApprovedAt: { 
      type: Date 
    },
    opsRejectionReason: { 
      type: String, 
      default: '' 
    },

    // Admin review
    approvedBy: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'User' 
    },
    approvedAt: { 
      type: Date 
    },
    rejectionReason: { 
      type: String, 
      default: '' 
    },
   
zohoEstimateId: {
  type: String,
  default: null,
  index: true
},
zohoEstimateNumber: {
  type: String,
  default: null
},
zohoEstimateUrl: {
  type: String,
  default: null
},
zohoSyncedAt: {
  type: Date,
  default: null
},

    // Award
    awardedBy: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'User' 
    },
    awardedAt: { 
      type: Date 
    },
    awardNote: { 
      type: String, 
      default: '' 
    },
  },
  { 
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// ===========================================
// UPDATED INDEXES - Critical for company filtering
// ===========================================

// Most important - filter by company (used when dropdown changes)
quotationSchema.index({ companyId: 1 });

// Company + Status (for dashboard tabs)
quotationSchema.index({ companyId: 1, status: 1, createdAt: -1 });

// Company + Date range
quotationSchema.index({ companyId: 1, date: -1 });

// Company + Customer
quotationSchema.index({ companyId: 1, customerId: 1, createdAt: -1 });

// Company + Currency
quotationSchema.index({ companyId: 1, 'currency.code': 1, totalInBaseCurrency: 1 });

// Company + CreatedBy (user's quotations per company)
quotationSchema.index({ companyId: 1, createdBy: 1, status: 1 });

// Company + Query date follow-ups
quotationSchema.index({ companyId: 1, queryDate: 1, status: 1 });

// Company + Quotation number (unique per company)
quotationSchema.index({ companyId: 1, quotationNumber: 1 }, { unique: true });

// Revenue reports (company + date)
quotationSchema.index({ companyId: 1, totalInBaseCurrency: 1, createdAt: -1 });

// ===========================================
// UPDATED MIDDLEWARE
// ===========================================

// Pre-save middleware to set company snapshot
quotationSchema.pre('save', async function(next) {
  try {
    // If this is a new quotation or company changed, update company snapshot
    if (this.isNew || this.isModified('companyId')) {
      const company = await Company.findById(this.companyId);
      if (company) {
        this.companySnapshot = {
          code: company.code,
          name: company.name,
          address: company.address?.street ? 
            `${company.address.street}, ${company.address.city}, ${company.address.country}` : 
            company.address,
          phone: company.phone,
          email: company.email,
          vatNumber: company.vatNumber,
          crNumber: company.crNumber,
          logo: company.logo,
          bankDetails: company.bankDetails
        };
      }
    }

    // Set currency details if code changed
    if (this.isModified('currency.code')) {
      const currency = CURRENCIES[this.currency.code];
      if (currency) {
        this.currency.symbol = currency.symbol;
        this.currency.name = currency.name;
        this.currency.decimalPlaces = currency.decimalPlaces;
      }
    }

    next();
  } catch (error) {
    next(error);
  }
});

// Auto-populate references (including company)
quotationSchema.pre(/^find/, function(next) {
  this.populate('customerId', 'name email phone address');
  this.populate('createdBy', 'name email');
  this.populate('opsApprovedBy', 'name email');
  this.populate('approvedBy', 'name email');
  this.populate('awardedBy', 'name email');
  this.populate('companyId', 'name code baseCurrency logo address phone email');
  next();
});

// ===========================================
// VIRTUALS
// ===========================================

quotationSchema.virtual('totalFormatted').get(function() {
  return `${this.currency.symbol} ${this.total.toFixed(this.currency.decimalPlaces || 2)}`;
});

quotationSchema.virtual('totalInBaseFormatted').get(function() {
  return `AED ${this.totalInBaseCurrency.toFixed(2)}`;
});

quotationSchema.virtual('isExpired').get(function() {
  return this.expiryDate && new Date(this.expiryDate) < new Date();
});

quotationSchema.virtual('daysUntilExpiry').get(function() {
  if (!this.expiryDate) return null;
  const diff = new Date(this.expiryDate) - new Date();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
});

// ===========================================
// UPDATED STATIC METHODS
// ===========================================

// Get all companies (from database, not hardcoded)
quotationSchema.statics.getCompanies = async function() {
  return await Company.find({ isActive: true }).lean();
};

quotationSchema.statics.getCurrencies = function() {
  return CURRENCIES;
};

quotationSchema.statics.getExchangeRates = async function(baseCurrency = 'AED') {
  return await ExchangeRateService.getRates(baseCurrency);
};

quotationSchema.statics.convertAmount = async function(amount, fromCurrency, toCurrency = 'AED') {
  return await ExchangeRateService.convert(amount, fromCurrency, toCurrency);
};

// NEW: Get quotations for a specific company (used when dropdown changes)
quotationSchema.statics.getForCompany = function(companyId, query = {}, pagination = {}) {
  const { page = 1, limit = 20, sort = { createdAt: -1 } } = pagination;
  const skip = (page - 1) * limit;
  
  return this.find({ companyId, ...query })
    .sort(sort)
    .skip(skip)
    .limit(limit)
    .populate('customerId', 'name email')
    .populate('createdBy', 'name');
};

// NEW: Get dashboard stats for a specific company
quotationSchema.statics.getStatsForCompany = async function(companyId) {
  const matchStage = { companyId };
  
  const [total, byStatus, totalValue] = await Promise.all([
    this.countDocuments(matchStage),
    this.aggregate([
      { $match: matchStage },
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]),
    this.aggregate([
      { $match: { ...matchStage, status: { $in: ['approved', 'awarded'] } } },
      { $group: { _id: null, total: { $sum: '$totalInBaseCurrency' } } }
    ])
  ]);

  const counts = {
    total,
    pending: 0, ops_approved: 0, ops_rejected: 0,
    approved: 0, rejected: 0, awarded: 0, not_awarded: 0, draft: 0
  };

  byStatus.forEach(item => {
    counts[item._id] = item.count;
  });

  return {
    counts,
    totalApprovedValue: totalValue[0]?.total || 0
  };
};

// ===========================================
// INSTANCE METHODS
// ===========================================

quotationSchema.methods.refreshExchangeRate = async function() {
  try {
    const rates = await ExchangeRateService.getRates('AED');
    const rate = rates[this.currency.code];
    
    if (rate) {
      this.currency.exchangeRate = {
        rate,
        baseCurrency: 'AED',
        fetchedAt: new Date()
      };
      
      // Recalculate base currency values
      this.subtotalInBaseCurrency = this.subtotal * rate;
      this.taxAmountInBaseCurrency = this.taxAmount * rate;
      this.discountAmountInBaseCurrency = this.discountAmount * rate;
      this.totalInBaseCurrency = this.total * rate;
      
      // Update item prices in base currency
      this.items.forEach(item => {
        item.unitPriceInBaseCurrency = item.unitPrice * rate;
        item.totalPriceInBaseCurrency = item.totalPrice * rate;
      });
      
      await this.save();
      return true;
    }
    return false;
  } catch (error) {
    console.error('Error refreshing exchange rate:', error);
    return false;
  }
};

// Check if quotation belongs to a specific company
quotationSchema.methods.belongsToCompany = function(companyId) {
  return this.companyId.toString() === companyId.toString();
};

// ===========================================
// EXPORTS
// ===========================================

const Quotation = mongoose.models.Quotation || mongoose.model('Quotation', quotationSchema);

module.exports = {
  Quotation,
  Company,
  ExchangeRate,
  ExchangeRateService,
  CURRENCIES
};