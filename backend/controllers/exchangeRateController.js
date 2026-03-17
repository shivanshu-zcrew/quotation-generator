const { ExchangeRate, ExchangeRateService } = require('../models/quotation');
const axios = require('axios');

// ===========================================
// EXCHANGE RATE CONTROLLER
// ===========================================

class ExchangeRateController {
  
  /**
   * Get exchange rates with fallback to previous rates
   * If API fails, returns the most recent cached rates
   */
  static async getRates(req, res) {
    try {
      const { base = 'AED' } = req.query;
      
      // Validate base currency
      const validCurrencies = ['AED', 'USD', 'SAR', 'QAR', 'KWD', 'BHD', 'OMR'];
      if (!validCurrencies.includes(base)) {
        return res.status(400).json({ 
          success: false,
          message: 'Invalid base currency. Supported: AED, USD, SAR, QAR, KWD, BHD, OMR' 
        });
      }

      // Try to get fresh rates
      let rates;
      let source = 'api';
      let fetchedAt = new Date();
      
      try {
        // Attempt to fetch fresh rates
        console.log(`[ExchangeRate] Fetching fresh rates for ${base}...`);
        rates = await ExchangeRateService.getRates(base);
        
        // Save to database
        await ExchangeRate.create({
          baseCurrency: base,
          rates,
          fetchedAt
        });
        
        console.log(`[ExchangeRate] Fresh rates fetched successfully`);
      } catch (apiError) {
        console.error(`[ExchangeRate] API fetch failed:`, apiError.message);
        
        // API failed - try to get most recent rates from database
        const cached = await ExchangeRate.findOne({ baseCurrency: base })
          .sort({ fetchedAt: -1 })
          .limit(1);
        
        if (cached) {
          // Use cached rates
          rates = cached.rates;
          fetchedAt = cached.fetchedAt;
          source = 'cache';
          console.log(`[ExchangeRate] Using cached rates from ${fetchedAt}`);
        } else {
          // No cache available - use fallback static rates
          rates = ExchangeRateService.getFallbackRates();
          source = 'fallback';
          console.log(`[ExchangeRate] Using fallback static rates`);
        }
      }

      // Calculate age of rates if from cache/fallback
      let age = null;
      if (source !== 'api') {
        age = Math.floor((Date.now() - new Date(fetchedAt).getTime()) / 1000); // age in seconds
      }

      res.json({
        success: true,
        base,
        rates,
        source,
        fetchedAt,
        age: age ? `${age} seconds old` : null,
        message: source === 'api' ? 'Fresh rates fetched' : 
                 source === 'cache' ? 'Using cached rates (API unavailable)' : 
                 'Using fallback rates (no cache available)'
      });

    } catch (error) {
      console.error('[ExchangeRate] Fatal error in getRates:', error);
      
      // Ultimate fallback - return static rates
      res.status(503).json({
        success: false,
        message: 'Unable to fetch exchange rates',
        rates: ExchangeRateService.getFallbackRates(),
        source: 'emergency-fallback',
        error: error.message
      });
    }
  }

  /**
   * Convert amount between currencies with fallback
   */
  static async convert(req, res) {
    try {
      const { amount, from, to = 'AED' } = req.body;

      // Validate inputs
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

      // Validate currencies
      const validCurrencies = ['AED', 'USD', 'SAR', 'QAR', 'KWD', 'BHD', 'OMR'];
      if (!validCurrencies.includes(from) || !validCurrencies.includes(to)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid currency. Supported: AED, USD, SAR, QAR, KWD, BHD, OMR'
        });
      }

      // If same currency, return original amount
      if (from === to) {
        return res.json({
          success: true,
          amount,
          from,
          to,
          result: amount,
          rate: 1,
          source: 'direct',
          timestamp: new Date()
        });
      }

      // Try to get conversion rate
      let result;
      let rate;
      let source = 'api';
      let rateInfo = null;

