// controllers/quotationController.js
const { Quotation, CURRENCIES, ExchangeRateService, Company } = require('../models/quotation');
const { Customer } = require('../models/customer');
const Item = require('../models/items');
const puppeteer = require('puppeteer');
const mime = require('mime-types')
const { uploadToCloudinary, deleteFromCloudinary } = require('../utils/uploadCloudnary');
const zohoBooksService = require('../zoho/customerServices');

// ─────────────────────────────────────────────────────────────
// Shared Puppeteer browser — one instance, auto-reconnect
// ─────────────────────────────────────────────────────────────
let _browser = null;

const getBrowser = async () => {
  if (_browser?.isConnected()) return _browser;

  _browser = await puppeteer.launch({
    headless: 'new',
    executablePath: process.env.NODE_ENV === 'production'
      ? (process.env.CHROMIUM_PATH || '/usr/bin/chromium-browser')
      : undefined,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
    ],
  });

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
const processItems = async (items, quotationImages, exchangeRate, existingItems = []) => {
  return Promise.all(
    items.map(async (item, idx) => {
      const prev = existingItems[idx] || {};
      const imageUrls = [...(item.imagePaths || prev.imagePaths || [])];
      const imagePublicIds = [...(item.imagePublicIds || prev.imagePublicIds || [])];

      const rawImages = quotationImages?.[idx];
      if (Array.isArray(rawImages)) {
        for (const img of rawImages) {
          const up = await uploadBase64ToCloudinary(img, 'quotations/items');
          if (up) {
            imageUrls.push(up.url);
            imagePublicIds.push(up.publicId);
          }
        }
      }

      const unitPrice = Number(item.unitPrice) || 0;
      const quantity = Number(item.quantity) || 1;
      const totalPrice = unitPrice * quantity;

      return {
        itemId: item.itemId,
        quantity,
        unitPrice,
        unitPriceInBaseCurrency: unitPrice * exchangeRate,
        totalPrice,
        totalPriceInBaseCurrency: totalPrice * exchangeRate,
        description: item.description?.trim() || '',
        imagePaths: imageUrls,
        imagePublicIds,
      };
    })
  );
};

