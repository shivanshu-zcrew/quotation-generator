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

function validatePaginationParams(query) {
  let page = parseInt(query.page, 10) || 1;
  let limit = parseInt(query.limit, 10) || DEFAULT_PAGE_SIZE;
  const search = query.search ? String(query.search).trim() : '';
  const sortBy = query.sortBy || 'createdAt';
  const sortOrder = query.sortOrder === 'asc' ? 1 : -1;

  if (page < 1) page = 1;
  if (limit < MIN_PAGE_SIZE) limit = MIN_PAGE_SIZE;
  if (limit > MAX_PAGE_SIZE) limit = MAX_PAGE_SIZE;

  return { page, limit, skip: (page - 1) * limit, search, sortBy, sortOrder };
}

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

async function addZohoDataToBatch(customers) {
  const results = [];

  for (const customer of customers) {
    const customerObj = customer.toObject ? customer.toObject() : customer;

    if (!customer.zohoId) {
      results.push(customerObj);
      continue;
    }

    try {
      const zohoResult = await zohoBooksService.getContact(customer.zohoId);

      if (zohoResult?.success && zohoResult.contact) {
        customerObj.zohoData = zohoResult.contact;
        customerObj.zohoSynced = true;
      } else if (zohoResult?.error) {
        customerObj.zohoError = zohoResult.error;
        console.warn(`Zoho fetch failed for ${customer.email}: ${zohoResult.error}`);
      }
    } catch (error) {
      customerObj.zohoError = error.message;
       
    }

    results.push(customerObj);
  }

  return results;
}

