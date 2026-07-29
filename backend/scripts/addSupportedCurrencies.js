// scripts/addSupportedCurrencies.js
// One-time migration: adds all newly-supported currency codes to every
// existing company's acceptedCurrencies list (merges, does not remove any
// currency a company already has).
//
// Usage:
//   MONGODB_URI="<production connection string>" node scripts/addSupportedCurrencies.js
// or, if run on a machine/container that already has the production
// MONGODB_URI set in its environment / .env:
//   node scripts/addSupportedCurrencies.js

const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

const Company = require('../models/company');
const { CURRENCY_CODES } = require('../models/constants');

async function run() {
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI environment variable is required');
  }
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB');

  const companies = await Company.find({});
  console.log(`Found ${companies.length} companies`);

  for (const company of companies) {
    const before = company.acceptedCurrencies || [];
    const merged = Array.from(new Set([...before, ...CURRENCY_CODES]));
    company.acceptedCurrencies = merged;
    await company.save();
    console.log(`Updated ${company.code}: ${before.length} -> ${merged.length} currencies`);
  }

  console.log('Done');
  await mongoose.disconnect();
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
