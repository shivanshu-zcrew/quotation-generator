const mongoose = require("mongoose");
const { Quotation, ExchangeRateService, Company } = require('../models/quotation');
const { Customer } = require('../models/customer');
const Item = require('../models/items');
const puppeteer = require('puppeteer');
const mime = require('mime-types')
const { uploadToCloudinary, deleteFromCloudinary } = require('../utils/uploadCloudnary');
const zohoBooksService = require('../zoho/customerServices');
const { CURRENCY_OPTIONS } = require('../models/constants'); 
const imageCompressor = require('../utils/imageCompressor');

// ─────────────────────────────────────────────────────────────
// Shared Puppeteer browser — one instance, auto-reconnect
// ─────────────────────────────────────────────────────────────
let _browser = null;

// const getBrowser = async () => {
//   if (_browser?.isConnected()) return _browser;

//   _browser = await puppeteer.launch({
//     headless: 'new',
//     executablePath: process.env.NODE_ENV === 'production'
//       ? (process.env.CHROMIUM_PATH || '/usr/bin/chromium-browser')
//       : undefined,
//     args: [
//       '--no-sandbox',
//       '--disable-setuid-sandbox',
//       '--disable-dev-shm-usage',
//       '--disable-gpu',
//     ],
//   });

//   _browser.on('disconnected', () => { _browser = null; });
//   return _browser;
// };
 
// ─────────────────────────────────────────────────────────────
// Health check endpoint for PDF service
// ─────────────────────────────────────────────────────────────
exports.getPDFMetrics = async (req, res) => {
  const metrics = browserPool.getMetrics();
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

  _browser = await puppeteer.launch({
    headless: true,
    executablePath: process.env.CHROMIUM_PATH || '/usr/bin/google-chrome',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--no-zygote',
      '--single-process',
    ],
  });

  // _browser = await puppeteer.launch({
  //   headless: true,
  //   args: [
  //     '--no-sandbox',
  //     '--disable-setuid-sandbox',
  //     '--disable-dev-shm-usage',
  //     '--disable-gpu',
  //   ],
  // });

  _browser.on('disconnected', () => { _browser = null; });
  return _browser;
};


// ─────────────────────────────────────────────────────────────
// Cloudinary helpers
// ─────────────────────────────────────────────────────────────
const uploadBase64ToCloudinary = async (dataUri, folder) => {
  // FIX: Allow any data: URI, not just images
  if (!dataUri?.startsWith('data:')) return null;
  const matches = dataUri.match(/^data:([^;]+);base64,(.*)$/s);
  if (!matches) return null;
  
  const mimeType = matches[1];
  const base64Data = matches[2];
  const buffer = Buffer.from(base64Data, 'base64');
  
  // Determine resource type from mime
  let resourceType = 'raw';
  if (mimeType.startsWith('image/')) resourceType = 'image';
  else if (mimeType.startsWith('video/')) resourceType = 'video';
  
  const result = await uploadToCloudinary(buffer, folder, resourceType);
  return { url: result.secure_url, publicId: result.public_id };
};

const safeDelete = (publicId) =>
  publicId
    ? deleteFromCloudinary(publicId).catch((e) =>
        console.warn(`[Cloudinary] delete failed for ${publicId}: ${e.message}`)
      )
    : Promise.resolve();

/**
 * Determine Cloudinary resource type from MIME type
 */
const getResourceTypeFromMime = (mimeType) => {
  if (!mimeType) return 'raw';
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'video';
  return 'raw';
};

/**
 * Get file info from base64 string
 */
const getFileInfoFromBase64 = (base64String) => {
  const matches = base64String.match(/^data:([^;]+);base64,(.*)$/s);
  if (!matches) throw new Error('Invalid base64 data');
  
  const mimeType = matches[1];
  const base64Data = matches[2];
  const buffer = Buffer.from(base64Data, 'base64');
  
  // Generate filename with proper extension
  const ext = mime.extension(mimeType) || 'bin';
  const fileName = `document-${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`;
  
  return {
    mimeType,
    buffer,
    size: buffer.length,
    fileName
  };
};

/**
 * Upload internal document to Cloudinary (from base64)
 */
 
const uploadInternalDocumentFromBase64 = async (base64String, quotationNumber, userId, description = '') => {
  try {
    const fileInfo = getFileInfoFromBase64(base64String);
    
     let resourceType = 'auto';
    if (fileInfo.mimeType.startsWith('image/')) {
      resourceType = 'image';
    } else if (fileInfo.mimeType.startsWith('video/')) {
      resourceType = 'video';
    } else {
      resourceType = 'raw';  
    }
    
     const folder = `quotations/${quotationNumber}/internal-docs`;
    
     const result = await uploadToCloudinary(
      fileInfo.buffer, 
      folder, 
      resourceType,
      { 
        access_mode: 'public',
        use_filename: true,
        unique_filename: true 
      }
    );
    
     
    
    return {
      fileName: fileInfo.fileName,
      fileType: fileInfo.mimeType,
      fileSize: fileInfo.size,
      fileUrl: result.secure_url,
      publicId: result.public_id,
      uploadedBy: userId,
      uploadedAt: new Date(),
      description: description,
      isInternalOnly: true
    };
    
  } catch (error) {
     
    throw error;
  }
};

/**
 * Upload multiple internal documents from base64 array
 */
const uploadMultipleInternalDocumentsFromBase64 = async (base64Array, quotationNumber, userId, descriptions = []) => {
  if (!Array.isArray(base64Array)) base64Array = [base64Array];
  
  const uploadPromises = base64Array.map(async (base64String, index) => {
    try {
      const description = descriptions[index] || '';
      return await uploadInternalDocumentFromBase64(
        base64String, 
        quotationNumber, 
        userId, 
        description
      );
    } catch (err) {
       
      return null;
    }
  });
  
  const results = await Promise.all(uploadPromises);
  return results.filter(Boolean);
};

/**
 * Delete internal document from Cloudinary
 */
const deleteInternalDocument = async (document) => {
  if (!document || !document.publicId) return;
  
  try {
    const resourceType = getResourceTypeFromMime(document.fileType);
    await deleteFromCloudinary(document.publicId, resourceType);
    return true;
  } catch (error) {
     
    return false;
  }
};

// ─────────────────────────────────────────────────────────────
// Item-image processor with currency conversion
// ─────────────────────────────────────────────────────────────
 

const processItemImages = async (item, itemIndex) => {
  let imagePaths = [];
  
  if (item.imagePaths && Array.isArray(item.imagePaths)) {
    const validUrls = item.imagePaths.filter(img => 
      img && typeof img === 'string' && img.includes('cloudinary.com')
    );
    imagePaths.push(...validUrls);
  }
  
  if (item.newImages && Array.isArray(item.newImages)) {
    for (let imgIdx = 0; imgIdx < item.newImages.length; imgIdx++) {
      const imageData = item.newImages[imgIdx];
      if (imageData && typeof imageData === 'string' && imageData.startsWith('data:image')) {
        try {
          const uploaded = await uploadBase64ToCloudinary(imageData, `quotations/items/item_${itemIndex + 1}`);
          if (uploaded && uploaded.url) {
            imagePaths.push(uploaded.url);
          }
        } catch (uploadError) {
          console.error(`Failed to upload image for item ${itemIndex + 1}:`, uploadError.message);
        }
      }
    }
  }
  
  return imagePaths;
};

 
// ─────────────────────────────────────────────────────────────
// Calculate totals with currency conversion
// ─────────────────────────────────────────────────────────────
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
  
   const subtotalOriginal = subtotal;
  const subtotalOriginalInBaseCurrency = subtotalInBaseCurrency;

  return {
     subtotal,
    taxAmount,
    discountAmount,
    total,
    subtotalInBaseCurrency,      
    taxAmountInBaseCurrency,     
    discountAmountInBaseCurrency, 
    totalInBaseCurrency,
    subtotalOriginal,
    subtotalOriginalInBaseCurrency,
    subtotalAfterDiscount,
    subtotalAfterDiscountInBaseCurrency
  };
};

// ─────────────────────────────────────────────────────────────
// Generate quotation number with company prefix
// ─────────────────────────────────────────────────────────────
const generateQuotationNumber = (companyCode) => {
  const prefix = companyCode || 'QT';
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return `${prefix}-${timestamp}-${random}`;
};

// ─────────────────────────────────────────────────────────────
// Pagination helpers
// ─────────────────────────────────────────────────────────────
const parsePagination = ({ page, limit }) => {
  const p = Math.max(1, parseInt(page, 10) || 1);
  const l = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  return { page: p, limit: l, skip: (p - 1) * l };
};

const paginated = (res, data, total, page, limit) =>
  res.status(200).json({
    data,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      hasNextPage: page * limit < total,
      hasPrevPage: page > 1,
    },
  });

