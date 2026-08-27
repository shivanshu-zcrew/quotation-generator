/**
 * Backfill historical "Awarded" quotations (from importFromExcel.js) into
 * Zoho Books as real Estimates.
 *
 * importFromExcel.js writes status:'awarded' straight into MongoDB and never
 * talks to Zoho — this script is the deliberate, separate follow-up step for
 * anyone who decides they *do* want those old deals to also exist as real
 * Estimates in Zoho Books. It reuses the exact same code path a live
 * "Award" button click goes through (quotationController.awardQuotation),
 * so the tax/currency/discount logic can never drift from the real flow.
 *
 * Usage:
 *   node scripts/backfillHistoricalAwardsToZoho.js --company MRME [--dry-run] [--verbose]
 *
 * Scope: only quotations imported by importFromExcel.js — identified by
 * `ourRef` matching the historical Zoho-CRM-style "SAL-QTN-..." numbering —
 * that are currently status:'awarded' with no zohoEstimateId yet. Never
 * touches an organically-awarded quotation.
 *
 * Safe to re-run: already-backfilled quotations (zohoEstimateId set) are
 * skipped automatically.
 */

const mongoose = require('mongoose');
const path     = require('path');
const dotenv   = require('dotenv');

dotenv.config({ path: path.join(__dirname, '../.env') });

const { Quotation }   = require('../models/quotation');
const { Customer }    = require('../models/customer');
const Company         = require('../models/company');
const zohoBooksService = require('../zoho/customerServices');
const emailService     = require('../utils/emailService');
const quotationController = require('../controllers/quotationController');

const args       = process.argv.slice(2);
const DRY_RUN    = args.includes('--dry-run');
const VERBOSE    = args.includes('--verbose');
const companyArg = (() => {
  const i = args.indexOf('--company');
  return i !== -1 ? args[i + 1] : null;
})();

// This is a historical bulk backfill, not a real award happening right now —
// 86 "Quotation awarded!" emails about deals the team already knows are old
// news would just be noise. The award logic itself must stay byte-identical
// to the real flow, so intercept only the email side effect, not the logic.
emailService.quotationAwardedNotifyAll = () => {};

