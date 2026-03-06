const express = require('express');
const router = express.Router();
const quotationController = require('../controllers/quotationController');
const { protect, adminOnly } = require('../middleware/auth');

// PROTECT ALL ROUTES - User must be logged in
router.use(protect);

// User routes (accessible by all authenticated users)
router.post('/', quotationController.createQuotation);
router.get('/my-quotations', quotationController.getMyQuotations);
router.get('/:id', quotationController.getQuotation);
router.put('/:id', quotationController.updateQuotation);
router.delete('/:id', quotationController.deleteQuotation);
router.post('/generate-pdf', quotationController.generatePDF);

// Admin only routes
router.get('/', adminOnly, quotationController.getAllQuotations);

// Test route (keep for debugging, but protect it)
router.post('/test-pdf', protect, async (req, res) => {
    try {
      const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
  
      const page = await browser.newPage();
      
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <title>Test</title>
        </head>
        <body>
          <h1>Hello PDF</h1>
          <p>This is a test.</p>
        </body>
        </html>
      `;
      
      await page.setContent(html, { waitUntil: 'networkidle0' });
      
      const pdf = await page.pdf({ format: 'A4' });
      
      await browser.close();
      
      console.log('Test PDF size:', pdf.length);
      console.log('First bytes:', pdf.slice(0, 10).toString());
      
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename="test.pdf"');
      res.send(pdf);
      
    } catch (error) {
      console.error('Test PDF error:', error);
      res.status(500).json({ error: error.message, stack: error.stack });
    }
  });

module.exports = router;