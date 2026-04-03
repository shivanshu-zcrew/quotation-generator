const axios = require('axios');

class ExchangeRateService {
  static SUPPORTED_CURRENCIES = ['AED', 'USD', 'EUR', 'GBP', 'SAR', 'QAR', 'KWD', 'BHD', 'OMR'];
  
  static FALLBACK_RATES = {
    AED: 1, USD: 0.2723, EUR: 0.2512, GBP: 0.2154,
    SAR: 1.0215, QAR: 0.9912, KWD: 0.0837, BHD: 0.1026, OMR: 0.1048
  };

  static async getRates(baseCurrency = 'AED') {
    console.log('========== GET RATES CALLED ==========');
    console.log('Input baseCurrency:', baseCurrency);
    
    baseCurrency = baseCurrency?.toUpperCase() || 'AED';
    console.log('Normalized baseCurrency:', baseCurrency);
    
    // Try API
    try {
      console.log(`🌐 Attempting API call for ${baseCurrency}...`);
      const response = await axios.get(`https://open.er-api.com/v6/latest/${baseCurrency}`, { 
        timeout: 8000,
        headers: { 'Accept': 'application/json' }
      });
      
      console.log('API Response status:', response.status);
      console.log('API has rates:', !!response.data?.rates);
      
      if (response.data?.rates) {
        const rates = { ...response.data.rates, [baseCurrency]: 1 };
        console.log(`✅ API success for ${baseCurrency}`);
        console.log('API rates sample:', {
          AED: rates.AED,
          USD: rates.USD,
          EUR: rates.EUR
        });
        
        // Filter to supported currencies
        const filteredRates = {};
        this.SUPPORTED_CURRENCIES.forEach(currency => {
          filteredRates[currency] = rates[currency] || this.getFallbackRate(baseCurrency, currency);
        });
        
        console.log('Filtered rates sample:', {
          AED: filteredRates.AED,
          USD: filteredRates.USD,
          EUR: filteredRates.EUR
        });
        
        return filteredRates;
      }
    } catch (apiError) {
      console.error(`❌ API failed for ${baseCurrency}:`, apiError.message);
      if (apiError.code) console.error('Error code:', apiError.code);
    }
    
    // Try database cache
    try {
      console.log(`💾 Attempting database cache for ${baseCurrency}...`);
      const { ExchangeRate } = require('../models/quotation');
      const cached = await ExchangeRate.findOne({ baseCurrency }).sort({ fetchedAt: -1 }).lean();
      
      if (cached?.rates) {
        console.log(`✅ Database cache hit for ${baseCurrency}`);
        console.log('Cached at:', cached.fetchedAt);
        const rates = cached.rates instanceof Map ? Object.fromEntries(cached.rates) : cached.rates;
        console.log('Cached rates sample:', {
          AED: rates.AED,
          USD: rates.USD,
          EUR: rates.EUR
        });
        return rates;
      } else {
        console.log(`⚠️ No database cache found for ${baseCurrency}`);
      }
    } catch (dbError) {
      console.error('❌ Database cache error:', dbError.message);
    }
    
    // Use fallback rates
    console.log(`🔄 Using fallback rates for ${baseCurrency}`);
    const fallbackRates = this.getFallbackRates(baseCurrency);
    console.log('Fallback rates sample:', {
      AED: fallbackRates.AED,
      USD: fallbackRates.USD,
      EUR: fallbackRates.EUR
    });
    
    return fallbackRates;
  }

  static getFallbackRates(baseCurrency = 'AED') {
    console.log('========== GET FALLBACK RATES ==========');
    console.log('Input baseCurrency:', baseCurrency);
    
    baseCurrency = baseCurrency?.toUpperCase() || 'AED';
    console.log('Normalized baseCurrency:', baseCurrency);
    
    if (baseCurrency === 'AED') {
      console.log('Using AED fallback rates directly');
      return { ...this.FALLBACK_RATES };
    }
    
    const baseRate = this.FALLBACK_RATES[baseCurrency];
    console.log(`Base rate for ${baseCurrency}:`, baseRate);
    
    if (!baseRate) {
      console.log(`⚠️ No base rate found, using AED rates`);
      return { ...this.FALLBACK_RATES, [baseCurrency]: 1 };
    }
    
    const rates = {};
    for (const [currency, rate] of Object.entries(this.FALLBACK_RATES)) {
      rates[currency] = Number((rate / baseRate).toFixed(6));
    }
    rates[baseCurrency] = 1;
    
    console.log('Converted rates sample:', {
      AED: rates.AED,
      USD: rates.USD,
      EUR: rates.EUR,
      [baseCurrency]: rates[baseCurrency]
    });
    
    return rates;
  }

  static getFallbackRate(fromCurrency, toCurrency) {
    console.log(`Getting fallback rate from ${fromCurrency} to ${toCurrency}`);
    const rates = this.getFallbackRates(fromCurrency);
    const rate = rates[toCurrency] || 1;
    console.log(`Fallback rate: ${rate}`);
    return rate;
  }

  static async convert(amount, fromCurrency, toCurrency = 'AED') {
    console.log('========== CONVERT CALLED ==========');
    console.log(`Amount: ${amount}, From: ${fromCurrency}, To: ${toCurrency}`);
    
    if (!amount || amount <= 0) return 0;
    if (fromCurrency === toCurrency) return amount;
    
    fromCurrency = fromCurrency?.toUpperCase() || 'AED';
    toCurrency = toCurrency?.toUpperCase() || 'AED';
    
    console.log(`Normalized - From: ${fromCurrency}, To: ${toCurrency}`);
    
    try {
      const rates = await this.getRates(fromCurrency);
      console.log(`Rates object type: ${typeof rates}`);
      console.log(`Rates is null? ${rates === null}`);
      console.log(`Rates has USD? ${rates?.USD !== undefined}`);
      console.log(`Rates[${toCurrency}]:`, rates?.[toCurrency]);
      
      const rate = rates[toCurrency];
      
      if (rate && !isNaN(rate)) {
        const result = amount * rate;
        console.log(`✅ Conversion result: ${result}`);
        return Number(result.toFixed(2));
      }
      
      console.warn(`⚠️ No rate found for ${fromCurrency} to ${toCurrency}, using fallback`);
      const fallbackRate = this.getFallbackRate(fromCurrency, toCurrency);
      const result = amount * fallbackRate;
      console.log(`Fallback result: ${result}`);
      return Number(result.toFixed(2));
      
    } catch (error) {
      console.error('❌ Conversion error:', error);
      const fallbackRate = this.getFallbackRate(fromCurrency, toCurrency);
      return Number((amount * fallbackRate).toFixed(2));
    }
  }
}

module.exports = ExchangeRateService;