// ─────────────────────────────────────────────────────────────
// Calculate totals with currency conversion
// ─────────────────────────────────────────────────────────────
const calculateTotals = (items, taxPercent, discountPercent, exchangeRate) => {
  const subtotal = items.reduce((sum, item) => sum + item.totalPrice, 0);
  const taxAmount = (subtotal * (taxPercent || 0)) / 100;
  const discountAmount = (subtotal * (discountPercent || 0)) / 100;
  const total = subtotal + taxAmount - discountAmount;
 
  const subtotalInBaseCurrency = subtotal * exchangeRate;
  const taxAmountInBaseCurrency = taxAmount * exchangeRate;
  const discountAmountInBaseCurrency = discountAmount * exchangeRate;
  const totalInBaseCurrency = total * exchangeRate;

  return {
    subtotal,
    taxAmount,
    discountAmount,
    total,
    subtotalInBaseCurrency,      
    taxAmountInBaseCurrency,     
    discountAmountInBaseCurrency, 
    totalInBaseCurrency         
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
    const quotation = await fullPopulate(
      Quotation.findById(req.params.id)
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
    date, expiryDate, queryDate,tl,trn,
    ourRef, ourContact, salesOffice, paymentTerms, deliveryTerms,
    items, taxPercent, discountPercent, notes,
    quotationImages, termsAndConditions, termsImage,
    internalDocuments, 
    internalDocDescriptions  
  } = req.body;

  // Validation
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

  if (!customerId || !customer?.trim()) {
    return res.status(400).json({ message: 'Customer ID and customer name are required' });
  }
  if (!items?.length) {
    return res.status(400).json({ message: 'At least one item is required' });
  }

  const dateErr = validateDates(date, expiryDate);
  if (dateErr) return res.status(400).json({ message: dateErr });

  try {
    // Validate customer exists
    const customerDoc = await Customer.findById(customerId).lean();
    if (!customerDoc) {
      return res.status(404).json({ message: 'Customer not found' });
    }

    // Validate all items exist
    for (const item of items) {
      const itemDoc = await Item.findById(item.itemId).lean();
      if (!itemDoc) {
        return res.status(404).json({ message: `Item not found: ${item.itemId}` });
      }
    }

    // Get exchange rate
    const targetCurrency = currencyCode || company.baseCurrency;
    const rates = await ExchangeRateService.getRates(company.baseCurrency);
    const exchangeRate = rates[targetCurrency] || 1;

    // Process items with currency conversion
    const processedItems = await processItems(items, quotationImages, exchangeRate);

    // Calculate totals
    const tax = parseFloat(taxPercent) || 0;
    const discount = parseFloat(discountPercent) || 0;
    const totals = calculateTotals(processedItems, tax, discount, exchangeRate);

    // Process terms image
    const termsUp = termsImage ? 
      await uploadBase64ToCloudinary(termsImage, 'quotations/terms') : null;

    // Generate quotation number
    const quotationNumber = generateQuotationNumber(company.code);

    // 🔥 FIX: Process internal documents from base64 (same as images)
    let processedInternalDocs = [];
    if (internalDocuments && internalDocuments.length > 0) {
      processedInternalDocs = await uploadMultipleInternalDocumentsFromBase64(
        internalDocuments,
        quotationNumber,
        req.user.id,
        internalDocDescriptions || []
      );
    }

    // Create quotation
    const quotation = new Quotation({
      quotationNumber,
      projectName:projectName?.trim() || '',
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
        bankDetails: company.bankDetails
      },
      currency: {
        code: targetCurrency,
        symbol: CURRENCIES[targetCurrency]?.symbol || targetCurrency,
        name: CURRENCIES[targetCurrency]?.name || targetCurrency,
        decimalPlaces: CURRENCIES[targetCurrency]?.decimalPlaces || 2,
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
        vatNumber: customerDoc.vatNumber
      },
      contact: contact?.trim() || '',
      date: date ? new Date(date) : new Date(),
      expiryDate: new Date(expiryDate),
      queryDate: queryDate ? new Date(queryDate) : null,
      ourRef: ourRef?.trim() || '',
      ourContact: ourContact?.trim() || '',
      salesOffice: salesOffice?.trim() || '',
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
      termsImage: termsUp?.url || null,
      termsImagePublicId: termsUp?.publicId || null,
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
    
    res.status(201).json({
      success: true,
      message: 'Quotation created successfully',
      quotation: populated,
      internalDocCount: processedInternalDocs.length
    });

  } catch (err) {
     
    res.status(500).json({ 
      success: false,
      message: 'Error creating quotation', 
      error: err.message 
    });
  }
};

// ─────────────────────────────────────────────────────────────
// UPDATE QUOTATION (with document support)
// ─────────────────────────────────────────────────────────────

exports.updateQuotation = async (req, res) => {
  const { id } = req.params;
  const {
    projectName,
    currencyCode,
    customerId, customer, contact, customerCountry,
    date, expiryDate, queryDate,
    ourRef, ourContact, salesOffice, paymentTerms, deliveryTerms,
    tl,trn,
    items, taxPercent, discountPercent, notes,
    quotationImages, termsAndConditions, termsImage,
    internalDocuments,
    internalDocDescriptions
  } = req.body;

  if (!items?.length) {
    return res.status(400).json({ message: 'At least one item is required' });
  }

  const dateErr = validateDates(date, expiryDate);
  if (dateErr) return res.status(400).json({ message: dateErr });

  try {
    const existing = await Quotation.findById(id);
    if (!existing) {
      return res.status(404).json({ message: 'Quotation not found' });
    }

    const isAdmin = req.user.role === 'admin';
    const isCreator = existing.createdBy._id.toString() === req.user.id;

    if (!isAdmin && !isCreator) {
      return res.status(403).json({ message: 'Not authorized to update this quotation' });
    }

    if (!isAdmin && !['pending', 'ops_rejected'].includes(existing.status)) {
      return res.status(400).json({ 
        message: `Cannot update a quotation with status: ${existing.status}` 
      });
    }

    let exchangeRate = existing.currency.exchangeRate.rate;
    if (currencyCode && currencyCode !== existing.currency.code) {
      const rates = await ExchangeRateService.getRates('AED');
      exchangeRate = rates[currencyCode] || 1;
    }

    const processedItems = await processItems(
      items, 
      quotationImages, 
      exchangeRate,
      existing.items
    );

    // Ensure taxPercent and discountPercent are valid numbers
    const tax = taxPercent !== undefined ? parseFloat(taxPercent) : existing.taxPercent;
    const discount = discountPercent !== undefined ? parseFloat(discountPercent) : existing.discountPercent;
    
    // Validate numbers
    if (isNaN(tax) || tax < 0 || tax > 100) {
      return res.status(400).json({ message: 'Tax must be a number between 0 and 100' });
    }
    if (isNaN(discount) || discount < 0 || discount > 100) {
      return res.status(400).json({ message: 'Discount must be a number between 0 and 100' });
    }

    const totals = calculateTotals(processedItems, tax, discount, exchangeRate);

    let termsImageUrl = existing.termsImage;
    let termsImagePublicId = existing.termsImagePublicId;

    if (termsImage?.startsWith('data:')) {
      await safeDelete(existing.termsImagePublicId);
      const up = await uploadBase64ToCloudinary(termsImage, 'quotations/terms');
      if (up) {
        termsImageUrl = up.url;
        termsImagePublicId = up.publicId;
      }
    } else if (termsImage === null) {
      await safeDelete(existing.termsImagePublicId);
      termsImageUrl = null;
      termsImagePublicId = null;
    }

    // Process new internal documents if any
    let newInternalDocs = [];
    if (internalDocuments && internalDocuments.length > 0) {
      // Filter out any non-string values (like objects)
      const validBase64Strings = internalDocuments.filter(doc => typeof doc === 'string');
      
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
      ...(customerCountry && { customerCountry }),
      ...(date && { date: new Date(date) }),
      ...(expiryDate && { expiryDate: new Date(expiryDate) }),
      ...(queryDate !== undefined && { 
        queryDate: queryDate ? new Date(queryDate) : null 
      }),
      ...(ourRef !== undefined && { ourRef: ourRef?.trim() || '' }),
      ...(ourContact !== undefined && { ourContact: ourContact?.trim() || '' }),
      ...(salesOffice !== undefined && { salesOffice: salesOffice?.trim() || '' }),
      ...(paymentTerms !== undefined && { paymentTerms: paymentTerms?.trim() || '' }),
      ...(deliveryTerms !== undefined && { deliveryTerms: deliveryTerms?.trim() || '' }),
      ...(tl !== undefined && { tl: tl?.trim() || '' }),
      ...(trn !== undefined && { trn: trn?.trim() || '' }),
      
      ...(currencyCode && currencyCode !== existing.currency.code ? {
        'currency.code': currencyCode,
        'currency.exchangeRate.rate': exchangeRate,
        'currency.exchangeRate.fetchedAt': new Date()
      } : {}),
      
      items: processedItems,
      taxPercent: tax,
      discountPercent: discount,
      ...totals,
      ...(notes !== undefined && { notes: notes?.trim() || '' }),
      ...(termsAndConditions !== undefined && { 
        termsAndConditions: termsAndConditions?.trim() || '' 
      }),
      termsImage: termsImageUrl,
      termsImagePublicId,
      
      // Add new documents to existing ones
      internalDocuments: [...(existing.internalDocuments || []), ...newInternalDocs],
      
      status: newStatus,
      ...(newStatus === 'pending' && existing.status === 'ops_rejected'
        ? { opsRejectionReason: '' }
        : {}),
    };

    const updated = await Quotation.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    );

    const populated = await fullPopulate(Quotation.findById(updated._id)).lean();
    
    res.status(200).json({
      success: true,
      message: 'Quotation updated successfully',
      quotation: populated
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

    const quotation = await Quotation.findById(req.params.id);
    if (!quotation)
      return res.status(404).json({ message: 'Quotation not found' });

    const isCreator = quotation.createdBy._id.toString() === req.user.id;
    const isAdmin = req.user.role === 'admin';

    if (!isCreator && !isAdmin)
      return res.status(403).json({ message: 'Not authorized' });

    quotation.queryDate = queryDate ? new Date(queryDate) : null;
    await quotation.save();

    res.status(200).json({ 
      success: true,
      message: 'Query date updated', 
      queryDate: quotation.queryDate 
    });
  } catch (err) {
     
    res.status(500).json({ 
      success: false,
      message: 'Error updating query date', 
      error: err.message 
    });
  }
};

// ─────────────────────────────────────────────────────────────
// TAX CONFIGURATION
// ─────────────────────────────────────────────────────────────

// Tax IDs mapping for different tax rates
const TAX_IDS = {
  '0%': '4698901000000085047',
  '5%': '4698901000000085041',
  '10%': '4698901000026039221',
  '15%': '4698901000026039213'
};

// ─────────────────────────────────────────────────────────────
// AWARD / NOT-AWARD
// ─────────────────────────────────────────────────────────────
// ===========================================
// AWARD QUOTATION - COMPLETELY REWRITTEN
// ===========================================

exports.awardQuotation = async (req, res) => {
  try {
    const { awarded, awardNote } = req.body;
    const quotationId = req.params.id;

     
     
     
     
     

    if (typeof awarded !== 'boolean') {
      return res.status(400).json({ 
        success: false,
        message: '`awarded` (boolean) is required' 
      });
    }

    // STEP 1: Fetch quotation
    const quotation = await Quotation.findById(quotationId)
      .populate('companyId')
      .populate('createdBy', 'name email');
    
    if (!quotation) {
      return res.status(404).json({ 
        success: false,
        message: 'Quotation not found' 
      });
    }
    
    // ✅ STEP 2: Fetch customer DIRECTLY (not through populate)
    const customer = await Customer.findById(quotation.customerId).lean();
    
 
    
    if (!customer) {
       
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

    // STEP 4: Get customer tax treatment and place of supply
    const customerTaxTreatment = customer?.taxTreatment || 'non_vat_registered';
    const customerPlaceOfSupply = customer?.placeOfSupply || 'Dubai';
    
    // Check if place of supply is in UAE (emirate) or GCC country
    const UAE_EMIRATES = ['Abu Dhabi', 'Ajman', 'Dubai', 'Fujairah', 'Ras al-Khaimah', 'Sharjah', 'Umm al-Quwain'];
    const GCC_COUNTRIES = ['Saudi Arabia', 'Kuwait', 'Qatar', 'Bahrain', 'Oman'];
    
    const isPlaceOfSupplyUAE = UAE_EMIRATES.includes(customerPlaceOfSupply);
    const isPlaceOfSupplyGCC = GCC_COUNTRIES.includes(customerPlaceOfSupply);
    
     
     
     
     
     
     
     
    
    // Tax IDs mapping
    const TAX_IDS = {
      '0%': '4698901000000085047',
      '5%': '4698901000000085041',
      '10%': '4698901000026039221',
      '15%': '4698901000026039213'
    };
    
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
        // Domestic UAE transaction - can use 0% or 5%
        taxRate = quotation.taxPercent || 5;
        
        // Only allow 0% or 5% for domestic UAE
        if (taxRate === 0) {
          taxId = TAX_IDS['0%'];
           
        } else if (taxRate === 5) {
          taxId = TAX_IDS['5%'];
           
        } else {
          // Force to 5% if other rates are selected
           
          taxId = TAX_IDS['5%'];
          taxRate = 5;
        }
        
        taxTreatment = 'vat_registered';
        
        // Place of supply: emirate code
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
        // Export to GCC - Zero-rated (0% only)
        taxRate = 0;
        taxId = TAX_IDS['0%'];
        taxTreatment = 'vat_registered';
        
        // Place of supply: country code
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
        // GCC customer importing to UAE - 5% tax
        taxRate = 5;
        taxId = TAX_IDS['5%'];
        taxTreatment = 'gcc_vat_registered';
        
        // Place of supply: emirate code for UAE
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
        // GCC customer within GCC - Zero-rated (0%)
        taxRate = 0;
        taxId = TAX_IDS['0%'];
        taxTreatment = 'gcc_vat_registered';
        
        // Place of supply: country code
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
      
      // Place of supply: emirate code for UAE or country code for GCC
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
    
     
     
     
     
     

    let zohoEstimate = null;
    
    // STEP 5: If awarded, create estimate in Zoho
    if (awarded) {
       
      
      try {
        // 5.1: Get customer Zoho ID
        let customerZohoId = customer?.zohoId;
        
        if (!customerZohoId) {
          // Create new customer in Zoho if no ID exists
           
          const customerData = {
            name: customer?.name || quotation.customerSnapshot.name,
            email: customer?.email || quotation.customerSnapshot.email,
            phone: customer?.phone || quotation.customerSnapshot.phone,
            address: customer?.address || quotation.customerSnapshot.address,
            placeOfSupply: customerPlaceOfSupply,
            taxTreatment: customerTaxTreatment,
            taxRegistrationNumber: customer?.taxRegistrationNumber || '',
            currencyCode: quotation.currency?.code || 'AED'
          };
          
          // Add uaeEmirate if place is UAE emirate
          if (isPlaceOfSupplyUAE) {
            customerData.uaeEmirate = customerPlaceOfSupply;
            customerData.placeOfSupply = 'United Arab Emirates (UAE)';
          }
          
          const createResult = await zohoBooksService.createContact(customerData);
          if (createResult.success) {
            customerZohoId = createResult.zohoId;
             
          } else {
            throw new Error(`Failed to create customer: ${createResult.error}`);
          }
        } else {
           
        }
        
        // 5.2: Calculate totals
        const subtotal = quotation.subtotal || 0;
        const discountPercent = quotation.discountPercent || 0;
        
        const taxAmount = (subtotal * taxRate) / 100;
        const discountAmount = (subtotal * discountPercent) / 100;
        const totalAfterTax = subtotal + taxAmount;
        const grandTotal = totalAfterTax - discountAmount;
        
         
         
         
         
         
        
        // 5.3: Prepare line items with tax
        const lineItems = [];
        
        for (let i = 0; i < quotation.items.length; i++) {
          const item = quotation.items[i];
          
          const itemTotal = item.quantity * item.unitPrice;
          
          const lineItem = {
            item_id: '',
            name: `Item ${i + 1}`,
            description: item.description || `Item ${i + 1}`,
            quantity: item.quantity,
            rate: item.unitPrice,
            discount: 0,
            discount_amount: 0,
            item_total: itemTotal,
            item_order: i + 1
          };
          
          // Add tax fields only if tax rate > 0
          if (taxRate > 0) {
            lineItem.tax_id = taxId;
            lineItem.tax_percentage = taxRate;
            lineItem.tax_name = 'VAT';
            lineItem.tax_type = 'tax';
          }
          
          lineItems.push(lineItem);
        }
        
        // 5.4: Prepare estimate data
        const estimateData = {
          customer_id: customerZohoId,
          reference_number: quotation.quotationNumber,
          date: new Date(quotation.date).toISOString().split('T')[0],
          expiry_date: new Date(quotation.expiryDate).toISOString().split('T')[0],
          exchange_rate: quotation.currency?.exchangeRate?.rate || 1,
          discount: discountPercent,
          is_discount_before_tax: false,
          discount_type: 'item_level',
          is_inclusive_tax: false,
          custom_body: quotation.notes || '',
          custom_subject: `Quotation: ${quotation.quotationNumber} - ${quotation.projectName || ''}`,
          salesperson_name: quotation.ourContact || '',
          notes: quotation.notes || '',
          terms:  cleanHtmlForZoho(quotation.termsAndConditions) || 'No terms and conditions provided.',
          line_items: lineItems,
          tax_treatment: taxTreatment,
          place_of_supply: placeOfSupplyCode,
          is_taxable: taxRate > 0,
          total: grandTotal,
          total_before_tax: subtotal,
          tax_total: taxAmount,
          discount_total: discountAmount
        };
        
        // Add tax_id only if tax rate > 0
        if (taxRate > 0) {
          estimateData.tax_id = taxId;
        }
        
         
         
        
        // 5.5: Create estimate in Zoho
         
        zohoEstimate = await zohoBooksService.createEstimate(estimateData);
        
        if (!zohoEstimate.success) {
          throw new Error(`Zoho estimate creation failed: ${zohoEstimate.error}`);
        }
        
         
         
         
        
        // 5.6: Update quotation with Zoho details
        quotation.zohoEstimateId = zohoEstimate.estimateId;
        quotation.zohoEstimateNumber = zohoEstimate.estimateNumber;
        quotation.zohoEstimateUrl = zohoEstimate.estimateUrl;
        quotation.zohoReferenceNumber = quotation.quotationNumber;
        quotation.zohoSyncedAt = new Date();
        
      } catch (zohoError) {
         
        
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
     
    
     
     
     
    
    const updated = await Quotation.findById(quotationId)
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
     
    
    res.status(500).json({ 
      success: false,
      message: 'Error awarding quotation', 
      error: err.message
    });
  }
};

function convertHtmlToPlainText(html) {
  if (!html) return '';

  let text = html;
 
  text = text.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  text = text.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
 
  text = text.replace(/<li[^>]*>\s*<p[^>]*>/gi, '<li>');
  text = text.replace(/<\/p>\s*<\/li>/gi, '</li>');

  const stack = [];

  text = text.replace(/<ol[^>]*>/gi, () => {
    stack.push(0);
    return '\n';
  });

  text = text.replace(/<\/ol>/gi, () => {
    stack.pop();
    return '\n';
  });

  text = text.replace(/<li[^>]*>/gi, () => {
    if (stack.length) {
      stack[stack.length - 1]++;
      const numbering = stack.join('.');
      const indent = '   '.repeat(stack.length - 1);
      return `\n${indent}${numbering}. `;
    }
    return '\n• ';
  });

  text = text.replace(/<\/li>/gi, '');
 
  text = text.replace(/<br\s*\/?>/gi, '\n');

  
  text = text.replace(/<[^>]+>/g, '');
 
  text = text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

   text = text.replace(/\n\s*\n\s*\n/g, '\n\n');
  text = text.replace(/[ \t]+/g, ' ');
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

  if (!html?.trim())
    return res.status(400).json({ message: 'HTML content is required' });

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

    await page.close(); page = null;
     

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

/**
 * @desc    Add internal documents to quotation
 * @route   POST /api/quotations/:id/internal-documents
 * @access  Private (Creator, Ops, Admin)
 */
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

/**
 * @desc    Get all internal documents for a quotation
 * @route   GET /api/quotations/:id/internal-documents
 * @access  Private (Internal team only)
 */
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

/**
 * @desc    Get single internal document by ID
 * @route   GET /api/quotations/:id/internal-documents/:docId
 * @access  Private (Internal team only)
 */
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

/**
 * @desc    Update internal document description
 * @route   PATCH /api/quotations/:id/internal-documents/:docId
 * @access  Private (Creator only)
 */
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

/**
 * @desc    Remove internal document from quotation
 * @route   DELETE /api/quotations/:id/internal-documents/:docId
 * @access  Private (Creator only)
 */
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

/**
 * @desc    Get internal document download URL
 * @route   GET /api/quotations/:id/internal-documents/:docId/download
 * @access  Private (Internal team only)
 */
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