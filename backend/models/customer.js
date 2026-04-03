// models/customer.js
const mongoose = require('mongoose');
const {
  TAX_TREATMENT_VALUES,
  CURRENCY_OPTIONS,
  CURRENCY_CODES
} = require('./constants');

const customerSchema = new mongoose.Schema(
  {
    // Add company reference
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
      index: true
    },
    name: {
      type: String,
      required: [true, 'Please provide a customer name'],
      trim: true,
      minlength: [2, 'Customer name must be at least 2 characters'],
      maxlength: [100, 'Customer name cannot exceed 100 characters'],
      index: true
    },
    zohoId: { 
      type: String,
      index: true
    },
    email: { 
      type: String, 
      lowercase: true, 
      trim: true,
      index: true,
      sparse: true,
      set: function(value) {
        if (!value || value.trim() === '') {
          return null;
        }
        return value;
      }
    },
    phone: { 
      type: String, 
      trim: true, 
      maxlength: [20, 'Phone number cannot exceed 20 characters'],
      index: true
    },
    address: { 
      type: String, 
      trim: true, 
      maxlength: [500, 'Address cannot exceed 500 characters'] 
    },
    companyName: { 
      type: String, 
      trim: true, 
      maxlength: [200, 'Company name cannot exceed 200 characters'] 
    },
    website: { 
      type: String, 
      trim: true 
    },
    notes: { 
      type: String, 
      trim: true, 
      maxlength: [1000, 'Notes cannot exceed 1000 characters'] 
    },
    taxTreatment: {
      type: String,
      enum: TAX_TREATMENT_VALUES,
      default: 'non_vat_registered',
      required: [true, 'Tax treatment is required'],
      index: true
    },
    taxRegistrationNumber: {
      type: String,
      trim: true,
      uppercase: true,
      set: function(value) { 
        if (!value) return '';
        return value.replace(/[^\d]/g, ''); 
      }
    },
    placeOfSupply: {
      type: String,
      required: [true, 'Place of supply is required'],
      default: 'Dubai',
      index: true
    },
    defaultCurrency: {
      code: { 
        type: String, 
        enum: CURRENCY_CODES, 
        default: 'AED', 
        required: [true, 'Currency code is required'] 
      },
      symbol: { 
        type: String, 
        default: 'د.إ' 
      },
      name: { 
        type: String, 
        default: 'United Arab Emirates Dirham' 
      }
    },
    zohoSynced: { 
      type: Boolean, 
      default: false 
    },
    zohoSyncDate: { 
      type: Date 
    },
    zohoSyncError: { 
      type: String 
    },
    lastModifiedTime: { 
      type: String 
    },
    isActive: { 
      type: Boolean, 
      default: true,
      index: true
    },
    createdBy: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'User' 
    }
  },
  { 
    timestamps: true, 
    toJSON: { virtuals: true }, 
    toObject: { virtuals: true } 
  }
);

// Compound unique index for company + zohoId
customerSchema.index({ companyId: 1, zohoId: 1 }, { unique: true, sparse: true });

// Regular indexes
customerSchema.index({ companyId: 1, name: 1, isActive: 1 });
customerSchema.index({ companyId: 1, taxTreatment: 1, isActive: 1 });
customerSchema.index({ companyId: 1, placeOfSupply: 1, isActive: 1 });
customerSchema.index({ companyId: 1, createdAt: -1, isActive: 1 });
customerSchema.index({ companyId: 1, email: 1 }, { sparse: true });

// Text search index with company filter
customerSchema.index({ 
  companyId: 1,
  name: 'text', 
  email: 'text' 
}, {
  weights: { name: 10, email: 5 },
  name: 'customer_search_idx'
});

// Virtuals
customerSchema.virtual('isVatRegistered').get(function() {
  return this.taxTreatment === 'vat_registered' || this.taxTreatment === 'gcc_vat_registered';
});

customerSchema.virtual('displayName').get(function() {
  return `${this.name} (${this.placeOfSupply})`;
});

// Methods
customerSchema.methods.getFormattedData = function() {
  return {
    _id: this._id,
    name: this.name,
    email: this.email,
    phone: this.phone,
    address: this.address,
    companyName: this.companyName,
    website: this.website,
    notes: this.notes,
    taxTreatment: this.taxTreatment,
    taxRegistrationNumber: this.taxRegistrationNumber,
    placeOfSupply: this.placeOfSupply,
    defaultCurrency: this.defaultCurrency,
    isVatRegistered: this.isVatRegistered,
    zohoId: this.zohoId,
    zohoSynced: this.zohoSynced,
    isActive: this.isActive,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt
  };
};

customerSchema.methods.getZohoSyncData = function() {
  return {
    name: this.name,
    email: this.email,
    phone: this.phone,
    address: this.address,
    companyName: this.companyName,
    website: this.website,
    taxTreatment: this.taxTreatment,
    taxRegistrationNumber: this.taxRegistrationNumber,
    placeOfSupply: this.placeOfSupply,
    currencyCode: this.defaultCurrency.code
  };
};

// Pre-save middleware
customerSchema.pre('save', function(next) {
  if (!this.isVatRegistered) {
    this.taxRegistrationNumber = '';
  }
  
  const currencyInfo = CURRENCY_OPTIONS[this.defaultCurrency.code];
  if (currencyInfo) {
    this.defaultCurrency.symbol = currencyInfo.symbol;
    this.defaultCurrency.name = currencyInfo.name;
  }
  
  next();
});

module.exports = {
  Customer: mongoose.model('Customer', customerSchema),
  constants: require('./constants')
};