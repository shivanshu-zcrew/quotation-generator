// models/company.js
const mongoose = require('mongoose');

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

  // Company details
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

  // Tax & Registration
  vatNumber: String,
  crNumber: String,
  taxRate: { type: Number, default: 5 },

  // Currency settings
  baseCurrency: { 
    type: String, 
    default: 'AED',
    enum: ['AED', 'USD', 'SAR', 'QAR', 'KWD', 'BHD', 'OMR']
  },
  acceptedCurrencies: [{
    type: String,
    enum: ['AED', 'USD', 'SAR', 'QAR', 'KWD', 'BHD', 'OMR']
  }],

  // Bank details
  bankDetails: {
    bankName: String,
    accountName: String,
    accountNumber: String,
    iban: String,
    swift: String
  },

  // Status
  isActive: { type: Boolean, default: true },

  // Timestamps
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, {
  timestamps: true
});

// Pre-save middleware
companySchema.pre('save', function(next) {
  if (this.isModified('name') && !this.slug) {
    this.slug = this.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }
  next();
});

module.exports = mongoose.models.Company || mongoose.model('Company', companySchema);