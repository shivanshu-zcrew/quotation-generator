const {Quotation} = require('../models/quotation');
const mongoose = require('mongoose');

// ─────────────────────────────────────────────────────────────
// Shared populate helper - FIXED
// ─────────────────────────────────────────────────────────────
const fullPopulate = (q) =>
  q
    .populate('customerId',    'name email phone address')
    .populate('items.itemId',  'name price description imagePath')
    .populate('createdBy',     'name email')
    .populate('opsApprovedBy', 'name email')
    .populate('approvedBy',    'name email')
    .populate('awardedBy',     'name email');

// ─────────────────────────────────────────────────────────────
// Reusable sanitization function
// ─────────────────────────────────────────────────────────────
const sanitizeQuotation = (q) => {
  if (!q) return null;
  
  return {
    ...q,
    // Ensure numeric fields exist
    total: typeof q.total === 'number' ? q.total : 0,
    subtotal: typeof q.subtotal === 'number' ? q.subtotal : 0,
    taxAmount: typeof q.taxAmount === 'number' ? q.taxAmount : 0,
    discountAmount: typeof q.discountAmount === 'number' ? q.discountAmount : 0,
    totalInBaseCurrency: typeof q.totalInBaseCurrency === 'number' ? q.totalInBaseCurrency : 0,
    
    // Ensure items array is safe with full item details
    items: (q.items || []).map(item => ({
      ...item,
      quantity: typeof item.quantity === 'number' ? item.quantity : 0,
      unitPrice: typeof item.unitPrice === 'number' ? item.unitPrice : 0,
      totalPrice: typeof item.totalPrice === 'number' ? item.totalPrice : 0,
      unitPriceInBaseCurrency: typeof item.unitPriceInBaseCurrency === 'number' ? item.unitPriceInBaseCurrency : 0,
      totalPriceInBaseCurrency: typeof item.totalPriceInBaseCurrency === 'number' ? item.totalPriceInBaseCurrency : 0,
      description: item.description || '',
      imagePaths: item.imagePaths || [],
      imagePublicIds: item.imagePublicIds || [],
      // Ensure itemId has all fields
      itemId: item.itemId ? {
        ...item.itemId,
        name: item.itemId.name || '',
        price: typeof item.itemId.price === 'number' ? item.itemId.price : 0,
        description: item.itemId.description || '',
        imagePath: item.itemId.imagePath || null
      } : null
    })),
    
    // Ensure currency object exists
    currency: q.currency || {
      code: 'AED',
      symbol: 'د.إ',
      name: 'UAE Dirham',
      decimalPlaces: 2,
      exchangeRate: {
        rate: 1,
        baseCurrency: 'AED',
        fetchedAt: new Date()
      }
    },
    
    // Ensure customerSnapshot exists
    customerSnapshot: q.customerSnapshot || {
      name: q.customer || 'N/A',
      email: '',
      phone: '',
      address: '',
      country: 'UAE'
    },
    
    // Ensure companySnapshot exists
    companySnapshot: q.companySnapshot || {
      name: 'N/A',
      code: 'N/A',
      address: '',
      phone: '',
      email: '',
      vatNumber: '',
      crNumber: '',
      logo: null,
      bankDetails: {}
    },
    
    // Ensure internalDocuments is an array
    internalDocuments: q.internalDocuments || [],
    
    // Ensure dates are strings
    date: q.date ? new Date(q.date).toISOString() : new Date().toISOString(),
    expiryDate: q.expiryDate ? new Date(q.expiryDate).toISOString() : new Date().toISOString(),
    createdAt: q.createdAt ? new Date(q.createdAt).toISOString() : new Date().toISOString(),
    updatedAt: q.updatedAt ? new Date(q.updatedAt).toISOString() : new Date().toISOString(),
    
    // Ensure string fields exist
    quotationNumber: q.quotationNumber || '',
    projectName: q.projectName || '',
    contact: q.contact || '',
    ourRef: q.ourRef || '',
    ourContact: q.ourContact || '',
    salesOffice: q.salesOffice || '',
    paymentTerms: q.paymentTerms || '',
    deliveryTerms: q.deliveryTerms || '',
    tl: q.tl || '',
    trn: q.trn || '',
    notes: q.notes || '',
    termsAndConditions: q.termsAndConditions || '',
    termsImage: q.termsImage || null,
    termsImagePublicId: q.termsImagePublicId || null,
    status: q.status || 'pending',
    
    // Ensure createdBy is populated
    createdBy: q.createdBy || { 
      _id: null,
      name: 'Unknown', 
      email: '' 
    },
    
    // Ensure approval fields exist
    opsApprovedBy: q.opsApprovedBy || null,
    opsApprovedAt: q.opsApprovedAt || null,
    opsRejectionReason: q.opsRejectionReason || '',
    approvedBy: q.approvedBy || null,
    approvedAt: q.approvedAt || null,
    rejectionReason: q.rejectionReason || '',
    awardedBy: q.awardedBy || null,
    awardedAt: q.awardedAt || null,
    awardNote: q.awardNote || ''
  };
};

