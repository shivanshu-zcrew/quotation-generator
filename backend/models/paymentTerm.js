const mongoose = require('mongoose');

const paymentTermSchema = new mongoose.Schema({
  // Records which company this was first saved under, for reference only —
  // NOT used to scope visibility. Payment terms are shared globally: one
  // saved under any company shows up for every company.
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    index: true
  },
  value: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, { timestamps: true });

// Case-insensitive uniqueness GLOBALLY (not per company) — reusing the same
// phrasing (any case), from any company, should never create a duplicate
// saved entry.
paymentTermSchema.index(
  { value: 1 },
  { unique: true, collation: { locale: 'en', strength: 2 } }
);
paymentTermSchema.index({ createdAt: -1 });

module.exports = mongoose.model('PaymentTerm', paymentTermSchema);
