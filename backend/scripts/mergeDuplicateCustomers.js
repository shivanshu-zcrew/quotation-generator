/**
 * Find and merge duplicate customer records for a company — same real
 * company under slightly different names (case, extra whitespace), one of
 * which is properly linked to a real Zoho Books contact and one of which
 * isn't. This is exactly the class of duplicate the historical import
 * created (e.g. "Schlumberger" vs. an already-synced "SCHLUMBERGER").
 *
 * Safety: only auto-merges a name-group when EXACTLY ONE member has a
 * zohoId and at least one member doesn't — the zohoId-holder is kept, the
 * others are repointed and deleted. Any group that doesn't fit that shape
 * (zero members synced, or more than one synced to DIFFERENT real
 * contacts) is left untouched and reported for manual review — those need
 * a human decision (e.g. merging the actual Zoho contacts too), not a
 * script guessing which one is "correct."
 *
 * Usage:
 *   node scripts/mergeDuplicateCustomers.js --company MRME [--dry-run] [--verbose]
 */

const mongoose = require('mongoose');
const path     = require('path');
const dotenv   = require('dotenv');

dotenv.config({ path: path.join(__dirname, '../.env') });

const { Quotation } = require('../models/quotation');
const { Customer }  = require('../models/customer');
const Company        = require('../models/company');
require('../models/user'); // Quotation's pre-find hook needs this registered

const args       = process.argv.slice(2);
const DRY_RUN    = args.includes('--dry-run');
const VERBOSE    = args.includes('--verbose');
const companyArg = (() => {
  const i = args.indexOf('--company');
  return i !== -1 ? args[i + 1] : null;
})();

const normalize = (s) => s.toLowerCase().replace(/\s+/g, ' ').trim();

async function run() {
  if (!companyArg) {
    console.error('❌  Usage: node scripts/mergeDuplicateCustomers.js --company <CODE> [--dry-run]');
    process.exit(1);
  }

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

  const all = await Customer.find({ companyId: company._id }).select('name zohoId');
  console.log(`👥  Total customers: ${all.length}\n`);

  const groups = new Map();
  for (const c of all) {
    const key = normalize(c.name);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(c);
  }
  const dupeGroups = [...groups.values()].filter((g) => g.length > 1);
  console.log(`🔍  Duplicate-name groups found: ${dupeGroups.length}\n`);

  let merged = 0, quotationsRepointed = 0, ambiguous = 0;

  for (const group of dupeGroups) {
    const withZoho    = group.filter((c) => c.zohoId);
    const withoutZoho  = group.filter((c) => !c.zohoId);

    if (withZoho.length !== 1 || withoutZoho.length === 0) {
      console.log(`  ⚠️   Ambiguous — needs manual review: ${JSON.stringify(group.map((c) => ({ name: c.name, zohoId: c.zohoId || null, _id: c._id.toString() })))}`);
      ambiguous++;
      continue;
    }

    const keep = withZoho[0];
    for (const dupe of withoutZoho) {
      if (DRY_RUN) {
        const count = await Quotation.countDocuments({ customerId: dupe._id });
        console.log(`  🔵  Would merge "${dupe.name}" (${count} quotation(s)) → "${keep.name}" (zohoId ${keep.zohoId})`);
        merged++;
        continue;
      }
      const result = await Quotation.updateMany({ customerId: dupe._id }, { $set: { customerId: keep._id } });
      await Customer.deleteOne({ _id: dupe._id });
      console.log(`  ✅  Merged "${dupe.name}" (${result.modifiedCount} quotation(s) repointed) → "${keep.name}" (zohoId ${keep.zohoId})`);
      quotationsRepointed += result.modifiedCount;
      merged++;
    }
  }

  console.log('\n──────────────────────────────────────');
  console.log(`✅  Merged                : ${merged}`);
  console.log(`📄  Quotations repointed  : ${quotationsRepointed}`);
  console.log(`⚠️   Ambiguous (untouched) : ${ambiguous}  (see warnings above — needs manual review)`);
  console.log('──────────────────────────────────────\n');

  const remaining = await Customer.countDocuments({ companyId: company._id });
  console.log(`👥  Customers remaining for ${company.code}: ${remaining}`);

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('\n💥  Fatal error:', err.message);
  if (VERBOSE) console.error(err.stack);
  process.exit(1);
});
