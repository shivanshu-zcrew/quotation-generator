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
const emailService = require('../utils/emailService');
const User = require('../models/user');
const logger = require('../config/logger');
const redisService = require('../config/redisService');

// Escape regex metacharacters to prevent ReDoS
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

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

// ─────────────────────────────────────────────────────────────
// PDF semaphore — caps concurrent Puppeteer pages so the server
// doesn't OOM when many users download PDFs at the same time.
// PDF_MAX_CONCURRENT from .env (default 3).
// ─────────────────────────────────────────────────────────────
const PDF_MAX = parseInt(process.env.PDF_MAX_CONCURRENT || '3', 10);
const PDF_MAX_QUEUE = parseInt(process.env.PDF_MAX_QUEUE || '50', 10);
const PDF_QUEUE_TIMEOUT_MS = 30_000;
let _pdfActive = 0;
const _pdfQueue = [];

function acquirePdfSlot() {
  return new Promise((resolve, reject) => {
    if (_pdfActive < PDF_MAX) { _pdfActive++; resolve(); }
    else {
      if (_pdfQueue.length >= PDF_MAX_QUEUE) {
        return reject(Object.assign(new Error('PDF generation queue is full'), { status: 503 }));
      }
      const entry = { resolve, reject };
      entry.timer = setTimeout(() => {
        const idx = _pdfQueue.indexOf(entry);
        if (idx !== -1) _pdfQueue.splice(idx, 1);
        reject(Object.assign(new Error('PDF generation timed out'), { status: 503 }));
      }, PDF_QUEUE_TIMEOUT_MS);
      _pdfQueue.push(entry);
    }
  });
}

function releasePdfSlot() {
  if (_pdfQueue.length > 0) {
    const entry = _pdfQueue.shift();
    clearTimeout(entry.timer);
    entry.resolve();
  } else _pdfActive--;
}

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

// Lightweight populate for list endpoints — skips approval-chain refs not shown in tables.
const listPopulate = (q) =>
  q
    .populate('customerId', 'name')
    .populate('createdBy', 'name');

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
    const CACHE_KEY = 'companies:active';
    const cached = await redisService.get(CACHE_KEY);
    if (cached) return res.json({ success: true, companies: cached, count: cached.length });

    const companies = await Company.find({ isActive: true })
      .select('code name slug logo address phone email baseCurrency acceptedCurrencies')
      .sort({ name: 1 })
      .lean();

    await redisService.set(CACHE_KEY, companies, 3600); // 1 hour — companies rarely change
    res.json({ success: true, companies, count: companies.length });
  } catch (err) {
    logger.error(`Get companies error: ${err.message}`);
    res.status(500).json({ success: false, message: 'Error fetching companies', error: err.message });
  }
};

