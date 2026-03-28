const mongoose = require('mongoose');

const syncLogSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['customers', 'items', 'estimates'],
    required: true
  },
  lastSyncAt: {
    type: Date,
    default: Date.now
  },
  status: {
    type: String,
    enum: ['success', 'failed', 'in_progress'],
    default: 'success'
  },
  recordsProcessed: {
    type: Number,
    default: 0
  },
  recordsCreated: {
    type: Number,
    default: 0
  },
  recordsUpdated: {
    type: Number,
    default: 0
  },
  errors: {
    type: Number,
    default: 0
  },
  errorMessage: {
    type: String
  }
}, {
  timestamps: true
});

// Index for faster queries
syncLogSchema.index({ type: 1, lastSyncAt: -1 });

module.exports = mongoose.model('SyncLog', syncLogSchema);