// ─────────────────────────────────────────────────────────────────────────
// CREATE CUSTOMER
// ─────────────────────────────────────────────────────────────────────────
// In your customerController.js - REPLACE the createCustomer function

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
      placeOfSupply = 'United Arab Emirates (UAE)',
      defaultCurrency = 'AED'
    } = req.body;

    // Get company from request
    const companyId = req.headers['x-company-id'] || req.body.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, message: 'Company ID is required' });
    }

    const company = await Company.findById(companyId);
    if (!company) {
      return res.status(404).json({ success: false, message: 'Company not found' });
    }

    // Debug: Log company Zoho info
    console.log('🔍 Company Zoho Info:', {
      companyId: company._id,
      companyName: company.name,
      zohoOrganizationId: company.zohoOrganizationId,
      hasZohoId: !!company.zohoOrganizationId
    });

    // Validate Zoho configuration before proceeding
    if (!company.zohoOrganizationId) {
      console.warn('⚠️ Company has no Zoho Organization ID - Zoho sync will be skipped');
    }

    const validation = validateCustomerData({ name, email });
    if (!validation.valid) {
      return res.status(400).json({ success: false, message: validation.error });
    }

    const taxErrors = validateTaxData(taxTreatment, taxRegistrationNumber, placeOfSupply);
    if (taxErrors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Tax validation error',
        errors: taxErrors
      });
    }

    const currencyError = validateCurrency(defaultCurrency);
    if (currencyError) {
      return res.status(400).json({ success: false, message: currencyError });
    }

    const customer = new Customer({
      companyId: company._id,
      name: name.trim(),
      email: email.toLowerCase().trim(),
      phone: phone ? phone.trim() : '',
      address: address ? address.trim() : '',
      companyName: companyName ? companyName.trim() : '',
      website: website ? website.trim() : '',
      notes: notes ? notes.trim() : '',
      taxTreatment,
      taxRegistrationNumber: (taxTreatment === 'vat_registered' || taxTreatment === 'gcc_vat_registered')
        ? taxRegistrationNumber.trim()
        : '',
      placeOfSupply,
      defaultCurrency: buildCurrencyObject(defaultCurrency)
    });

    const savedCustomer = await customer.save();
    const customerObj = savedCustomer.getFormattedData();

    // DEBUG: Log before Zoho sync
    console.log('📝 Customer saved locally:', {
      customerId: savedCustomer._id,
      name: savedCustomer.name,
      email: savedCustomer.email,
      zohoId: savedCustomer.zohoId
    });

    // Only attempt Zoho sync if company has Zoho Organization ID
    if (company.zohoOrganizationId) {
      // Set company context for Zoho
      zohoBooksService.setCompany(company._id, company.zohoOrganizationId);
      
      // DEBUG: Verify service context was set
      console.log('🔧 Zoho Service Context Set:', {
        companyId: company._id,
        orgId: company.zohoOrganizationId,
        currentContext: zohoBooksService.getCurrentContext?.() || 'No context getter'
      });
      
      try {
        // Build Zoho contact data with proper structure
        const zohoContactData = {
          name: savedCustomer.name,
          email: savedCustomer.email,
          phone: savedCustomer.phone,
          address: savedCustomer.address,
          companyName: savedCustomer.companyName || savedCustomer.name,
          website: savedCustomer.website,
          taxTreatment: savedCustomer.taxTreatment,
          placeOfSupply: savedCustomer.placeOfSupply,
          currencyCode: savedCustomer.defaultCurrency.code,
          taxRegistrationNumber: savedCustomer.taxRegistrationNumber
        };

        console.log('📤 Sending to Zoho:', JSON.stringify(zohoContactData, null, 2));
        
        const zohoResult = await zohoBooksService.createContact(zohoContactData);

        console.log('📥 Zoho Response:', JSON.stringify(zohoResult, null, 2));

        if (zohoResult?.success && zohoResult.zohoId) {
          // Update customer with Zoho ID
          savedCustomer.zohoId = zohoResult.zohoId;
          savedCustomer.zohoSynced = true;
          savedCustomer.zohoSyncDate = new Date();
          await savedCustomer.save();

          customerObj.zohoId = zohoResult.zohoId;
          customerObj.zohoSynced = true;
          customerObj.zohoData = zohoResult.contact;
          
          console.log('✅ Customer synced to Zoho successfully. Zoho ID:', zohoResult.zohoId);
        } else {
          const errorMsg = zohoResult?.error || 'Unknown Zoho error';
          console.error('❌ Zoho sync failed:', errorMsg);
          customerObj.zohoSyncError = `Failed to sync with Zoho: ${errorMsg}`;
          
          // Store error in database for debugging
          savedCustomer.zohoSyncError = errorMsg;
          savedCustomer.zohoSynced = false;
          await savedCustomer.save();
        }
      } catch (zohoError) {
        console.error('❌ Exception during Zoho sync:', {
          message: zohoError.message,
          stack: zohoError.stack,
          response: zohoError.response?.data
        });
        customerObj.zohoSyncError = `Failed to sync with Zoho: ${zohoError.message}`;
        
        savedCustomer.zohoSyncError = zohoError.message;
        savedCustomer.zohoSynced = false;
        await savedCustomer.save();
      }
    } else {
      console.warn('⚠️ Skipping Zoho sync - Company has no Zoho Organization ID');
      customerObj.zohoSyncWarning = 'Zoho sync skipped: Company not configured with Zoho Organization ID';
    }

    // Clear cache
    const redisService = require('../config/redisService');
    await redisService.delPattern(`customers_paginated_${company._id}:*`).catch(() => {});

    res.status(201).json({
      success: true,
      message: 'Customer created successfully',
      data: customerObj
    });

  } catch (error) {
    console.error('❌ Error creating customer:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating customer',
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
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
      defaultCurrency
    } = req.body;

    if (!id || typeof id !== 'string' || id.trim().length === 0) {
      return res.status(400).json({ success: false, message: 'Invalid customer ID' });
    }

    const customer = await Customer.findById(id).catch(() => null);
    if (!customer) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }

    const updateData = {};

    if (name !== undefined) {
      if (!name || name.trim().length < 2) {
        return res.status(400).json({ success: false, message: 'Name must be at least 2 characters' });
      }
      updateData.name = name.trim();
    }

    if (email !== undefined) updateData.email = email.toLowerCase().trim();
    if (phone !== undefined) updateData.phone = phone ? phone.trim() : '';
    if (address !== undefined) updateData.address = address ? address.trim() : '';
    if (companyName !== undefined) updateData.companyName = companyName ? companyName.trim() : '';
    if (website !== undefined) updateData.website = website ? website.trim() : '';
    if (notes !== undefined) updateData.notes = notes ? notes.trim() : '';

    // Tax fields validation
    if (taxTreatment !== undefined || taxRegistrationNumber !== undefined || placeOfSupply !== undefined) {
      const newTaxTreatment = taxTreatment !== undefined ? taxTreatment : customer.taxTreatment;
      const newTaxRegistrationNumber = taxRegistrationNumber !== undefined ? taxRegistrationNumber : customer.taxRegistrationNumber;
      const newPlaceOfSupply = placeOfSupply !== undefined ? placeOfSupply : customer.placeOfSupply;

      const errors = validateTaxData(newTaxTreatment, newTaxRegistrationNumber, newPlaceOfSupply);
      if (errors.length > 0) {
        return res.status(400).json({ success: false, message: 'Tax validation error', errors });
      }

      if (taxTreatment !== undefined) updateData.taxTreatment = taxTreatment;
      if (taxRegistrationNumber !== undefined) {
        updateData.taxRegistrationNumber = (newTaxTreatment === 'vat_registered' || newTaxTreatment === 'gcc_vat_registered')
          ? taxRegistrationNumber.trim()
          : '';
      }
      if (placeOfSupply !== undefined) updateData.placeOfSupply = placeOfSupply;
    }

    if (defaultCurrency !== undefined) {
      const currencyError = validateCurrency(defaultCurrency);
      if (currencyError) {
        return res.status(400).json({ success: false, message: currencyError });
      }
      updateData.defaultCurrency = buildCurrencyObject(defaultCurrency);
    }

    const updatedCustomer = await Customer.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    ).lean().catch(err => {
      throw new Error(err.message || 'Update failed');
    });

    if (!updatedCustomer) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }

    const customerObj = { ...updatedCustomer };

    // Update in Zoho if zohoId exists
    if (updatedCustomer.zohoId) {
      try {
        const zohoUpdateData = {
          name: updatedCustomer.name,
          email: updatedCustomer.email,
          phone: updatedCustomer.phone,
          address: updatedCustomer.address,
          companyName: updatedCustomer.companyName,
          website: updatedCustomer.website,
          taxTreatment: updatedCustomer.taxTreatment,
          placeOfSupply: updatedCustomer.placeOfSupply,
          currencyCode: updatedCustomer.defaultCurrency?.code
        };

        if ((updatedCustomer.taxTreatment === 'vat_registered' || updatedCustomer.taxTreatment === 'gcc_vat_registered')
            && updatedCustomer.taxRegistrationNumber) {
          zohoUpdateData.taxRegistrationNumber = updatedCustomer.taxRegistrationNumber;
        }

        const zohoResult = await zohoBooksService.updateContact(updatedCustomer.zohoId, zohoUpdateData);

        if (zohoResult?.success) {
          customerObj.zohoSynced = true;
          customerObj.zohoData = zohoResult.contact;
        } else if (zohoResult?.error) {
          customerObj.zohoSyncError = `Failed to update in Zoho: ${zohoResult.error}`;
        }
      } catch (zohoError) {
         
        customerObj.zohoSyncError = 'Failed to update in Zoho';
      }
    }

    // Clear cache
    const redisService = require('../config/redisService');
    await redisService.delPattern('customers_paginated:*').catch(() => {});

    res.status(200).json({
      success: true,
      message: 'Customer updated successfully',
      data: customerObj
    });

  } catch (error) {
     
    res.status(500).json({
      success: false,
      message: 'Error updating customer',
      error: error.message
    });
  }
};

