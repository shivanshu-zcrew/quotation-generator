const mongoose = require('mongoose');

const termsTemplateSchema = new mongoose.Schema({
  // Records which company this was first saved under, for reference only —
  // NOT used to scope visibility. Templates are shared globally: one saved
  // under any company shows up for every company.
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    index: true
  },
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  // Sanitized HTML (sanitizeTerms() applied in the controller before save) —
  // same content shape as Quotation.termsAndConditions.
  content: {
    type: String,
    required: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  createdByName: {
    type: String,
    default: ''
  }
}, { timestamps: true });

// Case-insensitive uniqueness GLOBALLY (not per company) — "Standard Terms"
// and "standard terms" collide regardless of which company saves them,
// since the same template is now shared across every company.
termsTemplateSchema.index(
  { name: 1 },
  { unique: true, collation: { locale: 'en', strength: 2 } }
);
termsTemplateSchema.index({ createdAt: -1 });

module.exports = mongoose.model('TermsTemplate', termsTemplateSchema);
