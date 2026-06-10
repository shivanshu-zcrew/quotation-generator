const mongoose = require("mongoose");
const { Quotation, ExchangeRateService, Company } = require('../models/quotation');
const { Customer } = require('../models/customer');
const Item = require('../models/items');
const puppeteer = require('puppeteer');
const mime = require('mime-types');
const zohoBooksService = require('../zoho/customerServices');
const { CURRENCY_OPTIONS } = require('../models/constants'); 
const imageCompressor = require('../utils/imageCompressor');
const ExcelJS = require('exceljs');
const NotificationService = require("../utils/notificationService");
const logger = require('../config/logger');

// ===================== S3 IMPORTS =====================
const {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand
} = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

// ===================== S3 CLIENT =====================
const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const presignS3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
  requestChecksumCalculation: "WHEN_REQUIRED",
});

const S3_BUCKET_NAME = process.env.S3_BUCKET_NAME;

// ===================== S3 HELPER FUNCTIONS =====================
const uploadBase64ToS3 = async (base64Data, folder) => {
  try {
    if (!base64Data || !base64Data.startsWith("data:")) {
      return null;
    }

    const matches = base64Data.match(/^data:([^;]+);base64,(.*)$/);
    if (!matches) return null;

    const mimeType = matches[1];
    const base64String = matches[2];
    const buffer = Buffer.from(base64String, "base64");
    const extension = mimeType.split("/")[1] || "jpg";
    const key = `${folder}/${Date.now()}-${Math.random().toString(36).substring(2, 8)}.${extension}`;

    const command = new PutObjectCommand({
      Bucket: S3_BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: mimeType,
    });

    await s3Client.send(command);
    return { key };
  } catch (error) {
    logger.error(`S3 Upload Error: ${error.message}`);
    return null;
  }
};

const uploadBufferToS3 = async (buffer, mimeType, folder) => {
  try {
    const extension = mimeType.split("/")[1] || "jpg";
    const key = `${folder}/${Date.now()}-${Math.random().toString(36).substring(2, 8)}.${extension}`;

    const command = new PutObjectCommand({
      Bucket: S3_BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: mimeType,
    });

    await s3Client.send(command);
    return { key };
  } catch (error) {
    logger.error(`S3 Upload Buffer Error: ${error.message}`);
    return null;
  }
};

const deleteFromS3 = async (key) => {
  if (!key) return false;
  
  try {
    const command = new DeleteObjectCommand({
      Bucket: S3_BUCKET_NAME,
      Key: key,
    });
    
    await s3Client.send(command);
    return true;
  } catch (error) {
    logger.error(`S3 Delete Error: ${error.message}`);
    return false;
  }
};

const getSignedFileUrl = async (key, expiresIn = 3600) => {
  if (!key) return null;
  
  try {
    const command = new GetObjectCommand({
      Bucket: S3_BUCKET_NAME,
      Key: key,
    });
    
    const url = await getSignedUrl(s3Client, command, { expiresIn });
    return url;
  } catch (error) {
    logger.error(`S3 Get Signed URL Error: ${error.message}`);
    return null;
  }
};

// ─────────────────────────────────────────────────────────────
// Shared Puppeteer browser — one instance, auto-reconnect
// ─────────────────────────────────────────────────────────────
let _browser = null;

exports.getPDFMetrics = async (req, res) => {
  const metrics = browserPool?.getMetrics() || {};
  const memory = process.memoryUsage();
  
  res.json({
    success: true,
    metrics,
    memory: {
      heapUsedMB: Math.round(memory.heapUsed / 1024 / 1024),
      heapTotalMB: Math.round(memory.heapTotal / 1024 / 1024),
      rssMB: Math.round(memory.rss / 1024 / 1024)
    },
    uptime: process.uptime()
  });
};


const getBrowser = async () => {
  if (_browser?.isConnected()) return _browser;

  try {
    _browser = await puppeteer.launch({
      headless: true,
      executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-zygote',
        '--single-process',
      ],
    });

  //    _browser = await puppeteer.launch({
  //   headless: true,
  //   args: [
  //     '--no-sandbox',
  //     '--disable-setuid-sandbox',
  //     '--disable-dev-shm-usage',
  //     '--disable-gpu',
  //   ],
  // });
  
    _browser.on('disconnected', () => { 
      _browser = null;
      logger.warn('Puppeteer browser disconnected');
    });
    
    return _browser;
  } catch (error) {
    logger.error(`Puppeteer browser launch error: ${error.message}`);
    throw error;
  }
};

// ─────────────────────────────────────────────────────────────
// S3 helpers for documents
// ─────────────────────────────────────────────────────────────
const getFileInfoFromBase64 = (base64String) => {
  const matches = base64String.match(/^data:([^;]+);base64,(.*)$/s);
  if (!matches) throw new Error('Invalid base64 data');
  
  const mimeType = matches[1];
  const base64Data = matches[2];
  const buffer = Buffer.from(base64Data, 'base64');
  
  const ext = mime.extension(mimeType) || 'bin';
  const fileName = `document-${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`;
  
  return { mimeType, buffer, size: buffer.length, fileName };
};

const uploadInternalDocumentFromBase64 = async (base64String, quotationNumber, userId, description = '') => {
  try {
    const fileInfo = getFileInfoFromBase64(base64String);
    const folder = `quotations/${quotationNumber}/internal-docs`;
    
    const result = await uploadBufferToS3(fileInfo.buffer, fileInfo.mimeType, folder);
    
    if (!result) throw new Error('Failed to upload to S3');
    
    return {
      fileName: fileInfo.fileName,
      fileType: fileInfo.mimeType,
      fileSize: fileInfo.size,
      s3Key: result.key,
      storageProvider: 's3',
      uploadedBy: userId,
      uploadedAt: new Date(),
      description: description,
      isInternalOnly: true
    };
  } catch (error) {
    logger.error(`Upload internal document error: ${error.message}`);
    throw error;
  }
};

const uploadMultipleInternalDocumentsFromBase64 = async (base64Array, quotationNumber, userId, descriptions = []) => {
  if (!Array.isArray(base64Array)) base64Array = [base64Array];
  
  const uploadPromises = base64Array.map(async (base64String, index) => {
    try {
      const description = descriptions[index] || '';
      return await uploadInternalDocumentFromBase64(base64String, quotationNumber, userId, description);
    } catch (err) {
      logger.error(`Failed to upload document: ${err.message}`);
      return null;
    }
  });
  
  const results = await Promise.all(uploadPromises);
  return results.filter(Boolean);
};

const deleteInternalDocument = async (document) => {
  if (!document || !document.s3Key) return false;
  return await deleteFromS3(document.s3Key);
};

const calculateTotals = (items, taxPercent, discountPercent, exchangeRate) => {
  const subtotal = items.reduce((sum, item) => sum + item.totalPrice, 0);
  const subtotalInBaseCurrency = subtotal * exchangeRate;
  
  const discountAmount = (subtotal * (discountPercent || 0)) / 100;
  const discountAmountInBaseCurrency = discountAmount * exchangeRate;
  
  const subtotalAfterDiscount = subtotal - discountAmount;
  const subtotalAfterDiscountInBaseCurrency = subtotalAfterDiscount * exchangeRate;
  
  const taxAmount = (subtotalAfterDiscount * (taxPercent || 0)) / 100;
  const taxAmountInBaseCurrency = taxAmount * exchangeRate;
  
  const total = subtotalAfterDiscount + taxAmount;
  const totalInBaseCurrency = total * exchangeRate;
  
  return {
    subtotal, taxAmount, discountAmount, total,
    subtotalInBaseCurrency, taxAmountInBaseCurrency, discountAmountInBaseCurrency,
    totalInBaseCurrency, subtotalOriginal: subtotal,
    subtotalOriginalInBaseCurrency: subtotalInBaseCurrency,
    subtotalAfterDiscount, subtotalAfterDiscountInBaseCurrency
  };
};

const generateQuotationNumber = (companyCode) => {
  const prefix = companyCode || 'QT';
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return `${prefix}-${timestamp}-${random}`;
};

const parsePagination = ({ page, limit }) => {
  const p = Math.max(1, parseInt(page, 10) || 1);
  const l = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  return { page: p, limit: l, skip: (p - 1) * l };
};

const paginated = (res, data, total, page, limit) =>
  res.status(200).json({
    data,
    pagination: {
      total, page, limit,
      totalPages: Math.ceil(total / limit),
      hasNextPage: page * limit < total,
      hasPrevPage: page > 1,
    },
  });

const validateDates = (date, expiryDate) => {
  if (!expiryDate) return 'Expiry date is required';
  if (date && expiryDate && new Date(expiryDate) < new Date(date))
    return 'Expiry date cannot be before the creation date';
  return null;
};

const SORT_FIELDS = new Set([
  'createdAt', 'date', 'expiryDate', 'queryDate',
  'total', 'totalInAED', 'customer', 'status', 'quotationNumber', 'company.code'
]);

const fullPopulate = (q) =>
  q
    .populate('customerId', 'name email phone address')
    .populate('createdBy', 'name email')
    .populate('opsApprovedBy', 'name email')
    .populate('approvedBy', 'name email')
    .populate('awardedBy', 'name email');

function convertHtmlToPlainText(html) {
  if (!html) return '';
  let text = html.replace(/<[^>]*>/g, ' ');
  text = text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
  text = text.replace(/\s+/g, ' ').trim();
  text = text.replace(/(\d+\.\d+)/g, '\n  $1');
  text = text.replace(/(\d+\.)(\s+)([^\d])/g, '\n$1 $3');
  text = text.replace(/(\d+\.\s+)(?!\d)/g, '\n$1');
  text = text.replace(/(\d+\.\s+[^\n]+?)(\n\s*\d+\.\d+)/g, '$1\n$2');
  text = text.replace(/\n{3,}/g, '\n\n');
  text = text.trim();
  return text;
}

function cleanHtmlForZoho(html) {
  if (!html) return '';
  let cleaned = html.replace(/<img[^>]*src="data:image[^"]*"[^>]*>/gi, '');
  cleaned = cleaned.replace(/<img[^>]*>/gi, '');
  let text = convertHtmlToPlainText(cleaned);
  if (text.length > 9500) {
    text = text.substring(0, 9500) + '... (truncated)';
  }
  return text;
}

// =============================================================
// COMPANY CONTROLLERS
// =============================================================

exports.getCompanies = async (req, res) => {
  try {
    const companies = await Company.find({ isActive: true })
      .select('code name slug logo address phone email baseCurrency acceptedCurrencies')
      .sort({ name: 1 })
      .lean();

    res.json({ success: true, companies, count: companies.length });
  } catch (err) {
    logger.error(`Get companies error: ${err.message}`);
    res.status(500).json({ success: false, message: 'Error fetching companies', error: err.message });
  }
};

exports.getCompanyByCode = async (req, res) => {
  try {
    const { code } = req.params;
    const company = await Company.findOne({ code: code.toUpperCase(), isActive: true }).lean();

    if (!company) {
      logger.warn(`Company not found: ${code}`);
      return res.status(404).json({ success: false, message: 'Company not found' });
    }

    res.json({ success: true, company });
  } catch (err) {
    logger.error(`Get company by code error: ${err.message}`);
    res.status(500).json({ success: false, message: 'Error fetching company', error: err.message });
  }
};

exports.getCompanyStats = async (req, res) => {
  try {
    const { id } = req.params;
    const { from, to } = req.query;

    const company = await Company.findById(id);
    if (!company) {
      logger.warn(`Company not found for stats: ${id}`);
      return res.status(404).json({ success: false, message: 'Company not found' });
    }

    const matchStage = { companyId: company._id };
    if (from || to) {
      matchStage.createdAt = {};
      if (from) matchStage.createdAt.$gte = new Date(from);
      if (to) matchStage.createdAt.$lte = new Date(to);
    }

    const [totalQuotations, totalValue, statusCounts, currencyBreakdown, recentQuotations] = await Promise.all([
      Quotation.countDocuments(matchStage),
      Quotation.aggregate([{ $match: { ...matchStage, status: { $in: ['approved', 'awarded'] } } }, { $group: { _id: null, total: { $sum: '$totalInBaseCurrency' } } }]),
      Quotation.aggregate([{ $match: matchStage }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
      Quotation.aggregate([{ $match: matchStage }, { $group: { _id: '$currency.code', count: { $sum: 1 }, total: { $sum: '$totalInBaseCurrency' } } }]),
      Quotation.find(matchStage).sort({ createdAt: -1 }).limit(5).populate('customerId', 'name').populate('createdBy', 'name').select('quotationNumber customerSnapshot.name total status createdAt currency.code').lean()
    ]);

    const statusMap = { draft: 0, pending: 0, ops_approved: 0, ops_rejected: 0, approved: 0, rejected: 0, awarded: 0, not_awarded: 0, sent: 0 };
    statusCounts.forEach(item => { statusMap[item._id] = item.count; });

    res.json({
      success: true,
      company: { id: company._id, code: company.code, name: company.name, baseCurrency: company.baseCurrency, logo: company.logo },
      stats: { totalQuotations, totalValue: totalValue[0]?.total || 0, statusCounts: statusMap, currencyBreakdown, recentQuotations }
    });
  } catch (err) {
    logger.error(`Get company stats error: ${err.message}`);
    res.status(500).json({ success: false, message: 'Error fetching company stats', error: err.message });
  }
};

// =============================================================
// QUOTATION CRUD OPERATIONS
// =============================================================

exports.getAllQuotations = async (req, res) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const filter = {};
    
    if (req.query.companyId) filter.companyId = req.query.companyId;
    if (req.query.status) filter.status = req.query.status;
    if (req.query.customerId) filter.customerId = req.query.customerId;
    if (req.query.currency) filter['currency.code'] = req.query.currency;
    
    if (req.query.search) {
      const re = new RegExp(req.query.search.trim(), 'i');
      filter.$or = [{ quotationNumber: re }, { 'customerSnapshot.name': re }, { contact: re }];
    }
    
    if (req.query.from || req.query.to) {
      filter.date = {};
      if (req.query.from) filter.date.$gte = new Date(req.query.from);
      if (req.query.to) filter.date.$lte = new Date(req.query.to);
    }

    const sortField = SORT_FIELDS.has(req.query.sortBy) ? req.query.sortBy : 'createdAt';
    const sortDir = req.query.sortDir === 'asc' ? 1 : -1;

    const [data, total] = await Promise.all([
      fullPopulate(Quotation.find(filter).sort({ [sortField]: sortDir }).skip(skip).limit(limit)).lean(),
      Quotation.countDocuments(filter),
    ]);

    return paginated(res, data, total, page, limit);
  } catch (err) {
    logger.error(`Get all quotations error: ${err.message}`);
    res.status(500).json({ message: 'Error fetching quotations', error: err.message });
  }
};

