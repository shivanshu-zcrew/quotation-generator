const mongoose = require('mongoose');
const {
  CURRENCY_OPTIONS,
  CURRENCY_CODES,
  QUOTATION_STATUSES,
  QUOTATION_STATUS_LIST
} = require('./constants');
const Company = require('./company');
const axios = require('axios');

// ===== EXCHANGE RATE SCHEMA =====
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
    index: { expireAfterSeconds: 3600 }
  }
});

const ExchangeRate = mongoose.models.ExchangeRate || mongoose.model('ExchangeRate', exchangeRateSchema);

// ===== EXCHANGE RATE SERVICE =====
class ExchangeRateService {
  static async getRates(baseCurrency = 'AED') {
    try {
      const cached = await ExchangeRate.findOne({ baseCurrency }).sort({ fetchedAt: -1 });
      
      const response = await axios.get(`https://open.er-api.com/v6/latest/${baseCurrency}`, { timeout: 5000 });
      
      if (response.data && response.data.rates) {
        return { ...response.data.rates, [baseCurrency]: 1 };
      }
      throw new Error('API failed');
    } catch (apiError) {
      if (cached) return cached.rates;
      return this.getFallbackRates();
    }
  }
  
  static getFallbackRates() {
    return {
      AED: 1, USD: 0.2723, EUR: 0.2512, GBP: 0.2154,
      SAR: 1.0215, QAR: 0.9912, KWD: 0.0837, BHD: 0.1026, OMR: 0.1048
    };
  }

  static async convert(amount, fromCurrency, toCurrency = 'AED') {
    if (fromCurrency === toCurrency) return amount;
    const rates = await this.getRates(fromCurrency);
    return amount * (rates[toCurrency] || 1);
  }
}

// ===== SUB-SCHEMAS =====
const quotationDocumentSchema = new mongoose.Schema({
  fileName: { type: String, required: true },
  fileType: { type: String, required: true },
  fileSize: { type: Number, required: true },
  fileUrl: { type: String, required: true },
  publicId: { type: String, required: true },
  uploadedAt: { type: Date, default: Date.now },
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  description: { type: String, default: '' }
});

const quotationItemSchema = new mongoose.Schema({
  itemId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Item',
    required: true,
  },
  zohoItemId: {
    type: String,
    index: true
  },
  description: { type: String, default: '' },
  quantity: {
    type: Number,
    required: true,
    min: 1,
  },
  unitPrice: {
    type: Number,
    required: true,
    min: 0,
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
  imagePaths: [{ type: String }],
  imagePublicIds: [{ type: String }],
}, { _id: false });

