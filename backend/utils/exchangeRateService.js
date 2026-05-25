const axios = require('axios');
const logger = require('../config/logger');

class ExchangeRateService {
  static SUPPORTED_CURRENCIES = ['AED', 'USD', 'EUR', 'GBP', 'SAR', 'QAR', 'KWD', 'BHD', 'OMR'];
  
  static FALLBACK_RATES = {
    AED: 1, USD: 0.2723, EUR: 0.2512, GBP: 0.2154,
    SAR: 1.0215, QAR: 0.9912, KWD: 0.0837, BHD: 0.1026, OMR: 0.1048
  };

  static async getRates(baseCurrency = 'AED') {
    baseCurrency = baseCurrency?.toUpperCase() || 'AED';
    
    // Try API
    try {
      const response = await axios.get(`https://open.er-api.com/v6/latest/${baseCurrency}`, { 
        timeout: 8000,
        headers: { 'Accept': 'application/json' }
      });
      
      if (response.data?.rates) {
        const rates = { ...response.data.rates, [baseCurrency]: 1 };
        
        // Filter to supported currencies
        const filteredRates = {};
        this.SUPPORTED_CURRENCIES.forEach(currency => {
          filteredRates[currency] = rates[currency] || this.getFallbackRate(baseCurrency, currency);
        });
        
        logger.info(`Exchange rates fetched from API for ${baseCurrency}`, {
          baseCurrency,
          source: 'api',
          ratesCount: Object.keys(filteredRates).length
        });
        
        return filteredRates;
      }
    } catch (apiError) {
      logger.warn(`API rate fetch failed for ${baseCurrency}: ${apiError.message}`, {
        baseCurrency,
        error: apiError.message,
        code: apiError.code
      });
    }
    
    // Try database cache
    try {
      const { ExchangeRate } = require('../models/quotation');
      const cached = await ExchangeRate.findOne({ baseCurrency }).sort({ fetchedAt: -1 }).lean();
      
      if (cached?.rates) {
        const rates = cached.rates instanceof Map ? Object.fromEntries(cached.rates) : cached.rates;
        const cacheAge = Math.floor((Date.now() - new Date(cached.fetchedAt).getTime()) / 1000 / 60);
        
        logger.info(`Exchange rates loaded from cache for ${baseCurrency}`, {
          baseCurrency,
          source: 'database',
          cacheAgeMinutes: cacheAge,
          fetchedAt: cached.fetchedAt
        });
        
        return rates;
      } else {
        logger.debug(`No database cache found for ${baseCurrency}`);
      }
    } catch (dbError) {
      logger.error(`Database cache error for ${baseCurrency}: ${dbError.message}`, {
        baseCurrency,
        error: dbError.message
      });
    }
    
    // Use fallback rates
    logger.warn(`Using fallback rates for ${baseCurrency}`, {
      baseCurrency,
      source: 'fallback'
    });
    
    return this.getFallbackRates(baseCurrency);
  }

  static getFallbackRates(baseCurrency = 'AED') {
    baseCurrency = baseCurrency?.toUpperCase() || 'AED';
    
    if (baseCurrency === 'AED') {
      return { ...this.FALLBACK_RATES };
    }
    
    const baseRate = this.FALLBACK_RATES[baseCurrency];
    
    if (!baseRate) {
      logger.warn(`No fallback base rate found for ${baseCurrency}, using AED rates`);
      return { ...this.FALLBACK_RATES, [baseCurrency]: 1 };
    }
    
    const rates = {};
    for (const [currency, rate] of Object.entries(this.FALLBACK_RATES)) {
      rates[currency] = Number((rate / baseRate).toFixed(6));
    }
    rates[baseCurrency] = 1;
    
    return rates;
  }

  static getFallbackRate(fromCurrency, toCurrency) {
    const rates = this.getFallbackRates(fromCurrency);
    return rates[toCurrency] || 1;
  }

  static async convert(amount, fromCurrency, toCurrency = 'AED') {
    if (!amount || amount <= 0) return 0;
    if (fromCurrency === toCurrency) return amount;
    
    fromCurrency = fromCurrency?.toUpperCase() || 'AED';
    toCurrency = toCurrency?.toUpperCase() || 'AED';
    
    try {
      const rates = await this.getRates(fromCurrency);
      const rate = rates[toCurrency];
      
      if (rate && !isNaN(rate)) {
        const result = amount * rate;
        logger.debug(`Currency conversion: ${amount} ${fromCurrency} -> ${result} ${toCurrency}`, {
          amount,
          from: fromCurrency,
          to: toCurrency,
          rate,
          result
        });
        return Number(result.toFixed(2));
      }
      
      logger.warn(`No rate found for ${fromCurrency} to ${toCurrency}, using fallback`, {
        from: fromCurrency,
        to: toCurrency
      });
      
      const fallbackRate = this.getFallbackRate(fromCurrency, toCurrency);
      return Number((amount * fallbackRate).toFixed(2));
      
    } catch (error) {
      logger.error(`Conversion error: ${error.message}`, {
        error: error.message,
        amount,
        from: fromCurrency,
        to: toCurrency
      });
      
      const fallbackRate = this.getFallbackRate(fromCurrency, toCurrency);
      return Number((amount * fallbackRate).toFixed(2));
    }
  }
}

module.exports = ExchangeRateService;