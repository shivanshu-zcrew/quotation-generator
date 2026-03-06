const Quotation = require('../models/quotation');
const Customer  = require('../models/customer');
const Item      = require('../models/items');
const puppeteer = require('puppeteer');
const { uploadToCloudinary, deleteFromCloudinary } = require('../utils/uploadCloudnary');

// ── Shared Puppeteer browser instance ────────────────────────────────────
let browserInstance = null;

const getBrowser = async () => {
  if (!browserInstance || !browserInstance.isConnected()) {
    browserInstance = await puppeteer.launch({
      headless: true,
      executablePath: '/usr/bin/chromium-browser',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage'
      ]
    });
  }
  return browserInstance;
};

// ── Upload a base64 data-URI to Cloudinary ────────────────────────────────
const uploadBase64ToCloudinary = async (dataUri, folder) => {
  if (!dataUri?.startsWith('data:image')) return null;
  const matches = dataUri.match(/^data:image\/(\w+);base64,(.*)$/);
  if (!matches) return null;
  const buffer = Buffer.from(matches[2], 'base64');
  const result = await uploadToCloudinary(buffer, folder);
  return { url: result.secure_url, publicId: result.public_id };
};

// GET ALL QUOTATIONS (admin)
exports.getAllQuotations = async (req, res) => {
  try {
    const quotations = await Quotation.find()
      .populate('customerId', 'name email phone address')
      .populate('items.itemId', 'name price description imagePath')
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 });
    res.status(200).json(quotations);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching quotations', error: error.message });
  }
};

// CREATE QUOTATION
exports.createQuotation = async (req, res) => {
  const {
    customerId, customer, contact, date, expiryDate,
    ourRef, ourContact, salesOffice, paymentTerms, deliveryTerms,
    items, tax, discount, notes, total,
    quotationImages, termsAndConditions, termsImage,
  } = req.body;

  if (!customerId || !customer || !items?.length)
    return res.status(400).json({ message: 'Customer ID, customer name, and items are required' });
  if (!expiryDate)
    return res.status(400).json({ message: 'Expiry date is required' });

  try {
    const customerExists = await Customer.findById(customerId);
    if (!customerExists) return res.status(404).json({ message: 'Customer not found' });

    for (const item of items) {
      const exists = await Item.findById(item.itemId);
      if (!exists) return res.status(404).json({ message: `Item ${item.itemId} not found` });
    }

    // Upload terms image
    let termsImageUrl = null, termsImagePublicId = null;
    if (termsImage) {
      const uploaded = await uploadBase64ToCloudinary(termsImage, 'quotations');
      if (uploaded) { termsImageUrl = uploaded.url; termsImagePublicId = uploaded.publicId; }
    }

    // Upload per-item images
    const processedItems = await Promise.all(
      items.map(async (item, idx) => {
        const imageUrls = [], imagePublicIds = [];
        const rawImages = quotationImages?.[idx];
        if (Array.isArray(rawImages)) {
          for (const imgData of rawImages) {
            const uploaded = await uploadBase64ToCloudinary(imgData, 'quotations');
            if (uploaded) { imageUrls.push(uploaded.url); imagePublicIds.push(uploaded.publicId); }
          }
        }
        return {
          itemId: item.itemId, quantity: item.quantity,
          unitPrice: item.unitPrice, description: item.description || '',
          imagePaths: imageUrls, imagePublicIds,
        };
      })
    );

    const saved = await new Quotation({
      quotationNumber: `QT-${Date.now()}`,
      customerId, customer, contact,
      date: date || new Date(), expiryDate: new Date(expiryDate),
      ourRef, ourContact, salesOffice, paymentTerms, deliveryTerms,
      items: processedItems,
      tax: parseFloat(tax) || 0, discount: parseFloat(discount) || 0,
      notes, termsAndConditions: termsAndConditions || '',
      termsImage: termsImageUrl, termsImagePublicId,
      total: parseFloat(total), createdBy: req.user.id, status: 'pending',
    }).save();

    const populated = await Quotation.findById(saved._id)
      .populate('customerId', 'name email phone address')
      .populate('items.itemId', 'name price description imagePath')
      .populate('createdBy', 'name email');

    res.status(201).json(populated);
  } catch (error) {
    console.error('Error creating quotation:', error);
    res.status(500).json({ message: 'Error creating quotation', error: error.message });
  }
};

// GET MY QUOTATIONS
exports.getMyQuotations = async (req, res) => {
  try {
    const quotations = await Quotation.find({ createdBy: req.user.id })
      .populate('customerId', 'name email phone')
      .populate('items.itemId', 'name price')
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 });
    res.json(quotations);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching your quotations', error: error.message });
  }
};

// GET SINGLE QUOTATION
exports.getQuotation = async (req, res) => {
  try {
    const quotation = await Quotation.findById(req.params.id)
      .populate('customerId', 'name email phone address')
      .populate('items.itemId', 'name price description imagePath')
      .populate('createdBy', 'name email')
      .populate('approvedBy', 'name email');

    if (!quotation) return res.status(404).json({ message: 'Quotation not found' });
    if (req.user.role !== 'admin' && quotation.createdBy._id.toString() !== req.user.id)
      return res.status(403).json({ message: 'Not authorized to view this quotation' });

    res.status(200).json(quotation);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching quotation', error: error.message });
  }
};

