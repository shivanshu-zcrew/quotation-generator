// scripts/deleteTestQuotations.js
//
// Deletes a specific, hardcoded list of quotations by quotationNumber.
//
// Usage:
//   node scripts/deleteTestQuotations.js            -> DRY RUN (lists what would be deleted)
//   node scripts/deleteTestQuotations.js --confirm  -> actually deletes them + their S3 files
//
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

const { Quotation } = require('../models/quotation');
const { S3Client, DeleteObjectCommand } = require('@aws-sdk/client-s3');

const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});
const S3_BUCKET_NAME = process.env.S3_BUCKET_NAME;

const deleteFromS3 = async (key) => {
  if (!key) return;
  try {
    await s3Client.send(new DeleteObjectCommand({ Bucket: S3_BUCKET_NAME, Key: key }));
  } catch (error) {
    console.error(`  ⚠️  S3 delete failed for ${key}: ${error.message}`);
  }
};

// Quotation numbers to remove (provided by the user).
const QUOTATION_NUMBERS = [
  'MRME-1784265795928-632',
  'MRME-1784267006313-758',
  'MRME-1784267776510-181',
  'MRME-1784267902494-260',
  'MRME-1784268970367-877',
  'MRME-1784269226149-984',
  'MRME-1784270106319-162',
  'MGCC-1784803119887-748',
  'MGCC-1784803611704-856',
  'MGCC-1784804534770-391',
  'MGCC-1784804986381-260',
  'MGCC-1784805109364-308',
  'MGCC-1784805109364-308-R1',
  'MGCC-1784292409772-984-R1',
  'MRME-1784882545481-097-R1',
  'MGCC-1785217028716-445',
  'MMEC-1785217211421-777',
  'MMEC-1785236839443-203',
  'MMEC-1785237341345-782',
  'MMEC-1785237341345-782-R1',
  'MMEC-1785236839443-203-R1',
  'MMEC-1785236839443-203-R2',
  'MMEC-1785239784097-966',
  'MGCC-1785324500750-168',
  'MMEC-1785389929014-067',
];

async function run() {
  const confirm = process.argv.includes('--confirm');

  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI environment variable is required');
  console.log(`🔄 Connecting to MongoDB (${confirm ? 'LIVE DELETE' : 'DRY RUN'})...`);
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✅ Connected.\n');

  const found = await Quotation.find({ quotationNumber: { $in: QUOTATION_NUMBERS } })
    .select('quotationNumber customerSnapshot.name status total currency.code createdAt revisedFrom')
    .lean();

  const foundNumbers = new Set(found.map((q) => q.quotationNumber));
  const missing = QUOTATION_NUMBERS.filter((n) => !foundNumbers.has(n));

  console.log(`📋 Matched ${found.length} of ${QUOTATION_NUMBERS.length} quotation numbers:\n`);
  found
    .sort((a, b) => a.quotationNumber.localeCompare(b.quotationNumber))
    .forEach((q) => {
      console.log(
        `  - ${q.quotationNumber}  | status=${q.status.padEnd(10)} | customer=${(q.customerSnapshot?.name || '-').padEnd(25)} | total=${q.currency.code} ${q.total} | createdAt=${q.createdAt.toISOString().slice(0, 10)}`
      );
    });

  if (missing.length) {
    console.log(`\n⚠️  Not found in DB (already deleted or typo'd) — ${missing.length}:`);
    missing.forEach((n) => console.log(`  - ${n}`));
  }

  // Check whether anything NOT in our list references these as a revision base,
  // which would be left dangling (revisedFrom pointing at a deleted doc).
  const ids = found.map((q) => q._id);
  const referencing = await Quotation.find({
    revisedFrom: { $in: ids },
    quotationNumber: { $nin: QUOTATION_NUMBERS },
  })
    .select('quotationNumber revisedFrom')
    .lean();
  if (referencing.length) {
    console.log(`\n⚠️  These quotations are NOT in your list but reference one of the above as revisedFrom:`);
    referencing.forEach((q) => console.log(`  - ${q.quotationNumber} -> revisedFrom ${q.revisedFrom}`));
  }

  if (!confirm) {
    console.log('\n🚫 Dry run only — nothing deleted. Re-run with --confirm to actually delete these.');
    await mongoose.disconnect();
    process.exit(0);
  }

  console.log(`\n🗑️  Deleting ${found.length} quotations and their S3 files...`);
  const fullDocs = await Quotation.find({ quotationNumber: { $in: QUOTATION_NUMBERS } });

  let deleted = 0;
  for (const quotation of fullDocs) {
    const jobs = [];
    quotation.items?.forEach((item) => {
      item.imageS3Keys?.forEach((key) => key && jobs.push(deleteFromS3(key)));
    });
    quotation.termsImages?.forEach((img) => img.s3Key && jobs.push(deleteFromS3(img.s3Key)));
    quotation.internalDocuments?.forEach((doc) => doc.s3Key && jobs.push(deleteFromS3(doc.s3Key)));

    await Promise.allSettled(jobs);
    await Quotation.findByIdAndDelete(quotation._id);
    console.log(`  ✅ Deleted ${quotation.quotationNumber}`);
    deleted++;
  }

  console.log(`\n✅ Done. Deleted ${deleted} quotations.`);
  await mongoose.disconnect();
  process.exit(0);
}

run().catch((err) => {
  console.error('\n❌ Error:', err);
  process.exit(1);
});
