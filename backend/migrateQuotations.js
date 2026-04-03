// scripts/migrateQuotations.js
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

// Load env file from backend root
dotenv.config({ path: path.join(__dirname, './.env') });

// Import all models that might be referenced
const { Quotation } = require('./models/quotation');
const Customer = require('./models/customer'); // Add this
const Item = require('./models/items'); // Add this
const User = require('./models/user'); // Add this

// Default values for existing quotations
const DEFAULT_COMPANY = {
  code: 'MEGA_REPAIR',
  name: 'Mega Repairing Machinery Equipment LLC',
  address: 'Dubai Industrial City, Dubai, UAE',
  phone: '+971 4 812 3456',
  email: 'info@megarepair.ae',
  vatNumber: '100123456700003',
  crNumber: '1234567',
  logo: '/logos/mega-repair.png',
  bankDetails: {
    bankName: 'Emirates NBD',
    accountName: 'Mega Repairing Machinery Equipment LLC',
    accountNumber: 'AE123456789012345678901',
    iban: 'AE580300001234567890123',
    swift: 'EBILAEAD'
  }
};

const DEFAULT_CURRENCY = {
  code: 'AED',
  symbol: 'د.إ',
  name: 'UAE Dirham',
  decimalPlaces: 2,
  exchangeRate: {
    rate: 1,
    baseCurrency: 'AED',
    fetchedAt: new Date()
  }
};

async function migrateQuotations() {
  try {
    // Connect to MongoDB
    console.log('Connecting to MongoDB...');
    await mongoose.connect('mongodb://localhost:27017/quotation-system');
    console.log('✅ Connected to MongoDB\n');

    // Register all models explicitly
    console.log('Registering models...');
    
    // =========================================================
    // STEP 1: Check total quotations
    // =========================================================
    const totalQuotations = await Quotation.countDocuments();
    console.log(`📊 Total quotations in database: ${totalQuotations}\n`);

    // =========================================================
    // STEP 2: Migrate company field - using updateMany directly
    // =========================================================
    const withoutCompany = await Quotation.countDocuments({ company: { $exists: false } });
    console.log(`📦 Quotations without company field: ${withoutCompany}`);

    if (withoutCompany > 0) {
      // Use updateMany instead of saving each document to avoid population
      const result = await Quotation.updateMany(
        { company: { $exists: false } },
        { $set: { company: DEFAULT_COMPANY } }
      );
      console.log(`✅ Added company field to ${result.modifiedCount} quotations`);
    } else {
      console.log(`✅ All quotations already have company field`);
    }

    // =========================================================
    // STEP 3: Migrate currency field - using updateMany
    // =========================================================
    const withoutCurrency = await Quotation.countDocuments({ currency: { $exists: false } });
    console.log(`\n💱 Quotations without currency field: ${withoutCurrency}`);

    if (withoutCurrency > 0) {
      const result = await Quotation.updateMany(
        { currency: { $exists: false } },
        { $set: { currency: DEFAULT_CURRENCY } }
      );
      console.log(`✅ Added currency field to ${result.modifiedCount} quotations`);
    } else {
      console.log(`✅ All quotations already have currency field`);
    }

    // =========================================================
    // STEP 4: Migrate AED total fields - using updateMany with $unset to remove populate triggers
    // =========================================================
    const withoutAEDTotals = await Quotation.countDocuments({
      $or: [
        { totalInAED: { $exists: false } },
        { subtotalInAED: { $exists: false } }
      ]
    });
    console.log(`\n💰 Quotations without AED total fields: ${withoutAEDTotals}`);

    if (withoutAEDTotals > 0) {
      // First, remove any populate triggers by using lean() and updateMany
      console.log('   Adding AED total fields...');
      
      // Get all quotations that need AED totals - use lean() to avoid population
      const quotations = await Quotation.find({
        $or: [
          { totalInAED: { $exists: false } },
          { subtotalInAED: { $exists: false } }
        ]
      }).lean(); // Add lean() to avoid population

      let updated = 0;
      for (const q of quotations) {
        // Calculate AED values based on existing totals
        const subtotal = q.subtotal || 0;
        const taxAmount = q.taxAmount || 0;
        const discountAmount = q.discountAmount || 0;
        const total = q.total || 0;

        // Update item prices in AED
        const itemsWithAED = (q.items || []).map(item => ({
          ...item,
          unitPriceInAED: item.unitPrice || 0,
          totalPriceInAED: (item.unitPrice || 0) * (item.quantity || 1)
        }));

        // Use updateOne to avoid model validation
        await Quotation.updateOne(
          { _id: q._id },
          {
            $set: {
              subtotalInAED: subtotal,
              taxAmountInAED: taxAmount,
              discountAmountInAED: discountAmount,
              totalInAED: total,
              items: itemsWithAED
            }
          }
        );
        
        updated++;
        
        if (updated % 10 === 0) {
          console.log(`   Progress: ${updated}/${withoutAEDTotals} updated`);
        }
      }
      console.log(`✅ Added AED total fields to ${updated} quotations`);
    } else {
      console.log(`✅ All quotations already have AED total fields`);
    }

    // =========================================================
    // STEP 5: Verify migration
    // =========================================================
    console.log('\n🔍 Verifying migration...');
    
    const remainingWithoutCompany = await Quotation.countDocuments({ company: { $exists: false } });
    const remainingWithoutCurrency = await Quotation.countDocuments({ currency: { $exists: false } });
    const remainingWithoutAED = await Quotation.countDocuments({ totalInAED: { $exists: false } });

    console.log(`   Without company: ${remainingWithoutCompany}`);
    console.log(`   Without currency: ${remainingWithoutCurrency}`);
    console.log(`   Without AED totals: ${remainingWithoutAED}`);

    if (remainingWithoutCompany === 0 && remainingWithoutCurrency === 0 && remainingWithoutAED === 0) {
      console.log('\n✅✅✅ Migration completed successfully! ✅✅✅');
    } else {
      console.log('\n⚠️ Migration incomplete. Some fields still missing.');
    }

    // =========================================================
    // STEP 6: Show sample of updated document (using lean to avoid populate)
    // =========================================================
    const sample = await Quotation.findOne().lean();
    console.log('\n📄 Sample updated quotation:');
    console.log(`   ID: ${sample._id}`);
    console.log(`   Number: ${sample.quotationNumber}`);
    console.log(`   Company: ${sample.company?.name} (${sample.company?.code})`);
    console.log(`   Currency: ${sample.currency?.code} ${sample.currency?.symbol}`);
    console.log(`   Total: ${sample.total} ${sample.currency?.code}`);
    console.log(`   Total in AED: ${sample.totalInAED} AED`);

  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    console.error(error.stack);
  } finally {
    await mongoose.disconnect();
    console.log('\n👋 Disconnected from MongoDB');
    process.exit(0);
  }
}

// Run migration
migrateQuotations();


