// routes/companyRoutes.js
const express = require('express');
const router = express.Router();
const companyController = require('../controllers/companyController');
const { protect, adminOnly } = require('../middleware/auth');

// ===========================================================
// PROTECT ALL ROUTES - User must be logged in
// ===========================================================
router.use(protect);

// ===========================================================
// PUBLIC COMPANY ROUTES (All authenticated users)
// ===========================================================

/**
 * @route   GET /api/companies
 * @desc    Get all active companies
 * @access  Private
 */
router.get('/', companyController.getAllCompanies);

/**
 * @route   GET /api/companies/:id
 * @desc    Get company by ID
 * @access  Private
 */
router.get('/:id', companyController.getCompanyById);

/**
 * @route   GET /api/companies/code/:code
 * @desc    Get company by code (e.g., MEGA_REPAIR)
 * @access  Private
 */
router.get('/code/:code', companyController.getCompanyByCode);

/**
 * @route   GET /api/companies/:id/stats
 * @desc    Get company statistics
 * @access  Private
 */
router.get('/:id/stats', companyController.getCompanyStats);

/**
 * @route   GET /api/companies/:id/currencies
 * @desc    Get company currency settings
 * @access  Private
 */
router.get('/:id/currencies', companyController.getCompanyCurrencies);

// ===========================================================
// ADMIN ONLY ROUTES
// ===========================================================

/**
 * @route   POST /api/companies
 * @desc    Create a new company
 * @access  Admin only
 */
router.post('/', adminOnly, companyController.createCompany);

/**
 * @route   PUT /api/companies/:id
 * @desc    Update a company
 * @access  Admin only
 */
router.put('/:id', adminOnly, companyController.updateCompany);

/**
 * @route   DELETE /api/companies/:id
 * @desc    Delete a company (soft delete if has quotations)
 * @access  Admin only
 */
router.delete('/:id', adminOnly, companyController.deleteCompany);

/**
 * @route   PATCH /api/companies/:id/toggle-status
 * @desc    Toggle company active status
 * @access  Admin only
 */
router.patch('/:id/toggle-status', adminOnly, companyController.toggleCompanyStatus);

/**
 * @route   POST /api/companies/bulk
 * @desc    Bulk import companies
 * @access  Admin only
 */
router.post('/bulk', adminOnly, companyController.bulkImportCompanies);

module.exports = router;