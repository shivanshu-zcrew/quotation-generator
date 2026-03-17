const {Quotation} = require('../models/quotation');
const mongoose = require('mongoose');

// ─────────────────────────────────────────────────────────────
// Shared populate helper
// ─────────────────────────────────────────────────────────────
const fullPopulate = (q) =>
  q
    .populate('customerId',    'name email phone')
    .populate('items.itemId',  'name price')
    .populate('createdBy',     'name email')
    .populate('opsApprovedBy', 'name email')
    .populate('approvedBy',    'name email')
    .populate('awardedBy',     'name email');

// ═══════════════════════════════════════════════════════════════
// OPS MANAGER CONTROLLERS  (level-1 review)
// ═══════════════════════════════════════════════════════════════

// @desc  Get quotations pending ops-manager review
// @route GET /api/admin/quotations/ops-pending
exports.getOpsPendingQuotations = async (req, res) => {
  try {
    const quotations = await fullPopulate(
      Quotation.find({ status: 'pending' }).sort({ createdAt: -1 })
    );
    res.json(quotations);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching pending quotations', error: error.message });
  }
};

// @desc  Ops manager approves quotation (moves to admin queue)
// @route PUT /api/admin/quotations/:id/ops-approve
exports.opsApproveQuotation = async (req, res) => {
  try {
    const quotation = await Quotation.findById(req.params.id);

    if (!quotation)
      return res.status(404).json({ message: 'Quotation not found' });

    if (quotation.status !== 'pending')
      return res.status(400).json({
        message: `Quotation cannot be ops-approved. Current status: ${quotation.status}`,
      });

    quotation.status        = 'ops_approved';
    quotation.opsApprovedBy = req.user.id;
    quotation.opsApprovedAt = new Date();
    quotation.opsRejectionReason = '';   // clear any prior rejection
    await quotation.save();

    res.json({
      message: 'Quotation approved by operations manager — now awaiting admin approval',
      quotation: await fullPopulate(Quotation.findById(quotation._id)).lean(),
    });
  } catch (error) {
    res.status(500).json({ message: 'Error approving quotation (ops)', error: error.message });
  }
};

// @desc  Ops manager rejects quotation (sends back to creator)
// @route PUT /api/admin/quotations/:id/ops-reject
exports.opsRejectQuotation = async (req, res) => {
  try {
    const { reason } = req.body;

    if (!reason?.trim())
      return res.status(400).json({ message: 'Rejection reason is required' });

    const quotation = await Quotation.findById(req.params.id);

    if (!quotation)
      return res.status(404).json({ message: 'Quotation not found' });

    if (quotation.status !== 'pending')
      return res.status(400).json({
        message: `Quotation cannot be ops-rejected. Current status: ${quotation.status}`,
      });

    quotation.status             = 'ops_rejected';
    quotation.opsApprovedBy      = req.user.id;   // who rejected
    quotation.opsApprovedAt      = new Date();
    quotation.opsRejectionReason = reason.trim();
    await quotation.save();

    res.json({
      message: 'Quotation rejected by operations manager — sent back to creator',
      quotation: await fullPopulate(Quotation.findById(quotation._id)).lean(),
    });
  } catch (error) {
    res.status(500).json({ message: 'Error rejecting quotation (ops)', error: error.message });
  }
};

exports.getOpsReviewHistory = async (req, res) => {
  try {
    const quotations = await fullPopulate(
      Quotation.find({
        status: { $in: ['ops_approved', 'ops_rejected'] }
      }).sort({ updatedAt: -1 })
    );

    res.json(quotations);
  } catch (error) {
    res.status(500).json({
      message: 'Error fetching ops review history',
      error: error.message
    });
  }
};

// ═══════════════════════════════════════════════════════════════
// ADMIN CONTROLLERS  (level-2 review)
// ═══════════════════════════════════════════════════════════════

// @desc  Get quotations pending admin approval (ops_approved only)
// @route GET /api/admin/quotations/pending
exports.getPendingQuotations = async (req, res) => {
  try {
    const quotations = await fullPopulate(
      Quotation.find({ status: 'ops_approved' }).sort({ createdAt: -1 })
    );
    res.json(quotations);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching pending quotations', error: error.message });
  }
};

