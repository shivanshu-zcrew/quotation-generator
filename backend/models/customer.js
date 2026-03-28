const mongoose = require('mongoose');

// UAE Emirates for VAT registered customers
const UAE_EMIRATES = [
  'Abu Dhabi',
  'Ajman',
  'Dubai',
  'Fujairah',
  'Ras al-Khaimah',
  'Sharjah',
  'Umm al-Quwain'
];

// GCC Countries for non-VAT and GCC types
const GCC_COUNTRIES = [
  { name: 'Saudi Arabia', code: 'SA' },
  { name: 'Kuwait', code: 'KW' },
  { name: 'Qatar', code: 'QA' },
  { name: 'Bahrain', code: 'BH' },
  { name: 'Oman', code: 'OM' }
];

const GCC_COUNTRY_NAMES = GCC_COUNTRIES.map(c => c.name);
const ALL_PLACE_OPTIONS = [...UAE_EMIRATES, ...GCC_COUNTRY_NAMES];

// Tax Treatment Options
const TAX_TREATMENTS = [
  { value: 'vat_registered', label: 'VAT Registered', requiresTrn: true },
  { value: 'non_vat_registered', label: 'Non-VAT Registered', requiresTrn: false },
  { value: 'gcc_vat_registered', label: 'GCC VAT Registered', requiresTrn: true },
  { value: 'gcc_non_vat_registered', label: 'GCC Non-VAT Registered', requiresTrn: false }
];

const TAX_TREATMENT_VALUES = TAX_TREATMENTS.map(t => t.value);

// Currency Options
const CURRENCY_OPTIONS = {
  'AED': { code: 'AED', symbol: 'د.إ', name: 'United Arab Emirates Dirham' },
  'SAR': { code: 'SAR', symbol: 'ر.س', name: 'Saudi Riyal' },
  'KWD': { code: 'KWD', symbol: 'د.ك', name: 'Kuwaiti Dinar' },
  'QAR': { code: 'QAR', symbol: 'ر.ق', name: 'Qatari Riyal' },
  'BHD': { code: 'BHD', symbol: '.د.ب', name: 'Bahraini Dinar' },
  'OMR': { code: 'OMR', symbol: 'ر.ع.', name: 'Omani Rial' },
  'USD': { code: 'USD', symbol: '$', name: 'US Dollar' },
  'EUR': { code: 'EUR', symbol: '€', name: 'Euro' },
  'GBP': { code: 'GBP', symbol: '£', name: 'British Pound' }
};

const CURRENCY_CODES = Object.keys(CURRENCY_OPTIONS);

// Customer Schema
const customerSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Please provide a customer name'],
      trim: true,
      minlength: [2, 'Customer name must be at least 2 characters'],
      maxlength: [100, 'Customer name cannot exceed 100 characters']
    },
    zohoId: { type: String, unique: true, sparse: true },
email: { type: String, lowercase: true, trim: true },
    phone: { type: String, trim: true, maxlength: [20, 'Phone number cannot exceed 20 characters'] },
    address: { type: String, trim: true, maxlength: [500, 'Address cannot exceed 500 characters'] },
    companyName: { type: String, trim: true, maxlength: [200, 'Company name cannot exceed 200 characters'] },
    website: { type: String, trim: true },
    notes: { type: String, trim: true, maxlength: [1000, 'Notes cannot exceed 1000 characters'] },

    taxTreatment: {
      type: String,
      enum: TAX_TREATMENT_VALUES,
      default: 'non_vat_registered',
      required: [true, 'Tax treatment is required']
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
      default: 'Dubai'
    },

    defaultCurrency: {
      code: { type: String, enum: CURRENCY_CODES, default: 'AED', required: [true, 'Currency code is required'] },
      symbol: { type: String, default: 'د.إ' },
      name: { type: String, default: 'United Arab Emirates Dirham' }
    },
    zohoSynced: { type: Boolean, default: false },
    zohoSyncDate: { type: Date },
    zohoSyncError: { type: String },
    isActive: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

// Indexes
customerSchema.index({ email: 1 });
customerSchema.index({ name: 'text', email: 'text', phone: 'text' });
customerSchema.index({ zohoId: 1 });
customerSchema.index({ taxTreatment: 1 });
customerSchema.index({ placeOfSupply: 1 });
customerSchema.index({ isActive: 1 });
customerSchema.index({ createdAt: -1 });

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
  constants: {
    UAE_EMIRATES,
    GCC_COUNTRIES,
    GCC_COUNTRY_NAMES,
    ALL_PLACE_OPTIONS,
    TAX_TREATMENTS,
    TAX_TREATMENT_VALUES,
    CURRENCY_OPTIONS,
    CURRENCY_CODES
  }
};