// routes/companyRoutes.js
const express = require('express');
const router = express.Router();
const companyController = require('../controllers/companyController');
const { protect, adminOnly } = require('../middleware/auth');

// All routes require authentication
router.use(protect);

// Public company routes (accessible by all authenticated users)
router.get('/', companyController.getAllCompanies);
router.get('/:id', companyController.getCompanyById);
router.get('/code/:code', companyController.getCompanyByCode);
router.get('/:id/stats', companyController.getCompanyStats);
router.get('/:id/currencies', companyController.getCompanyCurrencies);

// Admin only routes
router.post('/', adminOnly, companyController.createCompany);
router.put('/:id', adminOnly, companyController.updateCompany);
router.delete('/:id', adminOnly, companyController.deleteCompany);
router.patch('/:id/toggle-status', adminOnly, companyController.toggleCompanyStatus);
router.post('/bulk', adminOnly, companyController.bulkImportCompanies);

module.exports = router;