      try {
        // Attempt conversion with fresh rates
        result = await ExchangeRateService.convert(amount, from, to);
        rate = result / amount;
        
        // Get rate info for response
        const rates = await ExchangeRateService.getRates(from);
        rateInfo = {
          rate,
          baseCurrency: from,
          targetCurrency: to,
          timestamp: new Date()
        };
        
        console.log(`[ExchangeRate] Converted ${amount} ${from} to ${result} ${to} using fresh rates`);
      } catch (apiError) {
        console.error(`[ExchangeRate] Conversion failed, trying cache:`, apiError.message);
        
        // Try to get cached rates
        const cached = await ExchangeRate.findOne({ baseCurrency: from })
          .sort({ fetchedAt: -1 })
          .limit(1);
        
        if (cached && cached.rates.get(to)) {
          // Use cached rate
          rate = cached.rates.get(to);
          result = amount * rate;
          source = 'cache';
          rateInfo = {
            rate,
            baseCurrency: from,
            targetCurrency: to,
            timestamp: cached.fetchedAt,
            cached: true
          };
          console.log(`[ExchangeRate] Used cached rate: 1 ${from} = ${rate} ${to}`);
        } else {
          // Try reverse conversion using AED as bridge
          try {
            // Convert from -> AED using fallback
            const toAED = await ExchangeRateService.convert(amount, from, 'AED');
            // Then AED -> to using fallback
            const rates = ExchangeRateService.getFallbackRates();
            const aedToTarget = 1 / rates[to]; // Inverse rate
            result = toAED * aedToTarget;
            rate = result / amount;
            source = 'calculated-fallback';
            
            console.log(`[ExchangeRate] Used calculated fallback rate: 1 ${from} = ${rate} ${to}`);
          } catch (fallbackError) {
            // Ultimate fallback - use hardcoded approximate rates
            const approximateRates = {
              'USD': 0.27,
              'SAR': 1.02,
              'QAR': 0.99,
              'KWD': 0.084,
              'BHD': 0.103,
              'OMR': 0.105
            };
            
            if (from === 'AED') {
              rate = approximateRates[to] || 1;
            } else if (to === 'AED') {
              rate = 1 / (approximateRates[from] || 1);
            } else {
              // Cross currency: from -> AED -> to
              const fromToAED = 1 / (approximateRates[from] || 1);
              const aedToTarget = approximateRates[to] || 1;
              rate = fromToAED * aedToTarget;
            }
            
            result = amount * rate;
            source = 'hardcoded-fallback';
            console.log(`[ExchangeRate] Used hardcoded fallback rate: 1 ${from} = ${rate} ${to}`);
          }
        }
      }

