const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true,
    index: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },

  type: {
    type: String,
    enum: [
      'sync_completed',          // New
      'new_customer',            // New
      'quotation_submitted',
      'approval_needed',
      'quotation_approved',
      'quotation_rejected',
      'revision_requested',
      'quotation_awarded',
      'quotation_expired',
      'info',
      'warning',
      'error'
    ],
    required: true
  },

  title: { type: String, required: true },
  message: { type: String, required: true },

  // References
  quotationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Quotation'
  },
  customerId: {                    // New - for new customer
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Customer'
  },

  quotationNumber: String,
  customerName: String,            // New

  actionUrl: String,               // e.g., "/quotations/123" or "/customers/456"

  isRead: { type: Boolean, default: false },
  isArchived: { type: Boolean, default: false },
  
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium'
  },

  metadata: {
    type: Object,
    default: {}
  },

  readAt: Date,
  expiresAt: {
    type: Date,
    default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
  },

  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  }
});

// ============== INDEXES ==============
notificationSchema.index({ userId: 1, isRead: 1, createdAt: -1 });
notificationSchema.index({ companyId: 1, createdAt: -1 });
notificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
notificationSchema.index({ userId: 1, type: 1 });

// ============== VIRTUALS ==============
notificationSchema.virtual('timeAgo').get(function() {
  const diff = Date.now() - this.createdAt;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
});

module.exports = mongoose.model('Notification', notificationSchema);