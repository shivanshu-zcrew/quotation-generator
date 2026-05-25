const { ExchangeRate } = require('../models/quotation');
const ExchangeRateService = require('../utils/exchangeRateService.js');
const axios = require('axios');
const logger = require('../config/logger');

class ExchangeRateController {
  
  static async getRates(req, res) {
    try {
      const { base = 'AED' } = req.query;
      
      const validCurrencies = ExchangeRateService.SUPPORTED_CURRENCIES;
      if (!validCurrencies.includes(base)) {
        return res.status(400).json({ 
          success: false,
          message: `Invalid base currency. Supported: ${validCurrencies.join(', ')}`
        });
      }

      let rates, source = 'api', fetchedAt = new Date();
      
      try {
        rates = await ExchangeRateService.getRates(base);
        
        // Save to database for future use (don't await to not block response)
        ExchangeRate.create({ baseCurrency: base, rates, fetchedAt })
          .catch(err => logger.warn(`Failed to cache exchange rates for ${base}: ${err.message}`));
          
      } catch (apiError) {
        logger.warn(`API rate fetch failed for ${base}, trying cache: ${apiError.message}`);
        
        const cached = await ExchangeRate.findOne({ baseCurrency: base })
          .sort({ fetchedAt: -1 })
          .lean();
          
        if (cached?.rates) {
          rates = cached.rates;
          fetchedAt = cached.fetchedAt;
          source = 'cache';
          logger.info(`Using cached exchange rates for ${base} (${Math.floor((Date.now() - new Date(fetchedAt).getTime()) / 1000 / 60)} min old)`);
        } else {
          rates = ExchangeRateService.getFallbackRates(base);
          source = 'fallback';
          logger.warn(`Using fallback rates for ${base} - no cache available`);
        }
      }

      res.json({
        success: true,
        base,
        rates,
        source,
        fetchedAt,
        message: source === 'api' ? 'Fresh rates fetched' : 
                 source === 'cache' ? `Using cached rates (${Math.floor((Date.now() - new Date(fetchedAt).getTime()) / 1000 / 60)} min old)` : 
                 'Using fallback rates'
      });

    } catch (error) {
      logger.error(`Get rates error for ${req.query.base || 'AED'}: ${error.message}`, {
        error: error.message,
        base: req.query.base
      });
      res.status(503).json({
        success: false,
        message: 'Unable to fetch exchange rates',
        rates: ExchangeRateService.getFallbackRates(),
        error: error.message
      });
    }
  }

  static async convert(req, res) {
    try {
      const { amount, from, to = 'AED' } = req.body;

      if (!amount || amount <= 0) {
        return res.status(400).json({ 
          success: false, 
          message: 'Valid amount is required' 
        });
      }
      
      if (!from) {
        return res.status(400).json({ 
          success: false, 
          message: 'Source currency is required' 
        });
      }

      if (from === to) {
        return res.json({ 
          success: true, 
          amount, 
          from, 
          to, 
          result: amount, 
          rate: 1 
        });
      }

      const result = await ExchangeRateService.convert(amount, from, to);
      const rate = result / amount;

      res.json({
        success: true,
        amount,
        from,
        to,
        result,
        rate: Number(rate.toFixed(6)),
        timestamp: new Date()
      });

    } catch (error) {
      logger.error(`Convert error: ${error.message}`, {
        error: error.message,
        amount: req.body.amount,
        from: req.body.from,
        to: req.body.to
      });
      res.status(503).json({
        success: false,
        message: 'Unable to convert currency',
        result: req.body.amount,
        rate: 1,
        error: error.message
      });
    }
  }

  static async getSupportedCurrencies(req, res) {
    const currencies = {
      AED: { code: 'AED', symbol: 'د.إ', name: 'UAE Dirham', decimalPlaces: 2 },
      USD: { code: 'USD', symbol: '$', name: 'US Dollar', decimalPlaces: 2 },
      EUR: { code: 'EUR', symbol: '€', name: 'Euro', decimalPlaces: 2 },
      GBP: { code: 'GBP', symbol: '£', name: 'British Pound', decimalPlaces: 2 },
      SAR: { code: 'SAR', symbol: 'ر.س', name: 'Saudi Riyal', decimalPlaces: 2 },
      QAR: { code: 'QAR', symbol: 'ر.ق', name: 'Qatari Riyal', decimalPlaces: 2 },
      KWD: { code: 'KWD', symbol: 'د.ك', name: 'Kuwaiti Dinar', decimalPlaces: 3 },
      BHD: { code: 'BHD', symbol: '.د.ب', name: 'Bahraini Dinar', decimalPlaces: 3 },
      OMR: { code: 'OMR', symbol: 'ر.ع.', name: 'Omani Rial', decimalPlaces: 3 }
    };

    res.json({ 
      success: true, 
      currencies: Object.keys(currencies).map(key => currencies[key]),
      supportedCurrencies: ExchangeRateService.SUPPORTED_CURRENCIES,
      timestamp: new Date() 
    });
  }