// @desc  Admin approves quotation (final — quotation goes to client)
// @route PUT /api/admin/quotations/:id/approve
exports.approveQuotation = async (req, res) => {
  try {
    const quotation = await Quotation.findById(req.params.id);

    if (!quotation)
      return res.status(404).json({ message: 'Quotation not found' });

    if (quotation.status !== 'ops_approved')
      return res.status(400).json({
        message: `Quotation must be ops-approved before admin approval. Current status: ${quotation.status}`,
      });

    quotation.status     = 'approved';
    quotation.approvedBy = req.user.id;
    quotation.approvedAt = new Date();
    await quotation.save();

    res.json({
      message: 'Quotation approved — ready to be sent to client',
      quotation: await fullPopulate(Quotation.findById(quotation._id)).lean(),
    });
  } catch (error) {
    res.status(500).json({ message: 'Error approving quotation', error: error.message });
  }
};

// @desc  Admin rejects quotation (even if ops-approved)
// @route PUT /api/admin/quotations/:id/reject
exports.rejectQuotation = async (req, res) => {
  try {
    const { reason } = req.body;

    if (!reason?.trim())
      return res.status(400).json({ message: 'Rejection reason is required' });

    const quotation = await Quotation.findById(req.params.id);

    if (!quotation)
      return res.status(404).json({ message: 'Quotation not found' });

    // Admin can reject from ops_approved or even pending (override)
    if (!['pending', 'ops_approved'].includes(quotation.status))
      return res.status(400).json({
        message: `Quotation cannot be rejected. Current status: ${quotation.status}`,
      });

    quotation.status          = 'rejected';
    quotation.rejectionReason = reason.trim();
    quotation.approvedBy      = req.user.id;   // who rejected
    quotation.approvedAt      = new Date();
    await quotation.save();

    res.json({
      message: 'Quotation rejected',
      quotation: await fullPopulate(Quotation.findById(quotation._id)).lean(),
    });
  } catch (error) {
    res.status(500).json({ message: 'Error rejecting quotation', error: error.message });
  }
};

// ═══════════════════════════════════════════════════════════════
// ALL QUOTATIONS  (admin — full visibility)
// ═══════════════════════════════════════════════════════════════

// @desc  Get all quotations with filters (admin)
// @route GET /api/admin/quotations
exports.getAllQuotationsAdmin = async (req, res) => {
  try {
    const { status, fromDate, toDate, userId } = req.query;

    const query = {};
    if (status) query.status = status;
    if (userId) query.createdBy = userId;
    if (fromDate || toDate) {
      query.createdAt = {};
      if (fromDate) query.createdAt.$gte = new Date(fromDate);
      if (toDate)   query.createdAt.$lte = new Date(toDate);
    }

    const quotations = await fullPopulate(
      Quotation.find(query).sort({ createdAt: -1 })
    );

    res.json(quotations);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching quotations', error: error.message });
  }
};

// ═══════════════════════════════════════════════════════════════
// DASHBOARD STATS (admin)
// ═══════════════════════════════════════════════════════════════

