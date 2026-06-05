// scripts/fetchRates.js
//
// Standalone script: fetch the latest AED-based exchange rates from
// open.er-api.com and (optionally) persist them into the ExchangeRate
// collection. Run manually with:  node scripts/fetchRates.js
//
// IMPORTANT — rate direction:
// open.er-api.com/v6/latest/AED returns "1 AED = X <currency>".
// So rates.USD ≈ 0.2723 means 1 AED = 0.2723 USD  (i.e. 1 USD ≈ 3.67 AED).
// To convert an amount expressed in <currency> INTO AED you DIVIDE by the rate.

const axios = require('axios');

const BASE_CURRENCY = 'AED';
const API_URL = `https://open.er-api.com/v6/latest/${BASE_CURRENCY}`;

/**
 * Fetch fresh AED-based rates. Always includes AED: 1.
 * Returns a plain object: { AED: 1, USD: 0.2723, EUR: ..., ... }
 */
async function fetchRates() {
  const response = await axios.get(API_URL, { timeout: 8000 });

  if (!response.data || response.data.result !== 'success' || !response.data.rates) {
    throw new Error(`Exchange rate API returned an unexpected payload: ${JSON.stringify(response.data).slice(0, 200)}`);
  }

  return { ...response.data.rates, [BASE_CURRENCY]: 1 };
}

/**
 * Persist rates into the ExchangeRate collection. The schema stores `rates`
 * as a Map and auto-expires documents after 1 hour (TTL index on fetchedAt),
 * so each run effectively refreshes the cache.
 */
async function saveRates(rates) {
  // Lazy-require so this file can also be used purely as a fetcher without a DB.
  const { ExchangeRate } = require('../models/quotation'); // adjust path to your model file
  const doc = await ExchangeRate.create({
    baseCurrency: BASE_CURRENCY,
    rates,
    fetchedAt: new Date(),
  });
  return doc;
}

// Allow `require()` usage by the cron, and direct CLI execution.
module.exports = { fetchRates, saveRates, BASE_CURRENCY, API_URL };

if (require.main === module) {
  (async () => {
    try {
      const rates = await fetchRates();
      console.log(`[fetchRates] 1 ${BASE_CURRENCY} equals:`);
      console.log(`  USD: ${rates.USD}  (=> 1 USD = ${(1 / rates.USD).toFixed(4)} AED)`);
      console.log(`  EUR: ${rates.EUR}`);
      console.log(`  GBP: ${rates.GBP}`);
      console.log(`  total currencies: ${Object.keys(rates).length}`);

      // Persist only if a DB connection is available in this process.
      if (process.env.MONGODB_URI) {
        const mongoose = require('mongoose');
        await mongoose.connect(process.env.MONGODB_URI);
        const doc = await saveRates(rates);
        console.log(`[fetchRates] saved ExchangeRate doc ${doc._id}`);
        await mongoose.disconnect();
      } else {
        console.log('[fetchRates] MONGODB_URI not set — fetched only, not saved.');
      }
      process.exit(0);
    } catch (err) {
      console.error('[fetchRates] failed:', err.message);
      process.exit(1);
    }
  })();
}