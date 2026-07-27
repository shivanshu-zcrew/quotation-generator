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
// S3 SIGNED URL ROUTES (for displaying images from S3)
// =============================================================

/**
 * @route   GET /api/quotations/signed-url/:key
 * @desc    Get signed URL for a single S3 file
 * @access  Private (All authenticated users)
 */
router.get('/signed-url/:key', quotationController.getSignedUrl);

/**
 * @route   POST /api/quotations/signed-urls/batch
 * @desc    Get signed URLs for multiple S3 files
 * @access  Private (All authenticated users)
 * @body    { keys: ["key1", "key2", ...] }
 */
router.post('/signed-urls/batch', quotationController.getBatchSignedUrls);

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

/**
 * @route   DELETE /api/quotations/:id/internal-documents/:docId
 * @desc    Remove internal document
 * @access  Private (Creator only)
 */
router.delete('/:id/internal-documents/:docId', quotationController.removeInternalDocument);

/**
 * @route   GET /api/quotations/:id/internal-documents/:docId/download
 * @desc    Get download URL for internal document
 * @access  Private (Internal team only)
 */
router.get('/:id/internal-documents/:docId/download', quotationController.getInternalDocumentDownloadUrl);

// =============================================================
// REVIEW COMMENT ROUTES (highlight-and-comment annotations)
// =============================================================

/**
 * @route   POST /api/quotations/:id/comments
 * @desc    Add a review comment anchored to a highlighted quote
 * @access  Private (Ops, Admin)
 */
router.post('/:id/comments', quotationController.addReviewComment);

/**
 * @route   PATCH /api/quotations/:id/comments/:commentId
 * @desc    Edit a review comment's text
 * @access  Private (Comment author, Admin)
 */
router.patch('/:id/comments/:commentId', quotationController.updateReviewComment);

/**
 * @route   PATCH /api/quotations/:id/comments/:commentId/resolve
 * @desc    Mark a review comment as resolved
 * @access  Private (Creator, Admin)
 */
router.patch('/:id/comments/:commentId/resolve', quotationController.resolveReviewComment);

/**
 * @route   DELETE /api/quotations/:id/comments/:commentId
 * @desc    Delete a review comment
 * @access  Private (Comment author, Admin)
 */
router.delete('/:id/comments/:commentId', quotationController.deleteReviewComment);

// =============================================================
// USER QUOTATION ROUTES
// =============================================================
router.post('/', quotationController.createQuotation);
router.get('/my-quotations', quotationController.getMyQuotations);
router.get('/my-quotations/stats', quotationController.getMyQuotationsStats);
// Must stay before '/:id' — otherwise Express would match "pdf-metrics" as an :id value.
router.get('/pdf-metrics', adminOnly, quotationController.getPDFMetrics);
router.get('/:id', quotationController.getQuotation);
router.put('/:id', quotationController.updateQuotation);
router.delete('/:id', quotationController.deleteQuotation);
router.post('/generate-pdf', quotationController.generatePDF);
router.patch('/:id/query-date', quotationController.updateQueryDate);
router.patch('/:id/award', quotationController.awardQuotation);
router.patch('/:id/cancel', quotationController.cancelQuotation);
router.post('/presign-image', quotationController.presignItemImageUpload);

// =============================================================
// ADMIN ONLY ROUTES
// =============================================================
router.get('/', adminOnly, quotationController.getAllQuotations);

module.exports = router;