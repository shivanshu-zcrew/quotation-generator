/**
 * Import historical quotations from an Excel file.
 *
 * Usage:
 *   node scripts/importFromExcel.js <file.xlsx> [options]
 *
 * Options:
 *   --dry-run          Preview what will be imported without saving anything
 *   --company <CODE>   Company code to assign quotations to (e.g. MRME)
 *                      Defaults to the first active company in the database
 *   --verbose          Print full error stacks on failures
 *
 * Multi-row support:
 *   Each quotation can span multiple rows — one row per line item.
 *   Header columns (Quote #, Customer, dates, totals…) only need to be
 *   filled on the FIRST row; item columns repeat for each line item.
 *   Rows with the same Quote # are grouped into one quotation.
 *
 * Status mapping (case-insensitive):
 *   Active / Negotiation → approved
 *   Awarded              → awarded
 *   Lost                 → not_awarded
 *   Pending              → pending
 *   Rejected             → rejected
 *   Cancelled            → cancelled
 *
 * Quotation numbering:
 *   The sheet's "Quote #" is from a different system (e.g. Zoho) and does
 *   NOT match this app's own format. Each imported quotation gets a fresh
 *   number generated in the app's real format (<companyCode>-<timestamp>-
 *   <random3digits>, matching QuotationTemplate.jsx) — the original Quote #
 *   is preserved in the quotation's `ourRef` field for traceability, and is
 *   also what re-running this script checks against to skip already-
 *   imported rows.
 */

const mongoose = require('mongoose');
const dotenv   = require('dotenv');
const path     = require('path');
const fs       = require('fs');
const xlsx     = require('xlsx');

dotenv.config({ path: path.join(__dirname, '../.env') });

const { Quotation }        = require('../models/quotation');
const { Customer }         = require('../models/customer');
const User                 = require('../models/user');
const Company              = require('../models/company');
const { CURRENCY_OPTIONS } = require('../models/constants');

// ─── CLI args ────────────────────────────────────────────────────────────────

const args       = process.argv.slice(2);
const DRY_RUN    = args.includes('--dry-run');
const VERBOSE    = args.includes('--verbose');
const companyArg = (() => {
  const i = args.indexOf('--company');
  return i !== -1 ? args[i + 1] : null;
})();
const EXCEL_FILE = args.find(a => !a.startsWith('--') && (a.endsWith('.xlsx') || a.endsWith('.xls')));

// ─── Status mapping ──────────────────────────────────────────────────────────

const STATUS_MAP = {
  'active':       'approved',
  'negotiation':  'approved',
  'awarded':      'awarded',
  'lost':         'not_awarded',
  'pending':      'pending',
  'rejected':     'rejected',
  'not awarded':  'not_awarded',
  'approved':     'approved',
  'cancelled':    'cancelled',
  'canceled':     'cancelled',
};

// ─── Static AED exchange rates (fallback when API is unreachable) ─────────────
// 1 <currency> = <rate> AED

