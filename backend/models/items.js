// models/item.js
const mongoose = require('mongoose');

const itemSchema = new mongoose.Schema({
  // Add company reference
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true,
    index: true
  },
  zohoId: {
    type: String,
    required: true,
    index: true
  },
  name: {
    type: String,
    required: true,
    trim: true,
    index: true
  },
  price: {
    type: Number,
    required: true,
    min: 0,
    index: true
  },
  description: { 
    type: String, 
    trim: true 
  },
  sku: { 
    type: String, 
    trim: true, 
    index: true,
    sparse: true
  },
  unit: { 
    type: String, 
    trim: true 
  },
  product_type: { 
    type: String, 
    default: 'goods' 
  },
  tax_percentage: { 
    type: Number, 
    default: 0 
  },
  status: { 
    type: String, 
    default: 'active',
    index: true
  },
  is_taxable: { 
    type: Boolean, 
    default: true 
  },
  can_be_sold: { 
    type: Boolean, 
    default: true 
  },
  imagePath: { 
    type: String, 
    default: null 
  },
  imagePublicId: { 
    type: String, 
    default: null 
  },
  lastSyncedAt: { 
    type: Date, 
    default: Date.now,
    index: true
  },
  lastModifiedTime: { 
    type: String 
  },
  isActive: { 
    type: Boolean, 
    default: true,
    index: true
  },
  zohoData: { 
    type: Object, 
    default: null 
  }
}, { 
  timestamps: true 
});

// Compound unique index for company + zohoId
itemSchema.index({ companyId: 1, zohoId: 1 }, { unique: true });

// Compound indexes for common queries
itemSchema.index({ companyId: 1, isActive: 1, name: 1 });
itemSchema.index({ companyId: 1, isActive: 1, price: 1 });
itemSchema.index({ companyId: 1, isActive: 1, status: 1 });
itemSchema.index({ companyId: 1, isActive: 1, lastSyncedAt: -1 });
itemSchema.index({ companyId: 1, sku: 1 }, { sparse: true });

// Text search index with company filter
itemSchema.index({ 
  companyId: 1,
  name: 'text', 
  sku: 'text', 
  description: 'text' 
}, {
  weights: { name: 10, sku: 8, description: 3 },
  name: 'item_search_idx'
});

module.exports = mongoose.models.Item || mongoose.model('Item', itemSchema);