async function run() {
  if (!companyArg) {
    console.error('❌  Usage: node scripts/backfillHistoricalAwardsToZoho.js --company <CODE> [--dry-run]');
    process.exit(1);
  }

  if (DRY_RUN) console.log('🔵  DRY RUN — no customers will be synced, nothing will be sent to Zoho\n');

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
  if (!company.zohoOrganizationId) {
    console.error(`❌  ${company.name} has no zohoOrganizationId configured — cannot create Zoho Books estimates.`);
    await mongoose.disconnect();
    process.exit(1);
  }
  console.log(`🏢  Company: ${company.name} (${company.code}) — Zoho org ${company.zohoOrganizationId}\n`);

  // ── Find the target quotations ──────────────────────────────────────────
  const targets = await Quotation.find({
    companyId:      company._id,
    status:         'awarded',
    zohoEstimateId: null,
    ourRef:         { $regex: /^SAL-QTN-/ },
  }).populate('createdBy', 'name email role').populate('customerId');

  console.log(`📦  Historical awarded quotations to backfill: ${targets.length}\n`);
  if (targets.length === 0) {
    console.log('Nothing to do.');
    await mongoose.disconnect();
    return;
  }

  // ── Step 1: sync every distinct not-yet-Zoho-linked customer ───────────
  const customersById = new Map();
  for (const q of targets) {
    if (q.customerId?._id) customersById.set(q.customerId._id.toString(), q.customerId);
  }
  const unsynced = [...customersById.values()].filter(c => !c.zohoId);

  console.log(`👥  Distinct customers referenced: ${customersById.size}`);
  console.log(`🔗  Already synced to Zoho: ${customersById.size - unsynced.length}`);
  console.log(`🆕  Need syncing now: ${unsynced.length}\n`);

  zohoBooksService.setCompany(company._id, company.zohoOrganizationId);

  const syncFailures = new Set(); // customerId strings that failed to sync — their quotations get skipped below

  for (const customer of unsynced) {
    if (DRY_RUN) {
      console.log(`  🔵  Would look up / create Zoho contact for: ${customer.name}`);
      continue;
    }
    try {
      // Search first — these are historical customers, and Zoho Books
      // already rejects a duplicate name outright ("already exists") rather
      // than returning the existing contact, so a real contact with this
      // exact name may already exist in the live account (from actual past
      // business, unrelated to this import). Link to it instead of trying
      // to create a second one.
      const existing = await zohoBooksService.getAllContacts({ contact_name: customer.name, bypassCache: true });
      const exactMatch = existing?.success
        ? existing.contacts.find(c => c.contact_name?.trim().toLowerCase() === customer.name.trim().toLowerCase())
        : null;

      let zohoId;
      if (exactMatch) {
        zohoId = exactMatch.contact_id;
        console.log(`  🔗  Found existing Zoho contact for "${customer.name}" (${zohoId}) — linking, not creating`);
      } else {
        const zohoResult = await zohoBooksService.createContact({
          name:                customer.name,
          companyName:         customer.companyName || customer.name,
          email:               customer.email || undefined,
          phone:               customer.phone || undefined,
          address:             customer.address || '',
          city:                customer.city || '',
          state:               customer.state || '',
          zipcode:             customer.zipcode || '',
          taxTreatment:        customer.taxTreatment,
          placeOfSupply:       customer.placeOfSupply,
          taxRegistrationNumber: customer.taxRegistrationNumber || undefined,
          currencyCode:        customer.defaultCurrency?.code,
          contactPersons:      customer.contactPersons || [],
        });

        if (!zohoResult?.success || !zohoResult?.zohoId) {
          throw new Error(zohoResult?.error || 'Unknown Zoho error');
        }
        zohoId = zohoResult.zohoId;
        console.log(`  ✨  Created new Zoho contact: ${customer.name} (${zohoId})`);
      }

      await Customer.updateOne(
        { _id: customer._id },
        { $set: { zohoId, zohoSynced: true, zohoSyncDate: new Date() } }
      );
      customer.zohoId = zohoId; // keep the in-memory copy consistent for step 2 below
    } catch (err) {
      console.log(`  ❌  Failed to sync customer "${customer.name}": ${err.message}`);
      if (VERBOSE) console.error(err.stack);
      syncFailures.add(customer._id.toString());
    }
  }

  if (DRY_RUN) {
    console.log(`\n🔵  Would then attempt to award ${targets.length} quotation(s) to Zoho Books.`);
    await mongoose.disconnect();
    return;
  }

  // ── Step 2: award each quotation for real, via the actual controller ───
  let awarded = 0, skipped = 0, failed = 0;

  for (const q of targets) {
    const customerId = q.customerId?._id?.toString();
    if (!customerId || syncFailures.has(customerId)) {
      console.log(`  ⏩  ${q.quotationNumber} — customer never synced, skipping`);
      skipped++;
      continue;
    }
    if (!q.createdBy) {
      console.log(`  ⏩  ${q.quotationNumber} — no creator on record, skipping`);
      skipped++;
      continue;
    }

    // awardQuotation requires status:'approved' — flip it, then let the
    // real controller take it the rest of the way (and revert on failure
    // so a rejected backfill attempt doesn't leave the record stuck).
    await Quotation.updateOne({ _id: q._id }, { $set: { status: 'approved' } });

    const req = {
      params: { id: q._id.toString() },
      body:   { awarded: true, awardNote: 'Historical import — backfilled to Zoho Books' },
      companyId: company._id.toString(),
      headers: {},
      user: {
        id:    q.createdBy._id.toString(),
        name:  q.createdBy.name,
        email: q.createdBy.email,
        role:  q.createdBy.role,
      },
    };
    let statusCode = 200, payload = null;
    const res = {
      status(code) { statusCode = code; return this; },
      json(body)   { payload = body; return this; },
    };

    try {
      await quotationController.awardQuotation(req, res);
    } catch (err) {
      payload = { success: false, message: err.message };
      if (VERBOSE) console.error(err.stack);
    }

    if (payload?.success) {
      console.log(`  ✅  ${q.quotationNumber} → Zoho estimate ${payload.zohoEstimate?.estimateId || payload.quotation?.zohoEstimateId}`);
      awarded++;
    } else {
      console.log(`  ❌  ${q.quotationNumber} — ${payload?.message || `HTTP ${statusCode}`}`);
      // The controller only changes status on success; on failure it's
      // still 'approved' from our flip above — put it back.
      await Quotation.updateOne({ _id: q._id }, { $set: { status: 'awarded' } });
      failed++;
    }
  }

  console.log('\n──────────────────────────────────────');
  console.log(`✅  Awarded to Zoho : ${awarded}`);
  console.log(`⏩  Skipped         : ${skipped}  (customer sync failed / no creator)`);
  console.log(`❌  Failed          : ${failed}`);
  console.log('──────────────────────────────────────\n');

  await mongoose.disconnect();
}

run().catch(err => {
  console.error('\n💥  Fatal error:', err.message);
  if (VERBOSE) console.error(err.stack);
  process.exit(1);
});
