const { Customer, constants } = require('../models/customer');
const zohoBooksService = require('../zoho/customerServices');
const Company = require('../models/company'); 
// Destructure constants
const {
  GCC_COUNTRY_NAMES,
  TAX_TREATMENTS,
  TAX_TREATMENT_VALUES,
  CURRENCY_OPTIONS,
  CURRENCY_CODES,
  UAE_EMIRATES
} = constants;

// ─────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────
const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 500;
const MIN_PAGE_SIZE = 1;
const ZOHO_BATCH_SIZE = 10;
const PAGINATION_CACHE_TTL = 300;

// ─────────────────────────────────────────────────────────────────────────
// HELPER FUNCTIONS
// ─────────────────────────────────────────────────────────────────────────

 

function validateCustomerData(customer) {
  if (!customer || typeof customer !== 'object') {
    return { valid: false, error: 'Invalid customer object' };
  }

  if (!customer.email || typeof customer.email !== 'string') {
    return { valid: false, error: 'Email is required and must be string' };
  }

  if (!customer.name || typeof customer.name !== 'string') {
    return { valid: false, error: 'Name is required and must be string' };
  }

  return { valid: true };
}

/**
 * Validate tax data for all 4 tax treatment types
 */
function validateTaxData(taxTreatment, taxRegistrationNumber, placeOfSupply) {
  const errors = [];

  if (taxTreatment && !TAX_TREATMENT_VALUES.includes(taxTreatment)) {
    errors.push(`Tax treatment must be one of: ${TAX_TREATMENT_VALUES.join(', ')}`);
  }

  if (!placeOfSupply) {
    errors.push('Place of supply is required');
  } else if (taxTreatment === 'vat_registered' || taxTreatment === 'non_vat_registered') {
    if (!UAE_EMIRATES.includes(placeOfSupply)) {
      errors.push(`Place of supply must be a UAE emirate: ${UAE_EMIRATES.join(', ')}`);
    }
  } else {
    if (!GCC_COUNTRY_NAMES.includes(placeOfSupply)) {
      errors.push(`Place of supply must be one of: ${GCC_COUNTRY_NAMES.join(', ')}`);
    }
  }

  

  return errors;
}

function validateCurrency(currencyCode) {
  if (!currencyCode || !CURRENCY_OPTIONS[currencyCode]) {
    return `Currency must be one of: ${CURRENCY_CODES.join(', ')}`;
  }
  return null;
}

function buildCurrencyObject(currencyCode) {
  const info = CURRENCY_OPTIONS[currencyCode] || CURRENCY_OPTIONS['AED'];
  return {
    code: currencyCode,
    symbol: info.symbol,
    name: info.name
  };
}

 
// ─────────────────────────────────────────────────────────────────────────
// CREATE CUSTOMER
// ─────────────────────────────────────────────────────────────────────────
 
