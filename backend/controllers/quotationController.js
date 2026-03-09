const Quotation = require('../models/quotation');
const Customer  = require('../models/customer');
const Item      = require('../models/items');
const puppeteer = require('puppeteer');
const { uploadToCloudinary, deleteFromCloudinary } = require('../utils/uploadCloudnary');

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

  // Clean up on crash so next call spawns a fresh instance
  _browser.on('disconnected', () => { _browser = null; });
  return _browser;
};

// ─────────────────────────────────────────────────────────────
// Cloudinary helpers
// ─────────────────────────────────────────────────────────────
const uploadBase64ToCloudinary = async (dataUri, folder) => {
  if (!dataUri?.startsWith('data:image')) return null;
  const matches = dataUri.match(/^data:image\/(\w+);base64,(.*)$/s);
  if (!matches) return null;
  const buffer = Buffer.from(matches[2], 'base64');
  const result = await uploadToCloudinary(buffer, folder);
  return { url: result.secure_url, publicId: result.public_id };
};

const safeDelete = (publicId) =>
  publicId
    ? deleteFromCloudinary(publicId).catch((e) =>
        console.warn(`[Cloudinary] delete failed for ${publicId}: ${e.message}`)
      )
    : Promise.resolve();

// ─────────────────────────────────────────────────────────────
// Shared item-image processor (create + update)
// ─────────────────────────────────────────────────────────────
const processItems = (items, quotationImages, existingItems = []) =>
  Promise.all(
    items.map(async (item, idx) => {
      const prev           = existingItems[idx] || {};
      const imageUrls      = [...(item.imagePaths     || prev.imagePaths     || [])];
      const imagePublicIds = [...(item.imagePublicIds || prev.imagePublicIds || [])];

      const rawImages = quotationImages?.[idx];
      if (Array.isArray(rawImages)) {
        for (const img of rawImages) {
          const up = await uploadBase64ToCloudinary(img, 'quotations/items');
          if (up) { imageUrls.push(up.url); imagePublicIds.push(up.publicId); }
        }
      }

      return {
        itemId:       item.itemId,
        quantity:     Number(item.quantity)  || 1,
        unitPrice:    Number(item.unitPrice) || 0,
        description:  item.description?.trim() || '',
        imagePaths:   imageUrls,
        imagePublicIds,
      };
    })
  );

// ─────────────────────────────────────────────────────────────
// Pagination helpers
// ─────────────────────────────────────────────────────────────
const parsePagination = ({ page, limit }) => {
  const p = Math.max(1, parseInt(page,  10) || 1);
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
      totalPages:  Math.ceil(total / limit),
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
// Allowed sort fields (whitelist to prevent injection)
// ─────────────────────────────────────────────────────────────
const SORT_FIELDS = new Set(['createdAt', 'date', 'expiryDate', 'total', 'customer', 'status', 'quotationNumber']);

// ═════════════════════════════════════════════════════════════
// CONTROLLERS
// ═════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────────────────────
// GET ALL QUOTATIONS  (admin)
// GET /quotations?page=1&limit=20&status=pending&search=xyz
//                 &sortBy=createdAt&sortDir=desc
//                 &from=2024-01-01&to=2024-12-31&customerId=xxx
// ─────────────────────────────────────────────────────────────
exports.getAllQuotations = async (req, res) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);

    // Build filter
    const filter = {};
    if (req.query.status)     filter.status     = req.query.status;
    if (req.query.customerId) filter.customerId  = req.query.customerId;
    if (req.query.search) {
      const re = new RegExp(req.query.search.trim(), 'i');
      filter.$or = [{ quotationNumber: re }, { customer: re }, { contact: re }];
    }
    if (req.query.from || req.query.to) {
      filter.date = {};
      if (req.query.from) filter.date.$gte = new Date(req.query.from);
      if (req.query.to)   filter.date.$lte = new Date(req.query.to);
    }

    // Sort (whitelist-guarded)
    const sortField = SORT_FIELDS.has(req.query.sortBy) ? req.query.sortBy : 'createdAt';
    const sortDir   = req.query.sortDir === 'asc' ? 1 : -1;

    const [data, total] = await Promise.all([
      Quotation.find(filter)
        .populate('customerId', 'name email phone address')
        .populate('items.itemId', 'name price description imagePath')
        .populate('createdBy', 'name email')
        .sort({ [sortField]: sortDir })
        .skip(skip)
        .limit(limit)
        .lean(),
      Quotation.countDocuments(filter),
    ]);

    return paginated(res, data, total, page, limit);
  } catch (err) {
    console.error('[getAllQuotations]', err);
    res.status(500).json({ message: 'Error fetching quotations', error: err.message });
  }
};