exports.getCompanyByCode = async (req, res) => {
  try {
    const { code } = req.params;
    const CACHE_KEY = `company:code:${code.toUpperCase()}`;
    const cached = await redisService.get(CACHE_KEY);
    if (cached) return res.json({ success: true, company: cached });

    const company = await Company.findOne({ code: code.toUpperCase(), isActive: true }).lean();

    if (!company) {
      logger.warn(`Company not found: ${code}`);
      return res.status(404).json({ success: false, message: 'Company not found' });
    }

    await redisService.set(CACHE_KEY, company, 3600); // 1 hour
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

    // Skip cache when date filters are applied — results are filter-specific
    const hasDateFilter = !!(from || to);
    const CACHE_KEY = `stats:company:${id}`;
    if (!hasDateFilter) {
      const cached = await redisService.get(CACHE_KEY);
      if (cached) return res.json({ success: true, ...cached });
    }

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

    const payload = {
      company: { id: company._id, code: company.code, name: company.name, baseCurrency: company.baseCurrency, logo: company.logo },
      stats: { totalQuotations, totalValue: totalValue[0]?.total || 0, statusCounts: statusMap, currencyBreakdown, recentQuotations }
    };

    if (!hasDateFilter) await redisService.set(CACHE_KEY, payload, 600); // 10 min
    res.json({ success: true, ...payload });
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
      filter.$text = { $search: req.query.search.trim() };
    }

    if (req.query.from || req.query.to) {
      filter.date = {};
      if (req.query.from) filter.date.$gte = new Date(req.query.from);
      if (req.query.to) filter.date.$lte = new Date(req.query.to);
    }

    const sortField = SORT_FIELDS.has(req.query.sortBy) ? req.query.sortBy : 'createdAt';
    const sortDir = req.query.sortDir === 'asc' ? 1 : -1;
    // When searching by text, also sort by relevance score so best matches surface first
    const sortObj = req.query.search
      ? { score: { $meta: 'textScore' }, [sortField]: sortDir }
      : { [sortField]: sortDir };

    const [data, total] = await Promise.all([
      listPopulate(Quotation.find(filter).sort(sortObj).skip(skip).limit(limit)).lean(),
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
      filter.$text = { $search: req.query.search.trim() };
    }

    const sortField = SORT_FIELDS.has(req.query.sortBy) ? req.query.sortBy : 'createdAt';
    const sortDir = req.query.sortDir === 'asc' ? 1 : -1;
    const sortObject = req.query.search
      ? { score: { $meta: 'textScore' }, [sortField]: sortDir }
      : { [sortField]: sortDir, _id: 1 };

    const [data, total] = await Promise.all([
      listPopulate(Quotation.find(filter).sort(sortObject).skip(skip).limit(limit)).lean(),
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
    let companyId = req.query.companyId || req.headers['x-company-id'];
    const userId = req.user.id;

    const CACHE_KEY = `stats:user:${userId}:company:${companyId || 'all'}`;
    const cached = await redisService.get(CACHE_KEY);
    if (cached) return res.json({ success: true, stats: cached });

    // Get companyId from query params
    companyId = req.query.companyId || req.headers['x-company-id'];

    const userObjectId = mongoose.Types.ObjectId.isValid(userId)
      ? new mongoose.Types.ObjectId(userId) 
      : userId;
    
    logger.debug('getMyQuotationsStats', { userId, companyId: companyId || 'all' });
    
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
    
    logger.debug('getMyQuotationsStats result', { totalQuotations, pendingCount, opsApprovedCount, approvedCount, awardedCount, totalValue, awardedValue });
    
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

    await redisService.set(CACHE_KEY, stats, 300); // 5 min — stale stats are acceptable
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
    const isAdmin = req.user.role === 'admin';
    const isOps   = req.user.role === 'ops_manager';

    // Admins and ops managers can view any quotation regardless of company context.
    // Creators must belong to the same company as the quotation.
    let query;
    if (isAdmin || isOps) {
      query = { _id: req.params.id };
    } else {
      const companyId = req.companyId || req.headers['x-company-id'] || req.query.companyId;
      if (!companyId) return res.status(400).json({ message: 'Company ID is required' });
      query = { _id: req.params.id, companyId };
    }

    const quotation = await fullPopulate(Quotation.findOne(query)).lean();
    if (!quotation) return res.status(404).json({ message: 'Quotation not found' });

    const isCreator = quotation.createdBy && quotation.createdBy._id?.toString() === req.user.id;

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
    customerDesignation, customerTradeLicenseNumber, date, expiryDate, queryDate, 
    tl, trn,  // ← Company's TL and TRN from payload
    customerTaxRegistrationNumber,  // ← Customer's TRN (different from company's trn)
    ourRef, ourContact, salesManagerEmail, paymentTerms, deliveryTerms, ourFocalPointDesignation,
    focalPointDesignation, items, taxPercent, discountPercent, notes, remark,
    quotationImages, termsAndConditions, termsImages, existingTermsImages, internalDocuments, internalDocDescriptions, quotationNumber, 
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

  let exchangeRate = 1;
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
      unit: item.unit || '',
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
      phone: company.phone, email: company.email,
      vatNumber: company.vatNumber,  
      crNumber: company.crNumber,
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
      name: customerName?.trim() || customerDoc.name,  
      email: req.body.customerEmail?.trim() || customerDoc.email, 
      phone: customerDoc.phone,
      address: customerDoc.address, 
      country: customerCountry || 'UAE', 
      vatNumber: customerTaxRegistrationNumber?.trim() || customerDoc.vatNumber,  // ✅ Customer's TRN from payload
      designation: customerDesignation?.trim() || '', 
      tradeLicenseNumber: customerTradeLicenseNumber?.trim() || '',
      taxTreatment: customerDoc.taxTreatment || 'non_vat_registered', 
      placeOfSupply: customerDoc.placeOfSupply || 'Dubai'
    },
    customerTaxTreatment: customerDoc.taxTreatment || 'non_vat_registered',
    customerPlaceOfSupply: customerDoc.placeOfSupply || 'Dubai',
    contact: contact?.trim() || '',
    date: date ? new Date(date) : new Date(),
    expiryDate: new Date(expiryDate),
    queryDate: queryDate ? new Date(queryDate) : null,
    ourRef: ourRef?.trim() || '', 
    ourContact: ourContact?.trim() || '',
    ourFocalPointDesignation: ourFocalPointDesignation?.trim() || '',
    salesManagerEmail: salesManagerEmail?.trim() || '',
    paymentTerms: paymentTerms?.trim() || '', 
    deliveryTerms: deliveryTerms?.trim() || '',
    
    // ✅ COMPANY'S TL AND TRN
    tl: tl?.trim() || company.crNumber?.trim() || '',
    trn: trn?.trim() || company.vatNumber?.trim() || '',
    
    items: processedItems,
    taxPercent: tax, 
    discountPercent: discount,
    ...totals,
    notes: notes?.trim() || '', 
    remark: remark?.trim() || '',
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

  // Invalidate stats caches so dashboards reflect the new quotation immediately
  redisService.delPattern(`stats:user:${req.user.id}:*`);
  redisService.delPattern(`stats:company:${companyId}:*`);

  // Non-blocking: notify ops managers of new submission
  if (initialStatus === 'pending') {
    User.find({ role: 'ops_manager', isActive: true }).select('email').lean()
      .then(ops => {
        const emails = ops.map(o => o.email).filter(e => e);
        if (emails.length) emailService.creatorSubmittedNotifyOps(emails, quotation, req.user.name, false);
      })
      .catch(err => logger.warn('[Email] Failed to notify ops of new quotation', { error: err.message }));
  }

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
    ourRef, ourContact, salesManagerEmail, paymentTerms, deliveryTerms, 
    tl, trn,  // ← Company's TL and TRN from payload
    customerTaxRegistrationNumber,  // ← Customer's TRN (keep for customer)
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
      const customerDoc = await Customer.findOne({ _id: customerId, companyId: existing.companyId }).lean();
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
        unit: item.unit || '',
        quantity: quantity, unitPrice: unitPrice, unitPriceInBaseCurrency: unitPriceInBaseCurrency,
        totalPrice: totalPrice, totalPriceInBaseCurrency: totalPriceInBaseCurrency,
        imageS3Keys: imageKeys,
        storageProvider: 's3'
      });
    }

    // ==================== ITEM IMAGE S3 CLEANUP ====================
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
        logger.debug(`Deleted removed item image`, { key });
      }
      if (removedItemKeys.length > 0) {
        logger.info(`Item image cleanup: removed ${removedItemKeys.length} orphaned S3 object(s)`);
      }
    } catch (cleanupErr) {
      logger.error(`Item image S3 cleanup error: ${cleanupErr.message}`);
    }
    // ==================== END ITEM IMAGE S3 CLEANUP ====================

    const tax = taxPercent !== undefined ? parseFloat(taxPercent) : (existing.taxPercent || 0);
    const discount = discountPercent !== undefined ? parseFloat(discountPercent) : (existing.discountPercent || 0);
    const totals = calculateTotals(processedItems, tax, discount, exchangeRate);

    const subtotalInBaseCurrency = processedItems.reduce((sum, item) => sum + (item.totalPriceInBaseCurrency || 0), 0);
    const discountAmountInBaseCurrency = (subtotalInBaseCurrency * discount) / 100;
    const discountedSubtotalInBaseCurrency = subtotalInBaseCurrency - discountAmountInBaseCurrency;
    const taxAmountInBaseCurrency = (discountedSubtotalInBaseCurrency * tax) / 100;
    const totalInBaseCurrency = discountedSubtotalInBaseCurrency + taxAmountInBaseCurrency;

    // ==================== TERMS IMAGES HANDLING ====================
    const dbTermsImages = existing.termsImages || [];
    const keptExistingImages = existingTermsImages || [];
    
    const removedImages = dbTermsImages.filter(dbImg => 
      !keptExistingImages.some(keptImg => 
        keptImg.s3Key === dbImg.s3Key || keptImg.id === dbImg._id?.toString()
      )
    );
    
    for (const removedImg of removedImages) {
      if (removedImg.s3Key) {
        await deleteFromS3(removedImg.s3Key);
        logger.debug('Deleted removed terms image', { key: removedImg.s3Key });
      }
    }
    
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
    
    const finalTermsImages = [
      ...keptExistingImages.map(img => ({
        s3Key: img.s3Key,
        fileName: img.fileName,
        uploadedAt: img.uploadedAt || new Date(),
        storageProvider: 's3'
      })),
      ...newUploadedImages
    ];
    
    logger.debug('Terms images summary', { existing: dbTermsImages.length, removed: removedImages.length, kept: keptExistingImages.length, new: newUploadedImages.length, total: finalTermsImages.length });
    // ==================== END OF TERMS IMAGES HANDLING ====================

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
      ...(date && { date: new Date(date) }), 
      ...(expiryDate && { expiryDate: new Date(expiryDate) }),
      ...(queryDate !== undefined && { queryDate: queryDate ? new Date(queryDate) : null }),
      ...(ourRef !== undefined && { ourRef: ourRef?.trim() || '' }), 
      ...(ourContact !== undefined && { ourContact: ourContact?.trim() || '' }),
      ...(salesManagerEmail !== undefined && { salesManagerEmail: salesManagerEmail?.trim() || '' }),
      ...(paymentTerms !== undefined && { paymentTerms: paymentTerms?.trim() || '' }), 
      ...(deliveryTerms !== undefined && { deliveryTerms: deliveryTerms?.trim() || '' }),
      
       ...(tl !== undefined && { tl: tl?.trim() || '' }),   
      ...(trn !== undefined && { trn: trn?.trim() || '' }),  
      
      ...(customerTaxRegistrationNumber !== undefined && { 
        'customerSnapshot.vatNumber': customerTaxRegistrationNumber?.trim() || '' 
      }),
      
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
    
    // Handle approval data clearing based on new status
    if (newStatus === 'pending' || newStatus === 'ops_rejected') {
      updateData.opsRejectionReason = '';
      updateData.rejectionReason = '';
      updateData.opsApprovedBy = null;
      updateData.opsApprovedAt = null;
      updateData.approvedBy = null;
      updateData.approvedAt = null;
    } else if (newStatus === 'pending_admin') {
      updateData.approvedBy = null;
      updateData.approvedAt = null;
      updateData.rejectionReason = '';
    } else if (newStatus === 'rejected') {
      updateData.opsRejectionReason = existing.opsRejectionReason || '';
      updateData.rejectionReason = existing.rejectionReason || '';
    } else if (newStatus === 'ops_approved') {
      updateData.opsApprovedBy = req.user.id;
      updateData.opsApprovedAt = new Date();
      updateData.opsApprovedBySnapshot = {
        name: req.user.name,
        email: req.user.email,
        role: req.user.role,
        approvedAt: new Date()
      };
    } else if (newStatus === 'approved' || newStatus === 'awarded') {
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
    
    // Invalidate stats caches — status may have changed
    redisService.delPattern(`stats:user:${req.user.id}:*`);
    redisService.delPattern(`stats:company:${companyId}:*`);

    // Non-blocking: notify ops on resubmission after rejection
    if (newStatus === 'pending' && ['ops_rejected', 'rejected'].includes(currentStatus)) {
      User.find({ role: 'ops_manager', isActive: true }).select('email').lean()
        .then(ops => {
          const emails = ops.map(o => o.email).filter(e => e);
          if (emails.length) emailService.creatorSubmittedNotifyOps(emails, populated, req.user.name, true);
        })
        .catch(err => logger.warn('[Email] Failed to notify ops of resubmission', { error: err.message }));
    }

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

    const isCreator = quotation.createdBy && quotation.createdBy._id?.toString() === req.user.id;
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

    if (!quotation.createdBy || quotation.createdBy._id?.toString() !== req.user.id) {
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
        const isCustomerGone = zohoKind === 'client_error' && (
          /not accessible/i.test(zohoError) ||
          /deleted/i.test(zohoError) ||
          /permission/i.test(zohoError)
        );
        const kindMessages = {
          timeout:      'Zoho Books did not respond in time.',
          network:      'Could not connect to Zoho Books.',
          rate_limit:   'Zoho Books rate limit reached. Please wait a moment and try again.',
          server_error: 'Zoho Books returned a server error.',
          auth:         'Zoho Books authentication failed. Please contact your administrator.',
          circuit_open: 'Zoho Books is currently unavailable (too many recent failures). Please try again in a minute.',
          client_error: isCustomerGone
            ? 'The customer linked to this quotation no longer exists in Zoho Books (it may have been deleted or deactivated). Go to Customers → sync with Zoho to restore it, then try awarding again.'
            : `Zoho Books rejected the request: ${zohoError}`
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

      // Email admins + ops managers (exclude the creator if they hold one of those roles) — non-blocking
      User.find({ role: { $in: ['admin', 'ops_manager'] }, isActive: true })
        .select('email').lean()
        .then(members => {
          const emails = members.map(m => m.email).filter(e => e && e !== req.user.email);
          if (emails.length) emailService.quotationAwardedNotifyTeam(emails, quotation, req.user.name);
        }).catch(err => logger.warn('Failed to query team emails for award notification', { error: err.message }));

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
    const isCreator = quotation.createdBy && quotation.createdBy._id?.toString() === req.user.id;

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

  await acquirePdfSlot();
  try {
    const browser = await getBrowser();
    page = await browser.newPage();

    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const type = req.resourceType();
      if (['stylesheet', 'font', 'media', 'script', 'fetch', 'xhr', 'websocket', 'other'].includes(type)) req.abort();
      else req.continue();
    });

    await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 40000 });
    await page.evaluate(() => Promise.all([...document.images].filter((img) => !img.complete).map((img) => new Promise((res) => { img.onload = res; img.onerror = res; })))).catch(() => {});

    const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true, margin: { top: '10mm', right: '10mm', bottom: '10mm', left: '10mm' } });

    await page.close();
    page = null;

    if (Buffer.from(pdfBuffer).slice(0, 5).toString() !== '%PDF-') throw new Error('Puppeteer returned an invalid PDF buffer');

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(safeFilename)}.pdf`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.setHeader('Cache-Control', 'no-store');
    releasePdfSlot();
    res.send(Buffer.isBuffer(pdfBuffer) ? pdfBuffer : Buffer.from(pdfBuffer));

  } catch (err) {
    if (page) await page.close().catch(() => {});
    releasePdfSlot();
    logger.error(`PDF generation error: ${err.message}`);
    res.status(500).json({ success: false, message: 'Error generating PDF', error: err.message });
  }
};

exports.getDashboardStats = async (req, res) => {
  try {
    const { companyId } = req.query;
    let matchStage = {};
    if (companyId) {
      if (!mongoose.Types.ObjectId.isValid(companyId)) {
        return res.status(400).json({ success: false, message: 'Invalid company ID' });
      }
      matchStage = { companyId: new mongoose.Types.ObjectId(companyId) };
    }

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
      const regex = new RegExp(escapeRegex(search.trim()), "i");
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

    // Handle empty results - Create Excel file with "No Data" message
    if (!quotations.length) {
      logger.warn(`No quotations found for export`);
      
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet("No Data Found");
      
      // Title
      worksheet.mergeCells('A1:C1');
      const titleCell = worksheet.getCell('A1');
      titleCell.value = "QUOTATIONS REPORT";
      titleCell.font = { name: "Arial", size: 18, bold: true, color: { argb: "FFFFFFFF" } };
      titleCell.alignment = { horizontal: "center", vertical: "middle" };
      titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF111827" } };
      worksheet.getRow(1).height = 35;
      
      worksheet.addRow([]);
      
      // Message
      worksheet.mergeCells('A2:C2');
      const messageCell = worksheet.getCell('A2');
      messageCell.value = "⚠️ NO QUOTATIONS FOUND";
      messageCell.font = { name: "Arial", size: 14, bold: true, color: { argb: "FF991B1B" } };
      messageCell.alignment = { horizontal: "center", vertical: "middle" };
      
      worksheet.addRow([]);
      worksheet.mergeCells('A3:C3');
      const subMessageCell = worksheet.getCell('A3');
      subMessageCell.value = "No quotations match the selected filters.";
      subMessageCell.font = { name: "Arial", size: 11 };
      subMessageCell.alignment = { horizontal: "center" };
      
      worksheet.addRow([]);
      worksheet.addRow([]);
      
      // Applied Filters
      worksheet.getCell('A5').value = "APPLIED FILTERS:";
      worksheet.getCell('A5').font = { name: "Arial", size: 12, bold: true };
      worksheet.getCell('A5').fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE5E7EB" } };
      
      let filterRow = 6;
      worksheet.getCell(`A${filterRow}`).value = "Company:";
      worksheet.getCell(`B${filterRow}`).value = isAllCompanies ? "All Companies" : companyId;
      filterRow++;
      
      if (from || to) {
        worksheet.getCell(`A${filterRow}`).value = "Date Range:";
        worksheet.getCell(`B${filterRow}`).value = `${from || 'Start'} to ${to || 'End'}`;
        filterRow++;
      }
      
      if (status && status !== 'all') {
        worksheet.getCell(`A${filterRow}`).value = "Status:";
        worksheet.getCell(`B${filterRow}`).value = status;
        filterRow++;
      }
      
      if (search?.trim()) {
        worksheet.getCell(`A${filterRow}`).value = "Search:";
        worksheet.getCell(`B${filterRow}`).value = search;
        filterRow++;
      }
      
      worksheet.getColumn('A').width = 20;
      worksheet.getColumn('B').width = 40;
      worksheet.getColumn('C').width = 10;
      
      const fileName = `quotations_export_empty_${new Date().toISOString().split('T')[0]}.xlsx`;
      const buffer = await workbook.xlsx.writeBuffer();
      
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename=${fileName}`);
      return res.send(buffer);
    }

    // Currency conversion for the REPORT-LEVEL display currency
    let exchangeRates = null;
    if (currency !== 'AED') {
      try {
        exchangeRates = await ExchangeRateService.getRates(currency);
      } catch (rateError) {
        logger.error(`Error fetching exchange rates: ${rateError.message}`);
      }
    }

    const convertFromAED = (amountInAED) => {
      if (currency === 'AED' || !exchangeRates) return amountInAED;
      const rate = exchangeRates['AED'] || 1;
      if (!rate || rate <= 0) return amountInAED;
      return amountInAED / rate;
    };

    // Calculate metrics for analytics
    const totalQuotations = quotations.length;
    const awardedQuotations = quotations.filter(q => q.status === "awarded");
    const conversionRate = totalQuotations > 0 ? (awardedQuotations.length / totalQuotations) * 100 : 0;

    // Status breakdown
    const statusOrder = ['draft', 'pending', 'pending_admin', 'approved', 'ops_approved', 'awarded', 'rejected', 'not_awarded', 'expired'];
    const statusDisplayNames = {
      'draft': 'Draft',
      'pending': 'Pending',
      'pending_admin': 'Pending Admin',
      'approved': 'Approved',
      'ops_approved': 'Ops Approved',
      'awarded': 'Awarded',
      'rejected': 'Rejected',
      'not_awarded': 'Not Awarded',
      'expired': 'Expired'
    };
    
    const statusBreakdown = {};
    quotations.forEach(q => {
      const statusKey = q.status;
      if (!statusBreakdown[statusKey]) {
        statusBreakdown[statusKey] = { count: 0, percentage: 0 };
      }
      statusBreakdown[statusKey].count++;
    });
    
    Object.keys(statusBreakdown).forEach(status => {
      statusBreakdown[status].percentage = (statusBreakdown[status].count / totalQuotations) * 100;
    });

    const approvedCount = quotations.filter(q => ["approved", "ops_approved"].includes(q.status)).length;
    const awardedCount = awardedQuotations.length;
    const pendingCount = quotations.filter(q => ["pending", "pending_admin"].includes(q.status)).length;
    const rejectedCount = quotations.filter(q => ["rejected", "not_awarded"].includes(q.status)).length;
    
    const awardedRevenueInAED = awardedQuotations.reduce((sum, q) => sum + (q.totalInBaseCurrency || 0), 0);
    const awardedRevenue = convertFromAED(awardedRevenueInAED);

    // Group quotations by company
    const quotationsByCompany = {};
    quotations.forEach((q) => {
      const companyName = q.companySnapshot?.name || q.companyId?.name || "Unknown";
      if (!quotationsByCompany[companyName]) quotationsByCompany[companyName] = [];
      quotationsByCompany[companyName].push(q);
    });

    // Company-wise statistics (no filters)
    let companyStats = null;
    if (isAllCompanies) {
      companyStats = {};
      quotations.forEach((q) => {
        const companyName = q.companySnapshot?.name || q.companyId?.name || "Unknown";
        if (!companyStats[companyName]) {
          companyStats[companyName] = {
            companyName: companyName,
            totalQuotations: 0,
            awardedRevenue: 0,
            approvedCount: 0,
            awardedCount: 0,
            pendingCount: 0,
            rejectedCount: 0,
            conversionRate: 0
          };
        }

        const valueInAED = q.totalInBaseCurrency || 0;
        const valueConverted = convertFromAED(valueInAED);

        companyStats[companyName].totalQuotations++;
        
        if (q.status === "awarded") {
          companyStats[companyName].awardedRevenue += valueConverted;
          companyStats[companyName].awardedCount++;
        } else if (["approved", "ops_approved"].includes(q.status)) {
          companyStats[companyName].approvedCount++;
        } else if (["pending", "pending_admin"].includes(q.status)) {
          companyStats[companyName].pendingCount++;
        } else if (["rejected", "not_awarded"].includes(q.status)) {
          companyStats[companyName].rejectedCount++;
        }
      });
      
      // Calculate conversion rates
      Object.keys(companyStats).forEach(company => {
        const stats = companyStats[company];
        stats.conversionRate = stats.totalQuotations > 0 ? (stats.awardedCount / stats.totalQuotations) * 100 : 0;
      });
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Quotation Management System";
    workbook.created = new Date();

    // ==================== 1. QUOTATIONS SHEET (FIRST) ====================
    const worksheet = workbook.addWorksheet("📋 Quotations", {
      pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    });

    const hasConversion = currency !== 'AED';
    const currentDate = new Date();

    // Column definitions with Age and Days To Expiry
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

    columns.push(
      { key: "ageDays", width: 12 },
      { key: "daysToExpiry", width: 14 },
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

    // Title row
    worksheet.mergeCells(`A1:${lastColLetter}1`);
    const titleCellQuot = worksheet.getCell("A1");
    titleCellQuot.value = "QUOTATIONS DETAIL REPORT";
    titleCellQuot.font = { name: "Arial", size: 20, bold: true, color: { argb: "FFFFFFFF" } };
    titleCellQuot.alignment = { horizontal: "center", vertical: "middle" };
    titleCellQuot.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF111827" } };
    worksheet.getRow(1).height = 35;

    // Summary row
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

    // Header row
    const headerCells = [
      "SL No", "Quotation Number", "Company", "Customer Name", "Customer Email", "Customer Phone",
      "Contact Person", "Project Name", "Date", "Expiry Date", "Query Date",
      "Currency",
      "Subtotal (Quote Ccy)", "Tax %", "Tax Amount (Quote Ccy)",
      "Discount %", "Discount Amount (Quote Ccy)", "Total (Quote Ccy)",
      "Subtotal in AED", "Total in AED",
    ];

    if (hasConversion) headerCells.push(`Total in ${currency}`);

    headerCells.push(
      "Age (Days)", "Days To Expiry", "Status", "Created By", "Created At", "Items Count",
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
    const sortedCompaniesQuot = Object.keys(quotationsByCompany).sort();

    sortedCompaniesQuot.forEach((companyName) => {
      const companyQuotations = quotationsByCompany[companyName];

      if (sortedCompaniesQuot.length > 1) {
        const companyHeaderRow = worksheet.addRow({ company: `=== ${companyName.toUpperCase()} ===` });
        companyHeaderRow.height = 24;
        companyHeaderRow.font = { name: "Arial", bold: true, size: 12, color: { argb: "FF1E40AF" } };
        companyHeaderRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFF6FF" } };
        companyHeaderRow.eachCell((cell) => {
          cell.border = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
        });
      }

      companyQuotations.forEach((q) => {
        const subtotalOriginal = Number(q.subtotal) || 0;
        const taxAmount = Number(q.taxAmount) || 0;
        const discountAmount = Number(q.discountAmount) || 0;
        const totalOriginal = Number(q.total) || 0;
        const subtotalInAED = Number(q.subtotalInBaseCurrency) || 0;
        const totalInAED = Number(q.totalInBaseCurrency) || 0;

        const createdDate = new Date(q.createdAt);
        const ageDays = Math.floor((currentDate - createdDate) / (1000 * 60 * 60 * 24));
        
        const expiryDate = q.expiryDate ? new Date(q.expiryDate) : null;
        const daysToExpiry = expiryDate ? Math.floor((expiryDate - currentDate) / (1000 * 60 * 60 * 24)) : null;

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
          ageDays: ageDays >= 0 ? ageDays : 0,
          daysToExpiry: daysToExpiry !== null && daysToExpiry >= 0 ? daysToExpiry : "Expired",
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
        
        if (hasConversion) {
          row.getCell("totalConverted").numFmt = `"${currency}" #,##0.00`;
        }

        const ageCell = row.getCell("ageDays");
        if (ageDays > 90) {
          ageCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEE2E2" } };
          ageCell.font = { color: { argb: "FF991B1B" }, bold: true };
        } else if (ageDays > 60) {
          ageCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEF3C7" } };
        }

        const expiryCell = row.getCell("daysToExpiry");
        if (daysToExpiry !== null && daysToExpiry >= 0) {
          if (daysToExpiry <= 7) {
            expiryCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEE2E2" } };
            expiryCell.font = { color: { argb: "FF991B1B" }, bold: true };
          } else if (daysToExpiry <= 30) {
            expiryCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEF3C7" } };
          }
        } else if (daysToExpiry === null || daysToExpiry < 0) {
          expiryCell.value = "Expired";
          expiryCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3F4F6" } };
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

    worksheet.autoFilter = {
      from: { row: headerRowNumber, column: 1 },
      to: { row: headerRowNumber, column: columns.length },
    };
    worksheet.views = [{ state: "frozen", ySplit: headerRowNumber }];

    worksheet.columns.forEach(column => {
      let maxLength = column.header?.length || 0;
      column.eachCell?.({ includeEmpty: true }, (cell) => {
        const cellValue = cell.value ? cell.value.toString().length : 0;
        maxLength = Math.max(maxLength, cellValue);
      });
      column.width = Math.min(maxLength + 2, 50);
    });

    // ==================== 2. COMPANY-WISE STATS SHEET (SECOND - NO FILTERS) ====================
    if (isAllCompanies && companyStats && Object.keys(companyStats).length > 0) {
      const companySheet = workbook.addWorksheet("🏢 Company-wise Stats");
      
      companySheet.mergeCells('A1:H1');
      const companyTitle = companySheet.getCell('A1');
      companyTitle.value = "COMPANY-WISE PERFORMANCE REPORT";
      companyTitle.font = { name: "Arial", size: 16, bold: true, color: { argb: "FFFFFFFF" } };
      companyTitle.alignment = { horizontal: "center", vertical: "middle" };
      companyTitle.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF111827" } };
      companySheet.getRow(1).height = 30;
      
      companySheet.addRow([]);
      
      const companyColumns = [
        { key: "A", header: "Company Name", width: 35 },
        { key: "B", header: "Total Quotations", width: 18 },
        { key: "C", header: `Awarded Revenue (${currency})`, width: 22 },
        { key: "D", header: "Approved Count", width: 16 },
        { key: "E", header: "Awarded Count", width: 16 },
        { key: "F", header: "Pending Count", width: 16 },
        { key: "G", header: "Rejected Count", width: 16 },
        { key: "H", header: "Conversion Rate (%)", width: 18 }
      ];
      
      companyColumns.forEach(col => {
        const headerCell = companySheet.getCell(`${col.key}3`);
        headerCell.value = col.header;
        headerCell.font = { name: "Arial", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
        headerCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2563EB" } };
        headerCell.alignment = { horizontal: "center", vertical: "middle" };
        headerCell.border = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
        companySheet.getColumn(col.key).width = col.width;
      });
      
      let companyRowIndex = 4;
      const sortedCompanies = Object.values(companyStats).sort((a, b) => b.awardedRevenue - a.awardedRevenue);
      
      sortedCompanies.forEach((stats, idx) => {
        const row = companySheet.getRow(companyRowIndex);
        companySheet.getCell(`A${companyRowIndex}`).value = stats.companyName;
        companySheet.getCell(`B${companyRowIndex}`).value = stats.totalQuotations;
        companySheet.getCell(`C${companyRowIndex}`).value = stats.awardedRevenue;
        companySheet.getCell(`C${companyRowIndex}`).numFmt = `"${currency}" #,##0.00`;
        companySheet.getCell(`D${companyRowIndex}`).value = stats.approvedCount;
        companySheet.getCell(`E${companyRowIndex}`).value = stats.awardedCount;
        companySheet.getCell(`F${companyRowIndex}`).value = stats.pendingCount;
        companySheet.getCell(`G${companyRowIndex}`).value = stats.rejectedCount;
        companySheet.getCell(`H${companyRowIndex}`).value = stats.conversionRate;
        companySheet.getCell(`H${companyRowIndex}`).numFmt = '0.00"%"';
        
        if (idx % 2 === 0) {
          row.eachCell(cell => {
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF9FAFB" } };
          });
        }
        companyRowIndex++;
      });
      
      const totalRow = companySheet.getRow(companyRowIndex);
      companySheet.getCell(`A${companyRowIndex}`).value = "TOTAL / AVERAGE";
      companySheet.getCell(`B${companyRowIndex}`).value = sortedCompanies.reduce((sum, s) => sum + s.totalQuotations, 0);
      companySheet.getCell(`C${companyRowIndex}`).value = sortedCompanies.reduce((sum, s) => sum + s.awardedRevenue, 0);
      companySheet.getCell(`C${companyRowIndex}`).numFmt = `"${currency}" #,##0.00`;
      companySheet.getCell(`D${companyRowIndex}`).value = sortedCompanies.reduce((sum, s) => sum + s.approvedCount, 0);
      companySheet.getCell(`E${companyRowIndex}`).value = sortedCompanies.reduce((sum, s) => sum + s.awardedCount, 0);
      companySheet.getCell(`F${companyRowIndex}`).value = sortedCompanies.reduce((sum, s) => sum + s.pendingCount, 0);
      companySheet.getCell(`G${companyRowIndex}`).value = sortedCompanies.reduce((sum, s) => sum + s.rejectedCount, 0);
      
      const avgConversion = sortedCompanies.reduce((sum, s) => sum + s.conversionRate, 0) / sortedCompanies.length;
      companySheet.getCell(`H${companyRowIndex}`).value = avgConversion;
      companySheet.getCell(`H${companyRowIndex}`).numFmt = '0.00"%"';
      
      totalRow.font = { bold: true };
      totalRow.eachCell(cell => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE5E7EB" } };
        cell.border = { top: { style: "medium" }, left: { style: "thin" }, bottom: { style: "medium" }, right: { style: "thin" } };
      });
      
      // No auto-filter on company sheet
      companySheet.views = [{ state: "frozen", ySplit: 3 }];
    }

    // ==================== 3. ANALYTICS SHEET (THIRD - SIMPLE MINIMALIST) ====================
    const analyticsSheet = workbook.addWorksheet("📊 Analytics");
    
    // Simple title
    analyticsSheet.mergeCells('A1:C1');
    const analyticsTitle = analyticsSheet.getCell('A1');
    analyticsTitle.value = "QUOTATION ANALYTICS";
    analyticsTitle.font = { name: "Arial", size: 16, bold: true };
    analyticsTitle.alignment = { horizontal: "center", vertical: "middle" };
    analyticsSheet.getRow(1).height = 30;
    
    analyticsSheet.addRow([]);
    
    // Key metrics - simple table
    analyticsSheet.getCell('A3').value = "Metric";
    analyticsSheet.getCell('B3').value = "Value";
    analyticsSheet.getCell('C3').value = "";
    
    ['A3', 'B3'].forEach(cell => {
      const headerCell = analyticsSheet.getCell(cell);
      headerCell.font = { name: "Arial", bold: true, size: 11 };
      headerCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE5E7EB" } };
      headerCell.border = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
    });
    
    analyticsSheet.getCell('A4').value = "Total Quotations";
    analyticsSheet.getCell('B4').value = totalQuotations;
    
    analyticsSheet.getCell('A5').value = "Total Awarded Revenue";
    analyticsSheet.getCell('B5').value = awardedRevenue;
    analyticsSheet.getCell('B5').numFmt = `"${currency}" #,##0.00`;
    
    analyticsSheet.getCell('A6').value = "Conversion Rate";
    analyticsSheet.getCell('B6').value = conversionRate;
    analyticsSheet.getCell('B6').numFmt = '0.00"%"';
    
    analyticsSheet.addRow([]);
    
    // Status breakdown - simple table
    analyticsSheet.getCell('A8').value = "Status Breakdown";
    analyticsSheet.getCell('A8').font = { name: "Arial", bold: true, size: 12 };
    
    analyticsSheet.getCell('A9').value = "Status";
    analyticsSheet.getCell('B9').value = "Count";
    analyticsSheet.getCell('C9').value = "Percentage";
    
    ['A9', 'B9', 'C9'].forEach(cell => {
      const headerCell = analyticsSheet.getCell(cell);
      headerCell.font = { name: "Arial", bold: true, size: 11 };
      headerCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE5E7EB" } };
      headerCell.border = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
    });
    
    let statusRow = 10;
    const sortedStatusesSimple = Object.keys(statusBreakdown).sort((a, b) => {
      return statusOrder.indexOf(a) - statusOrder.indexOf(b);
    });
    
    sortedStatusesSimple.forEach((status, index) => {
      const data = statusBreakdown[status];
      const displayName = statusDisplayNames[status] || status.toUpperCase();
      
      analyticsSheet.getCell(`A${statusRow}`).value = displayName;
      analyticsSheet.getCell(`B${statusRow}`).value = data.count;
      analyticsSheet.getCell(`C${statusRow}`).value = data.percentage;
      analyticsSheet.getCell(`C${statusRow}`).numFmt = '0.00"%"';
      
      // Simple alternating row colors
      if (index % 2 === 0) {
        analyticsSheet.getRow(statusRow).eachCell(cell => {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF9FAFB" } };
        });
      }
      
      statusRow++;
    });
    
    // Total row
    analyticsSheet.getCell(`A${statusRow}`).value = "TOTAL";
    analyticsSheet.getCell(`B${statusRow}`).value = totalQuotations;
    analyticsSheet.getCell(`C${statusRow}`).value = 100;
    analyticsSheet.getCell(`C${statusRow}`).numFmt = '0.00"%"';
    analyticsSheet.getRow(statusRow).font = { bold: true };
    analyticsSheet.getRow(statusRow).eachCell(cell => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE5E7EB" } };
      cell.border = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
    });
    
    // Simple note
    const noteRow = statusRow + 2;
    analyticsSheet.mergeCells(`A${noteRow}:C${noteRow}`);
    analyticsSheet.getCell(`A${noteRow}`).value = `Report generated on ${new Date().toLocaleString()} | Currency: ${currency}`;
    analyticsSheet.getCell(`A${noteRow}`).font = { name: "Arial", size: 9, italic: true };
    analyticsSheet.getCell(`A${noteRow}`).alignment = { horizontal: "center" };
    
    // Set column widths
    analyticsSheet.getColumn('A').width = 30;
    analyticsSheet.getColumn('B').width = 20;
    analyticsSheet.getColumn('C').width = 20;
    
    // Freeze header row
    analyticsSheet.views = [{ state: "frozen", ySplit: 3 }];

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
    const isCreator = quotation.createdBy && quotation.createdBy._id?.toString() === req.user.id;

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
    const isCreator = quotation.createdBy && quotation.createdBy._id?.toString() === req.user.id;

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
    const isCreator = quotation.createdBy && quotation.createdBy._id?.toString() === req.user.id;

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

    const isCreator = quotation.createdBy && quotation.createdBy._id?.toString() === req.user.id;
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

    const isCreator = quotation.createdBy && quotation.createdBy._id?.toString() === req.user.id;
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
    const isCreator = quotation.createdBy && quotation.createdBy._id?.toString() === req.user.id;

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
    const expiresIn = Math.min(parseInt(req.query.expiresIn) || 3600, 3600);

    if (!key) {
      return res.status(400).json({ success: false, message: 'S3 key is required' });
    }

    const signedUrl = await getSignedFileUrl(key, expiresIn);

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
    const expiresIn = Math.min(parseInt(req.query.expiresIn) || 3600, 3600);

    if (!keys || !Array.isArray(keys) || keys.length > 20) {
      return res.status(400).json({ success: false, message: 'Maximum 20 keys per batch' });
    }

    const urls = {};

    for (const key of keys) {
      if (key) {
        const signedUrl = await getSignedFileUrl(key, expiresIn);
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