// ─────────────────────────────────────────────────────────────
// Date validation
// ─────────────────────────────────────────────────────────────
const validateDates = (date, expiryDate) => {
  if (!expiryDate) return 'Expiry date is required';
  if (date && expiryDate && new Date(expiryDate) < new Date(date))
    return 'Expiry date cannot be before the creation date';
  return null;
};

// ─────────────────────────────────────────────────────────────
// Allowed sort fields
// ─────────────────────────────────────────────────────────────
const SORT_FIELDS = new Set([
  'createdAt', 'date', 'expiryDate', 'queryDate',
  'total', 'totalInAED', 'customer', 'status', 'quotationNumber', 'company.code'
]);

// ─────────────────────────────────────────────────────────────
// Standard populate chains
// ─────────────────────────────────────────────────────────────
const fullPopulate = (q) =>
  q
    .populate('customerId', 'name email phone address')
    .populate('items.itemId', 'name price description imagePath')
    .populate('createdBy', 'name email')
    .populate('opsApprovedBy', 'name email')
    .populate('approvedBy', 'name email')
    .populate('awardedBy', 'name email');

// =============================================================
// COMPANY CONTROLLERS
// =============================================================

/**
 * Get all companies
 * GET /api/quotations/companies
 */
exports.getCompanies = async (req, res) => {
  try {
    const companies = await Company.find({ isActive: true })
      .select('code name slug logo address phone email baseCurrency acceptedCurrencies')
      .sort({ name: 1 })
      .lean();

    res.json({
      success: true,
      companies,
      count: companies.length
    });
  } catch (err) {
     
    res.status(500).json({ 
      success: false,
      message: 'Error fetching companies', 
      error: err.message 
    });
  }
};

/**
 * Get company by code
 * GET /api/quotations/companies/:code
 */
exports.getCompanyByCode = async (req, res) => {
  try {
    const { code } = req.params;
    
    const company = await Company.findOne({ 
      code: code.toUpperCase(),
      isActive: true 
    }).lean();

    if (!company) {
      return res.status(404).json({ 
        success: false,
        message: 'Company not found' 
      });
    }

    res.json({
      success: true,
      company
    });
  } catch (err) {
     
    res.status(500).json({ 
      success: false,
      message: 'Error fetching company', 
      error: err.message 
    });
  }
};

/**
 * Get company statistics
 * GET /api/quotations/companies/:id/stats
 */
exports.getCompanyStats = async (req, res) => {
  try {
    const { id } = req.params;
    const { from, to } = req.query;

    const company = await Company.findById(id);
    if (!company) {
      return res.status(404).json({ 
        success: false,
        message: 'Company not found' 
      });
    }

    const matchStage = { companyId: company._id };
    
    if (from || to) {
      matchStage.createdAt = {};
      if (from) matchStage.createdAt.$gte = new Date(from);
      if (to) matchStage.createdAt.$lte = new Date(to);
    }

    const [
      totalQuotations,
      totalValue,
      statusCounts,
      currencyBreakdown,
      recentQuotations
    ] = await Promise.all([
      Quotation.countDocuments(matchStage),
      
      Quotation.aggregate([
        { $match: { ...matchStage, status: { $in: ['approved', 'awarded'] } } },
        { 
          $group: { 
            _id: null, 
            total: { $sum: '$totalInBaseCurrency' } 
          } 
        }
      ]),
      
      Quotation.aggregate([
        { $match: matchStage },
        { 
          $group: { 
            _id: '$status', 
            count: { $sum: 1 } 
          } 
        }
      ]),
      
      Quotation.aggregate([
        { $match: matchStage },
        { 
          $group: { 
            _id: '$currency.code', 
            count: { $sum: 1 },
            total: { $sum: '$totalInBaseCurrency' }
          } 
        }
      ]),
      
      Quotation.find(matchStage)
        .sort({ createdAt: -1 })
        .limit(5)
        .populate('customerId', 'name')
        .populate('createdBy', 'name')
        .select('quotationNumber customerSnapshot.name total status createdAt currency.code')
        .lean()
    ]);

    const statusMap = {
      draft: 0, pending: 0, ops_approved: 0, ops_rejected: 0,
      approved: 0, rejected: 0, awarded: 0, not_awarded: 0, sent: 0
    };
    
    statusCounts.forEach(item => {
      statusMap[item._id] = item.count;
    });

    res.json({
      success: true,
      company: {
        id: company._id,
        code: company.code,
        name: company.name,
        baseCurrency: company.baseCurrency,
        logo: company.logo
      },
      stats: {
        totalQuotations,
        totalValue: totalValue[0]?.total || 0,
        statusCounts: statusMap,
        currencyBreakdown,
        recentQuotations
      }
    });

  } catch (err) {
     
    res.status(500).json({ 
      success: false,
      message: 'Error fetching company stats', 
      error: err.message 
    });
  }
};

// =============================================================
// QUOTATION CONTROLLERS
// =============================================================

// ─────────────────────────────────────────────────────────────
// GET ALL QUOTATIONS (admin) with company filter
// ─────────────────────────────────────────────────────────────
exports.getAllQuotations = async (req, res) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);

    const filter = {};
    
    if (req.query.companyId) {
      filter.companyId = req.query.companyId;
    }
    
    if (req.query.status) {
      filter.status = req.query.status;
    }
    
    if (req.query.customerId) {
      filter.customerId = req.query.customerId;
    }
    
    if (req.query.currency) {
      filter['currency.code'] = req.query.currency;
    }
    
    if (req.query.search) {
      const re = new RegExp(req.query.search.trim(), 'i');
      filter.$or = [
        { quotationNumber: re }, 
        { 'customerSnapshot.name': re }, 
        { contact: re }
      ];
    }
    
    if (req.query.from || req.query.to) {
      filter.date = {};
      if (req.query.from) filter.date.$gte = new Date(req.query.from);
      if (req.query.to) filter.date.$lte = new Date(req.query.to);
    }

    const sortField = SORT_FIELDS.has(req.query.sortBy) ? req.query.sortBy : 'createdAt';
    const sortDir = req.query.sortDir === 'asc' ? 1 : -1;

    const [data, total] = await Promise.all([
      fullPopulate(
        Quotation.find(filter)
          .sort({ [sortField]: sortDir })
          .skip(skip)
          .limit(limit)
      ).lean(),
      Quotation.countDocuments(filter),
    ]);

    return paginated(res, data, total, page, limit);
  } catch (err) {
     
    res.status(500).json({ message: 'Error fetching quotations', error: err.message });
  }
};

// ─────────────────────────────────────────────────────────────
// GET MY QUOTATIONS (logged-in user) with company filter
// ─────────────────────────────────────────────────────────────
exports.getMyQuotations = async (req, res) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);

    const filter = { createdBy: req.user.id };
    
    if (req.query.companyId) {
      filter.companyId = req.query.companyId;
    }
    
    if (req.query.status) filter.status = req.query.status;
    
    if (req.query.search) {
      const re = new RegExp(req.query.search.trim(), 'i');
      filter.$or = [
        { quotationNumber: re }, 
        { 'customerSnapshot.name': re }
      ];
    }

    const sortField = SORT_FIELDS.has(req.query.sortBy) ? req.query.sortBy : 'createdAt';
    const sortDir = req.query.sortDir === 'asc' ? 1 : -1;

    const [data, total] = await Promise.all([
      fullPopulate(
        Quotation.find(filter)
          .sort({ [sortField]: sortDir })
          .skip(skip)
          .limit(limit)
      ).lean(),
      Quotation.countDocuments(filter),
    ]);

    return paginated(res, data, total, page, limit);
  } catch (err) {
     
    res.status(500).json({ message: 'Error fetching your quotations', error: err.message });
  }
};

// ─────────────────────────────────────────────────────────────
// GET SINGLE QUOTATION
// ─────────────────────────────────────────────────────────────

exports.getQuotation = async (req, res) => {
  try {
    const companyId = req.companyId || req.headers['x-company-id'] || req.query.companyId;
    
    if (!companyId) {
      return res.status(400).json({ message: 'Company ID is required' });
    }
    
    const quotation = await fullPopulate(
      Quotation.findOne({ _id: req.params.id, companyId })
    ).lean();

    if (!quotation)
      return res.status(404).json({ message: 'Quotation not found' });

    const isAdmin = req.user.role === 'admin';
    const isOps = req.user.role === 'ops_manager';
    const isCreator = quotation.createdBy._id.toString() === req.user.id;

    if (!isAdmin && !isOps && !isCreator)
      return res.status(403).json({ message: 'Not authorized to view this quotation' });

    res.status(200).json(quotation);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching quotation', error: err.message });
  }
};

