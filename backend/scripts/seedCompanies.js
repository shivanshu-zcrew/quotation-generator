// scripts/seedCompanies.js
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

// Import models
const { Company } = require('../models/quotation');

// Company data from your hardcoded COMPANIES object
const companiesData = [
  {
    code: 'MEGA_REPAIR',
    name: 'Mega Repairing Machinery Equipment LLC',
    slug: 'mega-repair',
    address: {
      street: 'Dubai Industrial City',
      city: 'Dubai',
      country: 'UAE',
      poBox: '12345'
    },
    phone: '+971 4 812 3456',
    email: 'info@megarepair.ae',
    website: 'www.megarepair.ae',
    logo: '/logos/mega-repair.png',
    vatNumber: '100123456700003',
    crNumber: '1234567',
    taxRate: 5,
    baseCurrency: 'AED',
    acceptedCurrencies: ['AED', 'USD', 'SAR', 'QAR','KWD','BHD','OMR' ],
    bankDetails: {
      bankName: 'Emirates NBD',
      accountName: 'Mega Repairing Machinery Equipment LLC',
      accountNumber: 'AE123456789012345678901',
      iban: 'AE580300001234567890123',
      swift: 'EBILAEAD'
    },
    isActive: true
  },
  {
    code: 'GULF_TECH',
    name: 'Gulf Technical Services LLC',
    slug: 'gulf-tech',
    address: {
      street: 'Jebel Ali Free Zone',
      city: 'Dubai',
      country: 'UAE',
      poBox: '12346'
    },
    phone: '+971 4 813 4567',
    email: 'info@gulftech.ae',
    website: 'www.gulftech.ae',
    logo: '/logos/gulf-tech.png',
    vatNumber: '100123456700004',
    crNumber: '1234568',
    taxRate: 5,
    baseCurrency: 'AED',
    acceptedCurrencies: ['AED', 'USD', 'SAR', 'QAR','KWD','BHD','OMR'],
    bankDetails: {
      bankName: 'Dubai Islamic Bank',
      accountName: 'Gulf Technical Services LLC',
      accountNumber: 'AE987654321098765432109',
      iban: 'AE020030001234567890123',
      swift: 'DUIBAEAD'
    },
    isActive: true
  },
  {
    code: 'ARABIAN_MAINTENANCE',
    name: 'Arabian Maintenance Company LLC',
    slug: 'arabian-maintenance',
    address: {
      street: 'Mussafah Industrial Area',
      city: 'Abu Dhabi',
      country: 'UAE',
      poBox: '12347'
    },
    phone: '+971 2 814 5678',
    email: 'info@arabianmaintenance.ae',
    website: 'www.arabianmaintenance.ae',
    logo: '/logos/arabian-maintenance.png',
    vatNumber: '100123456700005',
    crNumber: '1234569',
    taxRate: 5,
    baseCurrency: 'AED',
    acceptedCurrencies: ['AED', 'USD', 'SAR', 'QAR','KWD','BHD','OMR'],
    bankDetails: {
      bankName: 'Abu Dhabi Commercial Bank',
      accountName: 'Arabian Maintenance Company LLC',
      accountNumber: 'AE543210987654321098765',
      iban: 'AE950030001234567890123',
      swift: 'ADCBAEAA'
    },
    isActive: true
  }
];

async function seedCompanies() {
  try {
    // Connect to MongoDB
    console.log('🔄 Connecting to MongoDB...');
    await mongoose.connect('mongodb://localhost:27017/quotation-system');
    console.log('✅ Connected to MongoDB successfully!\n');

    // Check if companies already exist
    const existingCount = await Company.countDocuments();
    console.log(`📊 Existing companies in database: ${existingCount}`);

    if (existingCount > 0) {
      console.log('⚠️ Companies already exist. What would you like to do?');
      console.log('1. Skip (keep existing)');
      console.log('2. Replace all (delete existing and insert new)');
      console.log('3. Add missing (insert only new companies)');
      
      // For script automation, we'll use environment variable or default to skip
      const action = process.env.SEED_ACTION || 'skip';
      
      if (action === 'skip') {
        console.log('⏭️ Skipping company creation. Use SEED_ACTION=replace to force replace.\n');
        await mongoose.disconnect();
        return;
      } else if (action === 'replace') {
        console.log('🗑️ Deleting all existing companies...');
        await Company.deleteMany({});
        console.log('✅ All companies deleted.\n');
      } else if (action === 'add') {
        console.log('➕ Will add only missing companies...\n');
      }
    }

    let inserted = 0;
    let skipped = 0;

    for (const companyData of companiesData) {
      // Check if company already exists (by code or slug)
      const existing = await Company.findOne({
        $or: [
          { code: companyData.code },
          { slug: companyData.slug }
        ]
      });

      if (existing && process.env.SEED_ACTION !== 'replace') {
        console.log(`⏭️ Company ${companyData.code} already exists. Skipping.`);
        skipped++;
        continue;
      }

      // Create or update company
      if (existing && process.env.SEED_ACTION === 'replace') {
        // Update existing
        await Company.updateOne(
          { _id: existing._id },
          { $set: companyData }
        );
        console.log(`🔄 Updated company: ${companyData.code} - ${companyData.name}`);
      } else {
        // Insert new
        await Company.create(companyData);
        console.log(`✅ Created company: ${companyData.code} - ${companyData.name}`);
      }
      inserted++;
    }

    console.log('\n📊 Summary:');
    console.log(`   - Total companies processed: ${companiesData.length}`);
    console.log(`   - Inserted/Updated: ${inserted}`);
    console.log(`   - Skipped: ${skipped}`);

    // Verify the data
    const finalCount = await Company.countDocuments();
    const companies = await Company.find().lean();
    
    console.log(`\n📋 Companies in database (${finalCount}):`);
    companies.forEach(c => {
      console.log(`   - ${c.code}: ${c.name} (${c.acceptedCurrencies.length} currencies)`);
    });

  } catch (error) {
    console.error('\n❌ Error seeding companies:', error);
    console.error(error.stack);
  } finally {
    await mongoose.disconnect();
    console.log('\n👋 Disconnected from MongoDB');
    process.exit(0);
  }
}

// Run the script
seedCompanies();