exports.createCustomer = async (req, res) => {
  try {
    const {
      name,
      email,
      phone,
      address,
      companyName,
      website,
      notes,
      taxTreatment = 'non_vat_registered',
      taxRegistrationNumber = '',
      placeOfSupply = 'Dubai',
      defaultCurrency = 'AED',
      contactPersons = [],
      mainContactSalutation = 'Mr.'
    } = req.body;

    const companyId = req.headers['x-company-id'] || req.body.companyId;

    if (!companyId) return res.status(400).json({ success: false, message: 'Company ID is required' });
    if (!name?.trim() || name.trim().length < 3) {
      return res.status(400).json({ success: false, message: 'Customer name must be at least 3 characters' });
    }

    const company = await Company.findById(companyId);
    if (!company) return res.status(404).json({ success: false, message: 'Company not found' });

    const taxErrors = validateTaxData(taxTreatment, taxRegistrationNumber, placeOfSupply);
    if (taxErrors.length > 0) {
      return res.status(400).json({ success: false, message: taxErrors[0] });
    }

    // ====================== BUILD CONTACT PERSONS ======================
    const allContactPersons = [];

    // Main Contact
    allContactPersons.push({
      salutation: mainContactSalutation || 'Mr.',
      firstName: name.trim(),
      lastName: '',
      email: email ? email.trim().toLowerCase() : '',
      workPhone: phone ? phone.trim() : '',
      mobile: '',
      designation: '',
      department: '',
      isPrimaryContact: true,
      notes: notes ? notes.trim() : ''
    });

    // Additional Contacts
    if (Array.isArray(contactPersons)) {
      contactPersons.forEach(cp => {
        if (cp.firstName?.trim()) {
          allContactPersons.push({
            salutation: cp.salutation || '',
            firstName: cp.firstName.trim(),
            lastName: cp.lastName?.trim() || '',
            email: cp.email ? cp.email.trim().toLowerCase() : '',
            workPhone: cp.workPhone?.trim() || cp.phone?.trim() || '',
            mobile: cp.mobile?.trim() || '',
            designation: cp.designation?.trim() || '',
            department: cp.department?.trim() || '',
            isPrimaryContact: false,
            notes: cp.notes?.trim() || ''
          });
        }
      });
    }

    // ====================== CREATE IN MONGODB (Temporarily) ======================
    const customer = new Customer({
      companyId: company._id,
      name: name.trim().toUpperCase(),
      email: email ? email.trim().toLowerCase() : null,
      phone: phone ? phone.trim() : '',
      address: address ? address.trim() : '',
      companyName: companyName ? companyName.trim() : name.trim(),
      website: website ? website.trim() : '',
      notes: notes ? notes.trim() : '',
      taxTreatment,
      taxRegistrationNumber: (taxTreatment.includes('vat_registered') && taxRegistrationNumber) ? taxRegistrationNumber.trim() : '',
      placeOfSupply,
      defaultCurrency: buildCurrencyObject(defaultCurrency),
      contactPersons: allContactPersons
    });

    const savedCustomer = await customer.save();
    let customerObj = savedCustomer.getFormattedData?.() || savedCustomer.toObject();

    // ====================== ZOHO SYNC ======================
    let zohoSuccess = false;
    if (company.zohoOrganizationId) {
      try {
        zohoBooksService.setCompany(company._id, company.zohoOrganizationId);

        const zohoResult = await zohoBooksService.createContact({
          name: savedCustomer.name,
          companyName: savedCustomer.companyName,
          email: savedCustomer.email,
          phone: savedCustomer.phone,
          taxTreatment: savedCustomer.taxTreatment,
          placeOfSupply: savedCustomer.placeOfSupply,
          taxRegistrationNumber: savedCustomer.taxRegistrationNumber,
          currencyCode: savedCustomer.defaultCurrency?.code,
          contactPersons: savedCustomer.contactPersons
        });

        if (zohoResult.success && zohoResult.zohoId) {
          zohoSuccess = true;
          savedCustomer.zohoId = zohoResult.zohoId;
          savedCustomer.zohoSynced = true;
          savedCustomer.zohoSyncDate = new Date();

          // Update zohoContactPersonId
          if (zohoResult.contact?.contact_persons) {
            zohoResult.contact.contact_persons.forEach((zp, i) => {
              if (savedCustomer.contactPersons[i]) {
                savedCustomer.contactPersons[i].zohoContactPersonId = zp.contact_person_id;
              }
            });
          }

          await savedCustomer.save();
          customerObj.zohoId = zohoResult.zohoId;
          customerObj.zohoSynced = true;
        } else {
          throw new Error(zohoResult.error || 'Unknown Zoho error');
        }
      } catch (zohoError) {
        console.error('Zoho Sync Error:', zohoError);

        // ROLLBACK: Delete from MongoDB if Zoho fails
        await Customer.findByIdAndDelete(savedCustomer._id);
        return res.status(400).json({
          success: false,
          message: `Failed to create customer in Zoho: ${zohoError.message}`,
          error: zohoError.message
        });
      }
    }

    // Clear Cache
    const redisService = require('../config/redisService');
    await redisService.delPattern(`customers_paginated_${company._id}:*`);

    res.status(201).json({
      success: true,
      message: 'Customer created successfully',
      data: customerObj
    });

  } catch (error) {
    console.error('Create Customer Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating customer',
      error: error.message
    });
  }
};

 
// ─────────────────────────────────────────────────────────────────────────
// UPDATE CUSTOMER
// ─────────────────────────────────────────────────────────────────────────
exports.updateCustomer = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      email,
      phone,
      address,
      companyName,
      website,
      notes,
      taxTreatment,
      taxRegistrationNumber,
      placeOfSupply,
      defaultCurrency,
      contactPersons = [],
      mainContactSalutation
    } = req.body;

    if (!id?.trim()) {
      return res.status(400).json({ success: false, message: 'Invalid customer ID' });
    }

    const customer = await Customer.findById(id);
    if (!customer) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }

    const company = await Company.findById(customer.companyId);
    if (!company) {
      return res.status(404).json({ success: false, message: 'Company not found' });
    }

    const updateData = {};

    // Basic fields
    if (name !== undefined) updateData.name = name.trim().toUpperCase();
    if (email !== undefined) updateData.email = email.trim().toLowerCase();
    if (phone !== undefined) updateData.phone = phone.trim();
    if (address !== undefined) updateData.address = address?.trim() || '';
    if (companyName !== undefined) updateData.companyName = companyName?.trim() || '';
    if (website !== undefined) updateData.website = website?.trim() || '';
    if (notes !== undefined) updateData.notes = notes?.trim() || '';

    // Tax fields
    if (taxTreatment !== undefined || taxRegistrationNumber !== undefined || placeOfSupply !== undefined) {
      const newTax = taxTreatment ?? customer.taxTreatment;
      const newTRN = taxRegistrationNumber ?? customer.taxRegistrationNumber;
      const newPlace = placeOfSupply ?? customer.placeOfSupply;

      const taxErrors = validateTaxData(newTax, newTRN, newPlace);
      if (taxErrors.length > 0) {
        return res.status(400).json({ success: false, message: taxErrors[0] });
      }

      updateData.taxTreatment = newTax;
      updateData.placeOfSupply = newPlace;
      updateData.taxRegistrationNumber = (newTax === 'vat_registered' || newTax === 'gcc_vat_registered')
        ? (newTRN?.trim() || '')
        : '';
    }

    // Currency
    if (defaultCurrency !== undefined) {
      updateData.defaultCurrency = buildCurrencyObject(defaultCurrency);
    }

    // ====================== CONTACT PERSONS ======================
    if (contactPersons !== undefined && Array.isArray(contactPersons)) {
      const processedContacts = [];

      // 1. Main Contact Person
      const mainContact = {
        salutation: mainContactSalutation !== undefined ? mainContactSalutation : (customer.contactPersons?.[0]?.salutation || 'Mr.'),
        firstName: name?.trim() || customer.name,
        lastName: '',
        email: email ? email.trim().toLowerCase() : (customer.email || ''),
        workPhone: phone ? phone.trim() : (customer.phone || ''),
        mobile: '',
        designation: '',
        department: '',
        isPrimaryContact: true,
        zohoContactPersonId: customer.contactPersons?.[0]?.zohoContactPersonId || null,
        createdAt: customer.contactPersons?.[0]?.createdAt || new Date(),
        updatedAt: new Date()
      };
      processedContacts.push(mainContact);

      // 2. Additional Contact Persons (including newly added)
      contactPersons.forEach(cp => {
        if (cp.firstName?.trim()) {
          processedContacts.push({
            salutation: cp.salutation || '',
            firstName: cp.firstName.trim(),
            lastName: cp.lastName?.trim() || '',
            email: cp.email ? cp.email.trim().toLowerCase() : '',
            workPhone: cp.workPhone?.trim() || cp.phone?.trim() || '',
            mobile: cp.mobile?.trim() || '',
            designation: cp.designation?.trim() || '',
            department: cp.department?.trim() || '',
            isPrimaryContact: false,
            zohoContactPersonId: cp.zohoContactPersonId || null,
            createdAt: new Date(),
            updatedAt: new Date()
          });
        }
      });

      updateData.contactPersons = processedContacts;
    } 
    // Only update main contact salutation (if no contactPersons array sent)
    else if (mainContactSalutation !== undefined && customer.contactPersons?.length > 0) {
      const updatedContacts = [...customer.contactPersons];
      updatedContacts[0].salutation = mainContactSalutation;
      updatedContacts[0].updatedAt = new Date();
      updateData.contactPersons = updatedContacts;
    }

    // ====================== SAVE UPDATE ======================
    const updatedCustomer = await Customer.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    );

    if (!updatedCustomer) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }

    const customerObj = updatedCustomer.getFormattedData();
    customerObj.contactPersons = updatedCustomer.contactPersons;

    // ====================== ZOHO SYNC ======================
 
