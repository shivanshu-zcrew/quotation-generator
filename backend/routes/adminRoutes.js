const express = require('express');
const router = express.Router();
const {
  getPendingQuotations,
  getAllQuotationsAdmin,
  approveQuotation,
  rejectQuotation,
  getDashboardStats
} = require('../controllers/adminController');
const { protect, adminOnly } = require('../middleware/auth');

// All routes require admin authentication
router.use(protect, adminOnly);

router.get('/dashboard', getDashboardStats);
router.get('/quotations/pending', getPendingQuotations);
router.get('/quotations', getAllQuotationsAdmin);
router.put('/quotations/:id/approve', approveQuotation);
router.put('/quotations/:id/reject', rejectQuotation);

module.exports = router;