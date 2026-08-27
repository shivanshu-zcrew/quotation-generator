/**
 * Apply already-created Zoho Books estimate/contact links onto freshly-
 * imported historical quotations — NO Zoho API calls are made by this
 * script at all.
 *
 * Context: the 86 historical "Awarded" quotations from QuotationData.xlsx
 * were already backfilled into a real Zoho Books account (57 contacts +
 * 86 Estimates actually created) during local validation, using
 * backfillHistoricalAwardsToZoho.js. Running that same script again
 * against production would create a SECOND, duplicate set of real Zoho
 * records for the exact same historical deals. This script instead just
 * writes the already-known Zoho IDs onto production's copies of the same
 * quotations/customers (matched by the original historical Quote #,
 * stored in `ourRef`) — a pure database operation.
 *
 * Prerequisite: run importFromExcel.js against this environment FIRST, so
 * the quotations/customers this script looks for actually exist.
 *
 * Usage:
 *   node scripts/applyZohoBacklinksFromMapping.js --company MRME [--dry-run] [--verbose]
 *
 * Reads scripts/zoho-estimate-mapping-<CODE>.json (generated once, during
 * local validation) — one entry per historical quotation:
 *   { ourRef, zohoEstimateId, zohoEstimateNumber, zohoEstimateUrl,
 *     zohoSyncedAt, customerName, customerZohoId }
 */

const mongoose = require('mongoose');
const path     = require('path');
const fs       = require('fs');
const dotenv   = require('dotenv');

dotenv.config({ path: path.join(__dirname, '../.env') });

const { Quotation } = require('../models/quotation');
const { Customer }  = require('../models/customer');
const Company        = require('../models/company');
require('../models/user'); // Quotation's pre-find hook auto-populates createdBy/awardedBy — needs this registered

const args       = process.argv.slice(2);
const DRY_RUN    = args.includes('--dry-run');
const VERBOSE    = args.includes('--verbose');
const companyArg = (() => {
  const i = args.indexOf('--company');
  return i !== -1 ? args[i + 1] : null;
})();