// ─────────────────────────────────────────────────────────────
// GET MY QUOTATIONS  (logged-in user)
// GET /quotations/my-quotations?page=1&limit=20&status=pending&search=xyz
// ─────────────────────────────────────────────────────────────
exports.getMyQuotations = async (req, res) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);

    const filter = { createdBy: req.user.id };
    if (req.query.status) filter.status = req.query.status;
    if (req.query.search) {
      const re = new RegExp(req.query.search.trim(), 'i');
      filter.$or = [{ quotationNumber: re }, { customer: re }];
    }

    const sortField = SORT_FIELDS.has(req.query.sortBy) ? req.query.sortBy : 'createdAt';
    const sortDir   = req.query.sortDir === 'asc' ? 1 : -1;

    const [data, total] = await Promise.all([
      Quotation.find(filter)
        .populate('customerId', 'name email phone')
        .populate('items.itemId', 'name price')
        .populate('createdBy', 'name email')
        .sort({ [sortField]: sortDir })
        .skip(skip)
        .limit(limit)
        .lean(),
      Quotation.countDocuments(filter),
    ]);

    return paginated(res, data, total, page, limit);
  } catch (err) {
    console.error('[getMyQuotations]', err);
    res.status(500).json({ message: 'Error fetching your quotations', error: err.message });
  }
};

// ─────────────────────────────────────────────────────────────
// GET SINGLE QUOTATION
// ─────────────────────────────────────────────────────────────
exports.getQuotation = async (req, res) => {
  try {
    const quotation = await Quotation.findById(req.params.id)
      .populate('customerId', 'name email phone address')
      .populate('items.itemId', 'name price description imagePath')
      .populate('createdBy', 'name email')
      .populate('approvedBy', 'name email')
      .lean();

    if (!quotation)
      return res.status(404).json({ message: 'Quotation not found' });

    if (req.user.role !== 'admin' && quotation.createdBy._id.toString() !== req.user.id)
      return res.status(403).json({ message: 'Not authorized to view this quotation' });

    res.status(200).json(quotation);
  } catch (err) {
    console.error('[getQuotation]', err);
    res.status(500).json({ message: 'Error fetching quotation', error: err.message });
  }
};