// ─────────────────────────────────────────────────────────────────────────
// GET ALL CUSTOMERS
// ─────────────────────────────────────────────────────────────────────────
exports.getAllCustomers = async (req, res) => {
  try {
    const pagination = validatePaginationParams(req.query);
    const companyId = req.headers['x-company-id'] || req.query.companyId;
    
    if (!companyId) {
      return res.status(400).json({ success: false, message: 'Company ID is required' });
    }

    const redisService = require('../config/redisService');
    const cacheKey = `customers_paginated_${companyId}:${pagination.page}:${pagination.limit}:${pagination.search}`;

    const cachedResult = await redisService.get(cacheKey).catch(() => null);
    if (cachedResult) {
      return res.status(200).json({
        success: true,
        data: cachedResult.data,
        pagination: cachedResult.pagination,
        source: 'cache'
      });
    }

    const query = { isActive: true, companyId };

    if (pagination.search) {
      query.$or = [
        { name: { $regex: pagination.search, $options: 'i' } },
        { email: { $regex: pagination.search, $options: 'i' } },
        { phone: { $regex: pagination.search, $options: 'i' } },
        { companyName: { $regex: pagination.search, $options: 'i' } }
      ];
    }

    const totalCount = await Customer.countDocuments(query).catch(() => 0);
    const totalPages = Math.ceil(totalCount / pagination.limit);

    if (pagination.page > totalPages && totalPages > 0) {
      return res.status(400).json({
        success: false,
        message: `Page ${pagination.page} exceeds total pages (${totalPages})`
      });
    }

    const customers = await Customer.find(query)
      .sort({ [pagination.sortBy]: pagination.sortOrder })
      .skip(pagination.skip)
      .limit(pagination.limit)
      .lean()
      .catch(() => []);

    const response = {
      data: customers,
      pagination: {
        page: pagination.page,
        limit: pagination.limit,
        totalItems: totalCount,
        totalPages,
        hasNextPage: pagination.page < totalPages,
        hasPreviousPage: pagination.page > 1
      },
      filters: pagination.search ? { search: pagination.search } : {}
    };

    await redisService.set(cacheKey, response, PAGINATION_CACHE_TTL).catch(() => {});

    res.status(200).json({
      success: true,
      ...response,
      source: 'database'
    });

  } catch (error) {
    console.error('❌ Error fetching customers:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching customers',
      error: error.message
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
    const redisService = require('../config/redisService');
    const cacheKey = 'customer_stats';

    const cachedStats = await redisService.get(cacheKey).catch(() => null);
    if (cachedStats) {
      return res.status(200).json({
        success: true,
        stats: cachedStats,
        source: 'cache'
      });
    }

    const stats = {
      totalCustomers: 0,
      activeCustomers: 0,
      vatRegistered: 0,
      nonVatRegistered: 0,
      gccVatRegistered: 0,
      gccNonVatRegistered: 0,
      synced: 0,
      unsynced: 0,
      syncErrors: 0,
      byPlaceOfSupply: {}
    };

    try {
      stats.totalCustomers = await Customer.countDocuments().catch(() => 0);
      stats.activeCustomers = await Customer.countDocuments({ isActive: true }).catch(() => 0);
      stats.vatRegistered = await Customer.countDocuments({ taxTreatment: 'vat_registered', isActive: true }).catch(() => 0);
      stats.nonVatRegistered = await Customer.countDocuments({ taxTreatment: 'non_vat_registered', isActive: true }).catch(() => 0);
      stats.gccVatRegistered = await Customer.countDocuments({ taxTreatment: 'gcc_vat_registered', isActive: true }).catch(() => 0);
      stats.gccNonVatRegistered = await Customer.countDocuments({ taxTreatment: 'gcc_non_vat_registered', isActive: true }).catch(() => 0);
      stats.synced = await Customer.countDocuments({ zohoSynced: true }).catch(() => 0);
      stats.unsynced = await Customer.countDocuments({ zohoSynced: { $ne: true }, isActive: true }).catch(() => 0);
      stats.syncErrors = await Customer.countDocuments({ zohoSyncError: { $exists: true } }).catch(() => 0);

      const allPlaceOptions = [...GCC_COUNTRY_NAMES, ...UAE_EMIRATES];
      for (const place of allPlaceOptions) {
        stats.byPlaceOfSupply[place] = await Customer.countDocuments({ placeOfSupply: place, isActive: true }).catch(() => 0);
      }
    } catch (error) {
       
    }

    await redisService.set(cacheKey, stats, 600).catch(() => {});

    res.status(200).json({
      success: true,
      stats,
      source: 'database'
    });

  } catch (error) {
     
    res.status(500).json({
      success: false,
      message: 'Error calculating statistics',
      error: error.message
    });
  }
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

    console.log(">>>>>>>>>", result);
    if (result.success) {
      const redisService = require('../config/redisService');
      // Clear all customer-related caches for this company
      await redisService.delPattern(`customers_paginated_${company._id}:*`).catch(() => {});
      await redisService.del(`customer_stats_${company._id}`).catch(() => {});

      return res.status(200).json({
        success: true,
        message: `Customers synced from Zoho successfully (${fullSync ? 'full' : 'incremental'} sync)`,
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
    const redisService = require('../config/redisService');
    const companyId = req.headers['x-company-id'] || req.query.companyId;
    
    if (!companyId) {
      return res.status(400).json({ success: false, message: 'Company ID is required' });
    }
    
    const cacheKey = `customer_stats_${companyId}`;

    const cachedStats = await redisService.get(cacheKey).catch(() => null);
    if (cachedStats) {
      return res.status(200).json({
        success: true,
        stats: cachedStats,
        source: 'cache'
      });
    }

    const stats = {
      totalCustomers: 0,
      activeCustomers: 0,
      vatRegistered: 0,
      nonVatRegistered: 0,
      gccVatRegistered: 0,
      gccNonVatRegistered: 0,
      synced: 0,
      unsynced: 0,
      syncErrors: 0,
      byPlaceOfSupply: {}
    };

    try {
      const baseQuery = { companyId, isActive: true };
      
      stats.totalCustomers = await Customer.countDocuments({ companyId }).catch(() => 0);
      stats.activeCustomers = await Customer.countDocuments({ companyId, isActive: true }).catch(() => 0);
      stats.vatRegistered = await Customer.countDocuments({ companyId, taxTreatment: 'vat_registered' }).catch(() => 0);
      stats.nonVatRegistered = await Customer.countDocuments({ companyId, taxTreatment: 'non_vat_registered' }).catch(() => 0);
      stats.gccVatRegistered = await Customer.countDocuments({ companyId, taxTreatment: 'gcc_vat_registered' }).catch(() => 0);
      stats.gccNonVatRegistered = await Customer.countDocuments({ companyId, taxTreatment: 'gcc_non_vat_registered' }).catch(() => 0);
      stats.synced = await Customer.countDocuments({ companyId, zohoSynced: true }).catch(() => 0);
      stats.unsynced = await Customer.countDocuments({ companyId, zohoSynced: { $ne: true }, isActive: true }).catch(() => 0);
      stats.syncErrors = await Customer.countDocuments({ companyId, zohoSyncError: { $exists: true } }).catch(() => 0);

      const allPlaceOptions = [...GCC_COUNTRY_NAMES, ...UAE_EMIRATES];
      for (const place of allPlaceOptions) {
        stats.byPlaceOfSupply[place] = await Customer.countDocuments({ companyId, placeOfSupply: place, isActive: true }).catch(() => 0);
      }
    } catch (error) {
      console.error('Error calculating stats:', error);
    }

    await redisService.set(cacheKey, stats, 600).catch(() => {});

    res.status(200).json({
      success: true,
      stats,
      source: 'database'
    });

  } catch (error) {
    console.error('❌ Error calculating statistics:', error);
    res.status(500).json({
      success: false,
      message: 'Error calculating statistics',
      error: error.message
    });
  }
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