      res.json({
        success: true,
        amount,
        from,
        to,
        result: Math.round(result * 100) / 100, // Round to 2 decimals
        rate: Math.round(rate * 10000) / 10000, // Round to 4 decimals
        source,
        rateInfo,
        timestamp: new Date()
      });

    } catch (error) {
      console.error('[ExchangeRate] Fatal error in convert:', error);
      
      // Ultimate fallback - return original amount with warning
      res.status(503).json({
        success: false,
        message: 'Unable to convert currency',
        amount,
        from,
        to,
        result: amount, // Return original amount as fallback
        rate: 1,
        source: 'error-fallback',
        error: error.message
      });
    }
  }

  /**
   * Get conversion history for a currency pair
   */
  static async getHistory(req, res) {
    try {
      const { from, to, days = 30 } = req.query;

      if (!from || !to) {
        return res.status(400).json({
          success: false,
          message: 'Both from and to currencies are required'
        });
      }

      // Get cached rates from last N days
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);

      const history = await ExchangeRate.find({
        baseCurrency: from,
        fetchedAt: { $gte: cutoffDate }
      }).sort({ fetchedAt: -1 });

      // Format history data
      const rates = history.map(entry => ({
        date: entry.fetchedAt,
        rate: entry.rates.get(to),
        source: 'cache'
      }));

      res.json({
        success: true,
        from,
        to,
        days,
        rates,
        count: rates.length
      });

    } catch (error) {
      console.error('[ExchangeRate] Error in getHistory:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching rate history',
        error: error.message
      });
    }
  }

  /**
   * Get supported currencies with details
   */
  static async getSupportedCurrencies(req, res) {
    try {
      const { CURRENCIES } = require('../models/quotation');
      
      // Get latest rates for each currency (if available)
      const latestRates = {};
      
      for (const currency of Object.keys(CURRENCIES)) {
        const cached = await ExchangeRate.findOne({ baseCurrency: currency })
          .sort({ fetchedAt: -1 })
          .limit(1);
        
        latestRates[currency] = cached ? {
          rates: cached.rates,
          fetchedAt: cached.fetchedAt
        } : null;
      }

      res.json({
        success: true,
        currencies: CURRENCIES,
        latestRates,
        baseCurrency: 'AED', // All companies use AED as base
        timestamp: new Date()
      });

    } catch (error) {
      console.error('[ExchangeRate] Error in getSupportedCurrencies:', error);
      
      // Fallback - return just currency list
      const { CURRENCIES } = require('../models/quotation');
      res.json({
        success: true,
        currencies: CURRENCIES,
        latestRates: null,
        message: 'Unable to fetch latest rates',
        timestamp: new Date()
      });
    }
  }

  /**
   * Manually refresh exchange rates (admin only)
   */
  static async refreshRates(req, res) {
    try {
      // Only admin can manually refresh
      if (req.user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          message: 'Only admins can manually refresh rates'
        });
      }

      const { base = 'AED' } = req.body;
      
      // Force fetch fresh rates
      const rates = await ExchangeRateService.getRates(base);
      
      // Save to database
      const newRate = await ExchangeRate.create({
        baseCurrency: base,
        rates,
        fetchedAt: new Date()
      });

      // Clean up old rates (keep only last 100)
      const count = await ExchangeRate.countDocuments({ baseCurrency: base });
      if (count > 100) {
        const oldest = await ExchangeRate.find({ baseCurrency: base })
          .sort({ fetchedAt: 1 })
          .limit(count - 100);
        
        for (const old of oldest) {
          await old.deleteOne();
        }
      }

      res.json({
        success: true,
        message: 'Exchange rates refreshed successfully',
        base,
        rates,
        fetchedAt: newRate.fetchedAt
      });

    } catch (error) {
      console.error('[ExchangeRate] Error in refreshRates:', error);
      res.status(500).json({
        success: false,
        message: 'Error refreshing rates',
        error: error.message
      });
    }
  }

  /**
   * Get rate status and health check
   */
  static async getStatus(req, res) {
    try {
      // Get latest rates for all base currencies
      const status = {};
      
      for (const currency of ['AED', 'USD', 'SAR', 'QAR', 'KWD', 'BHD', 'OMR']) {
        const latest = await ExchangeRate.findOne({ baseCurrency: currency })
          .sort({ fetchedAt: -1 })
          .limit(1);
        
        if (latest) {
          const age = Math.floor((Date.now() - new Date(latest.fetchedAt).getTime()) / 1000);
          status[currency] = {
            available: true,
            fetchedAt: latest.fetchedAt,
            age: `${age} seconds`,
            isFresh: age < 3600, // Less than 1 hour old
            ratesCount: Object.keys(latest.rates).length
          };
        } else {
          status[currency] = {
            available: false,
            message: 'No rates available'
          };
        }
      }

      // Try to fetch a fresh rate to test API
      let apiStatus = 'unknown';
      try {
        await axios.get('https://api.frankfurter.app/latest?from=AED', { timeout: 5000 });
        apiStatus = 'available';
      } catch (error) {
        apiStatus = 'unavailable';
      }

      res.json({
        success: true,
        apiStatus,
        databaseStatus: status,
        fallbackRates: ExchangeRateService.getFallbackRates(),
        timestamp: new Date()
      });

    } catch (error) {
      console.error('[ExchangeRate] Error in getStatus:', error);
      res.status(500).json({
        success: false,
        message: 'Error checking status',
        error: error.message
      });
    }
  }
}

module.exports = ExchangeRateController;