if (updatedCustomer.zohoId && company.zohoOrganizationId) {
  try {
    zohoBooksService.setCompany(company._id, company.zohoOrganizationId);

    console.log("🔍 [DEBUG] Contact Persons in MongoDB before Zoho:", 
      JSON.stringify(updatedCustomer.contactPersons, null, 2));

    // Pass the FULL customer object (or at least contactPersons array) to service
    const zohoResult = await zohoBooksService.updateContact(
      updatedCustomer.zohoId, 
      {
        name: updatedCustomer.name,
        companyName: updatedCustomer.companyName || updatedCustomer.name,
        taxTreatment: updatedCustomer.taxTreatment,
        placeOfSupply: updatedCustomer.placeOfSupply,
        taxRegistrationNumber: updatedCustomer.taxRegistrationNumber,
        currencyCode: updatedCustomer.defaultCurrency?.code,
        contactPersons: updatedCustomer.contactPersons || []   // ← This is the key
      }
    );

    console.log("📥 Zoho Update Result:", zohoResult);

    // Update zohoContactPersonId for newly created contacts
    if (zohoResult.success && zohoResult.contact?.contact_persons) {
      const zohoPersons = zohoResult.contact.contact_persons;
      
      for (let i = 0; i < updatedCustomer.contactPersons.length; i++) {
        const mongoPerson = updatedCustomer.contactPersons[i];
        const zohoPerson = zohoPersons.find(p => 
          p.first_name === mongoPerson.firstName || 
          p.email === mongoPerson.email
        );
        
        if (zohoPerson && zohoPerson.contact_person_id && !mongoPerson.zohoContactPersonId) {
          mongoPerson.zohoContactPersonId = zohoPerson.contact_person_id;
          console.log(`✅ Linked new contact person: ${mongoPerson.firstName}`);
        }
      }
      
      await updatedCustomer.save(); // Save the new zohoContactPersonIds
    }

  } catch (zohoErr) {
    console.error('❌ Zoho Update Error:', zohoErr.message);
  }
}

    // Clear Cache
    const redisService = require('../config/redisService');
    await redisService.delPattern(`customers_paginated_${customer.companyId}:*`);

    res.status(200).json({
      success: true,
      message: 'Customer updated successfully',
      data: customerObj
    });

  } catch (error) {
    console.error('Update Customer Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating customer',
      error: error.message
    });
  }
};

// Helper function for Zoho sync on update
async function syncUpdateWithZoho(customer, company, customerId, customerObj) {
  const zohoBooksService = require('../services/zohoBooksService');
  
  zohoBooksService.setCompany(company._id, company.zohoOrganizationId);
  
  // Only send contacts that have a Zoho ID (existing contacts)
  const contactsToSync = (customer.contactPersons || [])
    .filter(contact => contact.zohoContactPersonId)
    .map(contact => ({
      first_name: contact.firstName,
      last_name: contact.lastName || '',
      email: contact.email || '',
      phone: contact.workPhone || '',
      mobile: contact.mobile || '',
      salutation: contact.salutation || '',
      designation: contact.designation || '',
      department: contact.department || '',
      notes: contact.notes || '',
      contact_person_id: contact.zohoContactPersonId
    }));
  
  const zohoUpdateData = {
    name: customer.name,
    email: customer.email,
    phone: customer.phone,
    address: customer.address,
    companyName: customer.companyName,
    website: customer.website,
    taxTreatment: customer.taxTreatment,
    placeOfSupply: customer.placeOfSupply,
    currencyCode: customer.defaultCurrency?.code,
    contactPersons: contactsToSync
  };

  const isVatRegistered = customer.taxTreatment === 'vat_registered' || customer.taxTreatment === 'gcc_vat_registered';
  if (isVatRegistered && customer.taxRegistrationNumber) {
    zohoUpdateData.taxRegistrationNumber = customer.taxRegistrationNumber;
  }

  try {
    const zohoResult = await zohoBooksService.updateContact(customer.zohoId, zohoUpdateData);

    if (zohoResult?.success) {
      customerObj.zohoSynced = true;
      customerObj.zohoData = zohoResult.contact;
      customerObj.zohoSyncError = null;
      
      console.log('✅ Customer updated in Zoho:', customer.zohoId);
    } else if (zohoResult?.error) {
      customerObj.zohoSyncError = `Failed to update in Zoho: ${zohoResult.error}`;
      console.error('❌ Zoho update failed:', zohoResult.error);
    }
  } catch (error) {
    console.error('❌ Zoho sync error:', error.message);
    customerObj.zohoSyncError = 'Failed to update in Zoho';
  }
}

// Helper function for Zoho sync on update
async function syncUpdateWithZoho(customer, company, customerId, customerObj) {
   
  zohoBooksService.setCompany(company._id, company.zohoOrganizationId);
  
  const zohoUpdateData = {
    name: customer.name,
    email: customer.email,
    phone: customer.phone,
    address: customer.address,
    companyName: customer.companyName,
    website: customer.website,
    taxTreatment: customer.taxTreatment,
    placeOfSupply: customer.placeOfSupply,
    currencyCode: customer.defaultCurrency?.code,
    contactPersons: (customer.contactPersons || [])
      .filter(contact => contact.zohoContactPersonId)  
      .map(contact => ({
        first_name: contact.firstName,
        last_name: contact.lastName,
        email: contact.email,
        phone: contact.workPhone,
        mobile: contact.mobile,
        salutation: contact.salutation,  // ✅ Include salutation
        designation: contact.designation,
        department: contact.department,
        notes: contact.notes,
        contact_person_id: contact.zohoContactPersonId
      }))
  };

  const isVatRegistered = customer.taxTreatment === 'vat_registered' || customer.taxTreatment === 'gcc_vat_registered';
  if (isVatRegistered && customer.taxRegistrationNumber) {
    zohoUpdateData.taxRegistrationNumber = customer.taxRegistrationNumber;
  }

  try {
    const zohoResult = await zohoBooksService.updateContact(customer.zohoId, zohoUpdateData);

    if (zohoResult?.success) {
      customerObj.zohoSynced = true;
      customerObj.zohoData = zohoResult.contact;
      customerObj.zohoSyncError = null;
      
       if (zohoResult.contact?.contact_persons) {
        const existingContacts = customer.contactPersons || [];
        
        for (let i = 0; i < existingContacts.length && i < zohoResult.contact.contact_persons.length; i++) {
          const zohoContact = zohoResult.contact.contact_persons[i];
          const localContact = existingContacts[i];
          
          if (zohoContact?.contact_person_id && localContact?._id && !localContact.zohoContactPersonId) {
            await Customer.updateOne(
              { _id: customerId, 'contactPersons._id': localContact._id },
              { $set: { 'contactPersons.$.zohoContactPersonId': zohoContact.contact_person_id } }
            );
          }
        }
      }
      
      console.log('✅ Customer updated in Zoho:', customer.zohoId);
    } else if (zohoResult?.error) {
      customerObj.zohoSyncError = `Failed to update in Zoho: ${zohoResult.error}`;
      console.error('❌ Zoho update failed:', zohoResult.error);
    }
  } catch (error) {
    console.error('❌ Zoho sync error:', error.message);
    customerObj.zohoSyncError = 'Failed to update in Zoho';
  }
}