// ===== MAIN QUOTATION SCHEMA =====
const quotationSchema = new mongoose.Schema(
  {
    // Company reference
    companyId: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'Company', 
      required: true,
      index: true 
    },
    companySnapshot: {
      code: String,
      name: String,
      address: String,
      phone: String,
      email: String,
      vatNumber: String,
      crNumber: String,
      logo: String,
      zohoOrganizationId: String,  // ← ADD THIS FIELD
      bankDetails: {
        bankName: String,
        accountName: String,
        accountNumber: String,
        iban: String,
        swift: String
      }
    },

    // Currency
    currency: {
      code: { 
        type: String, 
        required: true,
        enum: CURRENCY_CODES
      },
      symbol: { type: String, required: true },
      name: { type: String, required: true },
      decimalPlaces: { type: Number, default: 2 },
      exchangeRate: {
        rate: { type: Number, required: true, min: 0 },
        baseCurrency: { type: String, required: true, default: 'AED' },
        fetchedAt: { type: Date, required: true, default: Date.now }
      }
    },

    // Core fields
    quotationNumber: { type: String, required: true, index: true },
    
    // Customer
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      required: true,
      index: true
    },
    customerSnapshot: {
      name: { type: String, required: true },
      email: String,
      phone: String,
      address: String,
      country: { type: String, default: 'UAE' },
      vatNumber: String,
      taxTreatment: { type: String, default: 'non_vat_registered' },  
  placeOfSupply: { type: String, default: 'Dubai' }  
    },
    contact: { type: String, default: '' },
    customerTaxTreatment: { 
      type: String, 
      default: 'non_vat_registered',
      enum: ['non_vat_registered', 'vat_registered', 'gcc_non_vat_registered', 'gcc_vat_registered']
    },
    customerPlaceOfSupply: { 
      type: String, 
      default: 'Dubai' 
    },
    // Dates
    date: { type: Date, default: Date.now, index: true },
    expiryDate: { type: Date, required: true, index: true },
    queryDate: { type: Date, default: null },

    // References
    ourRef: { type: String, default: '' },
    ourContact: { type: String, default: '' },
    salesManagerEmail: { type: String, default: '' },
    paymentTerms: { type: String, default: '' },
    deliveryTerms: { type: String, default: '' },
    tl: { type: String, default: '' },
    trn: { type: String, default: '' },
    projectName: { type: String, index: true },

    // Items
    items: [quotationItemSchema],

    // Tax & Discount
    taxPercent: { type: Number, default: 0, min: 0, max: 100 },
    discountPercent: { type: Number, default: 0, min: 0, max: 100 },

    // Totals (in selected currency)
    subtotal: { type: Number, required: true, set: v => Math.round(v * 100) / 100 },
    taxAmount: { type: Number, required: true, set: v => Math.round(v * 100) / 100 },
    discountAmount: { type: Number, required: true, set: v => Math.round(v * 100) / 100 },
    total: { type: Number, required: true, index: true, set: v => Math.round(v * 100) / 100 },

    // Totals (in base currency)
    subtotalInBaseCurrency: { type: Number, required: true, set: v => Math.round(v * 100) / 100 },
    taxAmountInBaseCurrency: { type: Number, required: true, set: v => Math.round(v * 100) / 100 },
    discountAmountInBaseCurrency: { type: Number, required: true, set: v => Math.round(v * 100) / 100 },
    totalInBaseCurrency: { type: Number, required: true, index: true, set: v => Math.round(v * 100) / 100 },

    // Notes & Terms
    notes: { type: String, default: '' },
    termsAndConditions: { type: String, default: '' },
    termsImages: [{
      url: { type: String, required: true },
      publicId: { type: String, required: true },
      fileName: { type: String },
      uploadedAt: { type: Date, default: Date.now }
    }],
    internalDocuments: [quotationDocumentSchema],

    // Status
    status: {
      type: String,
      enum: QUOTATION_STATUS_LIST,
      default: QUOTATION_STATUSES.PENDING,
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
      email: String,
      role: String
    },

    // Add these to your quotationSchema
opsApprovedBySnapshot: {
  name: String,
  email: String,
  role: String,
  approvedAt: { type: Date, default: Date.now }
},

