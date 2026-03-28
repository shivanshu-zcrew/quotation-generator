// models/Item.js
const mongoose = require('mongoose');

const itemSchema = new mongoose.Schema({
  // MongoDB will create _id (ObjectId) automatically
  zohoId: {
    type: String,
    required: true,
    unique: true,
    index: true,
    description: 'Zoho Books item ID (19-digit number)'
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
    min: 0
  },
  description: { type: String, trim: true },
  sku: { type: String, trim: true, index: true },
  unit: { type: String, trim: true },
  product_type: { type: String, default: 'goods' },
  tax_percentage: { type: Number, default: 0 },
  status: { type: String, default: 'active' },
  is_taxable: { type: Boolean, default: true },
  can_be_sold: { type: Boolean, default: true },
  imagePath: { type: String, default: null },
  imagePublicId: { type: String, default: null },
  
  // Cache management
  lastSyncedAt: { type: Date, default: Date.now },
  isActive: { type: Boolean, default: true },
  
  // Optional: Store full Zoho data for debugging
  zohoData: { type: Object, default: null }
}, { 
  timestamps: true 
});

// Compound indexes for search
itemSchema.index({ name: 'text', sku: 'text', description: 'text' });

module.exports = mongoose.models.Item || mongoose.model('Item', itemSchema);