// ─────────────────────────────────────────────────────────────
// CREATE QUOTATION - UPDATED to handle base64 documents
// ─────────────────────────────────────────────────────────────
exports.createQuotation = async (req, res) => {
  const {
    projectName,
    companyId,
    currencyCode,
    customerId, customer, contact, customerCountry,
    date, expiryDate, queryDate, tl, trn,
    ourRef, ourContact, salesManagerEmail, paymentTerms, deliveryTerms,
    items, taxPercent, discountPercent, notes,
    quotationImages, termsAndConditions, termsImages,
    internalDocuments,
    internalDocDescriptions
  } = req.body;

  // ============================================================
  // ✅ STEP 1: COMPRESS ALL IMAGES BEFORE PROCESSING
  // ============================================================
   
  // Compress quotation images (item images)
  let compressedQuotationImages = quotationImages;
  if (quotationImages && Object.keys(quotationImages).length > 0) {
     compressedQuotationImages = await imageCompressor.compressQuotationImages(quotationImages, {
      maxWidth: 800,
      quality: 70,
      maxSizeKB: 300
    });
  }
  
  // Compress terms images
  let compressedTermsImages = termsImages;
  if (termsImages && termsImages.length > 0) {
     compressedTermsImages = await imageCompressor.compressTermsImages(termsImages, {
      maxWidth: 600,
      quality: 65,
      maxSizeKB: 200
    });
  }
  
  // Compress internal documents that are images
  let compressedInternalDocuments = internalDocuments;
  if (internalDocuments && internalDocuments.length > 0) {
     compressedInternalDocuments = await imageCompressor.compressInternalDocuments(internalDocuments, {
      maxWidth: 1000,
      quality: 75,
      maxSizeKB: 400
    });
  }
  
  // console.log("📸 Compressed payload size estimate:", JSON.stringify({
  //   ...req.body,
  //   quotationImages: compressedQuotationImages,
  //   termsImages: compressedTermsImages,
  //   internalDocuments: compressedInternalDocuments
  // }).length, "chars");
  // ============================================================
 

  if (!projectName) {
    return res.status(400).json({ message: 'Project Name is required' });
  }
  if (!companyId) {
    return res.status(400).json({ message: 'Company selection is required' });
  }

  const company = await Company.findById(companyId);
  if (!company) {
    return res.status(400).json({ message: 'Invalid company selected' });
  }

  const customerDoc = await Customer.findOne({ _id: customerId, companyId: company._id }).lean();
  if (!customerDoc) {
    return res.status(404).json({ message: 'Customer not found for this company' });
  }

  const validatedItems = [];
  for (const item of items) {
    let itemDoc = null;
    
    if (mongoose.Types.ObjectId.isValid(item.itemId)) {
      itemDoc = await Item.findOne({ _id: item.itemId, companyId: company._id }).lean();
    }
    
    if (!itemDoc && item.zohoId) {
      itemDoc = await Item.findOne({ zohoId: item.zohoId, companyId: company._id }).lean();
    }
    
    if (!itemDoc && item.itemId) {
      itemDoc = await Item.findOne({ zohoId: item.itemId, companyId: company._id }).lean();
    }
    
    if (!itemDoc) {
      return res.status(404).json({ 
        message: `Item not found: ${item.name || item.itemId || item.zohoId}`
      });
    }
    
    validatedItems.push({ ...item, itemDoc });
  }

  let exchangeRate = 1;
  const targetCurrency = currencyCode || company.baseCurrency;
  
  try {
    const rates = await ExchangeRateService.getRates(company.baseCurrency);
    exchangeRate = rates[targetCurrency] || 1;
  } catch (rateError) {
    console.error('Error getting exchange rates:', rateError.message);
  }

   const processedItems = [];
  
  for (let i = 0; i < validatedItems.length; i++) {
    const item = validatedItems[i];
    const itemDoc = item.itemDoc;
    
    let imageUrls = [];
    
     if (compressedQuotationImages && compressedQuotationImages[i] && Array.isArray(compressedQuotationImages[i])) {
       
      for (let imgIdx = 0; imgIdx < compressedQuotationImages[i].length; imgIdx++) {
        const imageData = compressedQuotationImages[i][imgIdx];
        
        if (imageData && typeof imageData === 'string') {
           if (imageData.startsWith('data:image')) {
            try {
              console.log(`📤 Uploading compressed image ${imgIdx + 1} for item ${i + 1}...`);
              const uploaded = await uploadBase64ToCloudinary(imageData, `quotations/items/item_${i + 1}`);
              if (uploaded && uploaded.url) {
                imageUrls.push(uploaded.url);
               }
            } catch (err) {
              console.error(`❌ Upload failed:`, err.message);
            }
          }
           else if (imageData.includes('cloudinary.com')) {
            imageUrls.push(imageData);
            console.log(`📎 Keeping existing Cloudinary URL`);
          }
        }
      }
    }
    
     if (item.images && Array.isArray(item.images)) {
      for (const img of item.images) {
        if (img && typeof img === 'string' && img.startsWith('data:image')) {
          try {
            const uploaded = await uploadBase64ToCloudinary(img, `quotations/items/item_${i + 1}`);
            if (uploaded && uploaded.url && !imageUrls.includes(uploaded.url)) {
              imageUrls.push(uploaded.url);
            }
          } catch (err) {
            console.error(`Upload failed:`, err.message);
          }
        } else if (img && typeof img === 'string' && img.includes('cloudinary.com') && !imageUrls.includes(img)) {
          imageUrls.push(img);
        }
      }
    }
    
     imageUrls = [...new Set(imageUrls)];
    
    console.log(`📸 Item ${i + 1}: Final ${imageUrls.length} images stored`);
    
    const unitPriceInBaseCurrency = item.unitPrice * exchangeRate;
    const totalPrice = item.quantity * item.unitPrice;
    const totalPriceInBaseCurrency = totalPrice * exchangeRate;
    
    processedItems.push({
      itemId: itemDoc._id,
      zohoItemId: itemDoc.zohoId,
      name: itemDoc.name,
      description: item.description || '',
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      unitPriceInBaseCurrency,
      totalPrice,
      totalPriceInBaseCurrency,
      imagePaths: imageUrls,
      imagePublicIds: []
    });
  }
  
  const tax = parseFloat(taxPercent) || 0;
  const discount = parseFloat(discountPercent) || 0;
  const totals = calculateTotals(processedItems, tax, discount, exchangeRate);

   let processedTermsImages = [];
  if (compressedTermsImages && compressedTermsImages.length > 0) {
    console.log(`📸 Processing ${compressedTermsImages.length} compressed terms images`);
    
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
           const uploaded = await uploadBase64ToCloudinary(imageBase64, 'quotations/terms');
          if (uploaded && uploaded.url) {
            processedTermsImages.push({
              url: uploaded.url,
              publicId: uploaded.publicId,
              fileName: fileName,
              uploadedAt: new Date()
            });
           }
        } catch (uploadError) {
          console.error('Failed to upload terms image:', uploadError.message);
        }
      }
       else if (typeof imageData === 'object' && imageData.url && imageData.url.includes('cloudinary.com')) {
        processedTermsImages.push(imageData);
      }
       else if (typeof imageData === 'string' && imageData.includes('cloudinary.com')) {
        processedTermsImages.push({
          url: imageData,
          publicId: imageData.split('/').pop().split('.')[0],
          fileName: fileName,
          uploadedAt: new Date()
        });
      }
    }
  }

  const quotationNumber = generateQuotationNumber(company.code);

   let processedInternalDocs = [];
  if (compressedInternalDocuments && compressedInternalDocuments.length > 0) {
    console.log(`📸 Processing ${compressedInternalDocuments.length} compressed internal documents`);
    processedInternalDocs = await uploadMultipleInternalDocumentsFromBase64(
      compressedInternalDocuments,
      quotationNumber,
      req.user.id,
      internalDocDescriptions || []
    );
  }

  const quotation = new Quotation({
    quotationNumber,
    projectName: projectName?.trim() || '',
    companyId: company._id,
    companySnapshot: {
      code: company.code,
      name: company.name,
      address: typeof company.address === 'string' 
        ? company.address 
        : `${company.address?.street || ''}, ${company.address?.city || ''}, ${company.address?.country || 'UAE'}`,
      phone: company.phone,
      email: company.email,
      vatNumber: company.vatNumber,
      crNumber: company.crNumber,
      logo: company.logo,
      zohoOrganizationId: company.zohoOrganizationId,
      bankDetails: company.bankDetails
    },
    currency: {
      code: targetCurrency,
      symbol: CURRENCY_OPTIONS[targetCurrency]?.symbol || targetCurrency,
      name: CURRENCY_OPTIONS[targetCurrency]?.name || targetCurrency,
      decimalPlaces: CURRENCY_OPTIONS[targetCurrency]?.decimalPlaces || 2,
      exchangeRate: {
        rate: exchangeRate,
        baseCurrency: company.baseCurrency,
        fetchedAt: new Date()
      }
    },
    customerId,
    customerSnapshot: {
      name: customer.trim(),
      email: customerDoc.email,
      phone: customerDoc.phone,
      address: customerDoc.address,
      country: customerCountry || 'UAE',
      vatNumber: customerDoc.vatNumber,
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
    salesManagerEmail: salesManagerEmail?.trim() || '',
    paymentTerms: paymentTerms?.trim() || '',
    deliveryTerms: deliveryTerms?.trim() || '',
    tl: tl?.trim() || '',
    trn: trn?.trim() || '',
    items: processedItems,
    taxPercent: tax,
    discountPercent: discount,
    ...totals,
    notes: notes?.trim() || '',
    termsAndConditions: termsAndConditions?.trim() || '',
    termsImages: processedTermsImages,
    internalDocuments: processedInternalDocs,
    createdBy: req.user.id,
    createdBySnapshot: {
      name: req.user.name,
      email: req.user.email
    },
    status: 'pending',
  });

  await quotation.save();
  const populated = await fullPopulate(Quotation.findById(quotation._id)).lean();
  
   const originalSize = JSON.stringify(req.body).length;
  const compressedSize = JSON.stringify({
    ...req.body,
    quotationImages: compressedQuotationImages,
    termsImages: compressedTermsImages,
    internalDocuments: compressedInternalDocuments
  }).length;
  const reduction = ((1 - compressedSize / originalSize) * 100).toFixed(1);
  
 
  res.status(201).json({
    success: true,
    message: 'Quotation created successfully',
    quotation: populated,
    stats: {
      itemsCount: processedItems.length,
      imagesUploaded: processedItems.reduce((sum, i) => sum + i.imagePaths.length, 0),
      termsImagesUploaded: processedTermsImages.length,
      compression: {
        originalSizeMB: (originalSize / 1024 / 1024).toFixed(2),
        compressedSizeMB: (compressedSize / 1024 / 1024).toFixed(2),
        reductionPercent: reduction
      }
    }
  });
};