// @desc  Admin Dashboard Stats 
// @route GET /api/admin/dashboard/stats
exports.getAdminDashboardStats = async (req, res) => {
  try {
    const { companyId } = req.query;
    const matchStage = companyId ? { companyId: new mongoose.Types.ObjectId(companyId) } : {};

    console.log('🔍 Admin Stats - matchStage:', matchStage);

    const [
      totalQuotations,
      byStatus,
      totalRevenue,
      awardedValue,
      conversionRate,
    ] = await Promise.all([
      // Total Quotations - All quotations in system
      Quotation.countDocuments(matchStage),
      
      // Status counts for all statuses
      Quotation.aggregate([
        { $match: matchStage },
        { $group: { 
          _id: '$status', 
          count: { $sum: 1 } 
        } }
      ]),
      
      // Total Revenue - Sum of approved quotation values
      Quotation.aggregate([
        { 
          $match: { 
            ...matchStage,
            status: 'approved' 
          } 
        },
        { 
          $group: { 
            _id: null, 
            total: { $sum: '$totalInBaseCurrency' } 
          } 
        },
      ]),
      
      // Awarded Value - Sum of awarded quotation values
      Quotation.aggregate([
        { 
          $match: { 
            ...matchStage,
            status: 'awarded' 
          } 
        },
        { 
          $group: { 
            _id: null, 
            total: { $sum: '$totalInBaseCurrency' } 
          } 
        },
      ]),
      
      // Conversion Rate - (Awarded / Total Decided) × 100%
      (async () => {
        const [approvedCount, awardedCount, notAwardedCount] = await Promise.all([
          Quotation.countDocuments({ ...matchStage, status: 'approved' }),
          Quotation.countDocuments({ ...matchStage, status: 'awarded' }),
          Quotation.countDocuments({ ...matchStage, status: 'not_awarded' })
        ]);
        
        const totalDecided = approvedCount + awardedCount + notAwardedCount;
        const rate = totalDecided > 0 ? (awardedCount / totalDecided) * 100 : 0;
        
        return {
          approvedCount,
          awardedCount,
          notAwardedCount,
          totalDecided,
          rate: Math.round(rate * 100) / 100
        };
      })(),
    ]);

    // Initialize counts object with all statuses
    const counts = {
      total: totalQuotations,
      draft: 0,
      pending: 0,
      ops_approved: 0,  // Action Required
      ops_rejected: 0,
      approved: 0,
      rejected: 0,
      awarded: 0,
      not_awarded: 0,   // Not Awarded
      sent: 0,
    };

    // Fill in the counts from aggregation
    if (byStatus && byStatus.length > 0) {
      byStatus.forEach(item => {
        if (item._id && counts.hasOwnProperty(item._id)) {
          counts[item._id] = item.count;
        }
      });
    }

    const totalRevenueValue = totalRevenue[0]?.total || 0;
    const awardedValueTotal = awardedValue[0]?.total || 0;

    res.json({
      success: true,
      stats: {
        // Row 1 cards
        totalQuotations: counts.total,
        actionRequired: counts.ops_approved || 0,
        approved: counts.approved || 0,
        awarded: counts.awarded || 0,
        
        // Row 2 cards
        notAwarded: counts.not_awarded || 0,
        totalRevenue: totalRevenueValue,
        awardedValue: awardedValueTotal,
        conversionRate: conversionRate,
        
        // Additional
        rejected: counts.rejected || 0,
        
        // Raw counts for reference
        statusCounts: counts,
        conversionDetails: conversionRate
      }
    });
  } catch (err) {
    console.error('[getAdminDashboardStats]', err);
    res.status(500).json({ 
      success: false,
      message: 'Error fetching admin dashboard stats', 
      error: err.message 
    });
  }
};

// @desc  Ops Manager Dashboard Stats
// @route GET /api/admin/ops-dashboard/stats
exports.getOpsDashboardStats = async (req, res) => {
  try {
    const { companyId } = req.query;
    const matchStage = companyId ? { companyId: new mongoose.Types.ObjectId(companyId) } : {};

    console.log('🔍 Ops Stats - matchStage:', matchStage);

    const [
      totalQuotations,
      pendingCount,
      opsApprovedCount,
      opsRejectedCount,
      totalValue,
    ] = await Promise.all([
      // Total Quotations - All quotations in system for this company
      Quotation.countDocuments(matchStage),
      
      // Pending Review - Awaiting ops decision
      Quotation.countDocuments({ ...matchStage, status: 'pending' }),
      
      // Awaiting Admin - Forwarded to admin (ops_approved)
      Quotation.countDocuments({ ...matchStage, status: 'ops_approved' }),
      
      // Returned by Me - Rejected by ops
      Quotation.countDocuments({ ...matchStage, status: 'ops_rejected' }),
      
      // Total Value - Sum of all quotations ops can see
      Quotation.aggregate([
        { 
          $match: { 
            ...matchStage,
            status: { $in: ['pending', 'ops_approved', 'ops_rejected'] } 
          } 
        },
        { 
          $group: { 
            _id: null, 
            total: { $sum: '$totalInBaseCurrency' } 
          } 
        },
      ]),
    ]);

    const stats = {
      // Row 1 cards
      totalQuotations: totalQuotations || 0,
      pendingReview: pendingCount || 0,
      awaitingAdmin: opsApprovedCount || 0,
      returnedByMe: opsRejectedCount || 0,
      
      // Additional
      totalValue: totalValue[0]?.total || 0,
    };

    console.log('📊 Ops Stats - Final:', stats);

    res.json({
      success: true,
      stats
    });
  } catch (err) {
    console.error('[getOpsDashboardStats]', err);
    res.status(500).json({ 
      success: false,
      message: 'Error fetching ops dashboard stats', 
      error: err.message 
    });
  }
};