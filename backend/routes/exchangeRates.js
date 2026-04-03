const express = require('express');
const router = express.Router();
const ExchangeRateController = require('../controllers/exchangeRateController');
const { protect, adminOnly } = require('../middleware/auth');

router.use(protect);

router.get('/rates', ExchangeRateController.getRates);
router.post('/convert', ExchangeRateController.convert);
router.get('/supported', ExchangeRateController.getSupportedCurrencies);
router.get('/status', ExchangeRateController.getStatus);
router.post('/refresh', adminOnly, ExchangeRateController.refreshRates);

module.exports = router;