const AED_RATES = {
  AED: 1,
  USD: 3.672,
  EUR: 3.981,
  GBP: 4.645,
  SAR: 0.979,
  QAR: 1.009,
  KWD: 11.950,
  BHD: 9.747,
  OMR: 9.540,
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function mapStatus(raw) {
  if (!raw) return 'approved';
  const mapped = STATUS_MAP[String(raw).toLowerCase().trim()];
  if (mapped) return mapped;
  console.log(`      ⚠️   Unrecognized status "${raw}" — defaulting to approved. Add it to STATUS_MAP if that's wrong.`);
  return 'approved';
}

function parseDate(value) {
  if (!value) return null;
  if (value instanceof Date) return isNaN(value) ? null : value;
  const d = new Date(value);
  return isNaN(d) ? null : d;
}

function toNumber(value) {
  if (value === null || value === undefined || value === '') return 0;
  const n = parseFloat(String(value).replace(/,/g, ''));
  return isNaN(n) ? 0 : n;
}

function round3(n) {
  return Math.round(n * 1000) / 1000;
}

// Matches the app's own client-side format exactly (see
// frontend/quotation/src/page/QuotationTemplate.jsx's quotationNumber
// useState initializer): `<companyCode>-<timestamp>-<random3digits>`. The
// source spreadsheet's "Quote #" values are from a different system
// (Zoho's own SAL-QTN-… numbering) and don't match what this app actually
// generates — `seq` nudges the timestamp forward per row so numbers stay
// unique even if two rows are processed within the same millisecond.
function generateQuotationNumber(companyCode, seq) {
  const timestamp = Date.now() + seq;
  const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return `${companyCode}-${timestamp}-${random}`;
}

/**
 * Flexible column reader — tries exact match first, then case/space-insensitive.
 * Pass candidate names in order of preference.
 */
function col(row, ...names) {
  const keys = Object.keys(row);
  for (const name of names) {
    if (row[name] !== undefined && row[name] !== '') return row[name];
    const needle = name.toLowerCase().replace(/\s+/g, '');
    const found  = keys.find(k => k.toLowerCase().replace(/\s+/g, '') === needle);
    if (found && row[found] !== undefined && row[found] !== '') return row[found];
  }
  return '';
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function run() {
  if (!EXCEL_FILE || !fs.existsSync(EXCEL_FILE)) {
    console.error('❌  Usage: node scripts/importFromExcel.js <file.xlsx> [--dry-run] [--company CODE]');
    process.exit(1);
  }

  if (DRY_RUN) console.log('🔵  DRY RUN — nothing will be written to the database\n');

  // ── Parse Excel ──────────────────────────────────────────────────────────
  console.log(`📂  Reading: ${path.resolve(EXCEL_FILE)}`);
  const wb   = xlsx.readFile(EXCEL_FILE, { cellDates: true });
  const ws   = wb.Sheets[wb.SheetNames[0]];
  const rows = xlsx.utils.sheet_to_json(ws, { defval: '' });

  if (rows.length === 0) {
    console.error('❌  No data rows found in the first sheet.');
    process.exit(1);
  }

  console.log(`📊  Rows found  : ${rows.length}`);
  console.log(`📋  Columns     : ${Object.keys(rows[0]).join(', ')}\n`);

  // ── Group rows by Quote # (multi-row = multiple items per quotation) ─────
  // Rows with an empty Quote # are continuation rows — they belong to the
  // most recently seen quotation (additional line items).
  const groups = new Map(); // quoteNumber → { headerRow, itemRows[] }
  const order  = [];
  let   lastQn = null;

  for (const row of rows) {
    const qn = String(
      col(row, 'Quote #', 'Quote No', 'QuoteNo', 'QuoteNumber', 'Quotation No', 'Quotation Number', 'Quotation#') || ''
    ).trim();

    if (qn) {
      lastQn = qn;
      if (!groups.has(qn)) {
        groups.set(qn, { headerRow: row, itemRows: [] });
        order.push(qn);
      }
    }

    // Attach row to the current quotation (whether it has a Quote # or not)
    if (lastQn) groups.get(lastQn).itemRows.push(row);
  }

  console.log(`📦  Unique quotations: ${groups.size}\n`);

  // ── Connect to MongoDB ───────────────────────────────────────────────────
  const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!mongoUri) {
    console.error('❌  MONGODB_URI is not set in .env');
    process.exit(1);
  }

  console.log('Connecting to MongoDB...');
  await mongoose.connect(mongoUri);
  console.log('✅  Connected\n');

  // ── Resolve company ──────────────────────────────────────────────────────
  const companyQuery = companyArg
    ? { code: companyArg.toUpperCase() }
    : { isActive: true };
  const company = await Company.findOne(companyQuery);
  if (!company) {
    console.error(`❌  Company not found (code="${companyArg || 'any active'}").\n    Pass --company <CODE> or set MIGRATE_COMPANY env var.`);
    await mongoose.disconnect();
    process.exit(1);
  }
  console.log(`🏢  Company : ${company.name} (${company.code})\n`);

  // ── Fallback user (admin) ────────────────────────────────────────────────
  const adminUser = await User.findOne({ role: 'admin', isActive: true }).select('_id name email role');
  if (!adminUser) {
    console.error('❌  No active admin user found — cannot resolve createdBy fallback.');
    await mongoose.disconnect();
    process.exit(1);
  }

  // ── Caches ───────────────────────────────────────────────────────────────
  const customerCache = new Map();
  const userCache     = new Map();

  let imported = 0, skipped = 0, errors = 0;

  // ── Process each quotation group ─────────────────────────────────────────
  for (let i = 0; i < order.length; i++) {
    const quoteNumber = order[i];
    const { headerRow, itemRows } = groups.get(quoteNumber);

    try {
      // ── Duplicate check ──
      // Keyed on ourRef (the original historical Quote #), not
      // quotationNumber — the latter is now freshly generated per run (see
      // generateQuotationNumber below), so it can never collide with a
      // prior import attempt and would defeat re-run safety if used here.
      const exists = await Quotation.findOne(
        { ourRef: quoteNumber, companyId: company._id },
        { _id: 1 }
      ).lean();
      if (exists) {
        console.log(`  ⏩  ${quoteNumber} — already exists`);
        skipped++;
        continue;
      }

      const newQuotationNumber = generateQuotationNumber(company.code, i);

      // ── Customer ──────────────────────────────────────────────────────────
      const customerName  = String(col(headerRow, 'Customer Name', 'Customer', 'Client', 'CustomerName') || '').trim();
      const customerEmail = String(col(headerRow, 'Customer Email', 'CustomerEmail', 'Client Email', 'Email') || '').trim();
      const customerPhone = String(col(headerRow, 'Customer Phone', 'CustomerPhone', 'Phone') || '').trim();

      if (!customerName) {
        console.log(`  ⚠️   ${quoteNumber} — no customer name, skipping`);
        errors++;
        continue;
      }

      let customer;
      const customerKey = customerName.toLowerCase();
      if (customerCache.has(customerKey)) {
        customer = customerCache.get(customerKey);
      } else {
        customer = await Customer.findOne({
          companyId: company._id,
          name: { $regex: `^${customerName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' },
        }).lean();

        if (!customer) {
          if (!DRY_RUN) {
            const createData = {
              companyId:       company._id,
              name:            customerName,
              phone:           customerPhone || undefined,
              taxTreatment:    'non_vat_registered',
              placeOfSupply:   'Dubai',
              defaultCurrency: { code: 'AED', symbol: 'د.إ', name: 'United Arab Emirates Dirham' },
              isActive:        true,
              createdBy:       adminUser._id,
            };
            if (customerEmail) createData.email = customerEmail;
            customer = await Customer.create(createData);
            console.log(`      ✨  Created customer: ${customerName}`);
          } else {
            customer = { _id: new mongoose.Types.ObjectId(), name: customerName };
          }
        }
        customerCache.set(customerKey, customer);
      }

      // ── createdBy user ────────────────────────────────────────────────────
      const createdByName = String(col(headerRow, 'Created By', 'CreatedBy', 'Sales Person', 'Salesperson') || '').trim();
      let createdByUser   = adminUser;

      if (createdByName) {
        const userKey = createdByName.toLowerCase();
        if (userCache.has(userKey)) {
          createdByUser = userCache.get(userKey);
        } else {
          const escapedName = createdByName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

          let found = await User.findOne({
            name:     { $regex: `^${escapedName}$`, $options: 'i' },
            isActive: true,
          }).select('_id name email role').lean();

          // Historical exports often only recorded a first name (e.g.
          // "Nitish") while real accounts are saved with a full name (e.g.
          // "Nitish Kumar") — fall back to "starts with this as a whole
          // first word" before giving up to admin. Only auto-resolve when
          // exactly one account matches; multiple matches are genuinely
          // ambiguous and left for manual resolution rather than guessing.
          let ambiguous = false;
          if (!found) {
            const candidates = await User.find({
              name:     { $regex: `^${escapedName}\\b`, $options: 'i' },
              isActive: true,
            }).select('_id name email role').lean();

            if (candidates.length === 1) found = candidates[0];
            else if (candidates.length > 1) ambiguous = true;
          }

          createdByUser = found || adminUser;
          if (!found) {
            console.log(
              ambiguous
                ? `      ⚠️   "${createdByName}" matches multiple users — using admin. Resolve manually if needed.`
                : `      ⚠️   User "${createdByName}" not found — using admin`
            );
          } else if (found.name.toLowerCase() !== userKey) {
            console.log(`      ℹ️   "${createdByName}" matched to full name "${found.name}"`);
          }
          userCache.set(userKey, createdByUser);
        }
      }

      // ── Dates ─────────────────────────────────────────────────────────────
      const queryDate  = parseDate(col(headerRow, 'Query Date', 'QueryDate', 'Enquiry Date'));
      const quoteDate  = parseDate(col(headerRow, 'Date', 'Quotation Date', 'Quote Date', 'QuoteDate')) || queryDate || new Date();
      const expiryRaw  = parseDate(col(headerRow, 'Expiry Date', 'ExpiryDate', 'Valid Until', 'Validity'));
      const expiryDate = expiryRaw || new Date(quoteDate.getTime() + 90 * 24 * 60 * 60 * 1000);

      // ── Currency ──────────────────────────────────────────────────────────
      const currCode = String(col(headerRow, 'Currency', 'Curr', 'Currency Code') || 'AED').trim().toUpperCase();
      const currInfo = CURRENCY_OPTIONS[currCode] || CURRENCY_OPTIONS['AED'];
      const aedRate  = AED_RATES[currInfo.code] || 1;

      const currency = {
        code:          currInfo.code,
        symbol:        currInfo.symbol,
        name:          currInfo.name,
        decimalPlaces: currInfo.decimalPlaces,
        exchangeRate:  { rate: aedRate, baseCurrency: 'AED', fetchedAt: new Date() },
      };

      // ── Line items ────────────────────────────────────────────────────────
      const items = [];

      for (const row of itemRows) {
        const desc  = String(col(row, 'Item Description', 'ItemDescription', 'Description', 'Item Name', 'Item') || '').trim();
        const qty   = toNumber(col(row, 'Item Qty', 'Qty', 'Quantity', 'Item Quantity'));
        const unit  = String(col(row, 'Item Unit', 'Unit') || 'Lot').trim();
        const uPrice = toNumber(col(row, 'Item Unit Price', 'Unit Price', 'UnitPrice', 'Rate', 'Item Rate'));

        if (!desc && qty === 0 && uPrice === 0) continue; // blank item row

        const effectiveQty    = qty > 0 ? qty : 1;
        const effectivePrice  = uPrice > 0 ? uPrice : toNumber(col(row, 'Item Total', 'Item Amount'));
        const itemTotal       = round3(effectiveQty * effectivePrice);
        const itemTotalInBase = round3(itemTotal * aedRate);

        items.push({
          description:              desc || 'Imported item',
          unit:                     unit || 'Lot',
          quantity:                 effectiveQty,
          unitPrice:                round3(effectivePrice),
          unitPriceInBaseCurrency:  round3(effectivePrice * aedRate),
          totalPrice:               itemTotal,
          totalPriceInBaseCurrency: itemTotalInBase,
          imageS3Keys:              [],
          imagePaths:               [],
          imagePublicIds:           [],
          storageProvider:          's3',
        });
      }

      // ── Financials ────────────────────────────────────────────────────────
      const grandTotal         = toNumber(col(headerRow, 'Total (Quote Cur)', 'Total', 'Grand Total', 'Amount'));
      const taxPct             = toNumber(col(headerRow, 'Tax %', 'Tax', 'VAT %', 'VAT'));
      const discountPct        = toNumber(col(headerRow, 'Discount %', 'Discount', 'Disc %'));
      const explicitSubtotal   = toNumber(col(headerRow, 'Subtotal (Quote Cur)', 'Subtotal', 'Sub Total'));
      const explicitTax        = toNumber(col(headerRow, 'Tax Amount (Quote Cur)', 'Tax Amount', 'VAT Amount'));
      const explicitDiscount   = toNumber(col(headerRow, 'Discount Amount (Quote Cur)', 'Discount Amount'));

      let subtotal, taxAmount, discountAmount;

      if (explicitSubtotal > 0) {
        subtotal       = round3(explicitSubtotal);
        taxAmount      = round3(explicitTax);
        discountAmount = round3(explicitDiscount);
      } else if (items.length > 0) {
        // Sum from items; apply tax on top
        const itemsSum = round3(items.reduce((s, it) => s + it.totalPrice, 0));
        subtotal       = itemsSum;
        taxAmount      = taxPct > 0 ? round3(itemsSum * taxPct / 100) : 0;
        discountAmount = 0;
      } else if (taxPct > 0) {
        subtotal       = round3(grandTotal / (1 + taxPct / 100));
        taxAmount      = round3(grandTotal - subtotal);
        discountAmount = 0;
      } else {
        subtotal       = grandTotal;
        taxAmount      = 0;
        discountAmount = 0;
      }

      const finalTotal = grandTotal > 0 ? grandTotal : round3(subtotal + taxAmount - discountAmount);

      // If no items were parsed, create one dummy item from the project name / total
      if (items.length === 0) {
        const projectName = String(col(headerRow, 'Project Name', 'ProjectName', 'Project') || '').trim();
        items.push({
          description:              projectName || 'Historical quotation (imported from Excel)',
          unit:                     'Lot',
          quantity:                 1,
          unitPrice:                subtotal,
          unitPriceInBaseCurrency:  round3(subtotal * aedRate),
          totalPrice:               subtotal,
          totalPriceInBaseCurrency: round3(subtotal * aedRate),
          imageS3Keys:              [],
          imagePaths:               [],
          imagePublicIds:           [],
          storageProvider:          's3',
        });
      }

      const subtotalInBase     = round3(subtotal      * aedRate);
      const taxAmountInBase    = round3(taxAmount      * aedRate);
      const discountAmountInBase = round3(discountAmount * aedRate);
      const totalInBase        = round3(finalTotal     * aedRate);

      // ── Other header fields ───────────────────────────────────────────────
      const projectName   = String(col(headerRow, 'Project Name', 'ProjectName', 'Project') || '').trim();
      const status        = mapStatus(col(headerRow, 'Status'));
      const remark        = String(col(headerRow, 'Remarks', 'Remark', 'Notes', 'Comment') || '').trim();
      const contact       = String(col(headerRow, 'Contact Person', 'ContactPerson', 'Contact Name', 'Contact') || '').trim();
      const paymentTerms  = String(col(headerRow, 'Payment Terms', 'PaymentTerms') || '').trim();
      const deliveryTerms = String(col(headerRow, 'Delivery Terms', 'DeliveryTerms') || '').trim();
      const tl            = String(col(headerRow, 'TL') || '').trim();
      const trn           = String(col(headerRow, 'TRN') || '').trim();

      // ── Build document ────────────────────────────────────────────────────
      const doc = {
        companyId: company._id,
        companySnapshot: {
          code:                 company.code,
          name:                 company.name,
          address:              company.address?.street
            ? `${company.address.street}, ${company.address.city}, ${company.address.country}`
            : (company.address || ''),
          phone:                company.phone        || '',
          email:                company.email        || '',
          vatNumber:            company.vatNumber    || '',
          crNumber:             company.crNumber     || '',
          logo:                 company.logo         || '',
          bankDetails:          company.bankDetails  || {},
          focalPointDesignation: '',
        },
        currency,
        quotationNumber: newQuotationNumber,
        ourRef:          quoteNumber, // original historical Quote # — kept for traceability and re-run de-duplication
        customerId:      customer._id,
        customerSnapshot: {
          name:          customerName,
          email:         customerEmail || '',
          phone:         customerPhone || '',
          country:       'UAE',
          taxTreatment:  'non_vat_registered',
          placeOfSupply: 'Dubai',
        },
        contact,
        customerTaxTreatment:  'non_vat_registered',
        customerPlaceOfSupply: 'Dubai',
        date:        quoteDate,
        expiryDate,
        queryDate:   queryDate || null,
        projectName,
        items,
        taxPercent:      taxPct,
        discountPercent: discountPct,
        subtotal,
        taxAmount,
        discountAmount,
        total:                       finalTotal,
        subtotalInBaseCurrency:      subtotalInBase,
        taxAmountInBaseCurrency:     taxAmountInBase,
        discountAmountInBaseCurrency: discountAmountInBase,
        totalInBaseCurrency:         totalInBase,
        status,
        remark,
        notes:              '',
        termsAndConditions: '',
        paymentTerms,
        deliveryTerms,
        tl,
        trn,
        createdBy: createdByUser._id,
        createdBySnapshot: {
          name:  createdByUser.name,
          email: createdByUser.email,
          role:  createdByUser.role,
        },
      };

      // ── Save (or preview) ─────────────────────────────────────────────────
      if (DRY_RUN) {
        console.log(
          `  🔵  ${quoteNumber} → ${newQuotationNumber} | ${customerName.padEnd(28)} | ${currInfo.code} ${finalTotal.toFixed(2).padStart(12)} | ${items.length} item(s) | ${status}`
        );
        imported++;
        continue;
      }

      await Quotation.create(doc);
      console.log(
        `  ✅  ${quoteNumber} → ${newQuotationNumber} | ${customerName.padEnd(28)} | ${currInfo.code} ${finalTotal.toFixed(2).padStart(12)} | ${items.length} item(s) | ${status}`
      );
      imported++;

    } catch (err) {
      console.error(`  ❌  ${quoteNumber} — ${err.message}`);
      if (VERBOSE) console.error(err.stack);
      errors++;
    }
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('\n──────────────────────────────────────');
  if (DRY_RUN) console.log('🔵  DRY RUN — no changes were written');
  console.log(`✅  Imported : ${imported}`);
  console.log(`⏩  Skipped  : ${skipped}  (already exist)`);
  console.log(`❌  Errors   : ${errors}`);
  console.log('──────────────────────────────────────\n');

  await mongoose.disconnect();
}

run().catch(err => {
  console.error('\n💥  Fatal error:', err.message);
  if (VERBOSE) console.error(err.stack);
  process.exit(1);
});
