// scripts/migrateQuotationsWithCompany.js
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

// Import ALL models that might be referenced
const { Quotation, Company } = require('../models/quotation');
const Customer = require('../models/customer'); // Add this
const Item = require('../models/items'); // Add this
const User = require('../models/user'); // Add this

async function migrateQuotations() {
  try {
    console.log('🔄 Connecting to MongoDB...');
    await mongoose.connect('mongodb://localhost:27017/quotation-system')
    console.log('✅ Connected to MongoDB successfully!\n');

    // Get all companies
    const companies = await Company.find().lean();
    console.log(`📊 Found ${companies.length} companies in database:\n`);
    
    companies.forEach(c => {
      console.log(`   - ${c.code}: ${c.name} (ID: ${c._id})`);
    });
    console.log('');

    if (companies.length === 0) {
      throw new Error('No companies found in database. Please run seedCompanies.js first.');
    }

    // Default to first company
    const defaultCompany = companies[0];
    console.log(`🔧 Using default company: ${defaultCompany.code} - ${defaultCompany.name}\n`);

    // Step 1: Check quotations with old company structure
    const oldStructureCount = await Quotation.countDocuments({ 
      company: { $exists: true, $ne: null },
      companyId: { $exists: false }
    });
    
    console.log(`📦 Quotations with old company structure: ${oldStructureCount}`);

    if (oldStructureCount > 0) {
      console.log('🔄 Migrating quotations to new structure...');
      
      // Get all quotations with old structure - use lean() to avoid population
      const quotations = await Quotation.find({ 
        company: { $exists: true, $ne: null },
        companyId: { $exists: false }
      }).lean(); // Add lean() to avoid population

      let updated = 0;
      let failed = 0;

      for (const q of quotations) {
        try {
          // Find matching company by code
          const companyCode = q.company?.code;
          const company = companies.find(c => c.code === companyCode) || defaultCompany;

          // Prepare update data
          const updateData = {
            $set: {
              companyId: company._id,
              companySnapshot: {
                code: company.code,
                name: company.name,
                address: typeof company.address === 'string' 
                  ? company.address 
                  : `${company.address?.street || ''}, ${company.address?.city || ''}, ${company.address?.country || 'UAE'}`.replace(/^, |, $/g, '').replace(/^, |, $/g, ''),
                phone: company.phone,
                email: company.email,
                vatNumber: company.vatNumber,
                crNumber: company.crNumber,
                logo: company.logo,
                bankDetails: company.bankDetails
              },
              // Rename InAED fields to InBaseCurrency
              subtotalInBaseCurrency: q.subtotalInAED || q.subtotal || 0,
              taxAmountInBaseCurrency: q.taxAmountInAED || q.taxAmount || 0,
              discountAmountInBaseCurrency: q.discountAmountInAED || q.discountAmount || 0,
              totalInBaseCurrency: q.totalInAED || q.total || 0
            }
          };

          // Update items if they exist
          if (q.items && q.items.length > 0) {
            const updatedItems = q.items.map(item => ({
              ...item,
              unitPriceInBaseCurrency: item.unitPriceInAED || item.unitPrice || 0,
              totalPriceInBaseCurrency: item.totalPriceInAED || (item.unitPrice * item.quantity) || 0
            }));
            updateData.$set.items = updatedItems;
          }

          // Update the quotation - use updateOne to avoid model validation
          await Quotation.updateOne(
            { _id: q._id },
            updateData
          );

          updated++;
          
          if (updated % 5 === 0 || updated === oldStructureCount) {
            console.log(`   Progress: ${updated}/${oldStructureCount} updated`);
          }
        } catch (err) {
          console.error(`   ❌ Failed to update quotation ${q.quotationNumber}:`, err.message);
          failed++;
        }
      }

      console.log(`\n✅ Migration complete:`);
      console.log(`   - Updated: ${updated}`);
      console.log(`   - Failed: ${failed}`);
    } else {
      console.log('✅ All quotations already have new structure!');
    }

    // Step 2: Verify migration
    const withoutCompanyId = await Quotation.countDocuments({ companyId: { $exists: false } });
    const withOldCompany = await Quotation.countDocuments({ company: { $exists: true } });
    
    console.log('\n🔍 Verification:');
    console.log(`   - Quotations without companyId: ${withoutCompanyId}`);
    console.log(`   - Quotations with old company field: ${withOldCompany}`);

    if (withoutCompanyId === 0) {
      console.log('\n✅✅✅ Migration completed successfully! ✅✅✅');
    } else {
      console.log('\n⚠️ Some quotations still need migration.');
    }

    // Show sample - use lean() to avoid population
    const sample = await Quotation.findOne()
      .lean(); // Use lean to avoid population
    
    if (sample) {
      console.log('\n📄 Sample migrated quotation:');
      console.log(`   ID: ${sample._id}`);
      console.log(`   Number: ${sample.quotationNumber}`);
      console.log(`   Company ID: ${sample.companyId}`);
      console.log(`   Has Company Snapshot: ${sample.companySnapshot ? 'Yes' : 'No'}`);
      console.log(`   Currency: ${sample.currency?.code}`);
      console.log(`   Total: ${sample.total} ${sample.currency?.code}`);
      console.log(`   Total in Base: ${sample.totalInBaseCurrency} AED`);
    }

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

// # Normal run (skips if companies exist)
// npm run seed:companies

// # Force replace all companies
// npm run seed:companies:replace

// # Add only missing companies
// npm run seed:companies:add

// npm run migrate:quotations