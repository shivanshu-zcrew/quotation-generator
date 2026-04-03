// models/company.js
const mongoose = require('mongoose');
const { CURRENCY_CODES } = require('./constants');

const companySchema = new mongoose.Schema({
  code: { 
    type: String, 
    required: true, 
    unique: true,
    uppercase: true,
    trim: true,
    index: true
  },
  name: { 
    type: String, 
    required: true,
    trim: true,
    index: true
  },
  slug: { 
    type: String, 
    required: true,
    unique: true,
    lowercase: true,
    index: true
  },
  // Add Zoho Organization ID for this company
  zohoOrganizationId: {
    type: String,
    required: true,
    unique: true,
    index: true
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
    enum: CURRENCY_CODES,
    index: true
  },
  acceptedCurrencies: [{
    type: String,
    enum: CURRENCY_CODES
  }],
  bankDetails: {
    bankName: String,
    accountName: String,
    accountNumber: String,
    iban: String,
    swift: String
  },
  isActive: { 
    type: Boolean, 
    default: true,
    index: true
  }
}, {
  timestamps: true
});

// Compound indexes for common queries
companySchema.index({ isActive: 1, name: 1 });
companySchema.index({ isActive: 1, code: 1 });
companySchema.index({ createdAt: -1, isActive: 1 });

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