async function run() {
  if (!companyArg) {
    console.error('❌  Usage: node scripts/applyZohoBacklinksFromMapping.js --company <CODE> [--dry-run]');
    process.exit(1);
  }

  const mappingFile = path.join(__dirname, `zoho-estimate-mapping-${companyArg.toUpperCase()}.json`);
  if (!fs.existsSync(mappingFile)) {
    console.error(`❌  Mapping file not found: ${mappingFile}`);
    process.exit(1);
  }
  const mapping = JSON.parse(fs.readFileSync(mappingFile, 'utf8'));
  console.log(`📋  Loaded ${mapping.length} mapping entries from ${path.basename(mappingFile)}`);

  if (DRY_RUN) console.log('🔵  DRY RUN — no writes will be made\n');

  const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
  console.log('Connecting to MongoDB...');
  await mongoose.connect(mongoUri);
  console.log('✅  Connected\n');

  const company = await Company.findOne({ code: companyArg.toUpperCase() });
  if (!company) {
    console.error(`❌  Company not found (code="${companyArg}")`);
    await mongoose.disconnect();
    process.exit(1);
  }
  console.log(`🏢  Company: ${company.name} (${company.code})\n`);

  let quotationsLinked = 0, quotationsNotFound = 0, alreadyLinked = 0;
  let customersLinked = 0, customersAlreadyLinked = 0, customersConflict = 0;
  const customersDone = new Set(); // avoid redundant writes when many quotations share one customer

  for (const entry of mapping) {
    const quotation = await Quotation.findOne({ companyId: company._id, ourRef: entry.ourRef });
    if (!quotation) {
      console.log(`  ⚠️   No quotation found with ourRef="${entry.ourRef}" — did the import run first?`);
      quotationsNotFound++;
      continue;
    }

    if (quotation.zohoEstimateId) {
      console.log(`  ⏩  ${entry.ourRef} — already has a Zoho estimate linked, skipping`);
      alreadyLinked++;
      continue;
    }

    // ── Link the customer first (only once per distinct customer) ────────
    // quotation.customerId comes back already populated into a full object
    // (Quotation schema's pre-find hook auto-populates it, same as
    // companyId/createdBy) — not a raw ObjectId, so it needs unwrapping.
    const customerId = quotation.customerId?._id?.toString();
    if (customerId && !customersDone.has(customerId)) {
      customersDone.add(customerId);
      const customer = await Customer.findById(customerId);
      if (customer) {
        if (customer.zohoId === entry.customerZohoId) {
          customersAlreadyLinked++;
        } else if (customer.zohoId) {
          // Customer already links to a DIFFERENT Zoho contact than what we
          // recorded during local validation — don't silently overwrite;
          // this needs a human look (same class of issue as the ALEC
          // Facades / Schlumberger case-variant duplicates found locally).
          console.log(`  ⚠️   CONFLICT: customer "${customer.name}" already has zohoId ${customer.zohoId}, mapping says ${entry.customerZohoId} — left unchanged, please review manually.`);
          customersConflict++;
        } else {
          // Guard against the exact MongoDB unique-index collision found
          // locally: another customer document might already hold this
          // zohoId (a pre-existing, differently-named production record
          // for the same real company).
          const holder = await Customer.findOne({ companyId: company._id, zohoId: entry.customerZohoId });
          if (holder && holder._id.toString() !== customer._id.toString()) {
            console.log(`  ⚠️   CONFLICT: zohoId ${entry.customerZohoId} is already held by a different customer ("${holder.name}", _id ${holder._id}) than the one this quotation references ("${customer.name}", _id ${customer._id}) — likely a name-variant duplicate, same as found locally. Left unchanged, please review/merge manually.`);
            customersConflict++;
          } else if (!DRY_RUN) {
            customer.zohoId = entry.customerZohoId;
            customer.zohoSynced = true;
            customer.zohoSyncDate = new Date();
            await customer.save();
            customersLinked++;
          } else {
            console.log(`  🔵  Would link customer "${customer.name}" → zohoId ${entry.customerZohoId}`);
            customersLinked++;
          }
        }
      }
    }

    // ── Link the quotation's estimate fields ──────────────────────────────
    if (DRY_RUN) {
      console.log(`  🔵  Would link ${entry.ourRef} (${quotation.quotationNumber}) → estimate ${entry.zohoEstimateId}`);
      quotationsLinked++;
      continue;
    }

    quotation.zohoEstimateId     = entry.zohoEstimateId;
    quotation.zohoEstimateNumber = entry.zohoEstimateNumber;
    quotation.zohoEstimateUrl    = entry.zohoEstimateUrl;
    quotation.zohoSyncedAt       = entry.zohoSyncedAt ? new Date(entry.zohoSyncedAt) : new Date();
    await quotation.save();
    console.log(`  ✅  ${entry.ourRef} (${quotation.quotationNumber}) → linked to estimate ${entry.zohoEstimateId}`);
    quotationsLinked++;
  }

  console.log('\n──────────────────────────────────────');
  console.log(`✅  Quotations linked      : ${quotationsLinked}`);
  console.log(`⏩  Already linked         : ${alreadyLinked}`);
  console.log(`⚠️   Quotations not found   : ${quotationsNotFound}`);
  console.log(`👥  Customers linked       : ${customersLinked}`);
  console.log(`🔗  Customers already OK   : ${customersAlreadyLinked}`);
  console.log(`⚠️   Customer conflicts     : ${customersConflict}  (needs manual review — see warnings above)`);
  console.log('──────────────────────────────────────\n');

  await mongoose.disconnect();
}

run().catch(err => {
  console.error('\n💥  Fatal error:', err.message);
  if (VERBOSE) console.error(err.stack);
  process.exit(1);
});