// ─────────────────────────────────────────────────────────────
// UPDATE QUOTATION (with document support)
// ─────────────────────────────────────────────────────────────

 
exports.updateQuotation = async (req, res) => {
  const { id } = req.params;
  const companyId = req.companyId || req.headers['x-company-id'];
  const {
    projectName,
    currencyCode,
    customerId, customer, contact, customerCountry,
    date, expiryDate, queryDate,
    ourRef, ourContact, salesManagerEmail, paymentTerms, deliveryTerms,
    tl, trn,
    items, taxPercent, discountPercent, notes,
    quotationImages,
    termsAndConditions, termsImages,
    internalDocuments,
    internalDocDescriptions
  } = req.body;

  // ============================================================
  // ✅ STEP 1: COMPRESS ALL IMAGES BEFORE PROCESSING
  // ============================================================

   
  
   let compressedQuotationImages = quotationImages;
  if (quotationImages && Object.keys(quotationImages).length > 0) {
     compressedQuotationImages = await imageCompressor.compressQuotationImages(quotationImages, {
      maxWidth: 800,
      quality: 70,
      maxSizeKB: 300
    });
  }
  
   let compressedTermsImages = termsImages;
  if (termsImages && termsImages.length > 0) {
     compressedTermsImages = await imageCompressor.compressTermsImages(termsImages, {
      maxWidth: 600,
      quality: 65,
      maxSizeKB: 200
    });
  }
  
   let compressedInternalDocuments = internalDocuments;
  if (internalDocuments && internalDocuments.length > 0) {
     compressedInternalDocuments = await imageCompressor.compressInternalDocuments(internalDocuments, {
      maxWidth: 1000,
      quality: 75,
      maxSizeKB: 400
    });
  }
  
  const compressedPayloadSize = JSON.stringify({
    ...req.body,
    quotationImages: compressedQuotationImages,
    termsImages: compressedTermsImages,
    internalDocuments: compressedInternalDocuments
  }).length;
  
 
  if (!companyId) {
    return res.status(400).json({ message: 'Company ID is required' });
  }

  if (!items?.length) {
    return res.status(400).json({ message: 'At least one item is required' });
  }

  const dateErr = validateDates(date, expiryDate);
  if (dateErr) return res.status(400).json({ message: dateErr });

  try {
    const existing = await Quotation.findOne({ _id: id, companyId });
    if (!existing) {
      return res.status(404).json({ message: 'Quotation not found' });
    }

    const isAdmin = req.user?.role === 'admin';
    let isCreator = false;
    if (existing.createdBy) {
      const creatorId = existing.createdBy._id || existing.createdBy;
      isCreator = creatorId.toString() === req.user?.id;
    }

    if (!isAdmin && !isCreator) {
      return res.status(403).json({ message: 'Not authorized to update this quotation' });
    }

    if (!isAdmin && !['pending', 'ops_rejected'].includes(existing.status)) {
      return res.status(400).json({ 
        message: `Cannot update a quotation with status: ${existing.status}` 
      });
    }

    const company = await Company.findById(companyId);
    if (!company) {
      return res.status(404).json({ message: 'Company not found' });
    }

    let exchangeRate = existing.currency?.exchangeRate?.rate || 1;
    if (currencyCode && currencyCode !== existing.currency?.code) {
      const rates = await ExchangeRateService.getRates(company.baseCurrency || 'AED');
      exchangeRate = rates[currencyCode] || 1;
    }

    let customerTaxTreatment = existing.customerTaxTreatment || 'non_vat_registered';
    let customerPlaceOfSupply = existing.customerPlaceOfSupply || 'Dubai';
    let customerSnapshotTaxTreatment = existing.customerSnapshot?.taxTreatment || 'non_vat_registered';
    let customerSnapshotPlaceOfSupply = existing.customerSnapshot?.placeOfSupply || 'Dubai';
    
    if (customerId && customerId !== existing.customerId?.toString()) {
      const customerDoc = await Customer.findById(customerId).lean();
      if (customerDoc) {
        customerTaxTreatment = customerDoc.taxTreatment || 'non_vat_registered';
        customerPlaceOfSupply = customerDoc.placeOfSupply || 'Dubai';
        customerSnapshotTaxTreatment = customerDoc.taxTreatment || 'non_vat_registered';
        customerSnapshotPlaceOfSupply = customerDoc.placeOfSupply || 'Dubai';
      }
    }

     const processedItems = [];
    
    for (let idx = 0; idx < items.length; idx++) {
      const item = items[idx];
      if (!item) continue;
      
      let itemDoc = null;
      
      if (item.itemId) {
        if (mongoose.Types.ObjectId.isValid(item.itemId)) {
          itemDoc = await Item.findOne({ _id: item.itemId, companyId: company._id }).lean();
        }
        if (!itemDoc) {
          itemDoc = await Item.findOne({ zohoId: item.itemId, companyId: company._id }).lean();
        }
      }
      
      if (!itemDoc && existing.items && existing.items[idx]) {
        itemDoc = existing.items[idx].itemId;
      }
      
      const quantity = Number(item.quantity) || 1;
      const unitPrice = Number(item.unitPrice) || 0;
      const totalPrice = quantity * unitPrice;
      const totalPriceInBaseCurrency = totalPrice * exchangeRate;
      const unitPriceInBaseCurrency = unitPrice * exchangeRate;
      
      let imagePaths = [];
      
       if (compressedQuotationImages && compressedQuotationImages[idx] && Array.isArray(compressedQuotationImages[idx])) {
         
        for (let imgIdx = 0; imgIdx < compressedQuotationImages[idx].length; imgIdx++) {
          const imageData = compressedQuotationImages[idx][imgIdx];
          
          if (imageData && typeof imageData === 'string') {
             if (imageData.startsWith('data:image')) {
              try {
                 const uploaded = await uploadBase64ToCloudinary(imageData, `quotations/items/item_${idx + 1}`);
                if (uploaded && uploaded.url) {
                  imagePaths.push(uploaded.url);
                 }
              } catch (err) {
                console.error(`❌ Upload failed:`, err.message);
              }
            }
             else if (imageData.includes('cloudinary.com')) {
              imagePaths.push(imageData);
             }
          }
        }
      }
       
      if (item.imagePaths && Array.isArray(item.imagePaths)) {
        for (const img of item.imagePaths) {
          if (img && typeof img === 'string' && img.includes('cloudinary.com') && !imagePaths.includes(img)) {
            imagePaths.push(img);
          }
        }
      }
       
      imagePaths = [...new Set(imagePaths)];
      
       
      processedItems.push({
        itemId: itemDoc?._id || item.itemId,
        zohoItemId: itemDoc?.zohoId || item.zohoId || null,
        name: itemDoc?.name || item.name || '',
        description: item.description || itemDoc?.description || '',
        quantity: quantity,
        unitPrice: unitPrice,
        unitPriceInBaseCurrency: unitPriceInBaseCurrency,
        totalPrice: totalPrice,
        totalPriceInBaseCurrency: totalPriceInBaseCurrency,
        imagePaths: imagePaths,
        imagePublicIds: []
      });
    }

    const tax = taxPercent !== undefined ? parseFloat(taxPercent) : (existing.taxPercent || 0);
    const discount = discountPercent !== undefined ? parseFloat(discountPercent) : (existing.discountPercent || 0);
    
    const subtotal = processedItems.reduce((sum, item) => sum + (item.totalPrice || 0), 0);
    const taxAmount = (subtotal * tax) / 100;
    const discountAmount = (subtotal * discount) / 100;
    const total = subtotal + taxAmount - discountAmount;
    
    const subtotalInBaseCurrency = processedItems.reduce((sum, item) => sum + (item.totalPriceInBaseCurrency || 0), 0);
    const taxAmountInBaseCurrency = (subtotalInBaseCurrency * tax) / 100;
    const discountAmountInBaseCurrency = (subtotalInBaseCurrency * discount) / 100;
    const totalInBaseCurrency = subtotalInBaseCurrency + taxAmountInBaseCurrency - discountAmountInBaseCurrency;

     let processedTermsImages = existing.termsImages || [];
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
             const uploaded = await uploadBase64ToCloudinary(imageBase64, 'quotations/terms');
            if (uploaded && uploaded.url) {
              processedTermsImages.push({
                url: uploaded.url,
                publicId: uploaded.publicId,
                fileName: fileName,
                uploadedAt: new Date()
              });
             }
          } catch (uploadError) {
            console.error('Failed to upload terms image:', uploadError.message);
          }
        } else if (typeof imageData === 'object' && imageData.url && imageData.url.includes('cloudinary.com')) {
          const exists = processedTermsImages.some(img => img.url === imageData.url);
          if (!exists) {
            processedTermsImages.push(imageData);
          }
        } else if (typeof imageData === 'string' && imageData.includes('cloudinary.com')) {
          const exists = processedTermsImages.some(img => img.url === imageData);
          if (!exists) {
            processedTermsImages.push({
              url: imageData,
              publicId: imageData.split('/').pop().split('.')[0],
              fileName: fileName,
              uploadedAt: new Date()
            });
          }
        }
      }
    }

     let newInternalDocs = [];
    if (compressedInternalDocuments && compressedInternalDocuments.length > 0) {
      const validBase64Strings = compressedInternalDocuments.filter(doc => typeof doc === 'string' && doc.startsWith('data:'));
      if (validBase64Strings.length > 0) {
         newInternalDocs = await uploadMultipleInternalDocumentsFromBase64(
          validBase64Strings,
          existing.quotationNumber,
          req.user.id,
          internalDocDescriptions || []
        );
      }
    }

    const newStatus = (!isAdmin && existing.status === 'ops_rejected') ? 'pending' : existing.status;

    const updateData = {
      ...(customerId && { customerId }),
      ...(projectName !== undefined && { projectName: projectName?.trim() || '' }),
      ...(customer && { 
        'customerSnapshot.name': customer.trim(),
        customer: customer.trim() 
      }),
      ...(contact !== undefined && { contact: contact?.trim() || '' }),
      ...(customerCountry && { 'customerSnapshot.country': customerCountry }),
      ...(customerId && {
        'customerSnapshot.taxTreatment': customerSnapshotTaxTreatment,
        'customerSnapshot.placeOfSupply': customerSnapshotPlaceOfSupply,
        customerTaxTreatment: customerTaxTreatment,
        customerPlaceOfSupply: customerPlaceOfSupply
      }),
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
      items: processedItems,
      taxPercent: tax,
      discountPercent: discount,
      subtotal: subtotal,
      subtotalInBaseCurrency: subtotalInBaseCurrency,
      taxAmount: taxAmount,
      taxAmountInBaseCurrency: taxAmountInBaseCurrency,
      discountAmount: discountAmount,
      discountAmountInBaseCurrency: discountAmountInBaseCurrency,
      total: total,
      totalInBaseCurrency: totalInBaseCurrency,
      ...(notes !== undefined && { notes: notes?.trim() || '' }),
      ...(termsAndConditions !== undefined && { termsAndConditions: termsAndConditions?.trim() || '' }),
      termsImages: processedTermsImages,
      internalDocuments: [...(existing.internalDocuments || []), ...newInternalDocs],
      status: newStatus,
    };

    if (currencyCode && currencyCode !== existing.currency?.code) {
      updateData['currency.code'] = currencyCode;
      updateData['currency.symbol'] = CURRENCY_OPTIONS[currencyCode]?.symbol || currencyCode;
      updateData['currency.name'] = CURRENCY_OPTIONS[currencyCode]?.name || currencyCode;
      updateData['currency.exchangeRate.rate'] = exchangeRate;
      updateData['currency.exchangeRate.fetchedAt'] = new Date();
    }

    if (newStatus === 'pending' && existing.status === 'ops_rejected') {
      updateData.opsRejectionReason = '';
    }

    const updated = await Quotation.findByIdAndUpdate(id, updateData, { new: true, runValidators: true });

    if (!updated) {
      return res.status(404).json({ message: 'Quotation not found after update' });
    }

    const populated = await Quotation.findById(updated._id)
      .populate('customerId', 'name email phone address taxTreatment placeOfSupply')
      .populate('createdBy', 'name email')
      .populate('opsApprovedBy', 'name email')
      .populate('approvedBy', 'name email')
      .populate('awardedBy', 'name email')
      .populate('companyId', 'name code baseCurrency logo')
      .lean();
    
     const originalSize = JSON.stringify(req.body).length;
    const compressedSize = compressedPayloadSize;
    const reduction = ((1 - compressedSize / originalSize) * 100).toFixed(1);
     
    res.status(200).json({
      success: true,
      message: 'Quotation updated successfully',
      quotation: populated,
      stats: {
        itemsCount: processedItems.length,
        imagesCount: processedItems.reduce((sum, i) => sum + i.imagePaths.length, 0),
        termsImagesCount: processedTermsImages.length,
        compression: {
          originalSizeMB: (originalSize / 1024 / 1024).toFixed(2),
          compressedSizeMB: (compressedSize / 1024 / 1024).toFixed(2),
          reductionPercent: reduction
        }
      }
    });

  } catch (err) {
     res.status(500).json({ 
      success: false,
      message: 'Error updating quotation', 
      error: err.message 
    });
  }
};

