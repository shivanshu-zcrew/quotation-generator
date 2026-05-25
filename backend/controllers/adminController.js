const { Quotation } = require('../models/quotation');
const mongoose = require('mongoose');
const logger = require('../config/logger');
const LoggerHelper = require('../utils/loggerHelper');
const { Customer } = require('../models/customer');

// ─────────────────────────────────────────────────────────────
// Shared populate helper
// ─────────────────────────────────────────────────────────────
const fullPopulate = (q) =>
  q
    .populate('customerId', 'name email phone address')
    .populate('createdBy', 'name email')
    .populate('opsApprovedBy', 'name email')
    .populate('approvedBy', 'name email')
    .populate('awardedBy', 'name email');

// ─────────────────────────────────────────────────────────────
// Sanitization function
// ─────────────────────────────────────────────────────────────
const sanitizeQuotation = (q) => {
  if (!q) return null;
  return {
    ...q,
    total: Number(q.total) || 0,
    subtotal: Number(q.subtotal) || 0,
    taxAmount: Number(q.taxAmount) || 0,
    discountAmount: Number(q.discountAmount) || 0,
    totalInBaseCurrency: Number(q.totalInBaseCurrency) || 0,
    
    items: (q.items || []).map(item => ({
      ...item,
      quantity: Number(item.quantity) || 0,
      unitPrice: Number(item.unitPrice) || 0,
      totalPrice: Number(item.totalPrice) || 0,
      unitPriceInBaseCurrency: Number(item.unitPriceInBaseCurrency) || 0,
      totalPriceInBaseCurrency: Number(item.totalPriceInBaseCurrency) || 0,
      description: item.description || '',
      imagePaths: item.imagePaths || [],
    })),

    currency: q.currency || { code: 'AED', symbol: 'د.إ', name: 'UAE Dirham' },
    customerSnapshot: q.customerSnapshot || { name: 'N/A' },
    companySnapshot: q.companySnapshot || { name: 'N/A' },
    
    status: q.status || 'pending',
    quotationNumber: q.quotationNumber || '',
    projectName: q.projectName || '',
  };
};

// ═══════════════════════════════════════════════════════════════
// OPS MANAGER CONTROLLERS
// ═══════════════════════════════════════════════════════════════

exports.getOpsPendingQuotations = async (req, res) => {
  const startTime = Date.now();
  try {
    logger.debug('Fetching ops pending quotations', {
      userId: req.user?.id,
      companyId: req.headers['x-company-id']
    });

    const quotations = await fullPopulate(
      Quotation.find({ status: 'pending' }).sort({ createdAt: -1 })
    ).lean();

    const sanitizedQuotations = quotations.map(sanitizeQuotation);
    const duration = Date.now() - startTime;
    
    LoggerHelper.logDBQuery('Quotation', 'find', { status: 'pending' }, duration);
    logger.info(`Fetched ${sanitizedQuotations.length} pending quotations for ops`, {
      count: sanitizedQuotations.length,
      userId: req.user?.id,
      duration: `${duration}ms`
    });

    res.json(sanitizedQuotations);
  } catch (error) {
    const duration = Date.now() - startTime;
    LoggerHelper.logError('getOpsPendingQuotations', error, req);
    logger.error('Error fetching ops pending quotations', {
      error: error.message,
      stack: error.stack,
      duration: `${duration}ms`,
      userId: req.user?.id
    });
    res.status(500).json({ message: 'Error fetching pending quotations', error: error.message });
  }
};

