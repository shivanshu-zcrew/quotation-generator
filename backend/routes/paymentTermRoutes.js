const express = require('express');
const router = express.Router();
const paymentTermController = require('../controllers/paymentTermController');
const { protect } = require('../middleware/auth');
const { companyContext } = require('../middleware/companyContext');

router.use(protect);
router.use(companyContext);

router.get('/', paymentTermController.getAllPaymentTerms);
router.post('/', paymentTermController.createPaymentTerm);
router.delete('/:id', paymentTermController.deletePaymentTerm);

module.exports = router;
