const express = require('express');
const router = express.Router();
const quotationController = require('../controllers/quotationController');
const { protect, adminOnly } = require('../middleware/auth');

// PROTECT ALL ROUTES - User must be logged in
router.use(protect);

// =============================================================
// COMPANY ROUTES
// =============================================================
router.get('/companies', quotationController.getCompanies);
router.get('/companies/:code', quotationController.getCompanyByCode);
router.get('/companies/:code/stats', quotationController.getCompanyStats);

// =============================================================
// INTERNAL DOCUMENT ROUTES
// =============================================================

/**
 * @route   POST /api/quotations/:id/internal-documents
 * @desc    Add internal documents to quotation
 * @access  Private (Creator, Ops, Admin)
 */
router.post('/:id/internal-documents', quotationController.addInternalDocuments);

/**
 * @route   GET /api/quotations/:id/internal-documents
 * @desc    Get all internal documents for quotation
 * @access  Private (Internal team only)
 */
router.get('/:id/internal-documents', quotationController.getInternalDocuments);

/**
 * @route   GET /api/quotations/:id/internal-documents/:docId
 * @desc    Get single internal document
 * @access  Private (Internal team only)
 */
router.get('/:id/internal-documents/:docId', quotationController.getInternalDocumentById);

/**
 * @route   PATCH /api/quotations/:id/internal-documents/:docId
 * @desc    Update internal document description
 * @access  Private (Creator only)
 */
router.patch('/:id/internal-documents/:docId', quotationController.updateInternalDocumentDescription);

router.delete('/:id/internal-documents/:docId', quotationController.removeInternalDocument);

router.get('/:id/internal-documents/:docId/download', quotationController.getInternalDocumentDownloadUrl);

// =============================================================
// USER QUOTATION ROUTES
// =============================================================
router.post('/', quotationController.createQuotation);
router.get('/my-quotations', quotationController.getMyQuotations);
router.get('/:id', quotationController.getQuotation);
router.put('/:id', quotationController.updateQuotation);
router.delete('/:id', quotationController.deleteQuotation);
router.post('/generate-pdf', quotationController.generatePDF);
router.patch('/:id/query-date', quotationController.updateQueryDate);
router.patch('/:id/award', quotationController.awardQuotation);

// =============================================================
// ADMIN ONLY ROUTES
// =============================================================
router.get('/', adminOnly, quotationController.getAllQuotations);

// =============================================================
// TEST ROUTE
// =============================================================
router.post('/test-pdf', protect, async (req, res) => {
  try {
    const puppeteer = require('puppeteer');
    const browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    
    const html = `
      <!DOCTYPE html>
      <html>
      <head><meta charset="UTF-8"><title>Test</title></head>
      <body><h1>Hello PDF</h1><p>This is a test.</p></body>
      </html>
    `;
    
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdf = await page.pdf({ format: 'A4' });
    await browser.close();
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="test.pdf"');
    res.send(pdf);
    
  } catch (error) {
    console.error('Test PDF error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;