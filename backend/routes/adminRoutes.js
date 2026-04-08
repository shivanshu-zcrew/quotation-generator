
const express = require('express');
const router  = express.Router();
const {
  // Ops-manager level
  getOpsPendingQuotations,
  opsApproveQuotation,
  opsRejectQuotation,
  getOpsReviewHistory,
  // Admin level
  getPendingQuotations,
  getAllQuotationsAdmin,
  approveQuotation,
  rejectQuotation,
  // Dashboard
  getAdminDashboardStats,
  getOpsDashboardStats,
  getUserQuotationStats,
  getQuotationsByUser
} = require('../controllers/adminController');
const { protect, adminOnly, opsManagerOrAdmin } = require('../middleware/auth');

// All routes require authentication
router.use(protect);

// ── Dashboard (admin only) ──────────────────────────────────
router.get('/dashboard', adminOnly, getAdminDashboardStats);
router.get('/ops-dashboard', opsManagerOrAdmin, getOpsDashboardStats);

// ── Ops-manager routes (ops_manager OR admin can access) ────
router.get('/quotations/ops-pending',      opsManagerOrAdmin, getOpsPendingQuotations);
router.put('/quotations/:id/ops-approve',  opsManagerOrAdmin, opsApproveQuotation);
router.put('/quotations/:id/ops-reject',   opsManagerOrAdmin, opsRejectQuotation);
router.get('/quotations/ops-history',     opsManagerOrAdmin, getOpsReviewHistory);

// ── Admin-only review routes ────────────────────────────────
router.get('/quotations/pending',     adminOnly, getPendingQuotations);
router.get('/quotations',             adminOnly, getAllQuotationsAdmin);
router.put('/quotations/:id/approve', adminOnly, approveQuotation);
router.put('/quotations/:id/reject',  adminOnly, rejectQuotation);
router.get('/user-stats', adminOnly, getUserQuotationStats);
router.get('/user-quotations/:userId', adminOnly,getQuotationsByUser);

module.exports = router;