// ─────────────────────────────────────────────────────────────
// UPDATE QUERY DATE
// ─────────────────────────────────────────────────────────────
exports.updateQueryDate = async (req, res) => {
  try {
    const { queryDate } = req.body;
    const companyId = req.companyId || req.headers['x-company-id'];
    
    if (!companyId) {
      return res.status(400).json({ 
        success: false,
        message: 'Company ID is required' 
      });
    }

    const quotation = await Quotation.findOne({ 
      _id: req.params.id, 
      companyId 
    });
    
    if (!quotation) {
      return res.status(404).json({ 
        success: false,
        message: 'Quotation not found for this company' 
      });
    }

    const isCreator = quotation.createdBy._id.toString() === req.user.id;
    const isAdmin = req.user.role === 'admin';

    if (!isCreator && !isAdmin) {
      return res.status(403).json({ 
        success: false,
        message: 'Not authorized' 
      });
    }

    quotation.queryDate = queryDate ? new Date(queryDate) : null;
    await quotation.save();

    res.status(200).json({ 
      success: true,
      message: 'Query date updated', 
      queryDate: quotation.queryDate 
    });
  } catch (err) {
    console.error('Error updating query date:', err);
    res.status(500).json({ 
      success: false,
      message: 'Error updating query date', 
      error: err.message 
    });
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
    
    if (!companyId) {
      return res.status(400).json({ 
        success: false,
        message: 'Company ID is required' 
      });
    }

    if (typeof awarded !== 'boolean') {
      return res.status(400).json({ 
        success: false,
        message: '`awarded` (boolean) is required' 
      });
    }

    // STEP 1: Fetch quotation with company filter
    const quotation = await Quotation.findOne({ _id: quotationId, companyId })
      .populate('companyId')
      .populate('createdBy', 'name email');
    
    if (!quotation) {
      return res.status(404).json({ 
        success: false,
        message: 'Quotation not found for this company' 
      });
    }
    
    // STEP 2: Fetch customer with company filter
    const customer = await Customer.findOne({ 
      _id: quotation.customerId, 
      companyId 
    }).lean();
    
    if (!customer) {
      console.warn('⚠️ Customer not found for this company');
      return res.status(404).json({ 
        success: false,
        message: 'Customer not found for this company' 
      });
    }

    // STEP 3: Check permissions
    if (quotation.createdBy._id.toString() !== req.user.id) {
      return res.status(403).json({ 
        success: false,
        message: 'Only the creator can mark this quotation as awarded' 
      });
    }

    if (quotation.status !== 'approved') {
      return res.status(400).json({
        success: false,
        message: `Only admin-approved quotations can be awarded. Current status: ${quotation.status}`,
      });
    }

    // Set Zoho context for this company
    if (quotation.companyId && quotation.companyId.zohoOrganizationId) {
      zohoBooksService.setCompany(quotation.companyId._id, quotation.companyId.zohoOrganizationId);
    }

    // STEP 4: Get customer tax treatment and place of supply
    const customerTaxTreatment = customer?.taxTreatment || 'non_vat_registered';
    const customerPlaceOfSupply = customer?.placeOfSupply || 'Dubai';
    
    const UAE_EMIRATES = ['Abu Dhabi', 'Ajman', 'Dubai', 'Fujairah', 'Ras al-Khaimah', 'Sharjah', 'Umm al-Quwain'];
    const GCC_COUNTRIES = ['Saudi Arabia', 'Kuwait', 'Qatar', 'Bahrain', 'Oman'];
    
    const isPlaceOfSupplyUAE = UAE_EMIRATES.includes(customerPlaceOfSupply);
    const isPlaceOfSupplyGCC = GCC_COUNTRIES.includes(customerPlaceOfSupply);
    
    // ========== COMPANY-SPECIFIC TAX IDs ==========
    const companyZohoId = quotation.companyId?.zohoOrganizationId;
    console.log(">>>>>>>>>", quotation);
    let TAX_IDS = {};
     
    if (companyZohoId === '870392017') { // Mega Repairing Machinery Equipment LLC
      TAX_IDS = {
        '0%': '5723933000000089262',
        '5%': '5723933000000089256'
      };
    } else if (companyZohoId === '886656701') { // Megarme General Contracting Co LLC
      TAX_IDS = {
        '0%': '6201431000000108033',
        '5%': '6201431000000108025'
      };
    } else if (companyZohoId === '916255903') { // G T G C TECHNICAL SERVICES L.L.C
      TAX_IDS = {
        '0%': '8731317000000093294',
        '5%': '8731317000000093290'
      };
    } else {
      // Default fallback tax IDs
      TAX_IDS = {
        '0%': '8731317000000093294',
        '5%': '8731317000000093290'
      };
    }
    
    console.log(`🏢 Company Zoho ID: ${companyZohoId}`);
    console.log(`💰 Tax IDs for this company:`, TAX_IDS);
    
    // Determine tax settings based on rules
    let taxRate = 0;
    let taxId = TAX_IDS['0%'];
    let taxTreatment = 'vat_not_registered';
    let placeOfSupplyCode = 'AE';
    
    // ============================================
    // RULE 1: UAE VAT Registered (vat_registered)
    // ============================================
    if (customerTaxTreatment === 'vat_registered') {
      if (isPlaceOfSupplyUAE) {
        taxRate = quotation.taxPercent || 5;
        
        if (taxRate === 0) {
          taxId = TAX_IDS['0%'];
        } else if (taxRate === 5) {
          taxId = TAX_IDS['5%'];
        } else {
          taxId = TAX_IDS['5%'];
          taxRate = 5;
        }
        
        taxTreatment = 'vat_registered';
        
        const emirateCodeMap = {
          'Abu Dhabi': 'AB',
          'Ajman': 'AJ',
          'Dubai': 'DU',
          'Fujairah': 'FU',
          'Ras al-Khaimah': 'RA',
          'Sharjah': 'SH',
          'Umm al-Quwain': 'UM'
        };
        placeOfSupplyCode = emirateCodeMap[customerPlaceOfSupply] || 'DU';
        
      } else if (isPlaceOfSupplyGCC) {
        taxRate = 0;
        taxId = TAX_IDS['0%'];
        taxTreatment = 'vat_registered';
        
        const countryCodeMap = {
          'Saudi Arabia': 'SA',
          'Kuwait': 'KW',
          'Qatar': 'QA',
          'Bahrain': 'BH',
          'Oman': 'OM'
        };
        placeOfSupplyCode = countryCodeMap[customerPlaceOfSupply] || 'AE';
      }
    }
    
    // ============================================
    // RULE 2: GCC VAT Registered (gcc_vat_registered)
    // ============================================
    else if (customerTaxTreatment === 'gcc_vat_registered') {
      if (isPlaceOfSupplyUAE) {
        taxRate = 5;
        taxId = TAX_IDS['5%'];
        taxTreatment = 'gcc_vat_registered';
        
        const emirateCodeMap = {
          'Abu Dhabi': 'AB',
          'Ajman': 'AJ',
          'Dubai': 'DU',
          'Fujairah': 'FU',
          'Ras al-Khaimah': 'RA',
          'Sharjah': 'SH',
          'Umm al-Quwain': 'UM'
        };
        placeOfSupplyCode = emirateCodeMap[customerPlaceOfSupply] || 'DU';
        
      } else if (isPlaceOfSupplyGCC) {
        taxRate = 0;
        taxId = TAX_IDS['0%'];
        taxTreatment = 'gcc_vat_registered';
        
        const countryCodeMap = {
          'Saudi Arabia': 'SA',
          'Kuwait': 'KW',
          'Qatar': 'QA',
          'Bahrain': 'BH',
          'Oman': 'OM'
        };
        placeOfSupplyCode = countryCodeMap[customerPlaceOfSupply] || 'AE';
      }
    }
    
    // ============================================
    // RULE 3: Non-VAT Registered
    // ============================================
    else if (customerTaxTreatment === 'non_vat_registered' || customerTaxTreatment === 'gcc_non_vat_registered') {
      taxRate = 0;
      taxId = TAX_IDS['0%'];
      taxTreatment = 'vat_not_registered';
      
      if (isPlaceOfSupplyUAE) {
        const emirateCodeMap = {
          'Abu Dhabi': 'AB',
          'Ajman': 'AJ',
          'Dubai': 'DU',
          'Fujairah': 'FU',
          'Ras al-Khaimah': 'RA',
          'Sharjah': 'SH',
          'Umm al-Quwain': 'UM'
        };
        placeOfSupplyCode = emirateCodeMap[customerPlaceOfSupply] || 'DU';
      } else {
        const countryCodeMap = {
          'Saudi Arabia': 'SA',
          'Kuwait': 'KW',
          'Qatar': 'QA',
          'Bahrain': 'BH',
          'Oman': 'OM'
        };
        placeOfSupplyCode = countryCodeMap[customerPlaceOfSupply] || 'AE';
      }
    }

    console.log(`📊 Tax settings: Rate=${taxRate}%, TaxId=${taxId}, Treatment=${taxTreatment}`);

    let zohoEstimate = null;
    
    // STEP 5: If awarded, create estimate in Zoho
    if (awarded) {
      try {
        // 5.1: Get customer Zoho ID
        let customerZohoId = customer?.zohoId;
        
        if (!customerZohoId) {
          throw new Error('Customer Zoho ID not found. Please sync customer with Zoho first.');
        }
        
        // 5.2: Validate all items have zohoItemId before proceeding
        const missingZohoIds = [];
        
        for (let i = 0; i < quotation.items.length; i++) {
          const item = quotation.items[i];
          
          if (!item.zohoItemId) {
            const itemName = item.itemId?.name || `Item ${i + 1}`;
            missingZohoIds.push({
              index: i + 1,
              name: itemName,
              mongoId: item.itemId?._id
            });
          }
        }
        
        if (missingZohoIds.length > 0) {
          console.error('❌ Missing Zoho IDs for items:', missingZohoIds);
          
          return res.status(400).json({
            success: false,
            message: `Cannot create estimate in Zoho. The following items are missing Zoho IDs:`,
            missingItems: missingZohoIds.map(item => 
              `${item.name} (Item #${item.index})`
            ),
            suggestion: 'Please sync these items with Zoho first or ensure they have valid Zoho IDs.'
          });
        }
        
        // ========== DISCOUNT CONVERSION FOR VAT REGISTERED COMPANIES ==========
        // Check if we need to convert entity discount to line item discounts
        const isVatRegistered = taxRate > 0 || taxTreatment === 'vat_registered' || taxTreatment === 'gcc_vat_registered';
        const originalDiscountPercent = quotation.discountPercent || 0;
        let effectiveDiscountPercent = 0;
        let lineItemsWithDiscount = [];
        
        // 5.3: Calculate totals
        const subtotal = quotation.subtotal || 0;
        
        // Process line items with discount conversion if needed
        for (let i = 0; i < quotation.items.length; i++) {
          const item = quotation.items[i];
          const originalRate = item.unitPrice;
          let finalRate = originalRate;
          let itemDiscountPercent = 0;
          
          // Apply discount conversion for VAT registered customers
          if (isVatRegistered && originalDiscountPercent > 0) {
            // Convert entity discount to line item discount
            finalRate = Math.round((originalRate * (1 - originalDiscountPercent / 100)) * 100) / 100;
            itemDiscountPercent = 0; // No separate discount field in Zoho
            console.log(`🔄 Converted discount for item ${i + 1}: ${originalRate} → ${finalRate} (${originalDiscountPercent}% off)`);
          } else if (!isVatRegistered && originalDiscountPercent > 0) {
            // Keep entity-level discount for non-VAT registered
            effectiveDiscountPercent = originalDiscountPercent;
          }
          
          const itemTotal = item.quantity * finalRate;
          
          const lineItem = {
            item_id: item.zohoItemId,
            name: item.itemId?.name || `Item ${i + 1}`,
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
          console.log(`✅ Added line item: ${item.itemId?.name} (Rate: ${finalRate}, Qty: ${item.quantity})`);
        }
        
        // Recalculate totals after discount conversion
        const recalculatedSubtotal = lineItemsWithDiscount.reduce((sum, item) => sum + (item.rate * item.quantity), 0);
        const recalculatedTaxAmount = (recalculatedSubtotal * taxRate) / 100;
        const recalculatedDiscountAmount = isVatRegistered ? 0 : (subtotal * originalDiscountPercent / 100);
        const recalculatedGrandTotal = recalculatedSubtotal + recalculatedTaxAmount - recalculatedDiscountAmount;
        
        console.log('📊 Discount Conversion Summary:', {
          originalDiscountPercent,
          isVatRegistered,
          discountAppliedToLineItems: isVatRegistered && originalDiscountPercent > 0,
          effectiveDiscountPercent: isVatRegistered ? 0 : originalDiscountPercent,
          originalSubtotal: subtotal,
          recalculatedSubtotal,
          taxAmount: recalculatedTaxAmount,
          discountAmount: recalculatedDiscountAmount,
          grandTotal: recalculatedGrandTotal
        });
        
        // 5.4: Prepare estimate data
        const estimateData = {
          customer_id: customerZohoId,
          reference_number: quotation.quotationNumber,
          date: new Date(quotation.date).toISOString().split('T')[0],
          expiry_date: new Date(quotation.expiryDate).toISOString().split('T')[0],
          exchange_rate: quotation.currency?.exchangeRate?.rate || 1,
          discount: effectiveDiscountPercent, // Will be 0 for VAT registered
          is_discount_before_tax: false,
          discount_type: 'entity_level',
          is_inclusive_tax: false,
          custom_body: quotation.notes || '',
          custom_subject: `Quotation: ${quotation.quotationNumber} - ${quotation.projectName || ''}`,
          salesperson_name: quotation.ourContact || '',
          notes: quotation.notes || '',
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
        
        if (taxRate > 0) {
          estimateData.tax_id = taxId;
        }
        
        console.log('📊 Estimate data prepared:', {
          customerId: customerZohoId,
          lineItemsCount: lineItemsWithDiscount.length,
          total: recalculatedGrandTotal,
          taxRate: taxRate,
          taxId: taxId,
          taxTreatment: taxTreatment,
          discountAppliedToLineItems: isVatRegistered && originalDiscountPercent > 0,
          allItemsHaveZohoId: true
        });
        
        // 5.5: Create estimate in Zoho
        zohoEstimate = await zohoBooksService.createEstimate(estimateData);
        
        if (!zohoEstimate.success) {
          throw new Error(`Zoho estimate creation failed: ${zohoEstimate.error}`);
        }
        
        console.log('✅ Zoho estimate created:', {
          estimateId: zohoEstimate.estimateId,
          estimateNumber: zohoEstimate.estimateNumber
        });
        
        // 5.6: Update quotation with Zoho details
        quotation.zohoEstimateId = zohoEstimate.estimateId;
        quotation.zohoEstimateNumber = zohoEstimate.estimateNumber;
        quotation.zohoEstimateUrl = zohoEstimate.estimateUrl;
        quotation.zohoReferenceNumber = quotation.quotationNumber;
        quotation.zohoSyncedAt = new Date();
        
      } catch (zohoError) {
        console.error('❌ Zoho estimate creation error:', zohoError);
        
        return res.status(500).json({
          success: false,
          message: `Failed to create estimate in Zoho Books: ${zohoError.message}`,
          error: zohoError.message
        });
      }
    }
    
    // STEP 6: Update quotation status
    quotation.status = awarded ? 'awarded' : 'not_awarded';
    quotation.awardedBy = req.user.id;
    quotation.awardedAt = new Date();
    quotation.awardNote = awardNote?.trim() || '';
    
    await quotation.save();
    
    const updated = await Quotation.findOne({ _id: quotationId, companyId })
      .populate('customerId')
      .populate('companyId')
      .lean();
    
    res.status(200).json({
      success: true,
      message: awarded 
        ? 'Quotation awarded and synced to Zoho Books successfully' 
        : 'Quotation marked as not awarded',
      quotation: updated,
      zohoEstimate: zohoEstimate || null
    });
    
  } catch (err) {
    console.error('❌ Award quotation error:', err);
    
    res.status(500).json({ 
      success: false,
      message: 'Error awarding quotation', 
      error: err.message
    });
  }
};

function convertHtmlToPlainText(html) {
  if (!html) return '';
  
  // Remove HTML tags
  let text = html.replace(/<[^>]*>/g, ' ');
  
  // Decode HTML entities
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


// ─────────────────────────────────────────────────────────────
// DELETE QUOTATION  
// ─────────────────────────────────────────────────────────────
exports.deleteQuotation = async (req, res) => {
  try {
    const quotation = await Quotation.findById(req.params.id);
    if (!quotation)
      return res.status(404).json({ message: 'Quotation not found' });

    const isAdmin = req.user.role === 'admin';
    const isCreator = quotation.createdBy._id.toString() === req.user.id;

    if (!isAdmin && !isCreator)
      return res.status(403).json({ message: 'Not authorized to delete this quotation' });

    if (!isAdmin && !['pending', 'ops_rejected'].includes(quotation.status))
      return res.status(400).json({ 
        message: `Cannot delete a quotation with status: ${quotation.status}` 
      });

    const jobs = [];
    
    quotation.items?.forEach((item) =>
      item.imagePublicIds?.forEach((pid) => { if (pid) jobs.push(safeDelete(pid)); })
    );
    
    if (quotation.termsImagePublicId) jobs.push(safeDelete(quotation.termsImagePublicId));
    
    quotation.internalDocuments?.forEach((doc) => {
      if (doc.publicId) {
        const resourceType = getResourceTypeFromMime(doc.fileType);
        jobs.push(deleteFromCloudinary(doc.publicId, resourceType));
      }
    });
    
    await Promise.allSettled(jobs);

    await Quotation.findByIdAndDelete(req.params.id);
    res.status(200).json({ 
      success: true,
      message: 'Quotation deleted successfully' 
    });
  } catch (err) {
    
    res.status(500).json({ 
      success: false,
      message: 'Error deleting quotation', 
      error: err.message 
    });
  }
};

// ─────────────────────────────────────────────────────────────
// GENERATE PDF
// ─────────────────────────────────────────────────────────────

 
exports.generatePDF = async (req, res) => {
  const { html, filename = 'quotation' } = req.body;
  const startTime = Date.now();

  if (!html?.trim()) {
    return res.status(400).json({ message: 'HTML content is required' });
  }

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

    await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 20000 });

    await page.evaluate(() =>
      Promise.all(
        [...document.images]
          .filter((img) => !img.complete)
          .map((img) => new Promise((res) => { img.onload = res; img.onerror = res; }))
      )
    ).catch(() => {});

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '10mm', right: '10mm', bottom: '10mm', left: '10mm' },
    });

    await page.close();
    page = null;

    if (Buffer.from(pdfBuffer).slice(0, 5).toString() !== '%PDF-')
      throw new Error('Puppeteer returned an invalid PDF buffer');

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}.pdf"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.setHeader('Cache-Control', 'no-store');
    res.send(Buffer.isBuffer(pdfBuffer) ? pdfBuffer : Buffer.from(pdfBuffer));
    
  } catch (err) {
    if (page) await page.close().catch(() => {});
    res.status(500).json({ 
      success: false,
      message: 'Error generating PDF', 
      error: err.message 
    });
  }
};