// ═══════════════════════════════════════════════════════════════
// OPS MANAGER CONTROLLERS
// ═══════════════════════════════════════════════════════════════

// @desc  Get quotations pending ops-manager review
// @route GET /api/admin/quotations/ops-pending
exports.getOpsPendingQuotations = async (req, res) => {
  try {
    const quotations = await fullPopulate(
      Quotation.find({ status: 'pending' }).sort({ createdAt: -1 })
    ).lean();

    const sanitizedQuotations = quotations.map(sanitizeQuotation);
    res.json(sanitizedQuotations);
  } catch (error) {
     
    res.status(500).json({ 
      message: 'Error fetching pending quotations', 
      error: error.message 
    });
  }
};

// @desc  Ops manager approves quotation
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

    quotation.status = 'ops_approved';
    quotation.opsApprovedBy = req.user.id;
    quotation.opsApprovedAt = new Date();
    quotation.opsRejectionReason = '';
    
    // ✅ Store ops manager snapshot
    quotation.opsApprovedBySnapshot = {
      name: req.user.name,
      email: req.user.email,
      role: req.user.role
    };
    
    await quotation.save();

    const updated = await fullPopulate(Quotation.findById(quotation._id)).lean();
    const sanitized = sanitizeQuotation(updated);

    res.json({
      success: true,
      message: 'Quotation approved by operations manager — now awaiting admin approval',
      quotation: sanitized,
    });
  } catch (error) {
    res.status(500).json({ message: 'Error approving quotation (ops)', error: error.message });
  }
};

// @desc  Ops manager rejects quotation
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

    quotation.status = 'ops_rejected';
    quotation.opsApprovedBy = req.user.id;
    quotation.opsApprovedAt = new Date();
    quotation.opsRejectionReason = reason.trim();
    await quotation.save();

    const updated = await fullPopulate(Quotation.findById(quotation._id)).lean();
    const sanitized = sanitizeQuotation(updated);

    res.json({
      success: true,
      message: 'Quotation rejected by operations manager',
      quotation: sanitized,
    });
  } catch (error) {
     
    res.status(500).json({ message: 'Error rejecting quotation (ops)', error: error.message });
  }
};

// @desc  Get ops review history
// @route GET /api/admin/quotations/ops-history
exports.getOpsReviewHistory = async (req, res) => {
  try {
    const quotations = await fullPopulate(
      Quotation.find({
        status: { $in: ['ops_approved', 'ops_rejected'] }
      }).sort({ updatedAt: -1 })
    ).lean();

    const sanitizedQuotations = quotations.map(sanitizeQuotation);
    res.json(sanitizedQuotations);
  } catch (error) {
     
    res.status(500).json({
      message: 'Error fetching ops review history',
      error: error.message
    });
  }
};

// ═══════════════════════════════════════════════════════════════
// ADMIN CONTROLLERS
// ═══════════════════════════════════════════════════════════════

// @desc  Get quotations pending admin approval
// @route GET /api/admin/quotations/pending
exports.getPendingQuotations = async (req, res) => {
  try {
    const quotations = await fullPopulate(
      Quotation.find({ status: 'ops_approved' }).sort({ createdAt: -1 })
    ).lean();

    const sanitizedQuotations = quotations.map(sanitizeQuotation);
    res.json(sanitizedQuotations);
  } catch (error) {
     
    res.status(500).json({ message: 'Error fetching pending quotations', error: error.message });
  }
};