exports.getAllOpsQuotations = async (req, res) => {
  const startTime = Date.now();
  try {
    const { status, search, fromDate, toDate } = req.query;
    
    logger.debug('Fetching all ops quotations with filters', {
      filters: { status, search, fromDate, toDate },
      userId: req.user?.id,
      companyId: req.headers['x-company-id']
    });
    
    const query = {
      status: { $in: ['pending', 'ops_approved', 'ops_rejected', 'rejected', 'approved', 'awarded', 'not_awarded'] }
    };
    
    if (status && status !== 'all') query.status = status;
    
    if (search && search.trim()) {
      const searchRegex = new RegExp(search.trim(), 'i');
      query.$or = [
        { quotationNumber: searchRegex },
        { 'customerSnapshot.name': searchRegex },
        { projectName: searchRegex }
      ];
    }
    
    if (fromDate || toDate) {
      query.createdAt = {};
      if (fromDate) query.createdAt.$gte = new Date(fromDate);
      if (toDate) query.createdAt.$lte = new Date(toDate);
    }
    
    const quotations = await fullPopulate(
      Quotation.find(query).sort({ createdAt: -1 })
    ).lean();

    const sanitizedQuotations = quotations.map(sanitizeQuotation);
    
    const counts = {
      all: sanitizedQuotations.length,
      pending: sanitizedQuotations.filter(q => q.status === 'pending').length,
      ops_approved: sanitizedQuotations.filter(q => q.status === 'ops_approved').length,
      ops_rejected: sanitizedQuotations.filter(q => q.status === 'ops_rejected').length,
      rejected: sanitizedQuotations.filter(q => q.status === 'rejected').length,
      approved: sanitizedQuotations.filter(q => q.status === 'approved').length,
      awarded: sanitizedQuotations.filter(q => q.status === 'awarded').length,
    };
    
    const duration = Date.now() - startTime;
    LoggerHelper.logDBQuery('Quotation', 'find with filters', query, duration);
    logger.info(`Fetched ${sanitizedQuotations.length} quotations for ops`, {
      count: sanitizedQuotations.length,
      filters: { status, search, fromDate, toDate },
      counts,
      duration: `${duration}ms`
    });
    
    res.json({
      success: true,
      quotations: sanitizedQuotations,
      counts,
      total: sanitizedQuotations.length
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    LoggerHelper.logError('getAllOpsQuotations', error, req);
    logger.error('Error fetching ops quotations', {
      error: error.message,
      stack: error.stack,
      duration: `${duration}ms`,
      userId: req.user?.id
    });
    res.status(500).json({ message: 'Error fetching quotations', error: error.message });
  }
};

exports.opsApproveQuotation = async (req, res) => {
  const startTime = Date.now();
  try {
    const quotation = await Quotation.findById(req.params.id);
    if (!quotation) {
      logger.warn(`Quotation not found for ops approval: ${req.params.id}`, {
        quotationId: req.params.id,
        userId: req.user?.id
      });
      return res.status(404).json({ message: 'Quotation not found' });
    }

    if (quotation.status !== 'pending') {
      logger.warn(`Cannot approve quotation with status ${quotation.status}`, {
        quotationId: quotation._id,
        currentStatus: quotation.status,
        userId: req.user?.id
      });
      return res.status(400).json({ message: `Cannot approve. Current status: ${quotation.status}` });
    }

    const oldStatus = quotation.status;
    quotation.status = 'ops_approved';
    quotation.opsApprovedBy = req.user.id;
    quotation.opsApprovedAt = new Date();
    quotation.opsRejectionReason = '';

    quotation.opsApprovedBySnapshot = {
      name: req.user.name,
      email: req.user.email,
      role: req.user.role,
      approvedAt: new Date()
    };

    await quotation.save();

    const updated = await fullPopulate(Quotation.findById(quotation._id)).lean();
    const duration = Date.now() - startTime;
    
    LoggerHelper.logOperation('Ops Approve Quotation', {
      quotationId: quotation._id,
      quotationNumber: quotation.quotationNumber,
      oldStatus,
      newStatus: 'ops_approved'
    }, req);
    
    logger.info(`Quotation ${quotation.quotationNumber} approved by ops manager`, {
      quotationId: quotation._id,
      quotationNumber: quotation.quotationNumber,
      userId: req.user?.id,
      userName: req.user?.name,
      duration: `${duration}ms`
    });

    res.json({
      success: true,
      message: 'Quotation approved by operations manager',
      quotation: sanitizeQuotation(updated),
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    LoggerHelper.logError('opsApproveQuotation', error, req);
    logger.error('Error in ops approval', {
      error: error.message,
      stack: error.stack,
      quotationId: req.params.id,
      duration: `${duration}ms`,
      userId: req.user?.id
    });
    res.status(500).json({ message: 'Error approving quotation', error: error.message });
  }
};

exports.opsRejectQuotation = async (req, res) => {
  const startTime = Date.now();
  try {
    const { reason } = req.body;
    if (!reason?.trim()) {
      logger.warn('Ops rejection missing reason', { userId: req.user?.id });
      return res.status(400).json({ message: 'Rejection reason is required' });
    }

    const quotation = await Quotation.findById(req.params.id);
    if (!quotation) {
      logger.warn(`Quotation not found for ops rejection: ${req.params.id}`, {
        quotationId: req.params.id,
        userId: req.user?.id
      });
      return res.status(404).json({ message: 'Quotation not found' });
    }

    const oldStatus = quotation.status;
    quotation.status = 'ops_rejected';
    quotation.opsApprovedBy = req.user.id;
    quotation.opsApprovedAt = new Date();
    quotation.opsRejectionReason = reason.trim();

    quotation.opsApprovedBySnapshot = {
      name: req.user.name,
      email: req.user.email,
      role: req.user.role,
      approvedAt: new Date()
    };

    await quotation.save();

    const updated = await fullPopulate(Quotation.findById(quotation._id)).lean();
    const duration = Date.now() - startTime;
    
    LoggerHelper.logOperation('Ops Reject Quotation', {
      quotationId: quotation._id,
      quotationNumber: quotation.quotationNumber,
      oldStatus,
      newStatus: 'ops_rejected',
      reason: reason.trim()
    }, req);
    
    logger.warn(`Quotation ${quotation.quotationNumber} rejected by ops manager`, {
      quotationId: quotation._id,
      quotationNumber: quotation.quotationNumber,
      reason: reason.trim(),
      userId: req.user?.id,
      userName: req.user?.name,
      duration: `${duration}ms`
    });

    res.json({
      success: true,
      message: 'Quotation rejected by operations manager',
      quotation: sanitizeQuotation(updated),
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    LoggerHelper.logError('opsRejectQuotation', error, req);
    logger.error('Error in ops rejection', {
      error: error.message,
      stack: error.stack,
      quotationId: req.params.id,
      duration: `${duration}ms`,
      userId: req.user?.id
    });
    res.status(500).json({ message: 'Error rejecting quotation', error: error.message });
  }
};

// ═══════════════════════════════════════════════════════════════
// ADMIN CONTROLLERS
// ═══════════════════════════════════════════════════════════════

exports.getPendingQuotations = async (req, res) => {
  const startTime = Date.now();
  try {
    logger.debug('Fetching pending quotations for admin approval', {
      userId: req.user?.id,
      companyId: req.headers['x-company-id']
    });

    const quotations = await fullPopulate(
      Quotation.find({ status: 'ops_approved' }).sort({ createdAt: -1 })
    ).lean();

    const sanitizedQuotations = quotations.map(sanitizeQuotation);
    const duration = Date.now() - startTime;
    
    LoggerHelper.logDBQuery('Quotation', 'find', { status: 'ops_approved' }, duration);
    logger.info(`Fetched ${sanitizedQuotations.length} quotations pending admin approval`, {
      count: sanitizedQuotations.length,
      userId: req.user?.id,
      duration: `${duration}ms`
    });

    res.json(sanitizedQuotations);
  } catch (error) {
    const duration = Date.now() - startTime;
    LoggerHelper.logError('getPendingQuotations', error, req);
    logger.error('Error fetching pending quotations for admin', {
      error: error.message,
      stack: error.stack,
      duration: `${duration}ms`,
      userId: req.user?.id
    });
    res.status(500).json({ message: 'Error fetching pending quotations', error: error.message });
  }
};

exports.approveQuotation = async (req, res) => {
  const startTime = Date.now();
  try {
    const quotation = await Quotation.findById(req.params.id);
    if (!quotation) {
      logger.warn(`Quotation not found for admin approval: ${req.params.id}`, {
        quotationId: req.params.id,
        userId: req.user?.id
      });
      return res.status(404).json({ message: 'Quotation not found' });
    }

    if (req.user.role !== 'admin') {
      logger.warn(`Non-admin user attempted to approve quotation`, {
        userId: req.user?.id,
        userRole: req.user?.role,
        quotationId: quotation._id
      });
      return res.status(403).json({ message: 'Only admin can approve quotation' });
    }

    const allowedStatuses = ['ops_approved', 'pending_admin'];
    if (!allowedStatuses.includes(quotation.status)) {
      logger.warn(`Cannot approve quotation with status ${quotation.status}`, {
        quotationId: quotation._id,
        currentStatus: quotation.status,
        userId: req.user?.id
      });
      return res.status(400).json({ message: `Quotation cannot be approved in current status: ${quotation.status}` });
    }

    const oldStatus = quotation.status;
    quotation.status = 'approved';
    quotation.approvedBy = req.user.id;
    quotation.approvedAt = new Date();
    
    quotation.approvedBySnapshot = {
      name: req.user.name,
      email: req.user.email,
      role: req.user.role,
      approvedAt: new Date()
    };

    await quotation.save();

    const updated = await fullPopulate(Quotation.findById(quotation._id)).lean();
    const sanitized = sanitizeQuotation(updated);
    const duration = Date.now() - startTime;
    
    LoggerHelper.logOperation('Admin Approve Quotation', {
      quotationId: quotation._id,
      quotationNumber: quotation.quotationNumber,
      oldStatus,
      newStatus: 'approved'
    }, req);
    
    logger.info(`Quotation ${quotation.quotationNumber} approved by admin`, {
      quotationId: quotation._id,
      quotationNumber: quotation.quotationNumber,
      adminId: req.user?.id,
      adminName: req.user?.name,
      duration: `${duration}ms`
    });

    res.json({
      success: true,
      message: 'Quotation approved successfully',
      quotation: sanitized,
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    LoggerHelper.logError('approveQuotation', error, req);
    logger.error('Error in admin approval', {
      error: error.message,
      stack: error.stack,
      quotationId: req.params.id,
      duration: `${duration}ms`,
      userId: req.user?.id
    });
    res.status(500).json({ message: 'Error approving quotation', error: error.message });
  }
};

exports.rejectQuotation = async (req, res) => {
  const startTime = Date.now();
  try {
    const { reason } = req.body;
    if (!reason?.trim()) {
      logger.warn('Admin rejection missing reason', { userId: req.user?.id });
      return res.status(400).json({ message: 'Rejection reason is required' });
    }

    const quotation = await Quotation.findById(req.params.id);
    if (!quotation) {
      logger.warn(`Quotation not found for admin rejection: ${req.params.id}`, {
        quotationId: req.params.id,
        userId: req.user?.id
      });
      return res.status(404).json({ message: 'Quotation not found' });
    }

    if (!['pending', 'ops_approved', 'pending_admin'].includes(quotation.status)) {
      logger.warn(`Cannot reject quotation with status ${quotation.status}`, {
        quotationId: quotation._id,
        currentStatus: quotation.status,
        userId: req.user?.id
      });
      return res.status(400).json({ message: `Quotation cannot be rejected. Current status: ${quotation.status}` });
    }

    const oldStatus = quotation.status;
    quotation.status = 'rejected';
    quotation.rejectionReason = reason.trim();
    quotation.approvedBy = req.user.id;
    quotation.approvedAt = new Date();
    
    quotation.approvedBySnapshot = {
      name: req.user.name,
      email: req.user.email,
      role: req.user.role,
      approvedAt: new Date()
    };

    await quotation.save();

    const updated = await fullPopulate(Quotation.findById(quotation._id)).lean();
    const sanitized = sanitizeQuotation(updated);
    const duration = Date.now() - startTime;
    
    LoggerHelper.logOperation('Admin Reject Quotation', {
      quotationId: quotation._id,
      quotationNumber: quotation.quotationNumber,
      oldStatus,
      newStatus: 'rejected',
      reason: reason.trim()
    }, req);
    
    logger.warn(`Quotation ${quotation.quotationNumber} rejected by admin`, {
      quotationId: quotation._id,
      quotationNumber: quotation.quotationNumber,
      reason: reason.trim(),
      adminId: req.user?.id,
      adminName: req.user?.name,
      duration: `${duration}ms`
    });

    res.json({
      success: true,
      message: 'Quotation rejected successfully',
      quotation: sanitized,
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    LoggerHelper.logError('rejectQuotation', error, req);
    logger.error('Error in admin rejection', {
      error: error.message,
      stack: error.stack,
      quotationId: req.params.id,
      duration: `${duration}ms`,
      userId: req.user?.id
    });
    res.status(500).json({ message: 'Error rejecting quotation', error: error.message });
  }
};

// ═══════════════════════════════════════════════════════════════
// ALL QUOTATIONS (admin)
// ═══════════════════════════════════════════════════════════════

// @desc  Get all quotations with filters and pagination (admin)
// @route GET /api/admin/quotations
exports.getAllQuotationsAdmin = async (req, res) => {
  const startTime = Date.now();
  try {
    const { 
      status, 
      fromDate, 
      toDate, 
      userId, 
      companyId,
      page = 1,
      limit = 20,
      search = ''
    } = req.query;

    logger.debug('Fetching all quotations for admin', {
      filters: { status, fromDate, toDate, userId, companyId, page, limit, search },
      userId: req.user?.id
    });

    const parsedPage = Math.max(1, parseInt(page, 10) || 1);
    const parsedLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (parsedPage - 1) * parsedLimit;
    
    let query = {};
    
    // Handle company filter - if no companyId or 'all', don't filter by company
    if (companyId && companyId !== 'all' && companyId !== 'ALL') {
      if (mongoose.Types.ObjectId.isValid(companyId)) {
        query.companyId = companyId;
      }
    }
    
    if (status && status !== 'all') query.status = status;
    if (userId) query.createdBy = userId;
    
    if (fromDate || toDate) {
      query.createdAt = {};
      if (fromDate) query.createdAt.$gte = new Date(fromDate);
      if (toDate) query.createdAt.$lte = new Date(toDate);
    }
    
    if (search && search.trim()) {
      const searchRegex = new RegExp(search.trim(), 'i');
      query.$or = [
        { quotationNumber: searchRegex },
        { 'customerSnapshot.name': searchRegex },
        { projectName: searchRegex }
      ];
    }

    // Get total count for pagination
    const totalCount = await Quotation.countDocuments(query);
    
    // Get paginated results
    const quotations = await fullPopulate(
      Quotation.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parsedLimit)
    ).lean();

    const sanitizedQuotations = quotations.map(sanitizeQuotation);
    const totalPages = Math.ceil(totalCount / parsedLimit);
    const duration = Date.now() - startTime;
    
    LoggerHelper.logDBQuery('Quotation', 'admin find with pagination', query, duration);
    logger.info(`Admin fetched ${sanitizedQuotations.length} quotations (page ${parsedPage}/${totalPages})`, {
      totalCount,
      page: parsedPage,
      limit: parsedLimit,
      totalPages,
      filters: { status, userId, companyId, search },
      duration: `${duration}ms`,
      adminId: req.user?.id
    });
    
    res.json({
      success: true,
      quotations: sanitizedQuotations,
      pagination: {
        page: parsedPage,
        limit: parsedLimit,
        total: totalCount,
        totalPages,
        hasNextPage: parsedPage < totalPages,
        hasPreviousPage: parsedPage > 1
      },
      filters: { status, fromDate, toDate, userId, companyId, search },
      isAllCompanies: !companyId || companyId === 'all'
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    LoggerHelper.logError('getAllQuotationsAdmin', error, req);
    logger.error('Error in admin get all quotations', {
      error: error.message,
      stack: error.stack,
      duration: `${duration}ms`,
      userId: req.user?.id,
      query: req.query
    });
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
  const startTime = Date.now();
  try {
    let { companyId } = req.query;
    let matchStage = {};
    
    logger.debug('Fetching admin dashboard stats', {
      companyId,
      userId: req.user?.id
    });
    
    // Handle "All Companies" - don't filter by companyId
    if (companyId && companyId !== 'all' && companyId !== 'ALL') {
      if (mongoose.Types.ObjectId.isValid(companyId)) {
        matchStage = { companyId: new mongoose.Types.ObjectId(companyId) };
      }
    }

    const [
      totalQuotations,
      byStatus,
      totalRevenue,
      awardedValue,
      conversionRateData,
      totalCustomers  // ✅ Added total customers
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
      
      // ✅ Get total customers count
      Customer.countDocuments(matchStage)
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
    const duration = Date.now() - startTime;
    
    logger.info(`Admin dashboard stats fetched successfully`, {
      totalQuotations,
      totalCustomers,  // ✅ Added to log
      actionRequired: counts.ops_approved,
      totalRevenue: totalRevenueValue,
      awardedValue: awardedValueTotal,
      conversionRate: conversionRateData.rate,
      companyId: companyId || 'all',
      duration: `${duration}ms`,
      adminId: req.user?.id
    });

    res.json({
      success: true,
      stats: {
        totalQuotations: counts.total || 0,
        totalCustomers: totalCustomers || 0,  // ✅ Added total customers
        actionRequired: counts.ops_approved || 0,
        approved: counts.approved || 0,
        awarded: counts.awarded || 0,
        notAwarded: counts.not_awarded || 0,
        totalRevenue: totalRevenueValue || 0,
        awardedValue: awardedValueTotal || 0,
        conversionRate: conversionRateData.rate || 0,
        rejected: counts.rejected || 0,
        statusCounts: counts,
        conversionDetails: conversionRateData,
        isAllCompanies: !companyId || companyId === 'all' || companyId === 'ALL'
      }
    });
  } catch (err) {
    const duration = Date.now() - startTime;
    LoggerHelper.logError('getAdminDashboardStats', err, req);
    logger.error('Error fetching admin dashboard stats', {
      error: err.message,
      stack: err.stack,
      duration: `${duration}ms`,
      userId: req.user?.id,
      companyId: req.query.companyId
    });
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
  const startTime = Date.now();
  try {
    let { companyId } = req.query;
    let matchStage = {};
    
    if (companyId && companyId !== 'all' && companyId !== 'ALL') {
      if (mongoose.Types.ObjectId.isValid(companyId)) {
        matchStage = { companyId: new mongoose.Types.ObjectId(companyId) };
      }
    }

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
      isAllCompanies: !companyId || companyId === 'all' || companyId === 'ALL'
    };

    const duration = Date.now() - startTime;
    
    logger.info(`Ops dashboard stats fetched successfully`, {
      ...stats,
      companyId: companyId || 'all',
      duration: `${duration}ms`,
      userId: req.user?.id
    });

    res.json({
      success: true,
      stats
    });
  } catch (err) {
    const duration = Date.now() - startTime;
    LoggerHelper.logError('getOpsDashboardStats', err, req);
    logger.error('Error fetching ops dashboard stats', {
      error: err.message,
      stack: err.stack,
      duration: `${duration}ms`,
      userId: req.user?.id
    });
    res.status(500).json({ 
      success: false,
      message: 'Error fetching ops dashboard stats', 
      error: err.message 
    });
  }
};

exports.getUserQuotationStats = async (req, res) => {
  const startTime = Date.now();
  try {
    let companyId = req.companyId || req.headers['x-company-id'];
    let matchStage = {};
    
    if (companyId && companyId !== 'all' && companyId !== 'ALL') {
      if (mongoose.Types.ObjectId.isValid(companyId)) {
        matchStage = { companyId: new mongoose.Types.ObjectId(companyId) };
      }
    }

    if (req.user?.role !== 'admin') {
      logger.warn(`Non-admin user attempted to access user stats`, {
        userId: req.user?.id,
        userRole: req.user?.role
      });
      return res.status(403).json({ message: 'Unauthorized to view user statistics' });
    }

    const userStats = await Quotation.aggregate([
      { $match: matchStage },
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
      { $unwind: { path: '$userInfo', preserveNullAndEmptyArrays: true } },
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

    const totalQuotations = await Quotation.countDocuments(matchStage);
    const totalUsers = userStats.length;
    const duration = Date.now() - startTime;
    
    logger.info(`User quotation stats fetched`, {
      totalUsers,
      totalQuotations,
      averagePerUser: totalUsers > 0 ? (totalQuotations / totalUsers).toFixed(2) : 0,
      companyId: companyId || 'all',
      duration: `${duration}ms`,
      adminId: req.user?.id
    });

    res.json({
      success: true,
      stats: userStats,
      summary: {
        totalQuotations,
        totalUsers,
        averagePerUser: totalUsers > 0 ? (totalQuotations / totalUsers).toFixed(2) : 0,
        isAllCompanies: !companyId || companyId === 'all' || companyId === 'ALL'
      }
    });

  } catch (error) {
    const duration = Date.now() - startTime;
    LoggerHelper.logError('getUserQuotationStats', error, req);
    logger.error('Error getting user quotation stats', {
      error: error.message,
      stack: error.stack,
      duration: `${duration}ms`,
      userId: req.user?.id
    });
    res.status(500).json({ 
      success: false, 
      message: 'Error fetching user statistics', 
      error: error.message 
    });
  }
};

exports.getQuotationsByUser = async (req, res) => {
  const startTime = Date.now();
  try {
    const { userId } = req.params;
    const companyId = req.companyId || req.headers['x-company-id'];
    
    if (!companyId) {
      logger.warn('Company ID missing in getQuotationsByUser', {
        userId: req.user?.id,
        targetUserId: userId
      });
      return res.status(400).json({ message: 'Company ID is required' });
    }

    if (req.user?.role !== 'admin') {
      logger.warn(`Non-admin user attempted to view user quotations`, {
        userId: req.user?.id,
        userRole: req.user?.role,
        targetUserId: userId
      });
      return res.status(403).json({ message: 'Unauthorized to view user quotations' });
    }

    const quotations = await Quotation.find({ 
      companyId: new mongoose.Types.ObjectId(companyId),
      createdBy: new mongoose.Types.ObjectId(userId)
    })
      .sort({ createdAt: -1 })
      .populate('customerId', 'name')
      .lean();

    const duration = Date.now() - startTime;
    
    logger.info(`Fetched ${quotations.length} quotations for user ${userId}`, {
      targetUserId: userId,
      count: quotations.length,
      companyId,
      duration: `${duration}ms`,
      adminId: req.user?.id
    });

    res.json({
      success: true,
      quotations,
      count: quotations.length
    });

  } catch (error) {
    const duration = Date.now() - startTime;
    LoggerHelper.logError('getQuotationsByUser', error, req);
    logger.error('Error fetching user quotations', {
      error: error.message,
      stack: error.stack,
      duration: `${duration}ms`,
      userId: req.user?.id,
      targetUserId: req.params.userId
    });
    res.status(500).json({ 
      success: false, 
      message: 'Error fetching user quotations', 
      error: error.message 
    });
  }
};