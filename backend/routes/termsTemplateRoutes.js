const express = require('express');
const router = express.Router();
const termsTemplateController = require('../controllers/termsTemplateController');
const { protect } = require('../middleware/auth');
const { companyContext } = require('../middleware/companyContext');

router.use(protect);
router.use(companyContext);

router.get('/', termsTemplateController.getAllTermsTemplates);
router.post('/', termsTemplateController.createTermsTemplate);
router.delete('/:id', termsTemplateController.deleteTermsTemplate);

module.exports = router;