// ─────────────────────────────────────────────────────────────
// CREATE QUOTATION
// ─────────────────────────────────────────────────────────────
exports.createQuotation = async (req, res) => {
  const {
    customerId, customer, contact, date, expiryDate,
    ourRef, ourContact, salesOffice, paymentTerms, deliveryTerms,
    items, tax, discount, notes, total,
    quotationImages, termsAndConditions, termsImage,
  } = req.body;

  // Validation
  if (!customerId || !customer?.trim())
    return res.status(400).json({ message: 'Customer ID and customer name are required' });
  if (!items?.length)
    return res.status(400).json({ message: 'At least one item is required' });

  const dateErr = validateDates(date, expiryDate);
  if (dateErr) return res.status(400).json({ message: dateErr });

  try {
    // Parallel DB existence checks
    const [customerDoc, ...itemDocs] = await Promise.all([
      Customer.findById(customerId).lean(),
      ...items.map((i) => Item.findById(i.itemId).lean()),
    ]);

    if (!customerDoc)
      return res.status(404).json({ message: 'Customer not found' });

    const badIdx = itemDocs.findIndex((d) => !d);
    if (badIdx !== -1)
      return res.status(404).json({ message: `Item not found: ${items[badIdx].itemId}` });

    // Upload images in parallel
    const [termsUp, processedItems] = await Promise.all([
      termsImage ? uploadBase64ToCloudinary(termsImage, 'quotations/terms') : Promise.resolve(null),
      processItems(items, quotationImages),
    ]);

    const saved = await new Quotation({
      quotationNumber:    `QT-${Date.now()}`,
      customerId,
      customer:           customer.trim(),
      contact:            contact?.trim() || '',
      date:               date ? new Date(date) : new Date(),
      expiryDate:         new Date(expiryDate),
      ourRef, ourContact, salesOffice, paymentTerms, deliveryTerms,
      items:              processedItems,
      tax:                parseFloat(tax)      || 0,
      discount:           parseFloat(discount) || 0,
      notes:              notes?.trim() || '',
      termsAndConditions: termsAndConditions || '',
      termsImage:         termsUp?.url        || null,
      termsImagePublicId: termsUp?.publicId   || null,
      total:              parseFloat(total)   || 0,
      createdBy:          req.user.id,
      status:             'pending',
    }).save();

    const populated = await Quotation.findById(saved._id)
      .populate('customerId', 'name email phone address')
      .populate('items.itemId', 'name price description imagePath')
      .populate('createdBy', 'name email')
      .lean();

    res.status(201).json(populated);
  } catch (err) {
    console.error('[createQuotation]', err);
    res.status(500).json({ message: 'Error creating quotation', error: err.message });
  }
};

// ─────────────────────────────────────────────────────────────
// UPDATE QUOTATION
// ─────────────────────────────────────────────────────────────
exports.updateQuotation = async (req, res) => {
  const { id } = req.params;
  const {
    customerId, customer, contact, date, expiryDate,
    ourRef, ourContact, salesOffice, paymentTerms, deliveryTerms,
    items, tax, discount, notes, total,
    quotationImages, termsAndConditions, termsImage,
  } = req.body;

  if (!items?.length)
    return res.status(400).json({ message: 'At least one item is required' });

  const dateErr = validateDates(date, expiryDate);
  if (dateErr) return res.status(400).json({ message: dateErr });

  try {
    const existing = await Quotation.findById(id);
    if (!existing)
      return res.status(404).json({ message: 'Quotation not found' });

    if (req.user.role !== 'admin' && existing.createdBy.toString() !== req.user.id)
      return res.status(403).json({ message: 'Not authorized to update this quotation' });

    if (req.user.role !== 'admin' && existing.status !== 'pending')
      return res.status(400).json({ message: `Cannot update a quotation with status: ${existing.status}` });

    // Resolve terms image and item images in parallel
    let termsImageUrl      = existing.termsImage;
    let termsImagePublicId = existing.termsImagePublicId;

    const [processedItems] = await Promise.all([
      processItems(items, quotationImages, existing.items),
      (async () => {
        if (termsImage?.startsWith('data:image')) {
          await safeDelete(existing.termsImagePublicId);
          const up = await uploadBase64ToCloudinary(termsImage, 'quotations/terms');
          if (up) { termsImageUrl = up.url; termsImagePublicId = up.publicId; }
        } else if (termsImage === null) {
          await safeDelete(existing.termsImagePublicId);
          termsImageUrl = null; termsImagePublicId = null;
        }
      })(),
    ]);

    const updated = await Quotation.findByIdAndUpdate(
      id,
      {
        customerId,
        customer:           customer?.trim(),
        contact:            contact?.trim() || '',
        date:               date ? new Date(date) : existing.date,
        expiryDate:         new Date(expiryDate),
        ourRef, ourContact, salesOffice, paymentTerms, deliveryTerms,
        items:              processedItems,
        tax:                parseFloat(tax)      || 0,
        discount:           parseFloat(discount) || 0,
        notes:              notes?.trim() || '',
        termsAndConditions: termsAndConditions || '',
        termsImage:         termsImageUrl,
        termsImagePublicId,
        total:              parseFloat(total) || 0,
      },
      { new: true, runValidators: true }
    )
      .populate('customerId', 'name email phone address')
      .populate('items.itemId', 'name price description imagePath')
      .lean();

    res.status(200).json(updated);
  } catch (err) {
    console.error('[updateQuotation]', err);
    res.status(500).json({ message: 'Error updating quotation', error: err.message });
  }
};