// UPDATE QUOTATION
exports.updateQuotation = async (req, res) => {
  const { id } = req.params;
  const {
    customerId, customer, contact, date, expiryDate,
    ourRef, ourContact, salesOffice, paymentTerms, deliveryTerms,
    items, tax, discount, notes, total,
    quotationImages, termsAndConditions, termsImage,
  } = req.body;

  try {
    const existing = await Quotation.findById(id);
    if (!existing) return res.status(404).json({ message: 'Quotation not found' });
    if (req.user.role !== 'admin' && existing.createdBy.toString() !== req.user.id)
      return res.status(403).json({ message: 'Not authorized to update this quotation' });
    if (req.user.role !== 'admin' && existing.status !== 'pending')
      return res.status(400).json({ message: `Cannot update quotation with status: ${existing.status}` });

    // Process item images — keep existing Cloudinary URLs, upload new base64 ones
    const processedItems = await Promise.all(
      items.map(async (item, idx) => {
        const imageUrls      = [...(item.imagePaths    || [])];
        const imagePublicIds = [...(item.imagePublicIds || [])];
        const rawImages = quotationImages?.[idx];
        if (Array.isArray(rawImages)) {
          for (const imgData of rawImages) {
            const uploaded = await uploadBase64ToCloudinary(imgData, 'quotations');
            if (uploaded) { imageUrls.push(uploaded.url); imagePublicIds.push(uploaded.publicId); }
          }
        }
        return {
          itemId: item.itemId, quantity: item.quantity,
          unitPrice: item.unitPrice, description: item.description || '',
          imagePaths: imageUrls, imagePublicIds,
        };
      })
    );

    // Process terms image
    let termsImageUrl = existing.termsImage, termsImagePublicId = existing.termsImagePublicId;
    if (termsImage?.startsWith('data:image')) {
      if (existing.termsImagePublicId)
        await deleteFromCloudinary(existing.termsImagePublicId).catch(() => {});
      const uploaded = await uploadBase64ToCloudinary(termsImage, 'quotations/terms');
      if (uploaded) { termsImageUrl = uploaded.url; termsImagePublicId = uploaded.publicId; }
    } else if (termsImage === null) {
      if (existing.termsImagePublicId)
        await deleteFromCloudinary(existing.termsImagePublicId).catch(() => {});
      termsImageUrl = null; termsImagePublicId = null;
    }

    const updated = await Quotation.findByIdAndUpdate(id, {
      customerId, customer, contact,
      date: date || existing.date, expiryDate: new Date(expiryDate),
      ourRef, ourContact, salesOffice, paymentTerms, deliveryTerms,
      items: processedItems,
      tax: parseFloat(tax) || 0, discount: parseFloat(discount) || 0,
      notes, termsAndConditions: termsAndConditions || '',
      termsImage: termsImageUrl, termsImagePublicId,
      total: parseFloat(total),
    }, { new: true })
      .populate('customerId', 'name email phone address')
      .populate('items.itemId', 'name price description imagePath');

    res.status(200).json(updated);
  } catch (error) {
    console.error('Error updating quotation:', error);
    res.status(500).json({ message: 'Error updating quotation', error: error.message });
  }
};

// DELETE QUOTATION
exports.deleteQuotation = async (req, res) => {
  try {
    const quotation = await Quotation.findById(req.params.id);
    if (!quotation) return res.status(404).json({ message: 'Quotation not found' });

    // Check permissions BEFORE deleting
    if (req.user.role !== 'admin' && quotation.createdBy.toString() !== req.user.id)
      return res.status(403).json({ message: 'Not authorized to delete this quotation' });
    if (req.user.role !== 'admin' && quotation.status !== 'pending')
      return res.status(400).json({ message: `Cannot delete quotation with status: ${quotation.status}` });

    // Delete Cloudinary images
    const deletePromises = [];
    quotation.items?.forEach(item =>
      item.imagePublicIds?.forEach(pid => { if (pid) deletePromises.push(deleteFromCloudinary(pid)); })
    );
    if (quotation.termsImagePublicId)
      deletePromises.push(deleteFromCloudinary(quotation.termsImagePublicId));
    await Promise.allSettled(deletePromises);

    await Quotation.findByIdAndDelete(req.params.id);
    res.status(200).json({ message: 'Quotation deleted successfully' });
  } catch (error) {
    console.error('Error deleting quotation:', error);
    res.status(500).json({ message: 'Error deleting quotation', error: error.message });
  }
};

// GENERATE PDF
exports.generatePDF = async (req, res) => {
  const { html, filename = 'quotation' } = req.body;
  if (!html) return res.status(400).json({ message: 'HTML content is required' });

  let page;
  try {
    console.time('PDF Generation');
    const browser = await getBrowser();
    page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 15000 });

    const pdfBuffer = await page.pdf({
      format: 'A4', printBackground: true,
      margin: { top: '20mm', right: '20mm', bottom: '20mm', left: '20mm' },
    });

    await page.close(); page = null;

    const header = Buffer.from(pdfBuffer).slice(0, 5).toString();
    if (header !== '%PDF-') throw new Error('Generated file does not have a valid PDF header');

    console.timeEnd('PDF Generation');
    console.log(`PDF generated — ${pdfBuffer.length} bytes`);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}.pdf"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.send(Buffer.isBuffer(pdfBuffer) ? pdfBuffer : Buffer.from(pdfBuffer));
  } catch (error) {
    if (page) await page.close().catch(() => {});
    console.error('Error generating PDF:', error);
    res.status(500).json({ message: 'Error generating PDF', error: error.message });
  }
};