const express = require('express');
const router = express.Router();
const ExchangeRateController = require('../controllers/exchangeRateController');
const { protect, adminOnly } = require('../middleware/auth');

 router.use(protect);

/** 
 * Get current exchange rates with fallback 
 */
router.get('/rates', ExchangeRateController.getRates);

/** 
 * Convert amount between currencies with fallback 
 */
router.post('/convert', ExchangeRateController.convert);

/** 
 * Get conversion history for a currency pair
 */
router.get('/history', ExchangeRateController.getHistory);

/** 
 * Get list of supported currencies with details
 */
router.get('/supported', ExchangeRateController.getSupportedCurrencies);

/** 
 * Manually refresh exchange rates (admin only)
 */
router.post('/refresh', adminOnly, ExchangeRateController.refreshRates);

/** 
 * Get rate status and health check
 */
router.get('/status', ExchangeRateController.getStatus);

module.exports = router;