// Helper function for Zoho sync on update
async function syncUpdateWithZoho(customer, company, customerId, customerObj) {
   
  zohoBooksService.setCompany(company._id, company.zohoOrganizationId);
  
  const zohoUpdateData = {
    name: customer.name,
    email: customer.email,
    phone: customer.phone,
    address: customer.address,
    companyName: customer.companyName,
    website: customer.website,
    taxTreatment: customer.taxTreatment,
    placeOfSupply: customer.placeOfSupply,
    currencyCode: customer.defaultCurrency?.code,
    contactPersons: (customer.contactPersons || [])
      .filter(contact => contact.zohoContactPersonId) // Only existing Zoho contacts
      .map(contact => ({
        first_name: contact.firstName,
        last_name: contact.lastName,
        email: contact.email,
        phone: contact.workPhone,
        mobile: contact.mobile,
        salutation: contact.salutation,
        designation: contact.designation,
        department: contact.department,
        notes: contact.notes,
        contact_person_id: contact.zohoContactPersonId
      }))
  };

  const isVatRegistered = customer.taxTreatment === 'vat_registered' || customer.taxTreatment === 'gcc_vat_registered';
  if (isVatRegistered && customer.taxRegistrationNumber) {
    zohoUpdateData.taxRegistrationNumber = customer.taxRegistrationNumber;
  }

  try {
    const zohoResult = await zohoBooksService.updateContact(customer.zohoId, zohoUpdateData);

    if (zohoResult?.success) {
      customerObj.zohoSynced = true;
      customerObj.zohoData = zohoResult.contact;
      customerObj.zohoSyncError = null;
      
      // Update new contact person IDs
      if (zohoResult.contact?.contact_persons) {
        const existingContacts = customer.contactPersons || [];
        
        for (let i = 0; i < existingContacts.length && i < zohoResult.contact.contact_persons.length; i++) {
          const zohoContact = zohoResult.contact.contact_persons[i];
          const localContact = existingContacts[i];
          
          if (zohoContact?.contact_person_id && localContact?._id && !localContact.zohoContactPersonId) {
            await Customer.updateOne(
              { _id: customerId, 'contactPersons._id': localContact._id },
              { $set: { 'contactPersons.$.zohoContactPersonId': zohoContact.contact_person_id } }
            );
          }
        }
      }
      
      console.log('✅ Customer updated in Zoho:', customer.zohoId);
    } else if (zohoResult?.error) {
      customerObj.zohoSyncError = `Failed to update in Zoho: ${zohoResult.error}`;
      console.error('❌ Zoho update failed:', zohoResult.error);
    }
  } catch (error) {
    console.error('❌ Zoho sync error:', error.message);
    customerObj.zohoSyncError = 'Failed to update in Zoho';
  }
}

// ─────────────────────────────────────────────────────────────────────────
// GET ALL CUSTOMERS
// ─────────────────────────────────────────────────────────────────────────
 
exports.getAllCustomers = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      search = '',
      sortBy = 'createdAt',        
      sortOrder = 'desc',
      // Advanced filters
      status = 'all',
      taxStatus = 'all',
      placeOfSupply = 'all',
      hasTRN = 'all',
      minQuotations = null,
      maxQuotations = null,
      minTotalValue = null,
      maxTotalValue = null,
      zohoSyncStatus = 'all'
    } = req.query;

    const companyId = req.headers['x-company-id'] || req.query.companyId;
    
    if (!companyId) {
      return res.status(400).json({ 
        success: false, 
        message: 'Company ID is required',
        data: [],
        pagination: { page: 1, limit, totalItems: 0, totalPages: 0, hasNextPage: false, hasPreviousPage: false }
      });
    }

    // Parse pagination with validation
    const parsedPage = Math.max(1, parseInt(page, 10) || 1);
    const parsedLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (parsedPage - 1) * parsedLimit;

    // ====================== SORTING VALIDATION ======================
    const allowedSortFields = ['createdAt', 'updatedAt', 'name', 'companyName'];
    const finalSortBy = allowedSortFields.includes(sortBy) ? sortBy : 'createdAt';
    const finalSortOrder = (sortOrder === 'asc' || sortOrder === '1') ? 1 : -1;

    // ============================================================
    // BUILD QUERY OBJECT
    // ============================================================
    const query = { companyId };

    // 1. Status Filter
    if (status === 'active') {
      query.isActive = true;
    } else if (status === 'inactive') {
      query.isActive = false;
    }

    // 2. Tax Status Filter
    if (taxStatus !== 'all' && taxStatus) {
      query.taxTreatment = taxStatus;
    }

    // 3. Place of Supply Filter
    if (placeOfSupply !== 'all' && placeOfSupply) {
      query.placeOfSupply = placeOfSupply;
    }

    // 4. TRN Filter
    if (hasTRN === 'yes') {
      query.taxRegistrationNumber = { $gt: '' };
    } else if (hasTRN === 'no') {
      query.$or = [
        { taxRegistrationNumber: '' },
        { taxRegistrationNumber: { $exists: false } }
      ];
    }

    // 5. Zoho Sync Status Filter
    if (zohoSyncStatus === 'synced') {
      query.zohoSynced = true;
      query.zohoId = { $exists: true, $ne: null };
    } else if (zohoSyncStatus === 'not_synced') {
      query.$or = [
        { zohoSynced: { $ne: true } },
        { zohoId: { $exists: false } },
        { zohoId: null }
      ];
    }

    // 6. Search Filter
    if (search && typeof search === 'string' && search.trim()) {
      const searchRegex = { $regex: search.trim(), $options: 'i' };
      const orConditions = [
        { name: searchRegex },
        { email: searchRegex },
        { phone: searchRegex },
        { companyName: searchRegex },
        { taxRegistrationNumber: searchRegex }
      ];
      
      // If already has $or from TRN filter, merge them
      if (query.$or) {
        query.$and = [
          { $or: query.$or },
          { $or: orConditions }
        ];
        delete query.$or;
      } else {
        query.$or = orConditions;
      }
    }

    // ============================================================
    // HANDLE QUOTATION-BASED FILTERS
    // ============================================================
    let customerIdsToInclude = null;

    const hasQuotationFilters = minQuotations !== null || 
                                maxQuotations !== null || 
                                minTotalValue !== null || 
                                maxTotalValue !== null;

    if (hasQuotationFilters) {
      const Quotation = require('../models/quotation').Quotation;
      
      const matchStage = { companyId };
      
      const aggregationPipeline = [
        { $match: matchStage },
        { 
          $group: {
            _id: '$customerId',
            quotationCount: { $sum: 1 },
            totalValue: { $sum: '$total' } 
          }
        }
      ];

      const statsResults = await Quotation.aggregate(aggregationPipeline);
      
      // Apply quotation filters
      let filtered = statsResults;

      if (minQuotations !== null) {
        const minQ = parseInt(minQuotations);
        filtered = filtered.filter(r => r.quotationCount >= minQ);
      }

      if (maxQuotations !== null) {
        const maxQ = parseInt(maxQuotations);
        filtered = filtered.filter(r => r.quotationCount <= maxQ);
      }

      if (minTotalValue !== null) {
        const minV = parseFloat(minTotalValue);
        filtered = filtered.filter(r => r.totalValue >= minV);
      }

      if (maxTotalValue !== null) {
        const maxV = parseFloat(maxTotalValue);
        filtered = filtered.filter(r => r.totalValue <= maxV);
      }

      customerIdsToInclude = filtered.map(r => r._id);

      // If no customers match, return empty result
      if (customerIdsToInclude.length === 0) {
        return res.status(200).json({
          success: true,
          data: [],
          pagination: {
            page: parsedPage,
            limit: parsedLimit,
            totalItems: 0,
            totalPages: 0,
            hasNextPage: false,
            hasPreviousPage: false
          },
          filters: {
            status: status !== 'all' ? status : null,
            taxStatus: taxStatus !== 'all' ? taxStatus : null,
            placeOfSupply: placeOfSupply !== 'all' ? placeOfSupply : null,
            hasTRN: hasTRN !== 'all' ? hasTRN : null,
            zohoSyncStatus: zohoSyncStatus !== 'all' ? zohoSyncStatus : null,
            minQuotations: minQuotations ? parseInt(minQuotations) : null,
            maxQuotations: maxQuotations ? parseInt(maxQuotations) : null,
            minTotalValue: minTotalValue ? parseFloat(minTotalValue) : null,
            maxTotalValue: maxTotalValue ? parseFloat(maxTotalValue) : null
          }
        });
      }

      // Add customer IDs filter
      query._id = { $in: customerIdsToInclude };
    }

    // ============================================================
    // EXECUTE QUERY
    // ============================================================
    const [customers, totalCount] = await Promise.all([
      Customer.find(query)
        .select('-zohoData') // Exclude large zohoData field
        .sort({ [finalSortBy]: finalSortOrder })
        .skip(skip)
        .limit(parsedLimit)
        .lean()
        .exec(),
      Customer.countDocuments(query)
    ]);

    const totalPages = Math.ceil(totalCount / parsedLimit);

    // Format response with contact persons
    const formattedCustomers = customers.map(customer => ({
      ...customer,
      contactPersons: customer.contactPersons || [],
      primaryContactId: customer.primaryContactId || null
    }));

    // Return response
    res.status(200).json({
      success: true,
      data: formattedCustomers,
      pagination: {
        page: parsedPage,
        limit: parsedLimit,
        totalItems: totalCount,
        totalPages,
        hasNextPage: parsedPage < totalPages,
        hasPreviousPage: parsedPage > 1
      },
      filters: {
        status: status !== 'all' ? status : null,
        taxStatus: taxStatus !== 'all' ? taxStatus : null,
        placeOfSupply: placeOfSupply !== 'all' ? placeOfSupply : null,
        hasTRN: hasTRN !== 'all' ? hasTRN : null,
        zohoSyncStatus: zohoSyncStatus !== 'all' ? zohoSyncStatus : null,
        minQuotations: minQuotations ? parseInt(minQuotations) : null,
        maxQuotations: maxQuotations ? parseInt(maxQuotations) : null,
        minTotalValue: minTotalValue ? parseFloat(minTotalValue) : null,
        maxTotalValue: maxTotalValue ? parseFloat(maxTotalValue) : null
      }
    });

  } catch (error) {
    console.error('❌ Error fetching customers:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching customers',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Server error',
      data: [],
      pagination: { page: 1, limit: 20, totalItems: 0, totalPages: 0, hasNextPage: false, hasPreviousPage: false }
    });
  }
};