  static async refreshRates(req, res) {
    try {
      if (req.user?.role !== 'admin') {
        logger.warn(`Unauthorized refresh rates attempt by user: ${req.user?.id}`, {
          userId: req.user?.id,
          userRole: req.user?.role
        });
        return res.status(403).json({ 
          success: false, 
          message: 'Admin access required' 
        });
      }

      const { base = 'AED' } = req.body;
      
      logger.info(`Manual rate refresh requested for ${base} by admin`, {
        base,
        adminId: req.user.id,
        adminEmail: req.user.email
      });
      
      const rates = await ExchangeRateService.forceRefresh(base);
      
      // Clean up old records (keep last 100)
      const count = await ExchangeRate.countDocuments({ baseCurrency: base });
      if (count > 100) {
        const oldest = await ExchangeRate.find({ baseCurrency: base })
          .sort({ fetchedAt: 1 })
          .limit(count - 100);
        await Promise.all(oldest.map(doc => doc.deleteOne()));
        logger.info(`Cleaned up ${oldest.length} old exchange rate records for ${base}`);
      }

      logger.info(`Exchange rates refreshed successfully for ${base}`, {
        base,
        rateCount: Object.keys(rates).length,
        adminId: req.user.id
      });

      res.json({ 
        success: true, 
        message: 'Rates refreshed successfully', 
        base, 
        rates 
      });

    } catch (error) {
      logger.error(`Refresh rates error: ${error.message}`, {
        error: error.message,
        base: req.body.base,
        adminId: req.user?.id
      });
      res.status(500).json({ 
        success: false, 
        message: 'Error refreshing rates', 
        error: error.message 
      });
    }
  }

  static async getStatus(req, res) {
    try {
      const status = {};
      const currencies = ExchangeRateService.SUPPORTED_CURRENCIES.slice(0, 7); // First 7 for status check
      
      let cachedCount = 0;
      let freshCount = 0;
      
      for (const currency of currencies) {
        const latest = await ExchangeRate.findOne({ baseCurrency: currency })
          .sort({ fetchedAt: -1 })
          .lean();
        
        if (latest) {
          const age = Math.floor((Date.now() - new Date(latest.fetchedAt).getTime()) / 1000);
          const isFresh = age < 3600;
          cachedCount++;
          if (isFresh) freshCount++;
          
          status[currency] = {
            available: true,
            fetchedAt: latest.fetchedAt,
            age: `${Math.floor(age / 3600)}h ${Math.floor((age % 3600) / 60)}m`,
            isFresh
          };
        } else {
          status[currency] = { available: false };
        }
      }

      let apiStatus = 'unknown';
      let apiLatency = null;
      
      try {
        const start = Date.now();
        await axios.get('https://open.er-api.com/v6/latest/AED', { timeout: 5000 });
        apiLatency = Date.now() - start;
        apiStatus = 'available';
      } catch (error) {
        apiStatus = error.code === 'ECONNABORTED' ? 'timeout' : 'unavailable';
        logger.warn(`Exchange rate API status check failed: ${apiStatus}`, {
          error: error.message,
          code: error.code
        });
      }

      // Log status summary periodically (not on every request - this is just for info)
      if (process.env.NODE_ENV === 'development') {
        logger.debug(`Exchange rate status: API=${apiStatus}, Cache=${cachedCount}/${currencies.length}, Fresh=${freshCount}`);
      }

      res.json({
        success: true,
        api: { status: apiStatus, latency: apiLatency ? `${apiLatency}ms` : null },
        database: status,
        fallbackRates: ExchangeRateService.getFallbackRates(),
        timestamp: new Date()
      });

    } catch (error) {
      logger.error(`Status check error: ${error.message}`, {
        error: error.message
      });
      res.status(500).json({ 
        success: false, 
        message: 'Error checking status', 
        error: error.message 
      });
    }
  }
}

module.exports = ExchangeRateController;