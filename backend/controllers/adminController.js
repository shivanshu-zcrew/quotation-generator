const { Quotation, ExchangeRateService } = require('../models/quotation');
const mongoose = require('mongoose');
const logger = require('../config/logger');
const LoggerHelper = require('../utils/loggerHelper');
const { Customer } = require('../models/customer');
const User = require('../models/user');
const emailService = require('../utils/emailService');
const redisService = require('../config/redisService');

// Invalidate all stats caches affected by a quotation status change
const invalidateQuotationStats = (quotation) => {
  const companyId = quotation?.companyId?.toString();
  const createdById = quotation?.createdBy?.toString();
  if (companyId) redisService.delPattern(`stats:company:${companyId}*`);
  if (createdById) redisService.delPattern(`stats:user:${createdById}:*`);
};

// ─────────────────────────────────────────────────────────────
// Regex escape helper (prevents ReDoS from user-supplied search)
// ─────────────────────────────────────────────────────────────
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

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

const listPopulate = (q) =>
  q
    .populate('customerId', 'name')
    .populate('createdBy', 'name');

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

// OPS MANAGER CONTROLLERS WITH PAGINATION

exports.getOpsPendingQuotations = async (req, res) => {
  const startTime = Date.now();
  try {
    const { page = 1, limit = 20 } = req.query;
    const parsedPage = Math.max(1, parseInt(page, 10) || 1);
    const parsedLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (parsedPage - 1) * parsedLimit;
    
    logger.debug('Fetching ops pending quotations with pagination', {
      userId: req.user?.id,
      companyId: req.headers['x-company-id'],
      page: parsedPage,
      limit: parsedLimit
    });

    const query = { status: 'pending' };
    const opsCompanyId = req.headers['x-company-id'];
    if (opsCompanyId && mongoose.Types.ObjectId.isValid(opsCompanyId)) {
      query.companyId = new mongoose.Types.ObjectId(opsCompanyId);
    }

    const [quotations, totalCount] = await Promise.all([
      fullPopulate(
        Quotation.find(query)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(parsedLimit)
      ).lean(),
      Quotation.countDocuments(query)
    ]);

    const sanitizedQuotations = quotations.map(sanitizeQuotation);
    const totalPages = Math.ceil(totalCount / parsedLimit);
    const duration = Date.now() - startTime;
    
    LoggerHelper.logDBQuery('Quotation', 'find', { status: 'pending' }, duration);
    logger.info(`Fetched ${sanitizedQuotations.length} pending quotations for ops`, {
      count: sanitizedQuotations.length,
      totalCount,
      page: parsedPage,
      totalPages,
      userId: req.user?.id,
      duration: `${duration}ms`
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
      }
    });
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
    const {
      status,
      search,
      fromDate,
      toDate,
      page = 1,
      limit = 20,
      sortBy = 'createdAt',
      sortDir = 'desc'
    } = req.query;

    const parsedPage = Math.max(1, parseInt(page, 10) || 1);
    const parsedLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (parsedPage - 1) * parsedLimit;

    let companyId = req.query.companyId || req.headers['x-company-id'];

    // Build query
    const query = {};

    if (companyId && companyId !== 'all' && companyId !== 'ALL') {
      if (mongoose.Types.ObjectId.isValid(companyId)) {
        query.companyId = companyId;
      }
    }

    query.status = {
      $in: ['pending', 'pending_admin', 'ops_approved', 'ops_rejected', 'rejected', 'approved', 'awarded', 'not_awarded']
    };

    if (status && status !== 'all') {
      if (status === 'pending') {
        query.status = { $in: ['pending', 'pending_admin'] };
      } else {
        query.status = status;
      }
    }

    if (search && search.trim()) {
      query.$text = { $search: search.trim() };
    }

    if (fromDate || toDate) {
      query.createdAt = {};
      if (fromDate) query.createdAt.$gte = new Date(fromDate);
      if (toDate) query.createdAt.$lte = new Date(toDate);
    }

    // Build sort object (with _id tiebreaker for stable pagination on
    // non-unique sort fields). Text search overrides sort with relevance score.
    let sortObject = {};
    switch (sortBy) {
      case 'quotationNumber':
        sortObject = { quotationNumber: sortDir === 'asc' ? 1 : -1, _id: 1 };
        break;
      case 'customer':
        sortObject = { 'customerSnapshot.name': sortDir === 'asc' ? 1 : -1, _id: 1 };
        break;
      case 'date':
        sortObject = { date: sortDir === 'asc' ? 1 : -1, _id: 1 };
        break;
      case 'expiryDate':
        sortObject = { expiryDate: sortDir === 'asc' ? 1 : -1, _id: 1 };
        break;
      case 'status':
        sortObject = { status: sortDir === 'asc' ? 1 : -1, _id: 1 };
        break;
      case 'createdBy':
        sortObject = { 'createdBySnapshot.name': sortDir === 'asc' ? 1 : -1, _id: 1 };
        break;
      case 'total':
        sortObject = { total: sortDir === 'asc' ? 1 : -1, _id: 1 };
        break;
      case 'createdAt':
      default:
        sortObject = { createdAt: sortDir === 'asc' ? 1 : -1, _id: 1 };
        break;
    }

    // Fetch page, total count, and per-status counts — all computed in the DB.
    // The status counts use an aggregation instead of loading every matching
    // document into memory (the old `Quotation.find(query).lean()` approach
    // allocated the whole filtered collection on every request).
    const effectiveSort = search && search.trim()
      ? { score: { $meta: 'textScore' }, ...sortObject }
      : sortObject;

    const [quotations, totalCount, statusAgg] = await Promise.all([
      listPopulate(
        Quotation.find(query)
          .sort(effectiveSort)
          .skip(skip)
          .limit(parsedLimit)
      ).lean(),
      Quotation.countDocuments(query),
      Quotation.aggregate([
        { $match: query },
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ])
    ]);

    const sanitizedQuotations = quotations.map(sanitizeQuotation);
    const totalPages = Math.ceil(totalCount / parsedLimit);

    const cmap = {};
    statusAgg.forEach((s) => { cmap[s._id] = s.count; });

    const counts = {
      all: totalCount,
      pending: (cmap['pending'] || 0) + (cmap['pending_admin'] || 0),
      ops_approved: cmap['ops_approved'] || 0,
      ops_rejected: cmap['ops_rejected'] || 0,
      rejected: cmap['rejected'] || 0,
      approved: cmap['approved'] || 0,
      awarded: cmap['awarded'] || 0,
    };

    const duration = Date.now() - startTime;
    logger.info(`Fetched ${sanitizedQuotations.length} ops quotations (page ${parsedPage}/${totalPages})`, {
      totalCount,
      page: parsedPage,
      totalPages,
      sortBy,
      sortDir,
      duration: `${duration}ms`,
      userId: req.user?.id
    });

    res.json({
      success: true,
      quotations: sanitizedQuotations,
      counts,
      total: totalCount,
      pagination: {
        page: parsedPage,
        limit: parsedLimit,
        total: totalCount,
        totalPages,
        hasNextPage: parsedPage < totalPages,
        hasPreviousPage: parsedPage > 1
      }
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
    // First check the quotation exists and get current state
    const existing = await Quotation.findById(req.params.id).lean();
    if (!existing) {
      logger.warn(`Quotation not found for ops approval: ${req.params.id}`, {
        quotationId: req.params.id,
        userId: req.user?.id
      });
      return res.status(404).json({ message: 'Quotation not found' });
    }

    if (existing.status !== 'pending') {
      logger.warn(`Cannot approve quotation with status ${existing.status}`, {
        quotationId: existing._id,
        currentStatus: existing.status,
        userId: req.user?.id
      });
      return res.status(409).json({ success: false, message: 'Quotation status has changed — please refresh and try again.' });
    }

    const oldStatus = existing.status;

    // Build atomic filter with company scoping (Fix 6)
    const atomicFilter = { _id: req.params.id, status: 'pending' };
    const opsApproveCompanyId = req.headers['x-company-id'];
    if (opsApproveCompanyId && mongoose.Types.ObjectId.isValid(opsApproveCompanyId)) {
      atomicFilter.companyId = new mongoose.Types.ObjectId(opsApproveCompanyId);
    }

    // Atomic update — only succeeds if status is still 'pending' (and company matches)
    const quotation = await Quotation.findOneAndUpdate(
      atomicFilter,
      { $set: {
        status: 'ops_approved',
        opsApprovedBy: req.user.id,
        opsApprovedAt: new Date(),
        opsRejectionReason: '',
        opsApprovedBySnapshot: {
          name: req.user.name,
          email: req.user.email,
          role: req.user.role,
          approvedAt: new Date()
        }
      }},
      { new: true }
    );
    if (!quotation) {
      return res.status(409).json({ success: false, message: 'Quotation status has changed — please refresh and try again.' });
    }
    invalidateQuotationStats(quotation);

    // Email all admins (exclude the approver themselves) — non-blocking
    User.find({ role: 'admin', isActive: true })
      .select('email').lean()
      .then(admins => {
        const emails = admins.map(a => a.email).filter(e => e && e !== req.user.email);
        if (emails.length) emailService.opsApprovedNotifyAdmins(emails, quotation, req.user.name);
      }).catch(err => logger.warn('Failed to query admin emails for notification', { error: err.message }));

    // Notify creator their quotation moved to admin review — non-blocking
    const opsCreatorEmail = quotation.createdBySnapshot?.email;
    if (opsCreatorEmail && opsCreatorEmail !== req.user.email) {
      emailService.opsApprovedNotifyCreator(opsCreatorEmail, quotation, req.user.name);
    }

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

    // First check the quotation exists and get current state
    const existing = await Quotation.findById(req.params.id).lean();
    if (!existing) {
      logger.warn(`Quotation not found for ops rejection: ${req.params.id}`, {
        quotationId: req.params.id,
        userId: req.user?.id
      });
      return res.status(404).json({ message: 'Quotation not found' });
    }

    if (existing.status !== 'pending') {
      logger.warn(`Cannot ops-reject quotation with status ${existing.status}`, {
        quotationId: existing._id,
        currentStatus: existing.status,
        userId: req.user?.id
      });
      return res.status(409).json({ success: false, message: 'Quotation status has changed — please refresh and try again.' });
    }

    const oldStatus = existing.status;

    // Build atomic filter with company scoping (Fix 6)
    const atomicFilter = { _id: req.params.id, status: 'pending' };
    const opsRejectCompanyId = req.headers['x-company-id'];
    if (opsRejectCompanyId && mongoose.Types.ObjectId.isValid(opsRejectCompanyId)) {
      atomicFilter.companyId = new mongoose.Types.ObjectId(opsRejectCompanyId);
    }

    // Atomic update — only succeeds if status is still 'pending' (and company matches)
    const quotation = await Quotation.findOneAndUpdate(
      atomicFilter,
      { $set: {
        status: 'ops_rejected',
        opsRejectedBy: req.user.id,
        opsRejectedAt: new Date(),
        opsRejectionReason: reason.trim(),
        opsApprovedBySnapshot: {
          name: req.user.name,
          email: req.user.email,
          role: req.user.role,
          approvedAt: new Date()
        }
      }},
      { new: true }
    );
    if (!quotation) {
      return res.status(409).json({ success: false, message: 'Quotation status has changed — please refresh and try again.' });
    }
    invalidateQuotationStats(quotation);

    // Email creator — non-blocking
    const creatorEmail = quotation.createdBySnapshot?.email;
    if (creatorEmail) {
      emailService.opsRejectedNotifyCreator(creatorEmail, quotation, req.user.name, reason.trim());
    }

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
    // First check the quotation exists and get current state
    const existing = await Quotation.findById(req.params.id).lean();
    if (!existing) {
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
        quotationId: existing._id
      });
      return res.status(403).json({ message: 'Only admin can approve quotation' });
    }

    const allowedStatuses = ['ops_approved', 'pending_admin'];
    if (!allowedStatuses.includes(existing.status)) {
      logger.warn(`Cannot approve quotation with status ${existing.status}`, {
        quotationId: existing._id,
        currentStatus: existing.status,
        userId: req.user?.id
      });
      return res.status(409).json({ success: false, message: 'Quotation status has changed — please refresh and try again.' });
    }

    const oldStatus = existing.status;

    // Atomic update — only succeeds if status is still ops_approved or pending_admin
    const quotation = await Quotation.findOneAndUpdate(
      { _id: req.params.id, status: { $in: allowedStatuses } },
      { $set: {
        status: 'approved',
        approvedBy: req.user.id,
        approvedAt: new Date(),
        approvedBySnapshot: {
          name: req.user.name,
          email: req.user.email,
          role: req.user.role,
          approvedAt: new Date()
        }
      }},
      { new: true }
    );
    if (!quotation) {
      return res.status(409).json({ success: false, message: 'Quotation status has changed — please refresh and try again.' });
    }
    invalidateQuotationStats(quotation);

    // Email creator — skip if admin is approving their own quotation
    const approveCreatorEmail = quotation.createdBySnapshot?.email;
    const approveIsSelf = quotation.createdBy?.toString() === req.user.id;
    logger.info(`[Email] approve check — createdBy: ${quotation.createdBy}, approver: ${req.user.id}, isSelf: ${approveIsSelf}`);
    if (approveCreatorEmail && !approveIsSelf) {
      emailService.adminApprovedNotifyCreator(approveCreatorEmail, quotation, req.user.name);
    }

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

    // First check the quotation exists and get current state
    const existing = await Quotation.findById(req.params.id).lean();
    if (!existing) {
      logger.warn(`Quotation not found for admin rejection: ${req.params.id}`, {
        quotationId: req.params.id,
        userId: req.user?.id
      });
      return res.status(404).json({ message: 'Quotation not found' });
    }

    // Fix 9: 'pending' removed — admin can only reject after ops review
    const allowedStatuses = ['ops_approved', 'pending_admin'];
    if (!allowedStatuses.includes(existing.status)) {
      logger.warn(`Cannot reject quotation with status ${existing.status}`, {
        quotationId: existing._id,
        currentStatus: existing.status,
        userId: req.user?.id
      });
      return res.status(409).json({ success: false, message: 'Quotation status has changed — please refresh and try again.' });
    }

    const oldStatus = existing.status;

    // Atomic update — only succeeds if status is still ops_approved or pending_admin
    const quotation = await Quotation.findOneAndUpdate(
      { _id: req.params.id, status: { $in: allowedStatuses } },
      { $set: {
        status: 'rejected',
        rejectionReason: reason.trim(),
        rejectedBy: req.user.id,
        rejectedAt: new Date(),
        approvedBySnapshot: {
          name: req.user.name,
          email: req.user.email,
          role: req.user.role,
          approvedAt: new Date()
        }
      }},
      { new: true }
    );
    if (!quotation) {
      return res.status(409).json({ success: false, message: 'Quotation status has changed — please refresh and try again.' });
    }
    invalidateQuotationStats(quotation);

    // Email creator — skip if admin is rejecting their own quotation
    const rejectCreatorEmail = quotation.createdBySnapshot?.email;
    const rejectIsSelf = quotation.createdBy?.toString() === req.user.id;
    logger.info(`[Email] reject check — createdBy: ${quotation.createdBy}, approver: ${req.user.id}, isSelf: ${rejectIsSelf}`);
    if (rejectCreatorEmail && !rejectIsSelf) {
      emailService.adminRejectedNotifyCreator(rejectCreatorEmail, quotation, req.user.name, reason.trim());
    }

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
      search = '',
      sortBy = 'createdAt',     // ← ADD THIS
      sortDir = 'desc'           // ← ADD THIS
    } = req.query;

    logger.debug('Fetching all quotations for admin', {
      filters: { status, fromDate, toDate, userId, companyId, page, limit, search, sortBy, sortDir },
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
      query.$text = { $search: search.trim() };
    }

    // Get total count for pagination
    const totalCount = await Quotation.countDocuments(query);
    
    // Build sort object
    let sortObject = {};
    // Map frontend field names to database field names
    switch (sortBy) {
      case 'quotationNumber':
        sortObject = { quotationNumber: sortDir === 'asc' ? 1 : -1 };
        break;
      case 'customerSnapshot.name':
      case 'customer':
        sortObject = { 'customerSnapshot.name': sortDir === 'asc' ? 1 : -1 };
        break;
      case 'queryDate':
        sortObject = { queryDate: sortDir === 'asc' ? 1 : -1 };
        break;
      case 'date':
        sortObject = { date: sortDir === 'asc' ? 1 : -1 };
        break;
      case 'expiryDate':
        sortObject = { expiryDate: sortDir === 'asc' ? 1 : -1 };
        break;
      case 'total':
        sortObject = { total: sortDir === 'asc' ? 1 : -1 };
        break;
      case 'status':
        sortObject = { status: sortDir === 'asc' ? 1 : -1 };
        break;
      case 'createdBy.name':
      case 'createdby':
        sortObject = { 'createdBySnapshot.name': sortDir === 'asc' ? 1 : -1 };
        break;
      case 'createdAt':
      default:
        sortObject = { createdAt: sortDir === 'asc' ? 1 : -1 };
        break;
    }
    
    logger.debug('Admin sort query', { sortBy, sortDir, sortObject });
    
    const effectiveSortAdmin = search && search.trim()
      ? { score: { $meta: 'textScore' }, ...sortObject }
      : sortObject;

    const quotations = await listPopulate(
      Quotation.find(query)
        .sort(effectiveSortAdmin)
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
      sortBy,
      sortDir,
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
      filters: { status, fromDate, toDate, userId, companyId, search, sortBy, sortDir },
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
    // ✅ Get companyId from query params or headers (consistent with other APIs)
    let companyId = req.query.companyId || req.headers['x-company-id'];
    let matchStage = {};
    
    logger.debug('getAdminDashboardStats', { companyId: companyId || 'all' });

    // Handle "All Companies" - don't filter by companyId
    if (companyId && companyId !== 'all' && companyId !== 'ALL') {
      if (mongoose.Types.ObjectId.isValid(companyId)) {
        matchStage = { companyId: new mongoose.Types.ObjectId(companyId) };
      } else {
        logger.warn('Invalid companyId format in getAdminDashboardStats', { companyId });
      }
    }
    
    logger.debug('Fetching admin dashboard stats', {
      companyId,
      userId: req.user?.id
    });

    // ✅ Define all statuses that admin can see
    const adminVisibleStatuses = [
      'pending', 
      'pending_admin',
      'ops_approved', 
      'ops_rejected', 
      'rejected', 
      'approved', 
      'awarded', 
      'not_awarded',
      'draft',
      'sent'
    ];
    
    // ✅ Get all status counts using aggregation
    const allStatusCounts = await Quotation.aggregate([
      { $match: { ...matchStage, status: { $in: adminVisibleStatuses } } },
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);
    
    logger.debug('Admin dashboard allStatusCounts', { counts: allStatusCounts });

    // Build counts map
    const countsMap = {};
    allStatusCounts.forEach(item => {
      countsMap[item._id] = item.count;
    });
    
    const totalQuotations = allStatusCounts.reduce((sum, item) => sum + item.count, 0);
    
    // Get individual counts
    const pendingCount = (countsMap['pending'] || 0) + (countsMap['pending_admin'] || 0);
    const opsApprovedCount = countsMap['ops_approved'] || 0;
    const opsRejectedCount = countsMap['ops_rejected'] || 0;
    const rejectedCount = countsMap['rejected'] || 0;
    const approvedCount = countsMap['approved'] || 0;
    const awardedCount = countsMap['awarded'] || 0;
    const notAwardedCount = countsMap['not_awarded'] || 0;
    const draftCount = countsMap['draft'] || 0;
    const sentCount = countsMap['sent'] || 0;
    
    // ✅ Get total revenue from approved quotations
    const totalRevenueResult = await Quotation.aggregate([
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
    ]);
    
    // ✅ Get awarded value
    const awardedValueResult = await Quotation.aggregate([
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
    ]);
    
    // ✅ Get conversion rate data
    const conversionRateData = await (async () => {
      const [approvedCnt, awardedCnt, notAwardedCnt] = await Promise.all([
        Quotation.countDocuments({ ...matchStage, status: 'approved' }),
        Quotation.countDocuments({ ...matchStage, status: 'awarded' }),
        Quotation.countDocuments({ ...matchStage, status: 'not_awarded' })
      ]);
      
      const totalDecided = approvedCnt + awardedCnt + notAwardedCnt;
      const rate = totalDecided > 0 ? (awardedCnt / totalDecided) * 100 : 0;
      
      return {
        approvedCount: approvedCnt,
        awardedCount: awardedCnt,
        notAwardedCount: notAwardedCnt,
        totalDecided,
        rate: Math.round(rate * 100) / 100
      };
    })();
    
    // ✅ Get total customers count
    const totalCustomers = await Customer.countDocuments(matchStage);
    
    const totalRevenueValue = totalRevenueResult[0]?.total || 0;
    const awardedValueTotal = awardedValueResult[0]?.total || 0;
    
    logger.debug('Admin dashboard counts', { totalQuotations, pendingCount, opsApprovedCount, opsRejectedCount, rejectedCount, approvedCount, awardedCount, notAwardedCount });
    
    const duration = Date.now() - startTime;
    
    logger.info(`Admin dashboard stats fetched successfully`, {
      totalQuotations,
      totalCustomers,
      actionRequired: opsApprovedCount,
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
        totalQuotations: totalQuotations || 0,
        totalCustomers: totalCustomers || 0,
        actionRequired: opsApprovedCount || 0,
        approved: approvedCount || 0,
        awarded: awardedCount || 0,
        notAwarded: notAwardedCount || 0,
        totalRevenue: totalRevenueValue || 0,
        awardedValue: awardedValueTotal || 0,
        conversionRate: conversionRateData.rate || 0,
        rejected: rejectedCount || 0,
        statusCounts: {
          total: totalQuotations || 0,
          draft: draftCount || 0,
          pending: pendingCount || 0,
          ops_approved: opsApprovedCount || 0,
          ops_rejected: opsRejectedCount || 0,
          approved: approvedCount || 0,
          rejected: rejectedCount || 0,
          awarded: awardedCount || 0,
          not_awarded: notAwardedCount || 0,
          sent: sentCount || 0,
        },
        conversionDetails: conversionRateData,
        isAllCompanies: !companyId || companyId === 'all' || companyId === 'ALL',
        // ✅ Tab counts for frontend
        tabCounts: {
          all: totalQuotations || 0,
          pending: pendingCount || 0,
          ops_approved: opsApprovedCount || 0,
          ops_rejected: opsRejectedCount || 0,
          rejected: rejectedCount || 0,
          approved: approvedCount || 0,
          awarded: awardedCount || 0,
          not_awarded: notAwardedCount || 0,
        }
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

exports.getOpsDashboardStats = async (req, res) => {
  const startTime = Date.now();
  try {
    // ✅ Get companyId from query params or headers (consistent with getAllOpsQuotations)
    let companyId = req.query.companyId || req.headers['x-company-id'];
    let matchStage = {};
    let customerMatchStage = {};
    
    logger.debug('getOpsDashboardStats', { companyId: companyId || 'all' });

    if (companyId && companyId !== 'all' && companyId !== 'ALL') {
      if (mongoose.Types.ObjectId.isValid(companyId)) {
        const companyObjectId = new mongoose.Types.ObjectId(companyId);
        matchStage = { companyId: companyObjectId };
        customerMatchStage = { companyId: companyObjectId };
      } else {
        logger.warn('Invalid companyId format in getOpsDashboardStats', { companyId });
      }
    }

    // ✅ Include ALL statuses that Ops can see
    const opsVisibleStatuses = [
      'pending', 
      'pending_admin',
      'ops_approved', 
      'ops_rejected', 
      'rejected', 
      'approved', 
      'awarded', 
      'not_awarded'
    ];
    
    // Run all aggregations in parallel for better performance
    const [
      allStatusCounts,
      awardedValueResult,
      totalValueResult,
      customerStats
    ] = await Promise.all([
      // Quotation status counts
      Quotation.aggregate([
        { $match: { ...matchStage, status: { $in: opsVisibleStatuses } } },
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ]),
      
      // Awarded value
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
        }
      ]),
      
      // Total value (all quotations)
      Quotation.aggregate([
        { 
          $match: matchStage 
        },
        { 
          $group: { 
            _id: null, 
            total: { $sum: '$totalInBaseCurrency' } 
          } 
        }
      ]),
      
      // ✅ NEW: Customer statistics
      Customer.aggregate([
        { $match: customerMatchStage },
        { 
          $facet: {
            totalCustomers: [{ $count: 'count' }],
            activeCustomers: [
              { $match: { isActive: true } },
              { $count: 'count' }
            ],
            inactiveCustomers: [
              { $match: { isActive: false } },
              { $count: 'count' }
            ],
            vatRegistered: [
              { 
                $match: { 
                  $or: [
                    { taxTreatment: 'vat_registered' },
                    { taxTreatment: 'gcc_vat_registered' }
                  ]
                } 
              },
              { $count: 'count' }
            ],
            nonVatRegistered: [
              { 
                $match: { 
                  $or: [
                    { taxTreatment: 'non_vat_registered' },
                    { taxTreatment: 'gcc_non_vat_registered' }
                  ]
                } 
              },
              { $count: 'count' }
            ],
            customersWithTrn: [
              { 
                $match: { 
                  taxRegistrationNumber: { $exists: true, $ne: '' } 
                } 
              },
              { $count: 'count' }
            ]
          }
        }
      ])
    ]);

    logger.debug('Ops dashboard allStatusCounts', { counts: allStatusCounts });

    const countsMap = {};
    allStatusCounts.forEach(item => {
      countsMap[item._id] = item.count;
    });

    const totalQuotations = allStatusCounts.reduce((sum, item) => sum + item.count, 0);
    
    const pendingCount = (countsMap['pending'] || 0) + (countsMap['pending_admin'] || 0);
    const opsApprovedCount = countsMap['ops_approved'] || 0;
    const opsRejectedCount = countsMap['ops_rejected'] || 0;
    const rejectedCount = countsMap['rejected'] || 0;
    const approvedCount = countsMap['approved'] || 0;
    const awardedCount = countsMap['awarded'] || 0;
    const notAwardedCount = countsMap['not_awarded'] || 0;

    // Extract customer stats from facet result
    const customerStatsData = customerStats[0] || {};
    const totalCustomers = customerStatsData.totalCustomers?.[0]?.count || 0;
    const activeCustomers = customerStatsData.activeCustomers?.[0]?.count || 0;
    const inactiveCustomers = customerStatsData.inactiveCustomers?.[0]?.count || 0;
    const vatRegistered = customerStatsData.vatRegistered?.[0]?.count || 0;
    const nonVatRegistered = customerStatsData.nonVatRegistered?.[0]?.count || 0;
    const customersWithTrn = customerStatsData.customersWithTrn?.[0]?.count || 0;

    logger.debug('Ops dashboard counts', {
      totalQuotations, pendingCount, opsApprovedCount, opsRejectedCount,
      rejectedCount, approvedCount, awardedCount, notAwardedCount,
      awardedValue: awardedValueResult[0]?.total || 0,
      totalValue: totalValueResult[0]?.total || 0,
      totalCustomers, activeCustomers, inactiveCustomers,
      vatRegistered, nonVatRegistered, customersWithTrn
    });

    const stats = {
      // Quotation stats
      totalQuotations: totalQuotations || 0,
      pendingReview: pendingCount || 0,
      awaitingAdmin: opsApprovedCount || 0,
      returnedByMe: opsRejectedCount || 0,
      rejectedByAdmin: rejectedCount || 0,
      approved: approvedCount || 0,
      awarded: awardedCount || 0,
      notAwarded: notAwardedCount || 0,
      totalValue: awardedValueResult[0]?.total || 0,
      totalQuotationsValue: totalValueResult[0]?.total || 0,
      
      // ✅ NEW: Customer stats
      totalCustomers: totalCustomers || 0,
      activeCustomers: activeCustomers || 0,
      inactiveCustomers: inactiveCustomers || 0,
      vatRegisteredCustomers: vatRegistered || 0,
      nonVatRegisteredCustomers: nonVatRegistered || 0,
      customersWithTrn: customersWithTrn || 0,
      
      // Metadata
      isAllCompanies: !companyId || companyId === 'all' || companyId === 'ALL',
      
      // Tab counts for UI
      tabCounts: {
        all: totalQuotations || 0,
        pending: pendingCount || 0,
        ops_approved: opsApprovedCount || 0,
        ops_rejected: opsRejectedCount || 0,
        rejected: rejectedCount || 0,
        approved: approvedCount || 0,
        awarded: awardedCount || 0,
        not_awarded: notAwardedCount || 0,
      }
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
    let companyId = req.query.companyId || req.headers['x-company-id'];
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
          // ✅ FIXED: Awarded value only (sum of totalInBaseCurrency for awarded quotations)
          totalAwardedValue: {
            $sum: {
              $cond: [{ $eq: ['$status', 'awarded'] }, '$totalInBaseCurrency', 0]
            }
          },
          totalValueAll: { $sum: '$totalInBaseCurrency' }, // Keep for reference
          quotationsByStatus: {
            $push: {
              status: '$status',
              totalInBaseCurrency: '$totalInBaseCurrency',
              total: '$total',
              currency: '$currency.code'
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
          // ✅ This now shows awarded value only
          totalValue: '$totalAwardedValue',
          totalValueAll: 1,  
          pending: {
            $size: {
              $filter: {
                input: '$quotationsByStatus',
                as: 'q',
                cond: { 
                  $or: [
                    { $eq: ['$$q.status', 'pending'] },
                    { $eq: ['$$q.status', 'pending_admin'] }
                  ]
                }
              }
            }
          },
          approved: {
            $size: {
              $filter: {
                input: '$quotationsByStatus',
                as: 'q',
                cond: { 
                  $or: [
                    { $eq: ['$$q.status', 'approved'] },
                    { $eq: ['$$q.status', 'ops_approved'] }
                  ]
                }
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
                    { $eq: ['$$q.status', 'not_awarded'] },
                    { $eq: ['$$q.status', 'ops_rejected'] }
                  ] 
                }
              }
            }
          },
          returned: {
            $size: {
              $filter: {
                input: '$quotationsByStatus',
                as: 'q',
                cond: { $eq: ['$$q.status', 'ops_rejected'] }
              }
            }
          }
        }
      },
      { $sort: { totalQuotations: -1 } }
    ]);

    // ✅ Calculate total awarded value across all users (AED)
    const totalAwardedValue = await Quotation.aggregate([
      { $match: { ...matchStage, status: 'awarded' } },
      { $group: { _id: null, total: { $sum: '$totalInBaseCurrency' } } }
    ]);
    
    // Total quotations count
    const totalQuotations = await Quotation.countDocuments(matchStage);
    
    // Total awarded quotations count
    const totalAwardedQuotations = await Quotation.countDocuments({ ...matchStage, status: 'awarded' });
    
    const totalUsers = userStats.length;
    const duration = Date.now() - startTime;
    
    logger.info(`User quotation stats fetched`, {
      totalUsers,
      totalQuotations,
      totalAwardedQuotations,
      totalAwardedValue: totalAwardedValue[0]?.total || 0,
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
        totalAwardedQuotations,
        totalUsers,
        totalAwardedValue: totalAwardedValue[0]?.total || 0, 
        averagePerUser: totalUsers > 0 ? (totalQuotations / totalUsers).toFixed(2) : 0,
        averageAwardedValuePerUser: totalUsers > 0 ? ((totalAwardedValue[0]?.total || 0) / totalUsers).toFixed(2) : 0,
        isAllCompanies: !companyId || companyId === 'all' || companyId === 'ALL'
      }
    });

  } catch (error) {
    const duration = Date.now() - startTime;
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
    const companyId = req.query.companyId || req.headers['x-company-id'];
    
    // Get selected currency from query params (optional)
    const selectedCurrency = req.query.currency || 'AED';
    
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
      .populate('customerId', 'name email phone')
      .populate('companyId', 'name code baseCurrency')
      .lean();

    // Get exchange rates for currency conversion if needed
    let exchangeRates = null;
    if (selectedCurrency !== 'AED') {
      try {
        exchangeRates = await ExchangeRateService.getRates(selectedCurrency);
      } catch (rateError) {
        logger.error(`Error fetching exchange rates: ${rateError.message}`);
      }
    }

    // ✅ Calculate user's awarded total
    const userAwardedTotal = quotations
      .filter(q => q.status === 'awarded')
      .reduce((sum, q) => sum + (q.totalInBaseCurrency || 0), 0);

    // Process quotations to include converted values
    const processedQuotations = quotations.map(quotation => {
      const result = { ...quotation };
      const quoteCurrency = quotation.currency?.code || 'AED';
      
      // Add display currency conversion if needed
      if (selectedCurrency !== 'AED' && selectedCurrency !== quoteCurrency) {
        // Convert from AED to selected currency
        const rate = exchangeRates ? (exchangeRates[quoteCurrency] || 1) : 1;
        result.totalInSelectedCurrency = quotation.totalInBaseCurrency * rate;
        result.subtotalInSelectedCurrency = quotation.subtotalInBaseCurrency * rate;
        result.taxAmountInSelectedCurrency = quotation.taxAmountInBaseCurrency * rate;
        result.discountAmountInSelectedCurrency = quotation.discountAmountInBaseCurrency * rate;
      } else if (selectedCurrency !== quoteCurrency && quoteCurrency !== 'AED') {
        // Convert from quote currency to AED (already have totalInBaseCurrency)
        result.totalInSelectedCurrency = quotation.totalInBaseCurrency;
      } else {
        result.totalInSelectedCurrency = quotation.total;
      }
      
      result.displayCurrency = selectedCurrency;
      return result;
    });

    const duration = Date.now() - startTime;
    
    logger.info(`Fetched ${quotations.length} quotations for user ${userId}`, {
      targetUserId: userId,
      count: quotations.length,
      awardedTotal: userAwardedTotal,
      companyId,
      displayCurrency: selectedCurrency,
      duration: `${duration}ms`,
      adminId: req.user?.id
    });

    res.json({
      success: true,
      quotations: processedQuotations,
      count: quotations.length,
      awardedTotal: userAwardedTotal, // ✅ User's awarded total in AED
      displayCurrency: selectedCurrency
    });

  } catch (error) {
    const duration = Date.now() - startTime;
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