// ─────────────────────────────────────────────────────────────
// GET DASHBOARD STATS
// ─────────────────────────────────────────────────────────────
exports.getDashboardStats = async (req, res) => {
  try {
    const { companyId } = req.query;
    const matchStage = companyId ? { companyId } : {};

    const [
      total,
      byStatus,
      byCurrency,
      byCompany,
      totalValueAgg,
      monthlyStats,
    ] = await Promise.all([
      Quotation.countDocuments(matchStage),
      
      Quotation.aggregate([
        { $match: matchStage },
        { 
          $group: { 
            _id: '$status', 
            count: { $sum: 1 } 
          } 
        }
      ]),
      
      Quotation.aggregate([
        { $match: matchStage },
        { 
          $group: { 
            _id: '$currency.code', 
            count: { $sum: 1 },
            totalValue: { $sum: '$totalInBaseCurrency' }
          } 
        }
      ]),
      
      Quotation.aggregate([
        { $match: matchStage },
        { 
          $group: { 
            _id: '$companyId', 
            count: { $sum: 1 },
            totalValue: { $sum: '$totalInBaseCurrency' }
          } 
        },
        {
          $lookup: {
            from: 'companies',
            localField: '_id',
            foreignField: '_id',
            as: 'company'
          }
        },
        {
          $project: {
            company: { $arrayElemAt: ['$company', 0] },
            count: 1,
            totalValue: 1
          }
        }
      ]),
      
      Quotation.aggregate([
        { 
          $match: { 
            ...matchStage,
            status: { $in: ['approved', 'awarded'] } 
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
        { $match: matchStage },
        {
          $group: {
            _id: { 
              year: { $year: '$createdAt' }, 
              month: { $month: '$createdAt' }
            },
            count: { $sum: 1 },
            total: { $sum: '$totalInBaseCurrency' },
          },
        },
        { $sort: { '_id.year': -1, '_id.month': -1 } },
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

    byStatus.forEach(item => {
      counts[item._id] = item.count;
    });

    res.json({
      success: true,
      counts,
      byCurrency,
      byCompany,
      totalApprovedValue: totalValueAgg[0]?.total || 0,
      monthlyStats,
    });
  } catch (err) {
     res.status(500).json({ 
      success: false,
      message: 'Error fetching dashboard stats', 
      error: err.message 
    });
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
      return res.status(400).json({ 
        success: false, 
        message: 'No documents provided' 
      });
    }

    const quotation = await Quotation.findById(id);
    if (!quotation) {
      return res.status(404).json({ 
        success: false, 
        message: 'Quotation not found' 
      });
    }

    // Check authorization (creator, ops, admin can add internal docs)
    const isAdmin = req.user.role === 'admin';
    const isOps = req.user.role === 'ops_manager';
    const isCreator = quotation._id.toString() === req.user.id;

    if (!isAdmin && !isOps && !isCreator) {
      return res.status(403).json({ 
        success: false, 
        message: 'Not authorized to add documents to this quotation' 
      });
    }

    // Upload internal documents
    const processedDocuments = await uploadMultipleInternalDocuments(
      documents,
      quotation.quotationNumber,
      req.user.id
    );

    // Add descriptions if provided
    if (descriptions && descriptions.length) {
      processedDocuments.forEach((doc, index) => {
        if (descriptions[index]) {
          doc.description = descriptions[index];
        }
      });
    }

    // Add to quotation
    quotation.internalDocuments = [
      ...(quotation.internalDocuments || []), 
      ...processedDocuments
    ];
    await quotation.save();

    res.status(200).json({
      success: true,
      message: `${processedDocuments.length} internal document(s) added successfully`,
      documents: processedDocuments
    });

  } catch (err) {
     res.status(500).json({ 
      success: false,
      message: 'Error adding internal documents', 
      error: err.message 
    });
  }
};

 
exports.getInternalDocuments = async (req, res) => {
  try {
    const { id } = req.params;

    const quotation = await Quotation.findById(id)
      .select('internalDocuments quotationNumber company.code createdBy')
      .lean();

    if (!quotation) {
      return res.status(404).json({ 
        success: false, 
        message: 'Quotation not found' 
      });
    }

    // Check authorization (internal team only)
    const isAdmin = req.user.role === 'admin';
    const isOps = req.user.role === 'ops_manager';
    const isCreator = quotation.createdBy._id.toString() === req.user.id;

    if (!isAdmin && !isOps && !isCreator) {
      return res.status(403).json({ 
        success: false, 
        message: 'Not authorized to view internal documents' 
      });
    }

    res.status(200).json({
      success: true,
      quotationNumber: quotation.quotationNumber,
      companyCode: quotation.company?.code,
      documents: quotation.internalDocuments || [],
      count: quotation.internalDocuments?.length || 0
    });

  } catch (err) {
     res.status(500).json({ 
      success: false,
      message: 'Error fetching internal documents', 
      error: err.message 
    });
  }
};

 
exports.getInternalDocumentById = async (req, res) => {
  try {
    const { id, docId } = req.params;

    const quotation = await Quotation.findById(id)
      .select('internalDocuments')
      .lean();

    if (!quotation) {
      return res.status(404).json({ 
        success: false, 
        message: 'Quotation not found' 
      });
    }

    // Check authorization (internal team only)
    const isAdmin = req.user.role === 'admin';
    const isOps = req.user.role === 'ops_manager';
    const isCreator = quotation.createdBy._id.toString() === req.user.id;

    if (!isAdmin && !isOps && !isCreator) {
      return res.status(403).json({ 
        success: false, 
        message: 'Not authorized to view internal documents' 
      });
    }

    const document = quotation.internalDocuments?.find(
      doc => doc._id.toString() === docId
    );
    
    if (!document) {
      return res.status(404).json({ 
        success: false, 
        message: 'Document not found' 
      });
    }

    res.status(200).json({
      success: true,
      document
    });

  } catch (err) {
     res.status(500).json({ 
      success: false,
      message: 'Error fetching document', 
      error: err.message 
    });
  }
};

 
exports.updateInternalDocumentDescription = async (req, res) => {
  try {
    const { id, docId } = req.params;
    const { description } = req.body;

    const quotation = await Quotation.findById(id);
    if (!quotation) {
      return res.status(404).json({ 
        success: false, 
        message: 'Quotation not found' 
      });
    }

    // Only creator can update internal document descriptions
    const isCreator = quotation.createdBy._id.toString() === req.user.id;

    if (!isCreator) {
      return res.status(403).json({ 
        success: false, 
        message: 'Only the creator can update internal document descriptions' 
      });
    }

    // Find and update document
    const document = quotation.internalDocuments?.id(docId);
    if (!document) {
      return res.status(404).json({ 
        success: false, 
        message: 'Document not found' 
      });
    }

    document.description = description || '';
    await quotation.save();

    res.status(200).json({
      success: true,
      message: 'Internal document description updated',
      document
    });

  } catch (err) {
     res.status(500).json({ 
      success: false,
      message: 'Error updating document description', 
      error: err.message 
    });
  }
};

 
exports.removeInternalDocument = async (req, res) => {
  try {
    const { id, docId } = req.params;

    const quotation = await Quotation.findById(id);
    if (!quotation) {
      return res.status(404).json({ 
        success: false, 
        message: 'Quotation not found' 
      });
    }

    // Only creator can remove internal documents
    const isCreator = quotation.createdBy._id.toString() === req.user.id;

    if (!isCreator) {
      return res.status(403).json({ 
        success: false, 
        message: 'Only the creator can remove internal documents' 
      });
    }

    // Find the document
    const document = quotation.internalDocuments?.id(docId);
    if (!document) {
      return res.status(404).json({ 
        success: false, 
        message: 'Document not found' 
      });
    }

    // Delete from Cloudinary
    await deleteInternalDocument(document);

    // Remove from array
    quotation.internalDocuments.pull(docId);
    await quotation.save();

    res.status(200).json({
      success: true,
      message: 'Internal document removed successfully'
    });

  } catch (err) {
     
    res.status(500).json({ 
      success: false,
      message: 'Error removing internal document', 
      error: err.message 
    });
  }
};

 
exports.getInternalDocumentDownloadUrl = async (req, res) => {
  try {
    const { id, docId } = req.params;

    const quotation = await Quotation.findById(id);
    if (!quotation) {
      return res.status(404).json({ 
        success: false, 
        message: 'Quotation not found' 
      });
    }

    // Check authorization (internal team only)
    const isAdmin = req.user.role === 'admin';
    const isOps = req.user.role === 'ops_manager';
    const isCreator = quotation._id.toString() === req.user.id;

    if (!isAdmin && !isOps && !isCreator) {
      return res.status(403).json({ 
        success: false, 
        message: 'Not authorized to download internal documents' 
      });
    }

    const document = quotation.internalDocuments?.id(docId);
    if (!document) {
      return res.status(404).json({ 
        success: false, 
        message: 'Document not found' 
      });
    }

    res.status(200).json({
      success: true,
      downloadUrl: document.fileUrl,
      fileName: document.fileName,
      fileType: document.fileType,
      fileSize: document.fileSize,
      uploadedAt: document.uploadedAt,
      uploadedBy: document.uploadedBy
    });

  } catch (err) {
    res.status(500).json({ 
      success: false,
      message: 'Error getting document URL', 
      error: err.message 
    });
  }
};