approvedBySnapshot: {
  name: String,
  email: String,
  role: String,
  approvedAt: { type: Date, default: Date.now }
},
    // Ops review
    opsApprovedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    opsApprovedAt: { type: Date },
    opsRejectionReason: { type: String, default: '' },

    // Admin review
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    approvedAt: { type: Date },
    rejectionReason: { type: String, default: '' },

    // Zoho sync
    zohoEstimateId: { type: String, default: null, index: true, sparse: true },
    zohoEstimateNumber: { type: String, default: null },
    zohoEstimateUrl: { type: String, default: null },
    zohoSyncedAt: { type: Date, default: null },

    // Award
    awardedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    awardedAt: { type: Date },
    awardNote: { type: String, default: '' },
  },
  { 
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// ===== INDEXES =====
quotationSchema.index({ companyId: 1, status: 1, createdAt: -1 });
quotationSchema.index({ companyId: 1, date: -1 });
quotationSchema.index({ companyId: 1, customerId: 1 });
quotationSchema.index({ companyId: 1, createdBy: 1 });
quotationSchema.index({ companyId: 1, quotationNumber: 1 }, { unique: true });
quotationSchema.index({ companyId: 1, totalInBaseCurrency: 1 });
quotationSchema.index({ companyId: 1, queryDate: 1 });

// ===== PRE-SAVE MIDDLEWARE =====
quotationSchema.pre('save', async function(next) {
  try {
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
          zohoOrganizationId: company.zohoOrganizationId, // ← ADD THIS
          bankDetails: company.bankDetails
        };
      }
    }

    if (this.isModified('currency.code')) {
      const currency = CURRENCY_OPTIONS[this.currency.code];
      if (currency) {
        this.currency.symbol = currency.symbol;
        this.currency.name = currency.name;
        this.currency.decimalPlaces = currency.decimalPlaces;
      }
    }
    if (this.isNew || this.isModified('customerId')) {
      const Customer = mongoose.model('Customer');
      const customer = await Customer.findById(this.customerId);
      if (customer && this.customerSnapshot) {
        this.customerSnapshot.taxTreatment = customer.taxTreatment || 'non_vat_registered';
        this.customerSnapshot.placeOfSupply = customer.placeOfSupply || 'Dubai';
      }
    }
    next();
  } catch (error) {
    next(error);
  }
});

// ===== AUTO-POPULATE =====
quotationSchema.pre(/^find/, function(next) {
  this.populate('customerId', 'name email phone address');
  this.populate('createdBy', 'name email');
  this.populate('opsApprovedBy', 'name email');
  this.populate('approvedBy', 'name email');
  this.populate('awardedBy', 'name email');
  this.populate('companyId', 'name code baseCurrency logo zohoOrganizationId'); // ← ADD zohoOrganizationId
  next();
});

// ===== VIRTUALS =====
quotationSchema.virtual('totalFormatted').get(function() {
  return `${this.currency.symbol} ${this.total.toFixed(this.currency.decimalPlaces || 2)}`;
});

quotationSchema.virtual('totalInBaseFormatted').get(function() {
  return `AED ${this.totalInBaseCurrency.toFixed(2)}`;
});

quotationSchema.virtual('isExpired').get(function() {
  return this.expiryDate && new Date(this.expiryDate) < new Date();
});

// ===== STATIC METHODS =====
quotationSchema.statics.getForCompany = function(companyId, query = {}, pagination = {}) {
  const { page = 1, limit = 20, sort = { createdAt: -1 } } = pagination;
  return this.find({ companyId, ...query })
    .sort(sort)
    .skip((page - 1) * limit)
    .limit(limit);
};

quotationSchema.statics.getStatsForCompany = async function(companyId) {
  const byStatus = await this.aggregate([
    { $match: { companyId } },
    { $group: { _id: '$status', count: { $sum: 1 } } }
  ]);
  
  const totalValue = await this.aggregate([
    { $match: { companyId, status: { $in: ['approved', 'awarded'] } } },
    { $group: { _id: null, total: { $sum: '$totalInBaseCurrency' } } }
  ]);

  const counts = { total: byStatus.reduce((sum, s) => sum + s.count, 0) };
  byStatus.forEach(item => { counts[item._id] = item.count; });

  return {
    counts,
    totalApprovedValue: totalValue[0]?.total || 0
  };
};

quotationSchema.statics.convertAmount = ExchangeRateService.convert;

// ===== INSTANCE METHODS =====
quotationSchema.methods.belongsToCompany = function(companyId) {
  return this.companyId.toString() === companyId.toString();
};

// ===== EXPORTS =====
const Quotation = mongoose.models.Quotation || mongoose.model('Quotation', quotationSchema);

module.exports = {
  Quotation,
  Company: require('./company'),
  ExchangeRate,
  ExchangeRateService
};