const { Customer, constants } = require('../models/customer');
const zohoBooksService = require('../zoho/customerServices');

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

    // const existingCustomer = await Customer.findOne({ email: email.toLowerCase() }).catch(() => null);
    // if (existingCustomer) {
    //   return res.status(409).json({
    //     success: false,
    //     message: 'Customer with this email already exists'
    //   });
    // }

    const customer = new Customer({
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

    // Sync with Zoho
    try {
      const zohoContactData = {
        name: savedCustomer.name,
        email: savedCustomer.email,
        phone: savedCustomer.phone,
        address: savedCustomer.address,
        companyName: savedCustomer.companyName,
        website: savedCustomer.website,
        taxTreatment: savedCustomer.taxTreatment,
        placeOfSupply: savedCustomer.placeOfSupply,
        currencyCode: savedCustomer.defaultCurrency.code
      };

      if ((savedCustomer.taxTreatment === 'vat_registered' || savedCustomer.taxTreatment === 'gcc_vat_registered')
          && savedCustomer.taxRegistrationNumber) {
        zohoContactData.taxRegistrationNumber = savedCustomer.taxRegistrationNumber;
      }

      const zohoResult = await zohoBooksService.createContact(zohoContactData);

      if (zohoResult?.success) {
        savedCustomer.zohoId = zohoResult.zohoId;
        savedCustomer.zohoSynced = true;
        savedCustomer.zohoSyncDate = new Date();
        await savedCustomer.save();

        customerObj.zohoId = zohoResult.zohoId;
        customerObj.zohoSynced = true;
        customerObj.zohoData = zohoResult.contact;
      } else if (zohoResult?.error) {
        customerObj.zohoSyncError = `Failed to sync with Zoho: ${zohoResult.error}`;
      }
    } catch (zohoError) {
       
      customerObj.zohoSyncError = 'Failed to sync with Zoho';
    }

    // Clear cache
    const redisService = require('../config/redisService');
    await redisService.delPattern('customers_paginated:*').catch(() => {});

    res.status(201).json({
      success: true,
      message: 'Customer created successfully',
      data: customerObj
    });

  } catch (error) {
     
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

    const redisService = require('../config/redisService');
    const cacheKey = `customers_paginated:${pagination.page}:${pagination.limit}:${pagination.search}`;

    const cachedResult = await redisService.get(cacheKey).catch(() => null);
    if (cachedResult) {
      return res.status(200).json({
        success: true,
        data: cachedResult.data,
        pagination: cachedResult.pagination,
        source: 'cache'
      });
    }

    const query = { isActive: true };

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

    if (!Array.isArray(customers)) customers = [];

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

    if (!id || typeof id !== 'string' || id.trim().length === 0) {
      return res.status(400).json({ success: false, message: 'Invalid customer ID' });
    }

    const customer = await Customer.findById(id).catch(() => null);
    if (!customer) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }

    customer.isActive = false;
    await customer.save();

    const redisService = require('../config/redisService');
    await redisService.delPattern('customers_paginated:*').catch(() => {});

    res.status(200).json({
      success: true,
      message: 'Customer deactivated successfully'
    });

  } catch (error) {
     
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
// SYNC ALL CUSTOMERS FROM ZOHO TO LOCAL DB (Main Fix Here)
// ─────────────────────────────────────────────────────────────────────────
exports.syncFromZoho = async (req, res) => {
  try {
     

    const result = await zohoBooksService.syncContactsToDatabase();

    if (result.success) {
      const redisService = require('../config/redisService');
      await redisService.delPattern('customers_paginated:*').catch(() => {});

      return res.status(200).json({
        success: true,
        message: 'Customers synced from Zoho successfully',
        stats: {
          totalFromZoho: result.total,
          created: result.created,
          updated: result.updated,
          skippedNoEmail: result.skippedNoEmail || 0
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
     
    res.status(500).json({
      success: false,
      message: 'Error syncing customers from Zoho',
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