// ─────────────────────────────────────────────────────────────
// DELETE QUOTATION
// ─────────────────────────────────────────────────────────────
exports.deleteQuotation = async (req, res) => {
  try {
    const quotation = await Quotation.findById(req.params.id);
    if (!quotation)
      return res.status(404).json({ message: 'Quotation not found' });

    if (req.user.role !== 'admin' && quotation.createdBy.toString() !== req.user.id)
      return res.status(403).json({ message: 'Not authorized to delete this quotation' });

    if (req.user.role !== 'admin' && quotation.status !== 'pending')
      return res.status(400).json({ message: `Cannot delete a quotation with status: ${quotation.status}` });

    // Delete all Cloudinary assets (non-blocking on failure)
    const jobs = [];
    quotation.items?.forEach((item) =>
      item.imagePublicIds?.forEach((pid) => { if (pid) jobs.push(safeDelete(pid)); })
    );
    if (quotation.termsImagePublicId) jobs.push(safeDelete(quotation.termsImagePublicId));
    await Promise.allSettled(jobs);

    await Quotation.findByIdAndDelete(req.params.id);
    res.status(200).json({ message: 'Quotation deleted successfully' });
  } catch (err) {
    console.error('[deleteQuotation]', err);
    res.status(500).json({ message: 'Error deleting quotation', error: err.message });
  }
};

// ─────────────────────────────────────────────────────────────
// GENERATE PDF  (server-side via Puppeteer)
// POST /quotations/generate-pdf  { html, filename? }
// ─────────────────────────────────────────────────────────────
exports.generatePDF = async (req, res) => {
  const { html, filename = 'quotation' } = req.body;

  if (!html?.trim())
    return res.status(400).json({ message: 'HTML content is required' });

  // Sanitise filename — strip path separators and quotes
  const safeFilename = filename.replace(/[/\\'"]/g, '_').slice(0, 100);

  let page = null;
  try {
    console.time(`[PDF] ${safeFilename}`);

    const browser = await getBrowser();
    page = await browser.newPage();

    // Block unnecessary resources to speed up rendering
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const type = req.resourceType();
      if (['stylesheet', 'font', 'media'].includes(type)) req.abort();
      else req.continue();
    });

    await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 20000 });

    // Wait for any remaining images to load
    await page.evaluate(() =>
      Promise.all(
        [...document.images]
          .filter((img) => !img.complete)
          .map((img) => new Promise((res) => { img.onload = res; img.onerror = res; }))
      )
    ).catch(() => {});

    const pdfBuffer = await page.pdf({
      format:          'A4',
      printBackground: true,
      margin: { top: '10mm', right: '10mm', bottom: '10mm', left: '10mm' },
    });

    await page.close(); page = null;
    console.timeEnd(`[PDF] ${safeFilename}`);

    // Verify PDF header
    if (Buffer.from(pdfBuffer).slice(0, 5).toString() !== '%PDF-')
      throw new Error('Puppeteer returned an invalid PDF buffer');

    console.log(`[PDF] ${safeFilename} — ${pdfBuffer.length} bytes`);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}.pdf"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.setHeader('Cache-Control', 'no-store');
    res.send(Buffer.isBuffer(pdfBuffer) ? pdfBuffer : Buffer.from(pdfBuffer));
  } catch (err) {
    if (page) await page.close().catch(() => {});
    console.error('[generatePDF]', err);
    res.status(500).json({ message: 'Error generating PDF', error: err.message });
  }
};