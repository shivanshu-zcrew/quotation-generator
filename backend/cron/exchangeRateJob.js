// cron/exchangeRateJob.js
//
// Refreshes AED-based exchange rates every hour and stores them in the
// ExchangeRate collection (the schema already TTL-expires docs after 1h,
// so this keeps a fresh cached row that ExchangeRateService.getRates can
// fall back to when the live API is unreachable).
//
// Wire it up once at server startup:
//
//   const { startExchangeRateCron } = require('./cron/exchangeRateJob');
//   startExchangeRateCron();
//
// Requires: npm i node-cron
//
// Rate direction reminder: open.er-api.com/v6/latest/AED returns
// "1 AED = <rate> <currency>". Convert a foreign amount to AED by DIVIDING
// by the rate (handled in createQuotation/updateQuotation, not here).

const cron = require('node-cron');
const axios = require('axios');

// Adjust this path to wherever your Quotation model file lives — it exports
// { Quotation, ExchangeRate, ExchangeRateService }.
const { ExchangeRate } = require('../models/quotation');

let logger;
try {
  logger = require('../utils/logger'); // use your app logger if present
} catch (_) {
  logger = console; // fallback
}

const BASE_CURRENCY = 'AED';
const API_URL = `https://open.er-api.com/v6/latest/${BASE_CURRENCY}`;

/**
 * Fetch fresh rates and upsert a row into the ExchangeRate collection.
 * Safe to call directly (e.g. once at startup, before the first cron tick).
 */
async function refreshExchangeRates() {
  try {
    const response = await axios.get(API_URL, { timeout: 8000 });

    if (!response.data || response.data.result !== 'success' || !response.data.rates) {
      throw new Error('Exchange rate API returned an unexpected payload');
    }

    const rates = { ...response.data.rates, [BASE_CURRENCY]: 1 };

    await ExchangeRate.create({
      baseCurrency: BASE_CURRENCY,
      rates,
      fetchedAt: new Date(),
    });

    logger.info?.(`[exchangeRateCron] refreshed ${Object.keys(rates).length} rates (1 ${BASE_CURRENCY} = ${rates.USD} USD)`)
      || logger.log(`[exchangeRateCron] refreshed rates`);

    return rates;
  } catch (err) {
    // Don't throw out of the cron tick — just log. getRates() will keep
    // serving the last cached row (or fallback rates) until the next success.
    (logger.error || logger.log)(`[exchangeRateCron] refresh failed: ${err.message}`);
    return null;
  }
}

/**
 * Schedule the hourly job. Returns the cron task so callers can stop it in tests.
 */
function startExchangeRateCron() {
  // Run an immediate refresh on boot so we don't wait up to an hour for the
  // first populated row.
  refreshExchangeRates();

  // At minute 0 of every hour.
  const task = cron.schedule('0 * * * *', () => {
    refreshExchangeRates();
  });

  (logger.info || logger.log)('[exchangeRateCron] scheduled hourly (0 * * * *)');
  return task;
}

module.exports = { startExchangeRateCron, refreshExchangeRates, BASE_CURRENCY, API_URL };