// ─────────────────────────────────────────────────────────────────────────
// GET SINGLE CUSTOMER
// ─────────────────────────────────────────────────────────────────────────
exports.getCustomer = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id || typeof id !== 'string' || id.trim().length === 0) {
      return res.status(400).json({ success: false, message: 'Invalid customer ID' });
    }

    const customer = await Customer.findById(id).lean().catch(() => null);

    if (!customer) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }

    // Optional: If you still need Zoho data for single customer, fetch it conditionally
    // But remove the automatic fetch to avoid unnecessary API calls
    // You can add a separate endpoint for Zoho data if needed

    res.status(200).json({
      success: true,
      data: customer
    });

  } catch (error) {
     
    res.status(500).json({
      success: false,
      message: 'Error fetching customer',
      error: error.message
    });
  }
};

// ─────────────────────────────────────────────────────────────────────────
// DELETE CUSTOMER (soft delete)
// ─────────────────────────────────────────────────────────────────────────
exports.deleteCustomer = async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = req.companyId || req.headers['x-company-id'];

    if (!id || typeof id !== 'string' || id.trim().length === 0) {
      return res.status(400).json({ success: false, message: 'Invalid customer ID' });
    }

    // Find customer with company filter
    const customer = await Customer.findOne({ _id: id, companyId }).catch(() => null);
    if (!customer) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }

    // Check if customer has quotations before hard delete
    const Quotation = require('../models/quotation').Quotation;
    const quotationCount = await Quotation.countDocuments({ 
      customerId: id, 
      companyId 
    });
    
    if (quotationCount > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete customer because they have ${quotationCount} associated quotation(s). Please delete or reassign quotations first.`
      });
    }

    let zohoDeleted = false;
    let zohoError = null;

    // Delete from Zoho Books if customer has zohoId
    if (customer.zohoId) {
      try {
        // Get company to set Zoho context
        const Company = require('../models/company');
        const company = await Company.findById(companyId);
        
        if (company && company.zohoOrganizationId) {
          zohoBooksService.setCompany(company._id, company.zohoOrganizationId);
          
          const zohoResult = await zohoBooksService.deleteContact(customer.zohoId);
          
          if (zohoResult.success) {
            zohoDeleted = true;
            console.log(`✅ Deleted customer ${customer.name} from Zoho Books (ID: ${customer.zohoId})`);
          } else {
            zohoError = zohoResult.error;
            console.warn(`⚠️ Failed to delete from Zoho: ${zohoError}`);
          }
        } else {
          zohoError = 'Company Zoho Organization ID not found';
        }
      } catch (zohoErr) {
        zohoError = zohoErr.message;
        console.error(`❌ Error deleting from Zoho:`, zohoErr.message);
      }
    }

    // HARD DELETE from local database (permanent removal)
    await Customer.deleteOne({ _id: id, companyId });

    const redisService = require('../config/redisService');
    await redisService.delPattern(`customers_paginated_${companyId}:*`).catch(() => {});
    await redisService.del(`customer_stats_${companyId}`).catch(() => {});

    // Build response message
    let message = 'Customer deleted successfully from local database';
    if (customer.zohoId) {
      if (zohoDeleted) {
        message = 'Customer deleted successfully from both local database and Zoho Books';
      } else {
        message = `Customer deleted from local database, but failed to delete from Zoho Books: ${zohoError}`;
      }
    }

    res.status(200).json({
      success: true,
      message,
      data: {
        id: customer._id,
        name: customer.name,
        email: customer.email,
        zohoId: customer.zohoId,
        zohoDeleted,
        zohoError: zohoError || null
      }
    });

  } catch (error) {
    console.error('❌ Error deleting customer:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting customer',
      error: error.message
    });
  }
};

// ─────────────────────────────────────────────────────────────────────────
// SEARCH CUSTOMERS
// ─────────────────────────────────────────────────────────────────────────
exports.searchCustomers = async (req, res) => {
  try {
    const { query, limit = 20, offset = 0 } = req.query;

    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return res.status(400).json({ success: false, message: 'Search query is required' });
    }

    const searchTerm = query.trim();
    const parsedLimit = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
    const parsedOffset = Math.max(parseInt(offset, 10) || 0, 0);

    const customers = await Customer.find({
      isActive: true,
      $or: [
        { name: { $regex: searchTerm, $options: 'i' } },
        { email: { $regex: searchTerm, $options: 'i' } },
        { phone: { $regex: searchTerm, $options: 'i' } },
        { companyName: { $regex: searchTerm, $options: 'i' } }
      ]
    })
      .limit(parsedLimit + 1)
      .skip(parsedOffset)
      .lean()
      .catch(() => []);

    if (!Array.isArray(customers)) customers = [];

    const hasMore = customers.length > parsedLimit;
    const data = customers.slice(0, parsedLimit);

    res.status(200).json({
      success: true,
      data,
      offset: parsedOffset,
      limit: parsedLimit,
      hasMore,
      total: data.length
    });

  } catch (error) {
     
    res.status(500).json({
      success: false,
      message: 'Error searching customers',
      error: error.message
    });
  }
};

// ─────────────────────────────────────────────────────────────────────────
// GET CUSTOMER STATISTICS
// ─────────────────────────────────────────────────────────────────────────
 
exports.getCustomerStats = async (req, res) => {
  try {
    const companyId = req.headers['x-company-id'] || req.query.companyId;
    
    if (!companyId) {
      return res.status(400).json({ success: false, message: 'Company ID is required' });
    }

    const {
      status = 'all',
      taxStatus = 'all',
      placeOfSupply = 'all',
      hasTRN = 'all',
      search = ''
    } = req.query;

    console.log("📊 Stats API called with filters:", { status, taxStatus, placeOfSupply, hasTRN, search });

    const query = { companyId };

    // === Apply Filters (Same logic as getAllCustomers) ===
    if (status === 'active') {
      query.isActive = true;
    } else if (status === 'inactive') {
      query.isActive = false;
    }

    if (taxStatus !== 'all' && taxStatus) {
      query.taxTreatment = taxStatus;
    }

    if (placeOfSupply !== 'all' && placeOfSupply) {
      query.placeOfSupply = placeOfSupply;
    }

    if (hasTRN === 'yes') {
      query.taxRegistrationNumber = { $gt: '' };
    } else if (hasTRN === 'no') {
      query.$or = [
        { taxRegistrationNumber: '' },
        { taxRegistrationNumber: { $exists: false } },
        { taxRegistrationNumber: null }
      ];
    }

    // Search filter
    if (search && search.trim()) {
      const searchRegex = { $regex: search.trim(), $options: 'i' };
      query.$or = [
        { name: searchRegex },
        { email: searchRegex },
        { phone: searchRegex },
        { companyName: searchRegex }
      ];
    }

    // === Run Parallel Counts ===
    const [
      totalCustomers,
      activeCustomers,
      vatRegistered,
      nonVatRegistered,
      synced,
      unsynced
    ] = await Promise.all([
      Customer.countDocuments(query),
      Customer.countDocuments({ ...query, isActive: true }),
      Customer.countDocuments({ ...query, taxTreatment: { $in: ['vat_registered', 'gcc_vat_registered'] } }),
      Customer.countDocuments({ ...query, taxTreatment: { $in: ['non_vat_registered', 'gcc_non_vat_registered'] } }),
      Customer.countDocuments({ ...query, zohoSynced: true }),
      Customer.countDocuments({ ...query, zohoSynced: { $ne: true } })
    ]);

    const stats = {
      totalCustomers,
      activeCustomers,
      vatRegistered,
      nonVatRegistered,
      synced,
      unsynced
    };

    console.log("📊 Stats Calculated:", stats);

    res.status(200).json({
      success: true,
      stats,
      appliedFilters: { status, taxStatus, placeOfSupply, hasTRN, search }
    });

  } catch (error) {
    console.error('❌ Stats Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error calculating statistics',
      error: error.message
    });
  }
};

// Add this helper if not present
String.prototype.hashCode = function() {
  let hash = 0;
  for (let i = 0; i < this.length; i++) {
    const char = this.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString(36);
};

// ─────────────────────────────────────────────────────────────────────────
// SYNC SINGLE CUSTOMER WITH ZOHO
// ─────────────────────────────────────────────────────────────────────────
exports.syncCustomerWithZoho = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id || typeof id !== 'string' || id.trim().length === 0) {
      return res.status(400).json({ success: false, message: 'Invalid customer ID' });
    }

    const customer = await Customer.findById(id).catch(() => null);
    if (!customer) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }

    const contactData = {
      name: customer.name,
      email: customer.email,
      phone: customer.phone,
      address: customer.address,
      companyName: customer.companyName,
      website: customer.website,
      taxTreatment: customer.taxTreatment,
      placeOfSupply: customer.placeOfSupply,
      currencyCode: customer.defaultCurrency?.code
    };

    if ((customer.taxTreatment === 'vat_registered' || customer.taxTreatment === 'gcc_vat_registered')
        && customer.taxRegistrationNumber) {
      contactData.taxRegistrationNumber = customer.taxRegistrationNumber;
    }

    let result;
    if (customer.zohoId) {
      result = await zohoBooksService.updateContact(customer.zohoId, contactData);
    } else {
      result = await zohoBooksService.createContact(contactData);
      if (result?.success) {
        customer.zohoId = result.zohoId;
      }
    }

    if (result?.success) {
      customer.zohoSynced = true;
      customer.zohoSyncDate = new Date();
      customer.zohoSyncError = undefined;
      await customer.save();

      return res.status(200).json({
        success: true,
        message: 'Customer synced with Zoho successfully',
        data: customer.getFormattedData()
      });
    } else {
      customer.zohoSyncError = result?.error || 'Unknown error';
      customer.zohoSynced = false;
      await customer.save();

      return res.status(400).json({
        success: false,
        message: 'Failed to sync with Zoho',
        error: result?.error
      });
    }

  } catch (error) {
     
    res.status(500).json({
      success: false,
      message: 'Error syncing customer',
      error: error.message
    });
  }
};

// ─────────────────────────────────────────────────────────────────────────
// SYNC ALL CUSTOMERS FROM ZOHO 
// ───────────────────────────────────────────────────────────────────────── 
exports.syncFromZoho = async (req, res) => {
  try {
    const { fullSync = false } = req.query;
    const companyId = req.headers['x-company-id'] || req.body.companyId;
    
    if (!companyId) {
      return res.status(400).json({ 
        success: false, 
        message: 'Company ID is required. Please select a company first.' 
      });
    }
    
    // Get company details
    const company = await Company.findById(companyId);
    if (!company) {
      return res.status(404).json({ 
        success: false, 
        message: 'Company not found' 
      });
    }
    
    if (!company.zohoOrganizationId) {
      return res.status(400).json({ 
        success: false, 
        message: 'Company does not have a Zoho Organization ID configured. Please update company settings.' 
      });
    }
    
    console.log(`🔄 Starting customer sync for company: ${company.name} (${company.code})`);
    console.log(`📅 Mode: ${fullSync ? 'FULL' : 'INCREMENTAL'}`);
    
    // Pass company object and incremental flag to zohoBooksService
    const result = await zohoBooksService.syncContactsToDatabase(company, !fullSync);

    console.log("Sync Result:", JSON.stringify(result, null, 2));
    
    if (result.success) {
      const redisService = require('../config/redisService');
      // Clear all customer-related caches for this company
      await Promise.all([
        redisService.delPattern(`customers_paginated_${company._id}:*`).catch(() => {}),
        redisService.del(`customer_stats_${company._id}`).catch(() => {})
      ]);

      // Build response message
      let message = `Sync completed successfully. `;
      if (result.created > 0) message += `Created: ${result.created}, `;
      if (result.updated > 0) message += `Updated: ${result.updated}, `;
      if (result.unchanged > 0) message += `Unchanged: ${result.unchanged}, `;
      if (result.errors > 0) message += `Errors: ${result.errors}`;
      else message += `No errors.`;

      return res.status(200).json({
        success: true,
        message: message,
        stats: {
          totalFromZoho: result.totalFromZoho,
          created: result.created,
          updated: result.updated,
          unchanged: result.unchanged || 0,
          errors: result.errors || 0,
          vatCount: result.vatCount,
          trnFetched: result.trnFetched,
          trnFailed: result.trnFailed,
          duration: result.duration,
          lastSyncDate: result.lastSyncDate
        },
        syncType: fullSync ? 'full' : 'incremental',
        company: {
          id: company._id,
          name: company.name,
          code: company.code
        }
      });
    } else {
      return res.status(500).json({
        success: false,
        message: 'Failed to sync customers from Zoho',
        error: result.error
      });
    }
  } catch (error) {
    console.error('❌ Error syncing customers from Zoho:', error);
    res.status(500).json({
      success: false,
      message: 'Error syncing customers from Zoho',
      error: error.message
    });
  }
};

// ─────────────────────────────────────────────────────────────────────────
// GET CUSTOMER STATISTICS (Filter by company)
// ─────────────────────────────────────────────────────────────────────────
  
exports.getCustomerStats = async (req, res) => {
  try {
    const companyId = req.headers['x-company-id'] || req.query.companyId;
    
    if (!companyId) {
      return res.status(400).json({ success: false, message: 'Company ID is required' });
    }

    const {
      status = 'all',
      taxStatus = 'all',
      placeOfSupply = 'all',
      hasTRN = 'all',
      search = ''
    } = req.query;

    console.log("📊 Stats API called with filters:", { status, taxStatus, placeOfSupply, hasTRN, search });

    const query = { companyId };

    // === Apply Filters (Same logic as getAllCustomers) ===
    if (status === 'active') {
      query.isActive = true;
    } else if (status === 'inactive') {
      query.isActive = false;
    }

    if (taxStatus !== 'all' && taxStatus) {
      query.taxTreatment = taxStatus;
    }

    if (placeOfSupply !== 'all' && placeOfSupply) {
      query.placeOfSupply = placeOfSupply;
    }

    if (hasTRN === 'yes') {
      query.taxRegistrationNumber = { $gt: '' };
    } else if (hasTRN === 'no') {
      query.$or = [
        { taxRegistrationNumber: '' },
        { taxRegistrationNumber: { $exists: false } },
        { taxRegistrationNumber: null }
      ];
    }

    // Search filter
    if (search && search.trim()) {
      const searchRegex = { $regex: search.trim(), $options: 'i' };
      query.$or = [
        { name: searchRegex },
        { email: searchRegex },
        { phone: searchRegex },
        { companyName: searchRegex }
      ];
    }

    // === Run Parallel Counts ===
    const [
      totalCustomers,
      activeCustomers,
      vatRegistered,
      nonVatRegistered,
      synced,
      unsynced
    ] = await Promise.all([
      Customer.countDocuments(query),
      Customer.countDocuments({ ...query, isActive: true }),
      Customer.countDocuments({ ...query, taxTreatment: { $in: ['vat_registered', 'gcc_vat_registered'] } }),
      Customer.countDocuments({ ...query, taxTreatment: { $in: ['non_vat_registered', 'gcc_non_vat_registered'] } }),
      Customer.countDocuments({ ...query, zohoSynced: true }),
      Customer.countDocuments({ ...query, zohoSynced: { $ne: true } })
    ]);

    const stats = {
      totalCustomers,
      activeCustomers,
      vatRegistered,
      nonVatRegistered,
      synced,
      unsynced
    };

    console.log("📊 Stats Calculated:", stats);

    res.status(200).json({
      success: true,
      stats,
      appliedFilters: { status, taxStatus, placeOfSupply, hasTRN, search }
    });

  } catch (error) {
    console.error('❌ Stats Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error calculating statistics',
      error: error.message
    });
  }
};

// Add this helper if not present
String.prototype.hashCode = function() {
  let hash = 0;
  for (let i = 0; i < this.length; i++) {
    const char = this.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString(36);
};

// ─────────────────────────────────────────────────────────────────────────
// GET SYNC STATUS
// ─────────────────────────────────────────────────────────────────────────
exports.getSyncStatus = async (req, res) => {
  try {
    const companyId = req.headers['x-company-id'] || req.query.companyId;
    
    if (!companyId) {
      return res.status(400).json({ success: false, message: 'Company ID is required' });
    }
    
    const total = await Customer.countDocuments({ companyId });
    const synced = await Customer.countDocuments({ companyId, zohoSynced: true });
    const notSynced = await Customer.countDocuments({ companyId, zohoSynced: false });
    const pendingSync = await Customer.countDocuments({
      companyId,
      $or: [
        { zohoSynced: false },
        { lastModifiedTime: { $exists: false } }
      ]
    });
    const lastSync = await Customer.findOne({ companyId, zohoSyncDate: { $ne: null } })
      .sort({ zohoSyncDate: -1 })
      .select('zohoSyncDate lastModifiedTime');
    
    res.status(200).json({
      success: true,
      data: {
        total,
        synced,
        notSynced,
        pendingSync,
        lastSyncDate: lastSync?.zohoSyncDate || null,
        lastModifiedTime: lastSync?.lastModifiedTime || null
      }
    });
    
  } catch (error) {
    console.error('❌ Error getting sync status:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting sync status',
      error: error.message
    });
  }
};

// ─────────────────────────────────────────────────────────────────────────
// GET CUSTOMERS PENDING SYNC (Filter by company)
// ─────────────────────────────────────────────────────────────────────────
exports.getPendingSync = async (req, res) => {
  try {
    const companyId = req.headers['x-company-id'] || req.query.companyId;
    
    if (!companyId) {
      return res.status(400).json({ success: false, message: 'Company ID is required' });
    }
    
    const pendingCustomers = await Customer.find({
      companyId,
      $or: [
        { zohoSynced: false },
        { lastModifiedTime: { $exists: false } }
      ],
      isActive: true
    }).select('name email zohoId zohoSynced lastModifiedTime').lean();
    
    res.status(200).json({
      success: true,
      data: pendingCustomers,
      count: pendingCustomers.length
    });
    
  } catch (error) {
    console.error('❌ Error fetching pending sync customers:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching pending sync customers',
      error: error.message
    });
  }
};

// ─────────────────────────────────────────────────────────────────────────
// FORCE SYNC SPECIFIC CUSTOMER FROM ZOHO
// ─────────────────────────────────────────────────────────────────────────
exports.forceSyncCustomer = async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!id || typeof id !== 'string' || id.trim().length === 0) {
      return res.status(400).json({ success: false, message: 'Invalid customer ID' });
    }
    
    const customer = await Customer.findById(id).catch(() => null);
    if (!customer) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }
    
    if (!customer.zohoId) {
      return res.status(400).json({ 
        success: false, 
        message: 'Customer has no Zoho ID. Please sync from Zoho first.' 
      });
    }
    
    // Fetch latest from Zoho
    const zohoResult = await zohoBooksService.getContact(customer.zohoId);
    
    if (!zohoResult.success) {
      return res.status(400).json({
        success: false,
        message: 'Failed to fetch customer from Zoho',
        error: zohoResult.error
      });
    }
    
    // Update customer with latest Zoho data
    const zohoContact = zohoResult.contact;
    const mappedData = zohoBooksService._mapZohoContactToCustomer(zohoContact);
    
    const updatedCustomer = await Customer.findByIdAndUpdate(
      id,
      {
        $set: {
          ...mappedData,
          zohoSynced: true,
          zohoSyncDate: new Date(),
          zohoSyncError: null,
          lastModifiedTime: zohoContact.last_modified_time,
          zohoData: zohoContact
        }
      },
      { new: true, runValidators: false }
    );
    
    // Clear cache
    const redisService = require('../config/redisService');
    await redisService.delPattern('customers_paginated:*').catch(() => {});
    await redisService.del('customer_stats').catch(() => {});
    
    res.status(200).json({
      success: true,
      message: 'Customer force synced successfully',
      data: updatedCustomer.getFormattedData()
    });
    
  } catch (error) {
    console.error('❌ Error force syncing customer:', error);
    res.status(500).json({
      success: false,
      message: 'Error force syncing customer',
      error: error.message
    });
  }
};

 
// ─────────────────────────────────────────────────────────────────────────
// HELPER ENDPOINTS
// ─────────────────────────────────────────────────────────────────────────

exports.getGccCountries = async (req, res) => {
  try {
    res.status(200).json({ success: true, data: GCC_COUNTRY_NAMES });
  } catch (error) {
     
    res.status(500).json({ success: false, message: 'Error fetching GCC countries', error: error.message });
  }
};

exports.getCurrencyOptions = async (req, res) => {
  try {
    const currencies = Object.entries(CURRENCY_OPTIONS).map(([code, info]) => ({
      code,
      name: info.name,
      symbol: info.symbol
    }));

    res.status(200).json({ success: true, data: currencies });
  } catch (error) {
     
    res.status(500).json({ success: false, message: 'Error fetching currency options', error: error.message });
  }
};

exports.getTaxTreatments = async (req, res) => {
  try {
    const treatments = [
      { value: 'vat_registered', label: 'VAT Registered', requiresTrn: true, type: 'vat' },
      { value: 'non_vat_registered', label: 'Non-VAT Registered', requiresTrn: false, type: 'vat' },
      { value: 'gcc_vat_registered', label: 'GCC VAT Registered', requiresTrn: true, type: 'gcc' },
      { value: 'gcc_non_vat_registered', label: 'GCC Non-VAT Registered', requiresTrn: false, type: 'gcc' }
    ];

    res.status(200).json({ success: true, data: treatments });
  } catch (error) {
     
    res.status(500).json({ success: false, message: 'Error fetching tax treatments', error: error.message });
  }
};

exports.getTaxSummary = async (req, res) => {
  try {
    const vatRegistered = await Customer.find({
      taxTreatment: { $in: ['vat_registered', 'gcc_vat_registered'] },
      isActive: true
    }).select('name taxRegistrationNumber placeOfSupply defaultCurrency').lean();

    const summary = {
      totalVatRegistered: vatRegistered.length,
      uaeVatRegistered: vatRegistered.filter(c => c.taxTreatment === 'vat_registered').length,
      gccVatRegistered: vatRegistered.filter(c => c.taxTreatment === 'gcc_vat_registered').length,
      vatRegisteredCustomers: vatRegistered,
      breakdownByPlace: {}
    };

    const allPlaceOptions = [...GCC_COUNTRY_NAMES, ...UAE_EMIRATES];
    for (const place of allPlaceOptions) {
      summary.breakdownByPlace[place] = vatRegistered.filter(c => c.placeOfSupply === place).length;
    }

    res.status(200).json({ success: true, data: summary });
  } catch (error) {
     
    res.status(500).json({ success: false, message: 'Error fetching tax summary', error: error.message });
  }
};

// Export constants
exports.constants = {
  GCC_COUNTRIES: GCC_COUNTRY_NAMES,
  UAE_EMIRATES,
  TAX_TREATMENTS,
  TAX_TREATMENT_VALUES,
  CURRENCY_OPTIONS,
  CURRENCY_CODES
};