// @desc  Admin approves quotation
// @route PUT /api/admin/quotations/:id/approve
exports.approveQuotation = async (req, res) => {
  try {
    const quotation = await Quotation.findById(req.params.id);

    if (!quotation) {
      return res.status(404).json({ message: 'Quotation not found' });
    }

    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Only admin can approve quotation' });
    }

    const allowedStatuses = ['ops_approved', 'pending_admin'];

    if (!allowedStatuses.includes(quotation.status)) {
      return res.status(400).json({
        message: `Quotation cannot be approved in current status: ${quotation.status}`,
      });
    }

    quotation.status = 'approved';
    quotation.approvedBy = req.user.id;
    quotation.approvedAt = new Date();
    
    // ✅ Store admin approval snapshot
    quotation.approvedBySnapshot = {
      name: req.user.name,
      email: req.user.email,
      role: req.user.role
    };
    
    await quotation.save();

    const updated = await fullPopulate(Quotation.findById(quotation._id)).lean();
    const sanitized = sanitizeQuotation(updated);

    res.json({
      success: true,
      message: 'Quotation approved — ready to be sent to client',
      quotation: sanitized,
    });
  } catch (error) {
    res.status(500).json({
      message: 'Error approving quotation',
      error: error.message,
    });
  }
};

// @desc  Admin rejects quotation
// @route PUT /api/admin/quotations/:id/reject
exports.rejectQuotation = async (req, res) => {
  try {
    const { reason } = req.body;

    if (!reason?.trim())
      return res.status(400).json({ message: 'Rejection reason is required' });

    const quotation = await Quotation.findById(req.params.id);

    if (!quotation)
      return res.status(404).json({ message: 'Quotation not found' });

    if (!['pending', 'ops_approved', 'pending_admin'].includes(quotation.status))
      return res.status(400).json({
        message: `Quotation cannot be rejected. Current status: ${quotation.status}`,
      });

    quotation.status = 'rejected';
    quotation.rejectionReason = reason.trim();
    quotation.approvedBy = req.user.id;
    quotation.approvedAt = new Date();
    await quotation.save();

    const updated = await fullPopulate(Quotation.findById(quotation._id)).lean();
    const sanitized = sanitizeQuotation(updated);

    res.json({
      success: true,
      message: 'Quotation rejected',
      quotation: sanitized,
    });
  } catch (error) {
     
    res.status(500).json({ message: 'Error rejecting quotation', error: error.message });
  }
};

// ═══════════════════════════════════════════════════════════════
// ALL QUOTATIONS (admin)
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
      if (toDate) query.createdAt.$lte = new Date(toDate);
    }

    const quotations = await fullPopulate(
      Quotation.find(query).sort({ createdAt: -1 })
    ).lean();

    const sanitizedQuotations = quotations.map(sanitizeQuotation);
    res.json(sanitizedQuotations);
  } catch (error) {
     
    res.status(500).json({ 
      message: 'Error fetching quotations', 
      error: error.message 
    });
  }
};

// ═══════════════════════════════════════════════════════════════
// DASHBOARD STATS
// ═══════════════════════════════════════════════════════════════