exports.getMyQuotations = async (req, res) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const { companyId = null } = req.query;
    const isAllCompanies = !companyId || companyId === 'all' || companyId === 'ALL';

    let filter = { createdBy: req.user.id };
    if (!isAllCompanies) filter.companyId = companyId;
    if (req.query.status) filter.status = req.query.status;

    if (req.query.search) {
      const re = new RegExp(req.query.search.trim(), 'i');
      filter.$or = [{ quotationNumber: re }, { 'customerSnapshot.name': re }];
    }

    const sortField = SORT_FIELDS.has(req.query.sortBy) ? req.query.sortBy : 'createdAt';
    const sortDir = req.query.sortDir === 'asc' ? 1 : -1;

    // _id tiebreaker keeps ordering stable across pages when the sort
    // field has duplicate values (prevents rows duplicating/disappearing).
    const sortObject = { [sortField]: sortDir, _id: 1 };

    const [data, total] = await Promise.all([
      fullPopulate(Quotation.find(filter).sort(sortObject).skip(skip).limit(limit)).lean(),
      Quotation.countDocuments(filter),
    ]);

    const totalPages = Math.ceil(total / limit);

    res.status(200).json({
      success: true,
      data,
      pagination: {
        // Use the normalized `page` from parsePagination — NOT req.query.page,
        // which is NaN when page is omitted and breaks hasNextPage on page 1.
        page,
        limit,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
      isAllCompanies,
      companyId: isAllCompanies ? 'ALL' : companyId,
    });
  } catch (err) {
    logger.error(`Get my quotations error: ${err.message}`);
    res.status(500).json({ success: false, message: 'Error fetching your quotations', error: err.message });
  }
};
exports.getMyQuotationsStats = async (req, res) => {
  const startTime = Date.now();
  try {
    // Get companyId from query params
    let companyId = req.query.companyId || req.headers['x-company-id'];
    
    // Get user ID from request
    const userId = req.user.id;
    const userObjectId = mongoose.Types.ObjectId.isValid(userId) 
      ? new mongoose.Types.ObjectId(userId) 
      : userId;
    
    console.log('🔍 ===== DEBUG START =====');
    console.log('🔍 User ID from token:', userId);
    console.log('🔍 CompanyId from query:', companyId);
    
    // Build match stages
    let quotationMatchStage = { createdBy: userObjectId };
    let customerMatchStage = {};
    
    if (companyId && companyId !== 'all' && companyId !== 'ALL') {
      if (mongoose.Types.ObjectId.isValid(companyId)) {
        const companyObjectId = new mongoose.Types.ObjectId(companyId);
        quotationMatchStage.companyId = companyObjectId;
        customerMatchStage.companyId = companyObjectId;
      }
    }
    
    // All statuses
    const allStatuses = [
      'pending', 'pending_admin', 'ops_approved', 'ops_rejected',
      'approved', 'rejected', 'awarded', 'not_awarded'
    ];
    
    // Get status counts
    const allStatusCounts = await Quotation.aggregate([
      { $match: { ...quotationMatchStage, status: { $in: allStatuses } } },
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);
    
    // ✅ FIXED: Get total value using totalInBaseCurrency (not total)
    const totalValueResult = await Quotation.aggregate([
      { $match: quotationMatchStage },
      { $group: { _id: null, total: { $sum: '$totalInBaseCurrency' } } }  // ✅ Fixed
    ]);
    
    // ✅ FIXED: Get awarded value using totalInBaseCurrency (not total)
    const awardedValueResult = await Quotation.aggregate([
      { $match: { ...quotationMatchStage, status: 'awarded' } },
      { $group: { _id: null, total: { $sum: '$totalInBaseCurrency' } } }  // ✅ Fixed
    ]);
    
    // Get customers (all in company)
    const Customer = mongoose.model('Customer');
    const customersResult = await Customer.distinct('_id', customerMatchStage);
    
    // Build counts map
    const countsMap = {};
    allStatusCounts.forEach(item => {
      countsMap[item._id] = item.count;
    });
    
    const totalQuotations = allStatusCounts.reduce((sum, item) => sum + item.count, 0);
    const pendingCount = (countsMap['pending'] || 0) + (countsMap['pending_admin'] || 0);
    const opsApprovedCount = countsMap['ops_approved'] || 0;
    const opsRejectedCount = countsMap['ops_rejected'] || 0;
    const approvedCount = countsMap['approved'] || 0;
    const rejectedCount = countsMap['rejected'] || 0;
    const awardedCount = countsMap['awarded'] || 0;
    const notAwardedCount = countsMap['not_awarded'] || 0;
    
    const conversionRate = totalQuotations > 0 
      ? ((awardedCount / totalQuotations) * 100).toFixed(1)
      : 0;
    
    const totalValue = totalValueResult[0]?.total || 0;
    const awardedValue = awardedValueResult[0]?.total || 0;
    
    console.log('📊 FINAL STATS:');
    console.log('   - totalQuotations:', totalQuotations);
    console.log('   - pending:', pendingCount);
    console.log('   - inReview (ops_approved):', opsApprovedCount);
    console.log('   - approved:', approvedCount);
    console.log('   - awarded:', awardedCount);
    console.log('   - totalValue (AED):', totalValue);  // ✅ Now correct
    console.log('   - awardedValue (AED):', awardedValue);  // ✅ Now correct
    console.log('🔍 ===== DEBUG END =====');
    
    const stats = {
      totalQuotations: totalQuotations || 0,
      pending: pendingCount || 0,
      inReview: opsApprovedCount || 0,
      returned: opsRejectedCount || 0,
      approved: approvedCount || 0,
      rejected: rejectedCount || 0,
      awarded: awardedCount || 0,
      notAwarded: notAwardedCount || 0,
      totalValue: totalValue,  // ✅ Now correct AED value
      awardedValue: awardedValue,  // ✅ Now correct AED value
      conversionRate: parseFloat(conversionRate),
      actionRequired: opsApprovedCount || 0,
      totalCustomers: customersResult.length || 0,
      isAllCompanies: !companyId || companyId === 'all' || companyId === 'ALL',
      statusCounts: {
        all: totalQuotations || 0,
        pending: pendingCount || 0,
        ops_approved: opsApprovedCount || 0,
        ops_rejected: opsRejectedCount || 0,
        approved: approvedCount || 0,
        rejected: rejectedCount || 0,
        awarded: awardedCount || 0,
        not_awarded: notAwardedCount || 0,
      }
    };
    
    const duration = Date.now() - startTime;
    
    logger.info(`User quotations stats fetched`, {
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
    logger.error('Error fetching user quotations stats', {
      error: err.message,
      stack: err.stack,
      duration: `${duration}ms`,
      userId: req.user?.id
    });
    res.status(500).json({ 
      success: false,
      message: 'Error fetching quotations stats', 
      error: err.message 
    });
  }
};

exports.getQuotation = async (req, res) => {
  try {
    const companyId = req.companyId || req.headers['x-company-id'] || req.query.companyId;
    if (!companyId) return res.status(400).json({ message: 'Company ID is required' });
    
    const quotation = await fullPopulate(Quotation.findOne({ _id: req.params.id, companyId })).lean();
    if (!quotation) return res.status(404).json({ message: 'Quotation not found' });

    const isAdmin = req.user.role === 'admin';
    const isOps = req.user.role === 'ops_manager';
    const isCreator = quotation.createdBy._id.toString() === req.user.id;

    if (!isAdmin && !isOps && !isCreator)
      return res.status(403).json({ message: 'Not authorized to view this quotation' });

    res.status(200).json(quotation);
  } catch (err) {
    logger.error(`Get quotation error: ${err.message}`);
    res.status(500).json({ message: 'Error fetching quotation', error: err.message });
  }
};

exports.createQuotation = async (req, res) => {
  const {
    projectName, scopeOfWork, companyId, currencyCode, customerName, customerId, customer, contact, customerCountry,
    customerDesignation, customerTradeLicenseNumber, date, expiryDate, queryDate, tl, customerTaxRegistrationNumber,
    ourRef, ourContact, salesManagerEmail, paymentTerms, deliveryTerms, ourFocalPointDesignation,
    focalPointDesignation, items, taxPercent, discountPercent, notes, remark,
    quotationImages, termsAndConditions, termsImages, existingTermsImages, internalDocuments, internalDocDescriptions,  quotationNumber, 
  } = req.body;

  if (!projectName) return res.status(400).json({ message: 'Project Name is required' });
  if (!companyId) return res.status(400).json({ message: 'Company selection is required' });

  const company = await Company.findById(companyId);
  if (!company) return res.status(400).json({ message: 'Invalid company selected' });

  const customerDoc = await Customer.findOne({ _id: customerId, companyId: company._id }).lean();
  if (!customerDoc) return res.status(404).json({ message: 'Customer not found for this company' });
  
  if (!expiryDate) return res.status(400).json({ success: false, message: 'Expiry date is required' });
  
  const expiryDateObj = new Date(expiryDate);
  if (isNaN(expiryDateObj.getTime())) return res.status(400).json({ success: false, message: `Invalid expiry date format: "${expiryDate}"` });
  
  let dateObj = new Date();
  if (date) {
    dateObj = new Date(date);
    if (isNaN(dateObj.getTime())) dateObj = new Date();
  }

  const validatedItems = [];
  for (const item of items) {
    if (!item.description && !item.name) return res.status(400).json({ message: `Item ${validatedItems.length + 1} requires a name or description` });
    if (!item.quantity || item.quantity < 1) return res.status(400).json({ message: `Item ${validatedItems.length + 1} requires a valid quantity` });
    if (!item.unitPrice || item.unitPrice < 0) return res.status(400).json({ message: `Item ${validatedItems.length + 1} requires a valid unit price` });
    validatedItems.push(item);
  }
    
  let compressedQuotationImages = quotationImages;
  if (quotationImages && Object.keys(quotationImages).length > 0) {
    compressedQuotationImages = await imageCompressor.compressQuotationImages(quotationImages, { maxWidth: 800, quality: 70, maxSizeKB: 300 });
  }
  
  let compressedTermsImages = termsImages;
  if (termsImages && termsImages.length > 0) {
    compressedTermsImages = await imageCompressor.compressTermsImages(termsImages, { maxWidth: 600, quality: 65, maxSizeKB: 200 });
  }
  
  let compressedInternalDocuments = internalDocuments;
  if (internalDocuments && internalDocuments.length > 0) {
    compressedInternalDocuments = await imageCompressor.compressInternalDocuments(internalDocuments, { maxWidth: 1000, quality: 75, maxSizeKB: 400 });
  }
 
  const baseCurrency = company.baseCurrency || 'AED';
  const targetCurrency = currencyCode || baseCurrency;

  let exchangeRate = 1; // 1 targetCurrency = exchangeRate * AED
  if (targetCurrency !== baseCurrency) {
    try {
      const rates = await ExchangeRateService.getRates(targetCurrency);
      exchangeRate = rates[baseCurrency] || 1;
    } catch (rateError) {
      logger.error(`Error getting exchange rates: ${rateError.message}`);
    }
  }
  if (!exchangeRate || exchangeRate <= 0) exchangeRate = 1;

  const processedItems = [];
  for (let i = 0; i < validatedItems.length; i++) {
    const item = validatedItems[i];
    let imageKeys = [];
    
    if (compressedQuotationImages && compressedQuotationImages[i] && Array.isArray(compressedQuotationImages[i])) {
      for (let imgIdx = 0; imgIdx < compressedQuotationImages[i].length; imgIdx++) {
        const imageData = compressedQuotationImages[i][imgIdx];
        if (imageData && typeof imageData === 'string' && imageData.startsWith('data:image')) {
          try {
            const uploaded = await uploadBase64ToS3(imageData, `quotations/items/item_${i + 1}`);
            if (uploaded && uploaded.key) imageKeys.push(uploaded.key);
          } catch (err) { logger.error(`Upload failed: ${err.message}`); }
        }
      }
    }
    
    if (item.images && Array.isArray(item.images)) {
      for (const img of item.images) {
        if (img && typeof img === 'string' && img.startsWith('data:image')) {
          try {
            const uploaded = await uploadBase64ToS3(img, `quotations/items/item_${i + 1}`);
            if (uploaded && uploaded.key && !imageKeys.includes(uploaded.key)) imageKeys.push(uploaded.key);
          } catch (err) { logger.error(`Upload failed: ${err.message}`); }
        }
      }
    }
 
    if (item.imageS3Keys && Array.isArray(item.imageS3Keys)) {
      for (const key of item.imageS3Keys) {
        if (key && !imageKeys.includes(key)) imageKeys.push(key);
      }
    }
    
    imageKeys = [...new Set(imageKeys)];
    
    const unitPriceInBaseCurrency = item.unitPrice * exchangeRate;
    const totalPrice = item.quantity * item.unitPrice;
    const totalPriceInBaseCurrency = totalPrice * exchangeRate;
    
    processedItems.push({
      name: item.name || item.description?.substring(0, 50) || `Item ${i + 1}`,
      description: item.description || '',
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      unitPriceInBaseCurrency,
      totalPrice,
      totalPriceInBaseCurrency,
      imageS3Keys: imageKeys,
      storageProvider: 's3'
    });
  }
  
  const tax = parseFloat(taxPercent) || 0;
  const discount = parseFloat(discountPercent) || 0;
  const totals = calculateTotals(processedItems, tax, discount, exchangeRate);

  let processedTermsImages = [];
  if (compressedTermsImages && compressedTermsImages.length > 0) {
    for (let i = 0; i < compressedTermsImages.length; i++) {
      const imageData = compressedTermsImages[i];
      let imageBase64 = imageData;
      let fileName = `terms_image_${i + 1}`;
      
      if (typeof imageData === 'object') {
        imageBase64 = imageData.base64 || imageData.url;
        fileName = imageData.fileName || `terms_image_${i + 1}`;
      }
      
      if (imageBase64 && typeof imageBase64 === 'string' && imageBase64.startsWith('data:image')) {
        try {
          const uploaded = await uploadBase64ToS3(imageBase64, 'quotations/terms');
          if (uploaded && uploaded.key) {
            processedTermsImages.push({ 
              s3Key: uploaded.key, 
              fileName: fileName, 
              uploadedAt: new Date(),
              storageProvider: 's3'
            });
          }
        } catch (uploadError) { logger.error(`Failed to upload terms image: ${uploadError.message}`); }
      }
    }
  }

  // Merge in terms images that were ALREADY uploaded to S3 on the client.
  // These arrive as `existingTermsImages` (each with an s3Key) and must be
  // persisted alongside any newly-uploaded base64 images — otherwise an
  // already-uploaded terms image is silently dropped and never shows on view.
  if (Array.isArray(existingTermsImages) && existingTermsImages.length > 0) {
    for (const img of existingTermsImages) {
      if (img && img.s3Key) {
        processedTermsImages.push({
          s3Key: img.s3Key,
          fileName: img.fileName || 'terms_image',
          uploadedAt: img.uploadedAt ? new Date(img.uploadedAt) : new Date(),
          storageProvider: 's3'
        });
      }
    }
  }

  // const quotationNumber = generateQuotationNumber(company.code);

  let processedInternalDocs = [];
  if (compressedInternalDocuments && compressedInternalDocuments.length > 0) {
    processedInternalDocs = await uploadMultipleInternalDocumentsFromBase64(compressedInternalDocuments, quotationNumber, req.user.id, internalDocDescriptions || []);
  }

  const userRole = req.user?.role;
  const initialStatus = userRole === 'admin' ? 'pending_admin' : 'pending';

  const quotation = new Quotation({
    quotationNumber,
    projectName: projectName?.trim() || '',
    scopeOfWork: scopeOfWork?.trim() || '',
    companyId: company._id,
    companySnapshot: {
      code: company.code, name: company.name,
      address: typeof company.address === 'string' ? company.address : `${company.address?.street || ''}, ${company.address?.city || ''}, ${company.address?.country || 'UAE'}`,
      phone: company.phone, email: company.email, vatNumber: company.vatNumber, crNumber: company.crNumber,
      logo: company.logo, zohoOrganizationId: company.zohoOrganizationId,
      focalPointDesignation: focalPointDesignation || company.focalPointDesignation || '',
      bankDetails: company.bankDetails
    },
    currency: {
      code: targetCurrency, symbol: CURRENCY_OPTIONS[targetCurrency]?.symbol || targetCurrency,
      name: CURRENCY_OPTIONS[targetCurrency]?.name || targetCurrency,
      decimalPlaces: CURRENCY_OPTIONS[targetCurrency]?.decimalPlaces || 2,
      exchangeRate: { rate: exchangeRate, baseCurrency: company.baseCurrency, fetchedAt: new Date() }
    },
    customerId,
    customerSnapshot: {
      name: customerName?.trim() || customerDoc.name,  email: req.body.customerEmail?.trim() || customerDoc.email, phone: customerDoc.phone,
      address: customerDoc.address, country: customerCountry || 'UAE', vatNumber: customerDoc.vatNumber,
      designation: customerDesignation?.trim() || '', tradeLicenseNumber: customerTradeLicenseNumber?.trim() || '',
      taxTreatment: customerDoc.taxTreatment || 'non_vat_registered', placeOfSupply: customerDoc.placeOfSupply || 'Dubai'
    },
    customerTaxTreatment: customerDoc.taxTreatment || 'non_vat_registered',
    customerPlaceOfSupply: customerDoc.placeOfSupply || 'Dubai',
    contact: contact?.trim() || '',
    date: date ? new Date(date) : new Date(),
    expiryDate: new Date(expiryDate),
    queryDate: queryDate ? new Date(queryDate) : null,
    ourRef: ourRef?.trim() || '', ourContact: ourContact?.trim() || '',
    ourFocalPointDesignation: ourFocalPointDesignation?.trim() || '',
    salesManagerEmail: salesManagerEmail?.trim() || '',
    paymentTerms: paymentTerms?.trim() || '', deliveryTerms: deliveryTerms?.trim() || '',
    tl: tl?.trim() || '',trn: customerTaxRegistrationNumber?.trim() || trn?.trim() || '',
    items: processedItems,
    taxPercent: tax, discountPercent: discount,
    ...totals,
    notes: notes?.trim() || '', remark: remark?.trim() || '',
    termsAndConditions: termsAndConditions || '',
    termsImages: processedTermsImages,
    internalDocuments: processedInternalDocs,
    createdBy: req.user.id,
    createdBySnapshot: { name: req.user.name, email: req.user.email, role: req.user.role },
    status: initialStatus,
    storageProvider: 's3'
  });

  await quotation.save();
  const populated = await fullPopulate(Quotation.findById(quotation._id)).lean();
  
  res.status(201).json({
    success: true, message: 'Quotation created successfully', quotation: populated,
    stats: {
      itemsCount: processedItems.length,
      imagesUploaded: processedItems.reduce((sum, i) => sum + i.imageS3Keys.length, 0),
      termsImagesUploaded: processedTermsImages.length
    }
  });
};

exports.updateQuotation = async (req, res) => {
  const { id } = req.params;
  const companyId = req.companyId || req.headers['x-company-id'];
  const {
    projectName, scopeOfWork, currencyCode, customerName, customerId, customer, contact, customerCountry,
    customerDesignation, customerTradeLicenseNumber, date, expiryDate, queryDate,
    ourRef, ourContact, salesManagerEmail, paymentTerms, deliveryTerms, tl, customerTaxRegistrationNumber,
    ourFocalPointDesignation, focalPointDesignation, items, taxPercent, discountPercent, notes, remark,
    quotationImages, termsAndConditions, termsImages, internalDocuments, internalDocDescriptions,
    existingTermsImages  
  } = req.body;

  let compressedQuotationImages = quotationImages;
  if (quotationImages && Object.keys(quotationImages).length > 0) {
    compressedQuotationImages = await imageCompressor.compressQuotationImages(quotationImages, { maxWidth: 800, quality: 70, maxSizeKB: 300 });
  }

  let compressedTermsImages = termsImages;
  if (termsImages && termsImages.length > 0) {
    compressedTermsImages = await imageCompressor.compressTermsImages(termsImages, { maxWidth: 600, quality: 65, maxSizeKB: 200 });
  }
  
  let compressedInternalDocuments = internalDocuments;
  if (internalDocuments && internalDocuments.length > 0) {
    compressedInternalDocuments = await imageCompressor.compressInternalDocuments(internalDocuments, { maxWidth: 1000, quality: 75, maxSizeKB: 400 });
  }
  
  const compressedPayloadSize = JSON.stringify({ ...req.body, quotationImages: compressedQuotationImages, termsImages: compressedTermsImages, internalDocuments: compressedInternalDocuments }).length;
  
  if (!companyId) return res.status(400).json({ message: 'Company ID is required' });
  if (!items?.length) return res.status(400).json({ message: 'At least one item is required' });

  const dateErr = validateDates(date, expiryDate);
  if (dateErr) return res.status(400).json({ message: dateErr });

  try {
    const existing = await Quotation.findOne({ _id: id, companyId });
    if (!existing) return res.status(404).json({ message: 'Quotation not found' });

    const isAdmin = req.user?.role === 'admin';
    const isOpsManager = req.user?.role === 'ops_manager';
    
    let isCreator = false;
    if (existing.createdBy) {
      const creatorId = existing.createdBy._id || existing.createdBy;
      isCreator = creatorId.toString() === req.user?.id;
    }

    if (!isAdmin && !isOpsManager && !isCreator) return res.status(403).json({ message: 'Not authorized to update this quotation' });
    
    let newStatus = existing.status;
    const currentStatus = existing.status;
    
    if (isAdmin) {
      if (currentStatus === 'approved' || currentStatus === 'awarded' || currentStatus === 'not_awarded') {
        newStatus = currentStatus;
      } else if (['pending', 'ops_approved', 'ops_rejected', 'rejected', 'draft'].includes(currentStatus)) {
        newStatus = 'pending_admin';
      } else { newStatus = currentStatus; }
    } else if (isOpsManager) {
      if (currentStatus === 'pending' || currentStatus === 'ops_rejected') {
        newStatus = 'ops_approved';
      } else if (currentStatus === 'rejected' && isCreator) {
        newStatus = 'pending';
      } else if (currentStatus === 'ops_approved') {
        newStatus = 'ops_approved';
      } else { newStatus = currentStatus; }
    } else if (isCreator) {
      if (currentStatus === 'pending' || currentStatus === 'ops_rejected') {
        newStatus = 'pending';
      } else if (currentStatus === 'rejected') {
        newStatus = 'pending';
      } else { newStatus = currentStatus; }
    }

    const editableStatuses = ['pending', 'ops_rejected', 'rejected', 'pending_admin', 'draft'];
    if (!isAdmin && !editableStatuses.includes(currentStatus)) {
      return res.status(400).json({ message: `Cannot edit quotation with status: ${currentStatus}` });
    }

    const company = await Company.findById(companyId);
    if (!company) return res.status(404).json({ message: 'Company not found' });

    let exchangeRate = existing.currency?.exchangeRate?.rate || 1;
    if (currencyCode && currencyCode !== existing.currency?.code) {
      const rates = await ExchangeRateService.getRates(company.baseCurrency || 'AED');
      exchangeRate = rates[currencyCode] || 1;
    }

    let customerTaxTreatment = existing.customerTaxTreatment || 'non_vat_registered';
    let customerPlaceOfSupply = existing.customerPlaceOfSupply || 'Dubai';
    let customerSnapshotTaxTreatment = existing.customerSnapshot?.taxTreatment || 'non_vat_registered';
    let customerSnapshotPlaceOfSupply = existing.customerSnapshot?.placeOfSupply || 'Dubai';
    let customerSnapshotDesignation = existing.customerSnapshot?.designation || '';
    let customerSnapshotTradeLicense = existing.customerSnapshot?.tradeLicenseNumber || '';
    
    if (customerId && customerId !== existing.customerId?.toString()) {
      const customerDoc = await Customer.findById(customerId).lean();
      if (customerDoc) {
        customerTaxTreatment = customerDoc.taxTreatment || 'non_vat_registered';
        customerPlaceOfSupply = customerDoc.placeOfSupply || 'Dubai';
        customerSnapshotTaxTreatment = customerDoc.taxTreatment || 'non_vat_registered';
        customerSnapshotPlaceOfSupply = customerDoc.placeOfSupply || 'Dubai';
      }
    }
    
    if (customerDesignation !== undefined) customerSnapshotDesignation = customerDesignation?.trim() || '';
    if (customerTradeLicenseNumber !== undefined) customerSnapshotTradeLicense = customerTradeLicenseNumber?.trim() || '';

    const processedItems = [];
    for (let idx = 0; idx < items.length; idx++) {
      const item = items[idx];
      if (!item) continue;
      
      const quantity = Number(item.quantity) || 1;
      const unitPrice = Number(item.unitPrice) || 0;
      const totalPrice = quantity * unitPrice;
      const totalPriceInBaseCurrency = totalPrice * exchangeRate;
      const unitPriceInBaseCurrency = unitPrice * exchangeRate;
      
      let imageKeys = [];
      
      if (compressedQuotationImages && compressedQuotationImages[idx] && Array.isArray(compressedQuotationImages[idx])) {
        for (let imgIdx = 0; imgIdx < compressedQuotationImages[idx].length; imgIdx++) {
          const imageData = compressedQuotationImages[idx][imgIdx];
          if (imageData && typeof imageData === 'string' && imageData.startsWith('data:image')) {
            try {
              const uploaded = await uploadBase64ToS3(imageData, `quotations/items/item_${idx + 1}`);
              if (uploaded && uploaded.key) imageKeys.push(uploaded.key);
            } catch (err) { logger.error(`Upload failed: ${err.message}`); }
          }
        }
      }
      
      if (item.imageS3Keys && Array.isArray(item.imageS3Keys)) {
        for (const key of item.imageS3Keys) {
          if (key && !imageKeys.includes(key)) {
            imageKeys.push(key);
          }
        }
      }
      
      imageKeys = [...new Set(imageKeys)];
      
      processedItems.push({
        name: item.name || item.description?.substring(0, 50) || `Item ${idx + 1}`,
        description: item.description || '',
        quantity: quantity, unitPrice: unitPrice, unitPriceInBaseCurrency: unitPriceInBaseCurrency,
        totalPrice: totalPrice, totalPriceInBaseCurrency: totalPriceInBaseCurrency,
        imageS3Keys: imageKeys,
        storageProvider: 's3'
      });
    }

    // ==================== ✅ ITEM IMAGE S3 CLEANUP ====================
    // Diff the item-image keys saved on the quotation against the keys that
    // survived this update. Anything dropped was removed by the user and is now
    // orphaned in S3, so delete it. This mirrors the terms-image cleanup below.
    // Done at save time (not on click) so a cancelled/failed edit never destroys
    // a still-referenced image. Keys are unique per upload, so there's no risk of
    // deleting a key still used by another item.
    try {
      const oldItemKeys = new Set();
      (existing.items || []).forEach(it => {
        (it.imageS3Keys || []).forEach(k => { if (k) oldItemKeys.add(k); });
      });

      const keptItemKeys = new Set();
      processedItems.forEach(it => {
        (it.imageS3Keys || []).forEach(k => { if (k) keptItemKeys.add(k); });
      });

      const removedItemKeys = [...oldItemKeys].filter(k => !keptItemKeys.has(k));
      for (const key of removedItemKeys) {
        await deleteFromS3(key);
        console.log(`🗑️ Deleted removed item image: ${key}`);
      }
      if (removedItemKeys.length > 0) {
        logger.info(`Item image cleanup: removed ${removedItemKeys.length} orphaned S3 object(s)`);
      }
    } catch (cleanupErr) {
      // A cleanup failure must not block the save — just log it.
      logger.error(`Item image S3 cleanup error: ${cleanupErr.message}`);
    }
    // ==================== END ITEM IMAGE S3 CLEANUP ====================

    const tax = taxPercent !== undefined ? parseFloat(taxPercent) : (existing.taxPercent || 0);
    const discount = discountPercent !== undefined ? parseFloat(discountPercent) : (existing.discountPercent || 0);
    const totals = calculateTotals(processedItems, tax, discount, exchangeRate);

    const subtotalInBaseCurrency = processedItems.reduce((sum, item) => sum + (item.totalPriceInBaseCurrency || 0), 0);
    const taxAmountInBaseCurrency = (subtotalInBaseCurrency * tax) / 100;
    const discountAmountInBaseCurrency = (subtotalInBaseCurrency * discount) / 100;
    const totalInBaseCurrency = subtotalInBaseCurrency + taxAmountInBaseCurrency - discountAmountInBaseCurrency;

    // ==================== ✅ FIXED: TERMS IMAGES HANDLING ====================
    
    // Get existing terms images from database
    const dbTermsImages = existing.termsImages || [];
    
    // Get kept existing images from frontend (the ones that were NOT removed)
    const keptExistingImages = existingTermsImages || [];
    
    // 🔍 Find which images were removed (in DB but not in kept list)
    const removedImages = dbTermsImages.filter(dbImg => 
      !keptExistingImages.some(keptImg => 
        keptImg.s3Key === dbImg.s3Key || keptImg.id === dbImg._id?.toString()
      )
    );
    
    // 🗑️ Delete removed images from S3
    for (const removedImg of removedImages) {
      if (removedImg.s3Key) {
        await deleteFromS3(removedImg.s3Key);
        console.log(`🗑️ Deleted removed terms image: ${removedImg.s3Key}`);
      }
    }
    
    // 📤 Process new base64 images
    let newUploadedImages = [];
    if (compressedTermsImages && compressedTermsImages.length > 0) {
      for (let i = 0; i < compressedTermsImages.length; i++) {
        const imageData = compressedTermsImages[i];
        
        if (imageData && typeof imageData === 'object') {
          let base64ToUpload = null;
          let fileName = imageData.fileName || `terms_image_${i + 1}`;
          
          if (imageData.base64 && imageData.base64.startsWith('data:')) base64ToUpload = imageData.base64;
          else if (imageData.url && imageData.url.startsWith('data:')) base64ToUpload = imageData.url;
          else if (imageData.compressedBase64 && imageData.compressedBase64.startsWith('data:')) base64ToUpload = imageData.compressedBase64;
          
          if (base64ToUpload) {
            try {
              const uploaded = await uploadBase64ToS3(base64ToUpload, `quotations/terms/${existing.quotationNumber || Date.now()}`);
              if (uploaded && uploaded.key) {
                newUploadedImages.push({ 
                  s3Key: uploaded.key, 
                  fileName: fileName, 
                  uploadedAt: new Date(),
                  storageProvider: 's3'
                });
              }
            } catch (uploadError) { logger.error(`Failed to upload terms image: ${uploadError.message}`); }
          }
        } else if (typeof imageData === 'string' && imageData.startsWith('data:image')) {
          try {
            const uploaded = await uploadBase64ToS3(imageData, `quotations/terms/${existing.quotationNumber || Date.now()}`);
            if (uploaded && uploaded.key) {
              newUploadedImages.push({ 
                s3Key: uploaded.key, 
                fileName: `terms_image_${i + 1}`, 
                uploadedAt: new Date(),
                storageProvider: 's3'
              });
            }
          } catch (uploadError) { logger.error(`Failed to upload terms image: ${uploadError.message}`); }
        }
      }
    }
    
    // ✅ Combine kept existing images + new uploaded images
    const finalTermsImages = [
      ...keptExistingImages.map(img => ({
        s3Key: img.s3Key,
        fileName: img.fileName,
        uploadedAt: img.uploadedAt || new Date(),
        storageProvider: 's3'
      })),
      ...newUploadedImages
    ];
    
    console.log(`📸 Terms images summary: ${dbTermsImages.length} existing, ${removedImages.length} removed, ${keptExistingImages.length} kept, ${newUploadedImages.length} new, ${finalTermsImages.length} total`);

    // ==================== END OF TERMS IMAGES FIX ====================

    let newInternalDocs = [];
    if (compressedInternalDocuments && compressedInternalDocuments.length > 0) {
      const validBase64Strings = compressedInternalDocuments.filter(doc => typeof doc === 'string' && doc.startsWith('data:'));
      if (validBase64Strings.length > 0) {
        newInternalDocs = await uploadMultipleInternalDocumentsFromBase64(validBase64Strings, existing.quotationNumber, req.user.id, internalDocDescriptions || []);
      }
    }

    const existingCompanySnapshot = existing.companySnapshot || {};
    
    const updateData = {
      ...(customerId && { customerId }),
      ...(projectName !== undefined && { projectName: projectName?.trim() || '' }),
      ...(scopeOfWork !== undefined && { scopeOfWork: scopeOfWork?.trim() || '' }),
      ...(customer && { customer: customer.trim() }),
      ...(req.body.customerEmail !== undefined && { 
        'customerSnapshot.email': req.body.customerEmail?.trim() || '' 
      }),
      ...(customerDesignation !== undefined && { 'customerSnapshot.designation': customerDesignation?.trim() || '' }),
      ...(customerTradeLicenseNumber !== undefined && { 'customerSnapshot.tradeLicenseNumber': customerTradeLicenseNumber?.trim() || '' }),
      ...(ourFocalPointDesignation !== undefined && { ourFocalPointDesignation: ourFocalPointDesignation?.trim() || '' }),
      ...(focalPointDesignation !== undefined && { 'companySnapshot.focalPointDesignation': focalPointDesignation?.trim() || existingCompanySnapshot.focalPointDesignation || '' }),
      ...(contact !== undefined && { contact: contact?.trim() || '' }),
      ...(customerCountry && { 'customerSnapshot.country': customerCountry }),
      ...(customerId && { 'customerSnapshot.taxTreatment': customerSnapshotTaxTreatment, 'customerSnapshot.placeOfSupply': customerSnapshotPlaceOfSupply, customerTaxTreatment, customerPlaceOfSupply }),
      ...(date && { date: new Date(date) }), ...(expiryDate && { expiryDate: new Date(expiryDate) }),
      ...(queryDate !== undefined && { queryDate: queryDate ? new Date(queryDate) : null }),
      ...(ourRef !== undefined && { ourRef: ourRef?.trim() || '' }), ...(ourContact !== undefined && { ourContact: ourContact?.trim() || '' }),
      ...(salesManagerEmail !== undefined && { salesManagerEmail: salesManagerEmail?.trim() || '' }),
      ...(paymentTerms !== undefined && { paymentTerms: paymentTerms?.trim() || '' }), ...(deliveryTerms !== undefined && { deliveryTerms: deliveryTerms?.trim() || '' }),
      ...(tl !== undefined && { tl: tl?.trim() || '' }), ...(customerTaxRegistrationNumber !== undefined && { trn: customerTaxRegistrationNumber?.trim() || '' }),
      ...(remark !== undefined && { remark: remark?.trim() || '' }),
      items: processedItems, 
      taxPercent: tax, 
      discountPercent: discount,
      subtotal: totals.subtotal, 
      subtotalInBaseCurrency: subtotalInBaseCurrency,
      taxAmount: totals.taxAmount, 
      taxAmountInBaseCurrency: taxAmountInBaseCurrency,
      discountAmount: totals.discountAmount, 
      discountAmountInBaseCurrency: discountAmountInBaseCurrency,
      total: totals.total, 
      totalInBaseCurrency: totalInBaseCurrency,
      ...(notes !== undefined && { notes: notes?.trim() || '' }),
      ...(termsAndConditions !== undefined && { termsAndConditions: termsAndConditions || '' }),
      termsImages: finalTermsImages,
      internalDocuments: [...(existing.internalDocuments || []), ...newInternalDocs],
      status: newStatus,
      storageProvider: 's3'
    };
    
    // ✅ Handle approval data clearing based on new status
    if (newStatus === 'pending' || newStatus === 'ops_rejected') {
      // Reset all approvals when moving back to pending
      updateData.opsRejectionReason = '';
      updateData.rejectionReason = '';
      updateData.opsApprovedBy = null;
      updateData.opsApprovedAt = null;
      updateData.approvedBy = null;
      updateData.approvedAt = null;
    } else if (newStatus === 'pending_admin') {
      // Admin edit - only clear admin approval, preserve ops approval
      updateData.approvedBy = null;
      updateData.approvedAt = null;
      updateData.rejectionReason = '';
      // ✅ DO NOT clear opsApprovedBy and opsApprovedAt
    } else if (newStatus === 'rejected') {
      // Keep rejection reasons when rejected
      updateData.opsRejectionReason = existing.opsRejectionReason || '';
      updateData.rejectionReason = existing.rejectionReason || '';
    } else if (newStatus === 'ops_approved') {
      // Ops Manager approval
      updateData.opsApprovedBy = req.user.id;
      updateData.opsApprovedAt = new Date();
      updateData.opsApprovedBySnapshot = {
        name: req.user.name,
        email: req.user.email,
        role: req.user.role,
        approvedAt: new Date()
      };
    } else if (newStatus === 'approved' || newStatus === 'awarded') {
      // Admin approval
      updateData.approvedBy = req.user.id;
      updateData.approvedAt = new Date();
      updateData.approvedBySnapshot = {
        name: req.user.name,
        email: req.user.email,
        role: req.user.role,
        approvedAt: new Date()
      };
    }

    if (currencyCode && currencyCode !== existing.currency?.code) {
      updateData['currency.code'] = currencyCode;
      updateData['currency.symbol'] = CURRENCY_OPTIONS[currencyCode]?.symbol || currencyCode;
      updateData['currency.name'] = CURRENCY_OPTIONS[currencyCode]?.name || currencyCode;
      updateData['currency.exchangeRate.rate'] = exchangeRate;
      updateData['currency.exchangeRate.fetchedAt'] = new Date();
    }

    const updated = await Quotation.findByIdAndUpdate(id, updateData, { new: true, runValidators: true });
    if (!updated) return res.status(404).json({ message: 'Quotation not found after update' });

    const populated = await Quotation.findById(updated._id)
      .populate('customerId', 'name email phone address taxTreatment placeOfSupply designation tradeLicenseNumber')
      .populate('createdBy', 'name email').populate('opsApprovedBy', 'name email')
      .populate('approvedBy', 'name email').populate('awardedBy', 'name email')
      .populate('companyId', 'name code baseCurrency logo focalPointDesignation').lean();
    
    res.status(200).json({
      success: true, message: 'Quotation updated successfully', quotation: populated,
      stats: {
        itemsCount: processedItems.length,
        imagesCount: processedItems.reduce((sum, i) => sum + i.imageS3Keys.length, 0),
        termsImagesCount: finalTermsImages.length
      }
    });

  } catch (err) {
    logger.error(`Update quotation error: ${err.message}`);
    res.status(500).json({ success: false, message: 'Error updating quotation', error: err.message });
  }
};

 
const PRESIGN_ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

const PRESIGN_MAX_BYTES = 15 * 1024 * 1024; 
 
exports.presignItemImageUpload = async (req, res) => {
  try {
    const { contentType, fileName = '', itemIndex, size, type = 'item' } = req.body || {};
 
    if (!contentType || !PRESIGN_ALLOWED_MIME.has(contentType)) {
      return res.status(400).json({
        success: false,
        message: `Unsupported content type. Allowed: ${[...PRESIGN_ALLOWED_MIME].join(', ')}`,
      });
    }
 
    if (size != null && (typeof size !== 'number' || size > PRESIGN_MAX_BYTES)) {
      return res.status(400).json({
        success: false,
        message: `File too large. Max ${Math.round(PRESIGN_MAX_BYTES / 1024 / 1024)}MB`,
      });
    }
 
    const ext = (contentType.split('/')[1] || 'jpg').replace(/[^a-z0-9]/gi, '') || 'jpg';
    const unique = `${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
 
    // Build the key prefix based on type.
    let prefix;
    if (type === 'terms') {
      prefix = 'quotations/terms';
    } else {
      const safeIdx = Number.isInteger(itemIndex) && itemIndex >= 0 ? itemIndex + 1 : 'x';
      prefix = `quotations/items/item_${safeIdx}`;
    }
    const key = `${prefix}/${unique}.${ext}`;
 
    const command = new PutObjectCommand({
      Bucket: S3_BUCKET_NAME,
      Key: key,
      ContentType: contentType,
    });
 
    const expiresIn = 300;
    // Use the checksum-free presign client (requestChecksumCalculation: "WHEN_REQUIRED")
    const uploadUrl = await getSignedUrl(presignS3Client, command, { expiresIn });
 
    return res.status(200).json({ success: true, uploadUrl, key, expiresIn });
  } catch (err) {
    logger.error(`Presign image upload error: ${err.message}`);
    return res.status(500).json({ success: false, message: 'Failed to create upload URL', error: err.message });
  }
};
 

exports.updateQueryDate = async (req, res) => {
  try {
    const { queryDate } = req.body;
    const companyId = req.companyId || req.headers['x-company-id'];
    if (!companyId) return res.status(400).json({ success: false, message: 'Company ID is required' });

    const quotation = await Quotation.findOne({ _id: req.params.id, companyId });
    if (!quotation) return res.status(404).json({ success: false, message: 'Quotation not found' });

    const isCreator = quotation.createdBy._id.toString() === req.user.id;
    const isAdmin = req.user.role === 'admin';
    if (!isCreator && !isAdmin) return res.status(403).json({ success: false, message: 'Not authorized' });

    quotation.queryDate = queryDate ? new Date(queryDate) : null;
    await quotation.save();

    res.status(200).json({ success: true, message: 'Query date updated', queryDate: quotation.queryDate });
  } catch (err) {
    logger.error(`Update query date error: ${err.message}`);
    res.status(500).json({ success: false, message: 'Error updating query date', error: err.message });
  }
};

// ===========================================
// AWARD QUOTATION  
// ===========================================

exports.awardQuotation = async (req, res) => {
  try {
    const { awarded, awardNote } = req.body;
    const quotationId = req.params.id;
    const companyId = req.companyId || req.headers['x-company-id'];

    if (!companyId) return res.status(400).json({ success: false, message: 'Company ID is required' });
    if (typeof awarded !== 'boolean') return res.status(400).json({ success: false, message: '`awarded` (boolean) is required' });

    const quotation = await Quotation.findOne({ _id: quotationId, companyId })
      .populate('companyId').populate('createdBy', 'name email');

    if (!quotation) return res.status(404).json({ success: false, message: 'Quotation not found' });

    const existingOpsApprovedBySnapshot = quotation.opsApprovedBySnapshot;
    const existingApprovedBySnapshot = quotation.approvedBySnapshot;
    const existingCreatedBySnapshot = quotation.createdBySnapshot;

    const customer = await Customer.findOne({ _id: quotation.customerId, companyId }).lean();
    if (!customer) return res.status(404).json({ success: false, message: 'Customer not found' });

    if (quotation.createdBy._id.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Only the creator can mark this quotation as awarded' });
    }

    if (quotation.status !== 'approved') {
      return res.status(400).json({ success: false, message: `Only admin-approved quotations can be awarded. Current status: ${quotation.status}` });
    }

    if (quotation.companyId && quotation.companyId.zohoOrganizationId) {
      zohoBooksService.setCompany(quotation.companyId._id, quotation.companyId.zohoOrganizationId);
    }

    const customerTaxTreatment = customer?.taxTreatment || 'non_vat_registered';
    const customerPlaceOfSupply = customer?.placeOfSupply || 'Dubai';

    const UAE_EMIRATES = ['Abu Dhabi', 'Ajman', 'Dubai', 'Fujairah', 'Ras al-Khaimah', 'Sharjah', 'Umm al-Quwain'];
    const GCC_COUNTRIES = ['Saudi Arabia', 'Kuwait', 'Qatar', 'Bahrain', 'Oman'];

    const isPlaceOfSupplyUAE = UAE_EMIRATES.includes(customerPlaceOfSupply);
    const isPlaceOfSupplyGCC = GCC_COUNTRIES.includes(customerPlaceOfSupply);

    const companyZohoId = quotation.companyId?.zohoOrganizationId;
    let TAX_IDS = {};

    if (companyZohoId === '870392017') {
      TAX_IDS = { '0%': '5723933000000089262', '5%': '5723933000000089256' };
    } else if (companyZohoId === '886656701') {
      TAX_IDS = { '0%': '6201431000000108033', '5%': '6201431000000108025' };
    } else if (companyZohoId === '916255903') {
      TAX_IDS = { '0%': '8731317000000093294', '5%': '8731317000000093290' };
    } else {
      TAX_IDS = { '0%': '8731317000000093294', '5%': '8731317000000093290' };
    }

    let taxRate = 0, taxId = TAX_IDS['0%'], taxTreatment = 'vat_not_registered', placeOfSupplyCode = 'AE';

    if (customerTaxTreatment === 'vat_registered') {
      if (isPlaceOfSupplyUAE) {
        taxRate = quotation.taxPercent || 5;
        taxId = taxRate === 0 ? TAX_IDS['0%'] : TAX_IDS['5%'];
        taxTreatment = 'vat_registered';
        const emirateCodeMap = { 'Abu Dhabi': 'AB', 'Ajman': 'AJ', 'Dubai': 'DU', 'Fujairah': 'FU', 'Ras al-Khaimah': 'RA', 'Sharjah': 'SH', 'Umm al-Quwain': 'UM' };
        placeOfSupplyCode = emirateCodeMap[customerPlaceOfSupply] || 'DU';
      } else if (isPlaceOfSupplyGCC) {
        taxRate = 0; taxId = TAX_IDS['0%']; taxTreatment = 'vat_registered';
        const countryCodeMap = { 'Saudi Arabia': 'SA', 'Kuwait': 'KW', 'Qatar': 'QA', 'Bahrain': 'BH', 'Oman': 'OM' };
        placeOfSupplyCode = countryCodeMap[customerPlaceOfSupply] || 'AE';
      }
    } else if (customerTaxTreatment === 'gcc_vat_registered') {
      if (isPlaceOfSupplyUAE) {
        taxRate = 5; taxId = TAX_IDS['5%']; taxTreatment = 'gcc_vat_registered';
        const emirateCodeMap = { 'Abu Dhabi': 'AB', 'Ajman': 'AJ', 'Dubai': 'DU', 'Fujairah': 'FU', 'Ras al-Khaimah': 'RA', 'Sharjah': 'SH', 'Umm al-Quwain': 'UM' };
        placeOfSupplyCode = emirateCodeMap[customerPlaceOfSupply] || 'DU';
      } else if (isPlaceOfSupplyGCC) {
        taxRate = 0; taxId = TAX_IDS['0%']; taxTreatment = 'gcc_vat_registered';
        const countryCodeMap = { 'Saudi Arabia': 'SA', 'Kuwait': 'KW', 'Qatar': 'QA', 'Bahrain': 'BH', 'Oman': 'OM' };
        placeOfSupplyCode = countryCodeMap[customerPlaceOfSupply] || 'AE';
      }
    } else if (customerTaxTreatment === 'non_vat_registered' || customerTaxTreatment === 'gcc_non_vat_registered') {
      taxRate = 0; taxId = TAX_IDS['0%']; taxTreatment = 'vat_not_registered';
      if (isPlaceOfSupplyUAE) {
        const emirateCodeMap = { 'Abu Dhabi': 'AB', 'Ajman': 'AJ', 'Dubai': 'DU', 'Fujairah': 'FU', 'Ras al-Khaimah': 'RA', 'Sharjah': 'SH', 'Umm al-Quwain': 'UM' };
        placeOfSupplyCode = emirateCodeMap[customerPlaceOfSupply] || 'DU';
      } else {
        const countryCodeMap = { 'Saudi Arabia': 'SA', 'Kuwait': 'KW', 'Qatar': 'QA', 'Bahrain': 'BH', 'Oman': 'OM' };
        placeOfSupplyCode = countryCodeMap[customerPlaceOfSupply] || 'AE';
      }
    }

    // ── AWARDED PATH ─────────────────────────────────────────────────────
    // Zoho estimate MUST succeed before we touch the DB. If it fails for any
    // reason (network, timeout, missing zohoId, API error) we return an error
    // and leave the quotation in its current 'approved' state untouched.
    if (awarded) {
      const customerZohoId = customer?.zohoId;
      if (!customerZohoId) {
        return res.status(422).json({
          success: false,
          message: 'Customer is not synced with Zoho Books. Please sync the customer first before awarding.',
          code: 'CUSTOMER_NOT_SYNCED'
        });
      }

      const originalDiscountPercent = quotation.discountPercent || 0;
      let effectiveDiscountPercent = 0;
      let lineItemsWithDiscount = [];
      const subtotal = quotation.subtotal || 0;

      for (let i = 0; i < quotation.items.length; i++) {
        const item = quotation.items[i];
        const originalRate = item.unitPrice;
        let finalRate = originalRate;
        let itemDiscountPercent = 0;

        if (taxRate > 0 && originalDiscountPercent > 0) {
          finalRate = Math.round((originalRate * (1 - originalDiscountPercent / 100)) * 100) / 100;
          itemDiscountPercent = 0;
        } else if (!(taxRate > 0) && originalDiscountPercent > 0) {
          effectiveDiscountPercent = originalDiscountPercent;
        }

        const itemTotal = item.quantity * finalRate;
        const lineItem = {
          description: item.description || '',
          quantity: item.quantity,
          rate: finalRate,
          discount: itemDiscountPercent,
          discount_amount: 0,
          item_total: itemTotal,
          item_order: i + 1
        };

        if (taxRate > 0) {
          lineItem.tax_id = taxId;
          lineItem.tax_percentage = taxRate;
          lineItem.tax_name = 'VAT';
          lineItem.tax_type = 'tax';
        }

        lineItemsWithDiscount.push(lineItem);
      }

      const recalculatedSubtotal = lineItemsWithDiscount.reduce((sum, item) => sum + (item.rate * item.quantity), 0);
      const recalculatedTaxAmount = (recalculatedSubtotal * taxRate) / 100;
      const recalculatedDiscountAmount = (taxRate > 0) ? 0 : (subtotal * originalDiscountPercent / 100);
      const recalculatedGrandTotal = recalculatedSubtotal + recalculatedTaxAmount - recalculatedDiscountAmount;

      const estimateData = {
        customer_id: customerZohoId,
        reference_number: quotation.quotationNumber,
        date: new Date(quotation.date).toISOString().split('T')[0],
        expiry_date: new Date(quotation.expiryDate).toISOString().split('T')[0],
        exchange_rate: quotation.currency?.exchangeRate?.rate || 1,
        discount: effectiveDiscountPercent,
        is_discount_before_tax: false,
        discount_type: 'entity_level',
        is_inclusive_tax: false,
        custom_body: quotation.notes || '',
        custom_subject: `Quotation: ${quotation.quotationNumber} - ${quotation.projectName || ''}`,
        salesperson_name: quotation?.createdBy?.name || '',
        notes: awardNote || '',
        terms: cleanHtmlForZoho(quotation.termsAndConditions) || 'No terms and conditions provided.',
        line_items: lineItemsWithDiscount,
        tax_treatment: taxTreatment,
        place_of_supply: placeOfSupplyCode,
        is_taxable: taxRate > 0,
        total: recalculatedGrandTotal,
        total_before_tax: recalculatedSubtotal,
        tax_total: recalculatedTaxAmount,
        discount_total: recalculatedDiscountAmount
      };

      if (taxRate > 0) estimateData.tax_id = taxId;

      // ── Call Zoho FIRST — do not touch the DB until this succeeds ────────
      let zohoEstimate;
      try {
        zohoEstimate = await zohoBooksService.createEstimate(estimateData);
      } catch (zohoErr) {
        // Unexpected thrown error (should normally be caught inside the service,
        // but guard here in case something slips through)
        logger.error(`Zoho createEstimate threw unexpectedly: ${zohoErr.message}`, {
          quotationId, quotationNumber: quotation.quotationNumber
        });
        return res.status(502).json({
          success: false,
          message: 'Unable to reach Zoho Books. The quotation has NOT been awarded. Please try again.',
          error: zohoErr.message,
          code: 'ZOHO_UNREACHABLE'
        });
      }

      // Service returns { success: false } for any Zoho-side failure
      if (!zohoEstimate?.success) {
        const zohoError = zohoEstimate?.error || 'Unknown Zoho error';
        const zohoKind = zohoEstimate?.kind || 'unknown';

        logger.error(`Zoho estimate creation failed — quotation NOT awarded`, {
          quotationId,
          quotationNumber: quotation.quotationNumber,
          zohoError,
          zohoKind
        });

        // Surface a specific, actionable message per error kind
        const kindMessages = {
          timeout:      'Zoho Books did not respond in time.',
          network:      'Could not connect to Zoho Books.',
          rate_limit:   'Zoho Books rate limit reached. Please wait a moment and try again.',
          server_error: 'Zoho Books returned a server error.',
          auth:         'Zoho Books authentication failed. Please contact your administrator.',
          circuit_open: 'Zoho Books is currently unavailable (too many recent failures). Please try again in a minute.'
        };
        const userMessage = kindMessages[zohoKind] || `Zoho Books rejected the request: ${zohoError}`;

        return res.status(502).json({
          success: false,
          message: `Failed to create estimate in Zoho Books. The quotation has NOT been awarded. ${userMessage}`,
          error: zohoError,
          code: 'ZOHO_ESTIMATE_FAILED',
          kind: zohoKind
        });
      }

      // ── Zoho succeeded — now safe to update the DB ────────────────────────
      quotation.status = 'awarded';
      quotation.awardedBy = req.user.id;
      quotation.awardedAt = new Date();
      quotation.awardNote = awardNote?.trim() || '';

      quotation.zohoEstimateId = zohoEstimate.estimateId;
      quotation.zohoEstimateNumber = zohoEstimate.estimateNumber;
      quotation.zohoEstimateUrl = zohoEstimate.estimateUrl;
      quotation.zohoReferenceNumber = quotation.quotationNumber;
      quotation.zohoSyncedAt = new Date();

      quotation.opsApprovedBySnapshot = existingOpsApprovedBySnapshot;
      quotation.approvedBySnapshot = existingApprovedBySnapshot;
      quotation.createdBySnapshot = existingCreatedBySnapshot;
      quotation.awardedBySnapshot = {
        name: req.user.name,
        email: req.user.email,
        role: req.user.role,
        awardedAt: new Date(),
        awarded: true,
        awardNote: awardNote?.trim() || ''
      };

      await quotation.save();

      const updated = await Quotation.findOne({ _id: quotationId, companyId })
        .populate('customerId').populate('companyId').lean();

      return res.status(200).json({
        success: true,
        message: 'Quotation awarded and synced to Zoho Books successfully',
        quotation: updated,
        zohoEstimate
      });
    }

    // ── NOT-AWARDED PATH ─────────────────────────────────────────────────
    // No Zoho call needed — save immediately.
    quotation.status = 'not_awarded';
    quotation.awardedBy = req.user.id;
    quotation.awardedAt = new Date();
    quotation.awardNote = awardNote?.trim() || '';

    quotation.opsApprovedBySnapshot = existingOpsApprovedBySnapshot;
    quotation.approvedBySnapshot = existingApprovedBySnapshot;
    quotation.createdBySnapshot = existingCreatedBySnapshot;
    quotation.awardedBySnapshot = {
      name: req.user.name,
      email: req.user.email,
      role: req.user.role,
      awardedAt: new Date(),
      awarded: false,
      awardNote: awardNote?.trim() || ''
    };

    await quotation.save();

    const updated = await Quotation.findOne({ _id: quotationId, companyId })
      .populate('customerId').populate('companyId').lean();

    return res.status(200).json({
      success: true,
      message: 'Quotation marked as not awarded',
      quotation: updated,
      zohoEstimate: null
    });

  } catch (err) {
    logger.error(`Award quotation error: ${err.message}`, { quotationId: req.params.id, error: err.message, stack: err.stack });
    res.status(500).json({ success: false, message: 'Error awarding quotation', error: err.message });
  }
};

exports.deleteQuotation = async (req, res) => {
  try {
    const quotation = await Quotation.findById(req.params.id);
    if (!quotation) return res.status(404).json({ message: 'Quotation not found' });

    const isAdmin = req.user.role === 'admin';
    const isCreator = quotation.createdBy._id.toString() === req.user.id;

    if (!isAdmin && !isCreator) return res.status(403).json({ message: 'Not authorized to delete this quotation' });
    if (!isAdmin && !['pending', 'ops_rejected'].includes(quotation.status))
      return res.status(400).json({ message: `Cannot delete a quotation with status: ${quotation.status}` });

    const jobs = [];
    
    quotation.items?.forEach((item) => {
      if (item.imageS3Keys && Array.isArray(item.imageS3Keys)) {
        item.imageS3Keys.forEach((key) => {
          if (key) jobs.push(deleteFromS3(key));
        });
      }
    });
    
    quotation.termsImages?.forEach((img) => {
      if (img.s3Key) jobs.push(deleteFromS3(img.s3Key));
    });
    
    quotation.internalDocuments?.forEach((doc) => {
      if (doc.s3Key) jobs.push(deleteFromS3(doc.s3Key));
    });
    
    await Promise.allSettled(jobs);
    await Quotation.findByIdAndDelete(req.params.id);
    
    res.status(200).json({ success: true, message: 'Quotation deleted successfully' });
  } catch (err) {
    logger.error(`Delete quotation error: ${err.message}`);
    res.status(500).json({ success: false, message: 'Error deleting quotation', error: err.message });
  }
};

exports.generatePDF = async (req, res) => {
  const { html, filename = 'quotation' } = req.body;
  const startTime = Date.now();

  if (!html?.trim()) return res.status(400).json({ message: 'HTML content is required' });

  const safeFilename = filename.replace(/[/\\'"]/g, '_').slice(0, 100);
  let page = null;
  
  try {
    const browser = await getBrowser();
    page = await browser.newPage();

    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const type = req.resourceType();
      if (['stylesheet', 'font', 'media'].includes(type)) req.abort();
      else req.continue();
    });

    await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 40000 });
    await page.evaluate(() => Promise.all([...document.images].filter((img) => !img.complete).map((img) => new Promise((res) => { img.onload = res; img.onerror = res; })))).catch(() => {});

    const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true, margin: { top: '10mm', right: '10mm', bottom: '10mm', left: '10mm' } });

    await page.close();
    page = null;

    if (Buffer.from(pdfBuffer).slice(0, 5).toString() !== '%PDF-') throw new Error('Puppeteer returned an invalid PDF buffer');

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}.pdf"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.setHeader('Cache-Control', 'no-store');
    res.send(Buffer.isBuffer(pdfBuffer) ? pdfBuffer : Buffer.from(pdfBuffer));
    
  } catch (err) {
    if (page) await page.close().catch(() => {});
    logger.error(`PDF generation error: ${err.message}`);
    res.status(500).json({ success: false, message: 'Error generating PDF', error: err.message });
  }
};

exports.getDashboardStats = async (req, res) => {
  try {
    const { companyId } = req.query;
    const matchStage = companyId ? { companyId } : {};

    const [
      total,
      byStatus,
      byCurrency,
      byCompany,
      totalApprovedValueAgg,
      totalQuotationValueAgg,
      monthlyStats,
    ] = await Promise.all([
      // Total quotations count
      Quotation.countDocuments(matchStage),

      // Count by status
      Quotation.aggregate([
        { $match: matchStage },
        {
          $group: {
            _id: "$status",
            count: { $sum: 1 },
          },
        },
      ]),

      // Currency-wise stats
      Quotation.aggregate([
        { $match: matchStage },
        {
          $group: {
            _id: "$currency.code",
            count: { $sum: 1 },
            totalValue: { $sum: "$totalInBaseCurrency" },
          },
        },
      ]),

      // Company-wise stats
      Quotation.aggregate([
        { $match: matchStage },
        {
          $group: {
            _id: "$companyId",
            count: { $sum: 1 },
            totalValue: { $sum: "$totalInBaseCurrency" },
          },
        },
        {
          $lookup: {
            from: "companies",
            localField: "_id",
            foreignField: "_id",
            as: "company",
          },
        },
        {
          $project: {
            company: { $arrayElemAt: ["$company", 0] },
            count: 1,
            totalValue: 1,
          },
        },
      ]),

      // Approved + Awarded quotation value
      Quotation.aggregate([
        {
          $match: {
            ...matchStage,
            status: { $in: ["approved", "awarded"] },
          },
        },
        {
          $group: {
            _id: null,
            total: { $sum: "$totalInBaseCurrency" },
          },
        },
      ]),

      // Total quotation value (all statuses)
      Quotation.aggregate([
        { $match: matchStage },
        {
          $group: {
            _id: null,
            total: { $sum: "$totalInBaseCurrency" },
          },
        },
      ]),

      // Monthly stats
      Quotation.aggregate([
        { $match: matchStage },
        {
          $group: {
            _id: {
              year: { $year: "$createdAt" },
              month: { $month: "$createdAt" },
            },
            count: { $sum: 1 },
            total: { $sum: "$totalInBaseCurrency" },
          },
        },
        { $sort: { "_id.year": -1, "_id.month": -1 } },
        { $limit: 12 },
      ]),
    ]);

    const counts = {
      total,
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

    byStatus.forEach((item) => {
      counts[item._id] = item.count;
    });

    return res.json({
      success: true,
      counts,
      byCurrency,
      byCompany,
      totalApprovedValue: totalApprovedValueAgg[0]?.total || 0,
      totalQuotationValue: totalQuotationValueAgg[0]?.total || 0, // <-- Sum of all totalInBaseCurrency
      monthlyStats,
    });
  } catch (err) {
    logger.error(`Get dashboard stats error: ${err.message}`);
    return res.status(500).json({
      success: false,
      message: "Error fetching dashboard stats",
      error: err.message,
    });
  }
};

exports.exportQuotationsToExcel = async (req, res) => {
  try {
    const { status, fromDate, toDate, companyId, search, startDate, endDate, currency = 'AED' } = req.query;

    const query = {};

    // Track if all companies are selected
    const isAllCompanies = !companyId || companyId === 'all' || companyId === 'ALL';

    if (companyId && companyId !== 'all' && companyId !== 'ALL') {
      if (!mongoose.Types.ObjectId.isValid(companyId)) {
        return res.status(400).json({ success: false, message: 'Invalid company ID format' });
      }
      query.companyId = companyId;
    }

    if (status) {
      if (status.includes(",")) {
        query.status = { $in: status.split(",") };
      } else if (status !== "all") {
        query.status = status;
      }
    }

    const from = fromDate || startDate;
    const to = toDate || endDate;

    if (from || to) {
      query.createdAt = {};
      if (from) query.createdAt.$gte = new Date(from);
      if (to) query.createdAt.$lte = new Date(to);
    }

    if (search?.trim()) {
      const regex = new RegExp(search.trim(), "i");
      query.$or = [
        { quotationNumber: regex },
        { "customerSnapshot.name": regex },
        { projectName: regex },
        { "customerId.name": regex },
      ];
    }

    const quotations = await Quotation.find(query)
      .sort({ createdAt: -1 })
      .populate("createdBy", "name email")
      .populate("customerId", "name email phone")
      .populate("companyId", "name code baseCurrency")
      .lean();

    if (!quotations.length) {
      logger.warn(`No quotations found for export`);
      return res.status(404).json({ success: false, message: "No quotations found" });
    }

    // ──────────────────────────────────────────────────────────────
    // Currency conversion for the REPORT-LEVEL display currency.
    //
    // Every stored *InBaseCurrency field is already in AED. When the user
    // asks for a different display currency we convert FROM AED INTO it.
    //
    // We fetch rates with the display currency as base: getRates(currency)
    // returns "1 <currency> = X <other>", so rates.AED is the
    // <currency> -> AED multiplier. To go the other way (AED -> currency)
    // we DIVIDE by rates.AED.
    //
    // NOTE: this conversion is ONLY for the aggregated/AED-derived columns
    // shown in the chosen display currency. Each quotation's own stored
    // amounts (q.total, q.subtotal, q.taxAmount, q.discountAmount and their
    // *InBaseCurrency counterparts) are written straight from the DB with NO
    // recalculation.
    // ──────────────────────────────────────────────────────────────
    let exchangeRates = null;
    if (currency !== 'AED') {
      try {
        exchangeRates = await ExchangeRateService.getRates(currency);
      } catch (rateError) {
        logger.error(`Error fetching exchange rates: ${rateError.message}`);
      }
    }

    // Convert an AED amount into the selected display currency.
    const convertFromAED = (amountInAED) => {
      if (currency === 'AED' || !exchangeRates) return amountInAED;
      const rate = exchangeRates['AED'] || 1; // 1 <currency> = rate AED
      if (!rate || rate <= 0) return amountInAED;
      return amountInAED / rate;
    };

    // Awarded revenue (sum of stored AED totals), shown in display currency.
    const awardedRevenueInAED = quotations.reduce((sum, q) => {
      return q.status === "awarded" ? sum + (q.totalInBaseCurrency || 0) : sum;
    }, 0);
    const awardedRevenue = convertFromAED(awardedRevenueInAED);

    const approvedCount = quotations.filter((q) => ["approved", "ops_approved"].includes(q.status)).length;
    const awardedCount  = quotations.filter((q) => q.status === "awarded").length;
    const pendingCount  = quotations.filter((q) => ["pending", "pending_admin"].includes(q.status)).length;
    const rejectedCount = quotations.filter((q) => ["rejected", "not_awarded"].includes(q.status)).length;

    // Group quotations by company for subtotals
    const quotationsByCompany = {};
    quotations.forEach((q) => {
      const companyName = q.companySnapshot?.name || q.companyId?.name || "Unknown";
      if (!quotationsByCompany[companyName]) quotationsByCompany[companyName] = [];
      quotationsByCompany[companyName].push(q);
    });

    // Company-wise statistics (only if all companies are selected)
    let companyStats = null;
    if (isAllCompanies) {
      companyStats = {};
      quotations.forEach((q) => {
        const companyName = q.companySnapshot?.name || q.companyId?.name || "Unknown";
        if (!companyStats[companyName]) {
          companyStats[companyName] = {
            totalQuotations: 0,
            totalValueAED: 0,
            totalValueConverted: 0,
            awardedValueAED: 0,
            awardedValueConverted: 0,
            approvedCount: 0,
            awardedCount: 0,
            pendingCount: 0,
            rejectedCount: 0
          };
        }

        const valueInAED = q.totalInBaseCurrency || 0;
        const valueConverted = convertFromAED(valueInAED);

        companyStats[companyName].totalQuotations++;
        companyStats[companyName].totalValueAED += valueInAED;
        companyStats[companyName].totalValueConverted += valueConverted;

        if (q.status === "awarded") {
          companyStats[companyName].awardedValueAED += valueInAED;
          companyStats[companyName].awardedValueConverted += valueConverted;
          companyStats[companyName].awardedCount++;
        } else if (["approved", "ops_approved"].includes(q.status)) {
          companyStats[companyName].approvedCount++;
        } else if (["pending", "pending_admin"].includes(q.status)) {
          companyStats[companyName].pendingCount++;
        } else if (["rejected", "not_awarded"].includes(q.status)) {
          companyStats[companyName].rejectedCount++;
        }
      });
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Quotation Management System";
    workbook.created = new Date();

    const worksheet = workbook.addWorksheet("Quotations", {
      pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    });

    const hasConversion = currency !== 'AED';

    // ── Column definitions ──────────────────────────────────────────
    // Money columns sourced directly from the DB per row:
    //   subtotalOriginal      <- q.subtotal              (quote currency)
    //   taxAmount             <- q.taxAmount             (quote currency)
    //   discountAmount        <- q.discountAmount        (quote currency)
    //   totalOriginal         <- q.total                 (quote currency)
    //   subtotalInAED         <- q.subtotalInBaseCurrency (AED)
    //   totalInAED            <- q.totalInBaseCurrency    (AED)
    // Plus a SEPARATE, clearly-labelled cumulative column:
    //   runningTotal          <- running sum of totalInAED within company
    const columns = [
      { key: "slNo", width: 8 },
      { key: "quotationNumber", width: 25 },
      { key: "company", width: 30 },
      { key: "customerName", width: 30 },
      { key: "customerEmail", width: 30 },
      { key: "customerPhone", width: 20 },
      { key: "contact", width: 25 },
      { key: "projectName", width: 40 },
      { key: "date", width: 14 },
      { key: "expiryDate", width: 14 },
      { key: "queryDate", width: 14 },
      { key: "currency", width: 12 },
      { key: "subtotalOriginal", width: 18 },
      { key: "taxPercent", width: 10 },
      { key: "taxAmount", width: 16 },
      { key: "discountPercent", width: 12 },
      { key: "discountAmount", width: 16 },
      { key: "totalOriginal", width: 18 },
      { key: "subtotalInAED", width: 18 },
      { key: "totalInAED", width: 18 },
    ];

    if (hasConversion) {
      columns.push({ key: "totalConverted", width: 20 });
    }

    // Separate, clearly-labelled cumulative column (not the per-row subtotal).
    columns.push({ key: "runningTotalAED", width: 22 });
    if (hasConversion) {
      columns.push({ key: "runningTotalConverted", width: 24 });
    }

    columns.push(
      { key: "status", width: 18 },
      { key: "createdBy", width: 25 },
      { key: "createdAt", width: 22 },
      { key: "itemsCount", width: 12 },
      { key: "paymentTerms", width: 30 },
      { key: "deliveryTerms", width: 30 },
      { key: "tl", width: 15 },
      { key: "trn", width: 20 }
    );

    worksheet.columns = columns;

    const lastColLetter = worksheet.getColumn(columns.length).letter;

    // ── Title row ───────────────────────────────────────────────────
    worksheet.mergeCells(`A1:${lastColLetter}1`);
    const titleCell = worksheet.getCell("A1");
    titleCell.value = "QUOTATIONS REPORT";
    titleCell.font = { name: "Arial", size: 20, bold: true, color: { argb: "FFFFFFFF" } };
    titleCell.alignment = { horizontal: "center", vertical: "middle" };
    titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF111827" } };
    worksheet.getRow(1).height = 30;

    // ── Summary row ─────────────────────────────────────────────────
    worksheet.mergeCells("A2:D2");
    worksheet.getCell("A2").value = `Generated: ${new Date().toLocaleString()}`;
    worksheet.mergeCells("E2:H2");
    worksheet.getCell("E2").value = `Total Quotations: ${quotations.length}`;
    worksheet.mergeCells("I2:L2");
    worksheet.getCell("I2").value = `Approved: ${approvedCount}`;
    worksheet.mergeCells("M2:P2");
    worksheet.getCell("M2").value = `Awarded: ${awardedCount}`;
    worksheet.mergeCells("Q2:T2");
    worksheet.getCell("Q2").value = `Pending: ${pendingCount}`;
    worksheet.mergeCells("U2:X2");
    worksheet.getCell("U2").value = `Revenue (Awarded): ${awardedRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;

    ["A2", "E2", "I2", "M2", "Q2", "U2"].forEach((cell) => {
      worksheet.getCell(cell).font = { name: "Arial", bold: true, size: 10 };
      worksheet.getCell(cell).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3F4F6" } };
      worksheet.getCell(cell).border = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
    });

    worksheet.addRow([]);

    // ── Header row ──────────────────────────────────────────────────
    const headerCells = [
      "SL No", "Quotation Number", "Company", "Customer Name", "Customer Email", "Customer Phone",
      "Contact Person", "Project Name", "Date", "Expiry Date", "Query Date",
      "Currency",
      "Subtotal (Quote Ccy)", "Tax %", "Tax Amount (Quote Ccy)",
      "Discount %", "Discount Amount (Quote Ccy)", "Total (Quote Ccy)",
      "Subtotal in AED", "Total in AED",
    ];

    if (hasConversion) headerCells.push(`Total in ${currency}`);

    headerCells.push("Running Total in AED");
    if (hasConversion) headerCells.push(`Running Total in ${currency}`);

    headerCells.push(
      "Status", "Created By", "Created At", "Items Count",
      "Payment Terms", "Delivery Terms", "TL", "TRN"
    );

    const headerRow = worksheet.addRow(headerCells);
    headerRow.height = 32;
    headerRow.eachCell((cell) => {
      cell.font = { name: "Arial", bold: true, size: 11, color: { argb: "FFFFFFFF" } };
      cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2563EB" } };
      cell.border = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
    });

    const headerRowNumber = headerRow.number;

    let globalIndex = 1;
    const sortedCompanies = Object.keys(quotationsByCompany).sort();

    sortedCompanies.forEach((companyName) => {
      const companyQuotations = quotationsByCompany[companyName];

      // Running cumulative totals (the clearly-labelled separate column),
      // reset per company.
      let runningTotalAED = 0;
      let runningTotalConverted = 0;

      if (sortedCompanies.length > 1) {
        const companyHeaderRow = worksheet.addRow({ company: `=== ${companyName.toUpperCase()} ===` });
        companyHeaderRow.height = 22;
        companyHeaderRow.font = { name: "Arial", bold: true, size: 12, color: { argb: "FF1E40AF" } };
        companyHeaderRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFF6FF" } };
        companyHeaderRow.eachCell((cell) => {
          cell.border = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
        });
      }

      companyQuotations.forEach((q) => {
        // All amounts pulled straight from the stored DB fields. No recompute.
        const subtotalOriginal = Number(q.subtotal) || 0;
        const taxAmount        = Number(q.taxAmount) || 0;
        const discountAmount   = Number(q.discountAmount) || 0;
        const totalOriginal    = Number(q.total) || 0;
        const subtotalInAED    = Number(q.subtotalInBaseCurrency) || 0;
        const totalInAED       = Number(q.totalInBaseCurrency) || 0;

        // Cumulative running total uses the stored AED total per quotation.
        runningTotalAED += totalInAED;
        runningTotalConverted += convertFromAED(totalInAED);

        const rowData = {
          slNo: globalIndex++,
          quotationNumber: q.quotationNumber || "",
          company: q.companySnapshot?.name || q.companyId?.name || "",
          customerName: q.customerSnapshot?.name || q.customerId?.name || "",
          customerEmail: q.customerSnapshot?.email || q.customerId?.email || "",
          customerPhone: q.customerSnapshot?.phone || q.customerId?.phone || "",
          contact: q.contact || "",
          projectName: q.projectName || "",
          date: q.date ? new Date(q.date).toLocaleDateString() : "",
          expiryDate: q.expiryDate ? new Date(q.expiryDate).toLocaleDateString() : "",
          queryDate: q.queryDate ? new Date(q.queryDate).toLocaleDateString() : "",
          currency: q.currency?.code || "AED",
          subtotalOriginal,
          taxPercent: Number(q.taxPercent) || 0,
          taxAmount,
          discountPercent: Number(q.discountPercent) || 0,
          discountAmount,
          totalOriginal,
          subtotalInAED,
          totalInAED,
          runningTotalAED,
          status: q.status || "",
          createdBy: q.createdBy?.name || q.createdBySnapshot?.name || "",
          createdAt: q.createdAt ? new Date(q.createdAt).toLocaleString() : "",
          itemsCount: q.items?.length || 0,
          paymentTerms: q.paymentTerms || "",
          deliveryTerms: q.deliveryTerms || "",
          tl: q.tl || "",
          trn: q.trn || "",
        };

        if (hasConversion) {
          rowData.totalConverted = convertFromAED(totalInAED);
          rowData.runningTotalConverted = runningTotalConverted;
        }

        const row = worksheet.addRow(rowData);
        row.height = 22;
        row.eachCell((cell) => {
          cell.border = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
          cell.alignment = { vertical: "middle", horizontal: "left" };
          cell.font = { name: "Arial", size: 10 };
        });

        if (globalIndex % 2 === 0) {
          row.eachCell((cell) => { cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF9FAFB" } }; });
        }

        // Number formats. Quote-currency columns use the row's own currency
        // code as a prefix so a mixed-currency report stays unambiguous.
        const quoteCcy = q.currency?.code || "AED";
        const quoteFmt = `"${quoteCcy}" #,##0.00`;
        row.getCell("subtotalOriginal").numFmt = quoteFmt;
        row.getCell("taxAmount").numFmt = quoteFmt;
        row.getCell("discountAmount").numFmt = quoteFmt;
        row.getCell("totalOriginal").numFmt = quoteFmt;
        row.getCell("taxPercent").numFmt = '0.00"%"';
        row.getCell("discountPercent").numFmt = '0.00"%"';
        row.getCell("subtotalInAED").numFmt = '"AED" #,##0.00';
        row.getCell("totalInAED").numFmt = '"AED" #,##0.00';
        row.getCell("runningTotalAED").numFmt = '"AED" #,##0.00';
        if (hasConversion) {
          row.getCell("totalConverted").numFmt = `"${currency}" #,##0.00`;
          row.getCell("runningTotalConverted").numFmt = `"${currency}" #,##0.00`;
        }

        const statusCell = row.getCell("status");
        if (q.status === "approved" || q.status === "ops_approved") {
          statusCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD1FAE5" } };
          statusCell.font = { name: "Arial", size: 10, bold: true, color: { argb: "FF065F46" } };
        } else if (q.status === "pending" || q.status === "pending_admin") {
          statusCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEF3C7" } };
          statusCell.font = { name: "Arial", size: 10, bold: true, color: { argb: "FF92400E" } };
        } else if (q.status === "rejected" || q.status === "not_awarded") {
          statusCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEE2E2" } };
          statusCell.font = { name: "Arial", size: 10, bold: true, color: { argb: "FF991B1B" } };
        } else if (q.status === "awarded") {
          statusCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDBEAFE" } };
          statusCell.font = { name: "Arial", size: 10, bold: true, color: { argb: "FF1E40AF" } };
        }
      });
    });

    // Auto-filter + freeze the header row (dynamic last column).
    worksheet.autoFilter = {
      from: { row: headerRowNumber, column: 1 },
      to: { row: headerRowNumber, column: columns.length },
    };
    worksheet.views = [{ state: "frozen", ySplit: headerRowNumber }];

    // ── Analytics sheet ─────────────────────────────────────────────
    const analyticsSheet = workbook.addWorksheet("Analytics");
    analyticsSheet.columns = [{ header: "Metric", key: "metric", width: 35 }, { header: "Value", key: "value", width: 25 }];
    analyticsSheet.getRow(1).font = { name: "Arial", bold: true, color: { argb: "FFFFFFFF" } };
    analyticsSheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF111827" } };
    analyticsSheet.addRows([
      { metric: "Total Quotations", value: quotations.length },
      { metric: "Approved Quotations", value: approvedCount },
      { metric: "Awarded Quotations", value: awardedCount },
      { metric: "Pending Quotations", value: pendingCount },
      { metric: "Rejected Quotations", value: rejectedCount },
      { metric: `Total Awarded Revenue (${currency})`, value: awardedRevenue },
    ]);
    analyticsSheet.getColumn("value").numFmt = hasConversion ? `#,##0.00 "${currency}"` : '#,##0.00 "AED"';
    analyticsSheet.getRow(7).font = { name: "Arial", bold: true };

    // ── Company-wise stats sheet ────────────────────────────────────
    if (isAllCompanies && companyStats && Object.keys(companyStats).length > 0) {
      const companySheet = workbook.addWorksheet("Company-wise Stats");
      companySheet.columns = [
        { header: "Company Name", key: "companyName", width: 35 },
        { header: "Total Quotations", key: "totalQuotations", width: 18 },
        { header: `Total Value (${currency})`, key: "totalValue", width: 20 },
        { header: `Awarded Value (${currency})`, key: "awardedValue", width: 20 },
        { header: "Approved Count", key: "approvedCount", width: 16 },
        { header: "Awarded Count", key: "awardedCount", width: 16 },
        { header: "Pending Count", key: "pendingCount", width: 16 },
        { header: "Rejected Count", key: "rejectedCount", width: 16 }
      ];

      const companyHeaderRow = companySheet.getRow(1);
      companyHeaderRow.height = 25;
      companyHeaderRow.eachCell((cell) => {
        cell.font = { name: "Arial", bold: true, size: 11, color: { argb: "FFFFFFFF" } };
        cell.alignment = { horizontal: "center", vertical: "middle" };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2563EB" } };
        cell.border = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
      });

      let companyRowIndex = 2;
      Object.entries(companyStats).forEach(([cName, stats]) => {
        const row = companySheet.addRow({
          companyName: cName,
          totalQuotations: stats.totalQuotations,
          totalValue: hasConversion ? stats.totalValueConverted : stats.totalValueAED,
          awardedValue: hasConversion ? stats.awardedValueConverted : stats.awardedValueAED,
          approvedCount: stats.approvedCount,
          awardedCount: stats.awardedCount,
          pendingCount: stats.pendingCount,
          rejectedCount: stats.rejectedCount
        });

        row.height = 22;
        row.eachCell((cell, colNumber) => {
          cell.border = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
          cell.alignment = { vertical: "middle", horizontal: colNumber === 1 ? "left" : "center" };
          cell.font = { name: "Arial", size: 10 };
          if (companyRowIndex % 2 === 0) {
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF9FAFB" } };
          }
        });

        row.getCell("totalValue").numFmt = hasConversion ? `"${currency}" #,##0.00` : '"AED" #,##0.00';
        row.getCell("awardedValue").numFmt = hasConversion ? `"${currency}" #,##0.00` : '"AED" #,##0.00';
        companyRowIndex++;
      });

      const totalCompanyRow = companySheet.addRow({
        companyName: "TOTAL",
        totalQuotations: Object.values(companyStats).reduce((sum, s) => sum + s.totalQuotations, 0),
        totalValue: Object.values(companyStats).reduce((sum, s) => hasConversion ? sum + s.totalValueConverted : sum + s.totalValueAED, 0),
        awardedValue: Object.values(companyStats).reduce((sum, s) => hasConversion ? sum + s.awardedValueConverted : sum + s.awardedValueAED, 0),
        approvedCount: Object.values(companyStats).reduce((sum, s) => sum + s.approvedCount, 0),
        awardedCount: Object.values(companyStats).reduce((sum, s) => sum + s.awardedCount, 0),
        pendingCount: Object.values(companyStats).reduce((sum, s) => sum + s.pendingCount, 0),
        rejectedCount: Object.values(companyStats).reduce((sum, s) => sum + s.rejectedCount, 0)
      });
      totalCompanyRow.height = 26;
      totalCompanyRow.font = { name: "Arial", bold: true };
      totalCompanyRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE5E7EB" } };
      totalCompanyRow.getCell("totalValue").numFmt = hasConversion ? `"${currency}" #,##0.00` : '"AED" #,##0.00';
      totalCompanyRow.getCell("awardedValue").numFmt = hasConversion ? `"${currency}" #,##0.00` : '"AED" #,##0.00';
      totalCompanyRow.eachCell((cell) => {
        cell.border = { top: { style: "medium" }, left: { style: "thin" }, bottom: { style: "medium" }, right: { style: "thin" } };
      });
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const fileName = `quotations_export_${new Date().toISOString().split("T")[0]}.xlsx`;

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename=${fileName}`);
    res.setHeader("Content-Length", buffer.length);
    return res.send(buffer);

  } catch (error) {
    logger.error(`Export quotations error: ${error.message}`);
    return res.status(500).json({ success: false, message: "Error exporting quotations", error: error.message });
  }
};

// =============================================================
// INTERNAL DOCUMENT CRUD OPERATIONS
// =============================================================

exports.addInternalDocuments = async (req, res) => {
  try {
    const { id } = req.params;
    const { documents, descriptions } = req.body;

    if (!documents || !documents.length) {
      return res.status(400).json({ success: false, message: 'No documents provided' });
    }

    const quotation = await Quotation.findById(id);
    if (!quotation) return res.status(404).json({ success: false, message: 'Quotation not found' });

    const isAdmin = req.user.role === 'admin';
    const isOps = req.user.role === 'ops_manager';
    const isCreator = quotation.createdBy._id.toString() === req.user.id;

    if (!isAdmin && !isOps && !isCreator) {
      return res.status(403).json({ success: false, message: 'Not authorized to add documents to this quotation' });
    }

    const processedDocuments = await uploadMultipleInternalDocumentsFromBase64(
      documents,
      quotation.quotationNumber,
      req.user.id
    );

    if (descriptions && descriptions.length) {
      processedDocuments.forEach((doc, index) => {
        if (descriptions[index]) doc.description = descriptions[index];
      });
    }

    quotation.internalDocuments = [...(quotation.internalDocuments || []), ...processedDocuments];
    await quotation.save();

    res.status(200).json({ success: true, message: `${processedDocuments.length} internal document(s) added successfully`, documents: processedDocuments });
  } catch (err) {
    logger.error(`Add internal documents error: ${err.message}`);
    res.status(500).json({ success: false, message: 'Error adding internal documents', error: err.message });
  }
};

exports.getInternalDocuments = async (req, res) => {
  try {
    const { id } = req.params;
    const quotation = await Quotation.findById(id).select('internalDocuments quotationNumber company.code createdBy').lean();
    if (!quotation) return res.status(404).json({ success: false, message: 'Quotation not found' });

    const isAdmin = req.user.role === 'admin';
    const isOps = req.user.role === 'ops_manager';
    const isCreator = quotation.createdBy._id.toString() === req.user.id;

    if (!isAdmin && !isOps && !isCreator) {
      return res.status(403).json({ success: false, message: 'Not authorized to view internal documents' });
    }

    res.status(200).json({
      success: true,
      quotationNumber: quotation.quotationNumber,
      companyCode: quotation.company?.code,
      documents: quotation.internalDocuments || [],
      count: quotation.internalDocuments?.length || 0
    });
  } catch (err) {
    logger.error(`Get internal documents error: ${err.message}`);
    res.status(500).json({ success: false, message: 'Error fetching internal documents', error: err.message });
  }
};

exports.getInternalDocumentById = async (req, res) => {
  try {
    const { id, docId } = req.params;
    const quotation = await Quotation.findById(id).select('internalDocuments').lean();
    if (!quotation) return res.status(404).json({ success: false, message: 'Quotation not found' });

    const isAdmin = req.user.role === 'admin';
    const isOps = req.user.role === 'ops_manager';
    const isCreator = quotation.createdBy._id.toString() === req.user.id;

    if (!isAdmin && !isOps && !isCreator) {
      return res.status(403).json({ success: false, message: 'Not authorized to view internal documents' });
    }

    const document = quotation.internalDocuments?.find(doc => doc._id.toString() === docId);
    if (!document) return res.status(404).json({ success: false, message: 'Document not found' });

    res.status(200).json({ success: true, document });
  } catch (err) {
    logger.error(`Get document by ID error: ${err.message}`);
    res.status(500).json({ success: false, message: 'Error fetching document', error: err.message });
  }
};

exports.updateInternalDocumentDescription = async (req, res) => {
  try {
    const { id, docId } = req.params;
    const { description } = req.body;

    const quotation = await Quotation.findById(id);
    if (!quotation) return res.status(404).json({ success: false, message: 'Quotation not found' });

    const isCreator = quotation.createdBy._id.toString() === req.user.id;
    if (!isCreator) return res.status(403).json({ success: false, message: 'Only the creator can update internal document descriptions' });

    const document = quotation.internalDocuments?.id(docId);
    if (!document) return res.status(404).json({ success: false, message: 'Document not found' });

    document.description = description || '';
    await quotation.save();

    res.status(200).json({ success: true, message: 'Internal document description updated', document });
  } catch (err) {
    logger.error(`Update document description error: ${err.message}`);
    res.status(500).json({ success: false, message: 'Error updating document description', error: err.message });
  }
};

exports.removeInternalDocument = async (req, res) => {
  try {
    const { id, docId } = req.params;
    const quotation = await Quotation.findById(id);
    if (!quotation) return res.status(404).json({ success: false, message: 'Quotation not found' });

    const isCreator = quotation.createdBy._id.toString() === req.user.id;
    if (!isCreator) return res.status(403).json({ success: false, message: 'Only the creator can remove internal documents' });

    const document = quotation.internalDocuments?.id(docId);
    if (!document) return res.status(404).json({ success: false, message: 'Document not found' });

    await deleteInternalDocument(document);
    quotation.internalDocuments.pull(docId);
    await quotation.save();

    res.status(200).json({ success: true, message: 'Internal document removed successfully' });
  } catch (err) {
    logger.error(`Remove document error: ${err.message}`);
    res.status(500).json({ success: false, message: 'Error removing internal document', error: err.message });
  }
};

exports.getInternalDocumentDownloadUrl = async (req, res) => {
  try {
    const { id, docId } = req.params;
    const quotation = await Quotation.findById(id);
    if (!quotation) return res.status(404).json({ success: false, message: 'Quotation not found' });

    const isAdmin = req.user.role === 'admin';
    const isOps = req.user.role === 'ops_manager';
    const isCreator = quotation.createdBy._id.toString() === req.user.id;

    if (!isAdmin && !isOps && !isCreator) {
      return res.status(403).json({ success: false, message: 'Not authorized to download internal documents' });
    }

    const document = quotation.internalDocuments?.id(docId);
    if (!document) return res.status(404).json({ success: false, message: 'Document not found' });

    let downloadUrl = document.s3Key ? await getSignedFileUrl(document.s3Key) : null;
    
    if (!downloadUrl) {
      return res.status(404).json({ success: false, message: 'Unable to generate download URL' });
    }

    res.status(200).json({ 
      success: true, 
      downloadUrl, 
      fileName: document.fileName, 
      fileType: document.fileType, 
      fileSize: document.fileSize, 
      uploadedAt: document.uploadedAt, 
      uploadedBy: document.uploadedBy 
    });
  } catch (err) {
    logger.error(`Get download URL error: ${err.message}`);
    res.status(500).json({ success: false, message: 'Error getting document URL', error: err.message });
  }
};

// =============================================================
// S3 SIGNED URL HELPERS
// =============================================================

exports.getSignedUrl = async (req, res) => {
  try {
    const { key } = req.params;
    const { expiresIn = 3600 } = req.query;
    
    if (!key) {
      return res.status(400).json({ success: false, message: 'S3 key is required' });
    }
    
    const signedUrl = await getSignedFileUrl(key, parseInt(expiresIn));
    
    if (!signedUrl) {
      return res.status(404).json({ success: false, message: 'Unable to generate signed URL' });
    }
    
    res.json({ success: true, url: signedUrl });
  } catch (err) {
    logger.error(`Get signed URL error: ${err.message}`);
    res.status(500).json({ success: false, message: 'Error generating signed URL', error: err.message });
  }
};

exports.getBatchSignedUrls = async (req, res) => {
  try {
    const { keys } = req.body;
    const { expiresIn = 3600 } = req.query;
    
    if (!keys || !Array.isArray(keys)) {
      return res.status(400).json({ success: false, message: 'Array of S3 keys is required' });
    }
    
    const urls = {};
    
    for (const key of keys) {
      if (key) {
        const signedUrl = await getSignedFileUrl(key, parseInt(expiresIn));
        if (signedUrl) {
          urls[key] = signedUrl;
        }
      }
    }
    
    res.json({ success: true, urls });
  } catch (err) {
    logger.error(`Batch get signed URLs error: ${err.message}`);
    res.status(500).json({ success: false, message: 'Error generating signed URLs', error: err.message });
  }
};