// @desc  Admin Dashboard Stats 
// @route GET /api/admin/dashboard/stats
exports.getAdminDashboardStats = async (req, res) => {
  try {
    const { companyId } = req.query;
    const matchStage = companyId ? { companyId: new mongoose.Types.ObjectId(companyId) } : {};

    const [
      totalQuotations,
      byStatus,
      totalRevenue,
      awardedValue,
      conversionRateData,
    ] = await Promise.all([
      Quotation.countDocuments(matchStage),
      
      Quotation.aggregate([
        { $match: matchStage },
        { $group: { 
          _id: '$status', 
          count: { $sum: 1 } 
        } }
      ]),
      
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

    const counts = {
      total: totalQuotations,
      draft: 0,
      pending: 0,
      ops_approved: 0,
      ops_rejected: 0,
      approved: 0,
      rejected: 0,
      awarded: 0,
      not_awarded: 0,
      sent: 0,
    };

    byStatus.forEach(item => {
      if (item._id && counts.hasOwnProperty(item._id)) {
        counts[item._id] = item.count;
      }
    });

    const totalRevenueValue = totalRevenue[0]?.total || 0;
    const awardedValueTotal = awardedValue[0]?.total || 0;

    res.json({
      success: true,
      stats: {
        totalQuotations: counts.total || 0,
        actionRequired: counts.ops_approved || 0,
        approved: counts.approved || 0,
        awarded: counts.awarded || 0,
        notAwarded: counts.not_awarded || 0,
        totalRevenue: totalRevenueValue || 0,
        awardedValue: awardedValueTotal || 0,
        conversionRate: conversionRateData.rate || 0,
        rejected: counts.rejected || 0,
        statusCounts: counts,
        conversionDetails: conversionRateData
      }
    });
  } catch (err) {
     
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

    const [
      totalQuotations,
      pendingCount,
      opsApprovedCount,
      opsRejectedCount,
      totalValue,
    ] = await Promise.all([
      Quotation.countDocuments(matchStage),
      Quotation.countDocuments({ ...matchStage, status: 'pending' }),
      Quotation.countDocuments({ ...matchStage, status: 'ops_approved' }),
      Quotation.countDocuments({ ...matchStage, status: 'ops_rejected' }),
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
      totalQuotations: totalQuotations || 0,
      pendingReview: pendingCount || 0,
      awaitingAdmin: opsApprovedCount || 0,
      returnedByMe: opsRejectedCount || 0,
      totalValue: totalValue[0]?.total || 0,
    };

    res.json({
      success: true,
      stats
    });
  } catch (err) {
     
    res.status(500).json({ 
      success: false,
      message: 'Error fetching ops dashboard stats', 
      error: err.message 
    });
  }
};

exports.getUserQuotationStats = async (req, res) => {
  try {
    const companyId = req.companyId || req.headers['x-company-id'];
    
    if (!companyId) {
      return res.status(400).json({ message: 'Company ID is required' });
    }

    // Check if user is admin (only admins can see user stats)
    if (req.user?.role !== 'admin') {
      return res.status(403).json({ message: 'Unauthorized to view user statistics' });
    }

    // Use 'new' keyword with ObjectId
    const companyObjectId = new mongoose.Types.ObjectId(companyId);

    // Aggregate quotations by createdBy user - MongoDB compatible version
    const userStats = await Quotation.aggregate([
      { $match: { companyId: companyObjectId } },
      {
        $group: {
          _id: '$createdBy',
          totalQuotations: { $sum: 1 },
          totalValue: { $sum: '$totalInBaseCurrency' },
          quotationsByStatus: {
            $push: {
              status: '$status',
              total: '$totalInBaseCurrency'
            }
          }
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'userInfo'
        }
      },
      // FIX: Remove preserveNullAndEmptyValues - use $unwind with { path: '$userInfo' }
      { $unwind: { path: '$userInfo' } },
      {
        $project: {
          userId: '$_id',
          userName: { $ifNull: ['$userInfo.name', 'Unknown User'] },
          userEmail: { $ifNull: ['$userInfo.email', 'N/A'] },
          totalQuotations: 1,
          totalValue: 1,
          pending: {
            $size: {
              $filter: {
                input: '$quotationsByStatus',
                as: 'q',
                cond: { $eq: ['$$q.status', 'pending'] }
              }
            }
          },
          approved: {
            $size: {
              $filter: {
                input: '$quotationsByStatus',
                as: 'q',
                cond: { $eq: ['$$q.status', 'approved'] }
              }
            }
          },
          awarded: {
            $size: {
              $filter: {
                input: '$quotationsByStatus',
                as: 'q',
                cond: { $eq: ['$$q.status', 'awarded'] }
              }
            }
          },
          rejected: {
            $size: {
              $filter: {
                input: '$quotationsByStatus',
                as: 'q',
                cond: { 
                  $or: [
                    { $eq: ['$$q.status', 'rejected'] }, 
                    { $eq: ['$$q.status', 'ops_rejected'] }
                  ] 
                }
              }
            }
          }
        }
      },
      { $sort: { totalQuotations: -1 } }
    ]);

    // Get total counts
    const totalQuotations = await Quotation.countDocuments({ companyId: companyObjectId });
    const totalUsers = userStats.length;

    res.json({
      success: true,
      stats: userStats,
      summary: {
        totalQuotations,
        totalUsers,
        averagePerUser: totalUsers > 0 ? (totalQuotations / totalUsers).toFixed(2) : 0
      }
    });

  } catch (error) {
    console.error('Error getting user quotation stats:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error fetching user statistics', 
      error: error.message 
    });
  }
};

exports.getQuotationsByUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const companyId = req.companyId || req.headers['x-company-id'];
    
    if (!companyId) {
      return res.status(400).json({ message: 'Company ID is required' });
    }

    if (req.user?.role !== 'admin') {
      return res.status(403).json({ message: 'Unauthorized to view user quotations' });
    }

    const quotations = await Quotation.find({ 
      companyId: new mongoose.Types.ObjectId(companyId),
      createdBy: new mongoose.Types.ObjectId(userId)
    })
      .sort({ createdAt: -1 })
      .populate('customerId', 'name')
      .lean();

    res.json({
      success: true,
      quotations,
      count: quotations.length
    });

  } catch (error) {
    console.error('Error fetching user quotations:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error fetching user quotations', 
      error: error.message 
    });
  }
};