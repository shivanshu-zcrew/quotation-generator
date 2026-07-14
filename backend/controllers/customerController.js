const { Customer, constants } = require('../models/customer');
const zohoBooksService = require('../zoho/customerServices');
const Company = require('../models/company');
const redisService = require('../config/redisService');
const { GCC_COUNTRIES } = require('../models/constants');
const Quotation = require('../models/quotation').Quotation;
const ExcelJS = require('exceljs');
const mongoose = require('mongoose');
const logger = require('../config/logger');

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
// CONFIGURATION CONSTANTS
// ─────────────────────────────────────────────────────────────────────────
const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 500;
const MIN_PAGE_SIZE = 1;
const ZOHO_BATCH_SIZE = 10;
const PAGINATION_CACHE_TTL = 300;
const MAX_SEARCH_LIMIT = 100;
const DEFAULT_LIST_LIMIT = 20;
const MAX_LIST_LIMIT = 100;

// ─────────────────────────────────────────────────────────────────────────
// SYNC STATE MANAGEMENT (Singleton Pattern)
// ─────────────────────────────────────────────────────────────────────────
class SyncStateManager {
  constructor() {
    this.statusMap = new Map();
    this.progressMap = new Map();
    this.cancelMap = new Map();
  }

  tryAcquire(companyId) {
    const status = this.getStatus(companyId);
    if (status.isSyncing) return false;
    this.setStatus(companyId, { isSyncing: true });
    return true;
  }
 
  release(companyId) {
    this.setStatus(companyId, { isSyncing: false });
  }

  getStatus(companyId) {
    if (!this.statusMap.has(companyId)) {
      this.statusMap.set(companyId, {
        isSyncing: false,
        lastSyncTime: null,
        lastSyncResult: null,
        fetched: 0,
        total: 0
      });
    }
    return this.statusMap.get(companyId);
  }

  setStatus(companyId, updates) {
    const current = this.getStatus(companyId);
    this.statusMap.set(companyId, { ...current, ...updates });
  }

  getProgress(companyId) {
    return this.progressMap.get(companyId) || {
      stage: 'idle',
      message: 'No sync in progress',
      fetched: 0,
      total: 0,
      startTime: null
    };
  }

  setProgress(companyId, progress) {
    this.progressMap.set(companyId, {
      ...progress,
      updatedAt: Date.now()
    });
  }

  requestCancel(companyId) {
    this.cancelMap.set(companyId, true);
    logger.info(`Customer sync cancellation requested for company ${companyId}`);
  }

  isCancelRequested(companyId) {
    return this.cancelMap.get(companyId) === true;
  }

  clearCancel(companyId) {
    this.cancelMap.delete(companyId);
  }

  clearSyncState(companyId) {
    this.statusMap.delete(companyId);
    this.progressMap.delete(companyId);
    this.cancelMap.delete(companyId);
  }

  setSyncing(companyId, isSyncing) {
    this.setStatus(companyId, { isSyncing });
  }
}

const syncManager = new SyncStateManager();

// ─────────────────────────────────────────────────────────────────────────
// HELPER FUNCTIONS
// ─────────────────────────────────────────────────────────────────────────

const buildCurrencyObject = (currencyCode) => {
  const info = CURRENCY_OPTIONS[currencyCode] || CURRENCY_OPTIONS['AED'];
  return {
    code: currencyCode,
    symbol: info.symbol,
    name: info.name
  };
};

const validateCurrency = (currencyCode) => {
  if (!currencyCode || !CURRENCY_OPTIONS[currencyCode]) {
    return `Currency must be one of: ${CURRENCY_CODES.join(', ')}`;
  }
  return null;
};

const validateCustomerData = (customer) => {
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
};

const validateTaxData = (taxTreatment, taxRegistrationNumber, placeOfSupply) => {
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
  } else if (taxTreatment === 'gcc_vat_registered' || taxTreatment === 'gcc_non_vat_registered') {
    if (!GCC_COUNTRY_NAMES.includes(placeOfSupply)) {
      errors.push(`Place of supply must be one of: ${GCC_COUNTRY_NAMES.join(', ')}`);
    }
  }

  return errors;
};

const buildContactPersons = (name, email, phone, notes, contactPersons = [], mainContactSalutation = 'Mr.') => {
  const allContactPersons = [];

  allContactPersons.push({
    salutation: mainContactSalutation,
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

  for (const cp of contactPersons) {
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
  }

  return allContactPersons;
};

const buildUpdateData = (body, existingCustomer) => {
  const updateData = {};
  const {
    name, email, phone, address, city, state, zipcode,
    companyName, website, notes, taxTreatment, taxRegistrationNumber,
    placeOfSupply, defaultCurrency, contactPersons, mainContactSalutation,trnExpiryDate
  } = body;

  if (name !== undefined) updateData.name = name.trim().toUpperCase();
  if (email !== undefined) updateData.email = email.trim().toLowerCase();
  if (phone !== undefined) updateData.phone = phone.trim();
  if (address !== undefined) updateData.address = address?.trim() || '';
  if (city !== undefined) updateData.city = city?.trim() || '';
  if (state !== undefined) updateData.state = state?.trim() || '';
  if (zipcode !== undefined) updateData.zipcode = zipcode?.trim() || '';
  if (companyName !== undefined) updateData.companyName = companyName?.trim() || '';
  if (website !== undefined) updateData.website = website?.trim() || '';
  if (notes !== undefined) updateData.notes = notes?.trim() || '';

  if (taxTreatment !== undefined || taxRegistrationNumber !== undefined || placeOfSupply !== undefined) {
    const newTax = taxTreatment ?? existingCustomer.taxTreatment;
    const newTRN = taxRegistrationNumber ?? existingCustomer.taxRegistrationNumber;
    const newPlace = placeOfSupply ?? existingCustomer.placeOfSupply;

    updateData.taxTreatment = newTax;
    updateData.placeOfSupply = newPlace;
    updateData.taxRegistrationNumber = (newTax === 'vat_registered' || newTax === 'gcc_vat_registered')
      ? (newTRN?.trim() || '')
      : '';
  }

  if (trnExpiryDate !== undefined) {
    updateData.trnExpiryDate = trnExpiryDate ? new Date(trnExpiryDate) : null;
  }

  if (defaultCurrency !== undefined) {
    updateData.defaultCurrency = buildCurrencyObject(defaultCurrency);
  }

  if (contactPersons !== undefined && Array.isArray(contactPersons)) {
    updateData.contactPersons = buildContactPersons(
      name || existingCustomer.name,
      email || existingCustomer.email,
      phone || existingCustomer.phone,
      notes || existingCustomer.notes,
      contactPersons,
      mainContactSalutation
    );
  } else if (mainContactSalutation !== undefined && existingCustomer.contactPersons?.length > 0) {
    updateData.contactPersons = [...existingCustomer.contactPersons];
    updateData.contactPersons[0].salutation = mainContactSalutation;
    updateData.contactPersons[0].updatedAt = new Date();
  }

  return updateData;
};

const clearCustomerCache = async (companyId) => {
  await redisService.delPattern(`customers_paginated_${companyId}:*`).catch(() => {});
  await redisService.del(`customer_stats_${companyId}`).catch(() => {});
};

const sendErrorResponse = (res, statusCode, message, error = null) => {
  const response = { success: false, message };
  if (error && process.env.NODE_ENV === 'development') {
    response.error = error.message;
  }
  return res.status(statusCode).json(response);
};

const getCompanyFromRequest = async (req) => {
  let companyId = null;
  
  if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
    companyId = req.body.companyId;
  }
  
  if (!companyId) {
    companyId = req.headers['x-company-id'] || req.query.companyId;
  } 
  if (!companyId) {
    throw new Error('Company ID is required');
  }
   
  if (companyId === 'all' || companyId === 'ALL') {
    throw new Error('Cannot create/update customer with "All Companies". Please select a specific company.');
  }
   
  if (!mongoose.Types.ObjectId.isValid(companyId)) {
    throw new Error('Invalid company ID format');
  }
  
  const company = await Company.findById(companyId);
  if (!company) {
    throw new Error('Company not found');
  }
  
  return { companyId, company };
};

// ─────────────────────────────────────────────────────────────────────────
// CORE CRUD OPERATIONS
// ─────────────────────────────────────────────────────────────────────────

exports.createCustomer = async (req, res) => {
  try {
    const {
      name, email, phone, address, city, state, zipcode,
      companyName, website, notes, taxTreatment = 'non_vat_registered',
      taxRegistrationNumber = '', placeOfSupply = 'Dubai',
      defaultCurrency = 'AED', contactPersons = [], mainContactSalutation = 'Mr.',
      trnExpiryDate = null
    } = req.body;

    const { companyId, company } = await getCompanyFromRequest(req);
    if (!companyId) return sendErrorResponse(res, 400, 'Company ID is required');
    if (!company) return sendErrorResponse(res, 404, 'Company not found');
    
    if (!name?.trim() || name.trim().length < 3) {
      return sendErrorResponse(res, 400, 'Customer name must be at least 3 characters');
    }

    const taxErrors = validateTaxData(taxTreatment, taxRegistrationNumber, placeOfSupply);
    if (taxErrors.length > 0) {
      return sendErrorResponse(res, 400, taxErrors[0]);
    }

    if (taxRegistrationNumber && taxRegistrationNumber.trim()) {
      const existingCustomer = await Customer.findOne({
        companyId: company._id,
        taxRegistrationNumber: taxRegistrationNumber.trim()
      });
      
      if (existingCustomer) {
        return sendErrorResponse(res, 400, 'Tax Registration Number (TRN) already exists for another customer in this company');
      }
    }

    const allContactPersons = buildContactPersons(name, email, phone, notes, contactPersons, mainContactSalutation);

    const isVatRegistered = taxTreatment.includes('vat_registered');

    const customerData = {
      companyId: company._id,
      name: name.trim().toUpperCase(),
      email: email ? email.trim().toLowerCase() : null,
      phone: phone ? phone.trim() : '',
      address: address?.trim() || '',
      city: city?.trim() || '',
      state: state?.trim() || '',
      zipcode: zipcode?.trim() || '',
      companyName: companyName?.trim() || name.trim(),
      website: website?.trim() || '',
      notes: notes?.trim() || '',
      taxTreatment,
      taxRegistrationNumber: (isVatRegistered && taxRegistrationNumber) ? taxRegistrationNumber.trim() : '',
      // Only keep an expiry date for VAT-registered customers (the only ones
      // with a TRN). Blank/null means "never expires".
      trnExpiryDate: (isVatRegistered && trnExpiryDate) ? new Date(trnExpiryDate) : null,
      placeOfSupply,
      defaultCurrency: buildCurrencyObject(defaultCurrency),
      contactPersons: allContactPersons
    };

    let zohoResult = null;

    if (company.zohoOrganizationId) {
      try {
        zohoBooksService.setCompany(company._id, company.zohoOrganizationId);
        zohoResult = await zohoBooksService.createContact({
          name: customerData.name,
          companyName: customerData.companyName,
          email: customerData.email,
          phone: customerData.phone,
          address: customerData.address,
          city: customerData.city,
          state: customerData.state,
          zipcode: customerData.zipcode,
          taxTreatment: customerData.taxTreatment,
          placeOfSupply: customerData.placeOfSupply,
          taxRegistrationNumber: customerData.taxRegistrationNumber,
          currencyCode: customerData.defaultCurrency?.code,
          contactPersons: customerData.contactPersons
        });

        if (!zohoResult.success) {
          throw new Error(`Zoho creation failed: ${zohoResult.error || 'Unknown error'}`);
        }
      } catch (zohoErr) {
        logger.error(`Zoho customer creation failed: ${zohoErr.message}`, {
          companyId: company._id,
          customerName: name,
          error: zohoErr.message
        });
        return sendErrorResponse(res, 400, `Failed to create customer in Zoho Books: ${zohoErr.message}`, zohoErr);
      }
    }

    const customer = new Customer(customerData);
    const savedCustomer = await customer.save();

    if (zohoResult && zohoResult.success && zohoResult.zohoId) {
      savedCustomer.zohoId = zohoResult.zohoId;
      savedCustomer.zohoSynced = true;
      savedCustomer.zohoSyncDate = new Date();

      if (zohoResult.contact?.contact_persons) {
        zohoResult.contact.contact_persons.forEach((zp, i) => {
          if (savedCustomer.contactPersons[i]) {
            savedCustomer.contactPersons[i].zohoContactPersonId = zp.contact_person_id;
          }
        });
      }

      await savedCustomer.save();
    }

    let customerObj = savedCustomer.getFormattedData?.() || savedCustomer.toObject();
    await clearCustomerCache(company._id);

    logger.info(`Customer created: ${savedCustomer.name} (${savedCustomer.email})`, {
      customerId: savedCustomer._id,
      customerName: savedCustomer.name,
      companyId: company._id,
      companyCode: company.code,
      zohoSynced: !!savedCustomer.zohoId,
      createdBy: req.user?.id
    });

    res.status(201).json({
      success: true,
      message: 'Customer created successfully in both Zoho and local database',
      data: customerObj,
      zohoSynced: true
    });

  } catch (error) {
    logger.error(`Create customer error: ${error.message}`, {
      error: error.message,
      stack: error.stack,
      customerName: req.body?.name
    });
    sendErrorResponse(res, 500, 'Error creating customer', error);
  }
};

exports.updateCustomer = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id?.trim()) return sendErrorResponse(res, 400, 'Invalid customer ID');

    const customer = await Customer.findById(id);
    if (!customer) return sendErrorResponse(res, 404, 'Customer not found');

    const company = await Company.findById(customer.companyId);
    if (!company) return sendErrorResponse(res, 404, 'Company not found');

    const updateData = buildUpdateData(req.body, customer);
    const newTRN = updateData.taxRegistrationNumber || customer.taxRegistrationNumber;
    const newTaxTreatment = updateData.taxTreatment || customer.taxTreatment;
    
    if (newTRN && newTRN.trim() && newTaxTreatment.includes('vat_registered')) {
      const existingCustomer = await Customer.findOne({
        _id: { $ne: id },
        companyId: customer.companyId,
        taxRegistrationNumber: newTRN.trim()
      });
      
      if (existingCustomer) {
        return sendErrorResponse(res, 400, 'Tax Registration Number (TRN) already exists for another customer in this company');
      }
    }

    if (updateData.taxTreatment !== undefined || updateData.placeOfSupply !== undefined) {
      const taxErrors = validateTaxData(
        updateData.taxTreatment || customer.taxTreatment,
        updateData.taxRegistrationNumber || customer.taxRegistrationNumber,
        updateData.placeOfSupply || customer.placeOfSupply
      );
      if (taxErrors.length > 0) {
        return sendErrorResponse(res, 400, taxErrors[0]);
      }
    }

    const oldCustomerData = {
      name: customer.name,
      email: customer.email,
      taxTreatment: customer.taxTreatment
    };

    const updatedCustomer = await Customer.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    );

    if (!updatedCustomer) return sendErrorResponse(res, 404, 'Customer not found');

    if (updatedCustomer.zohoId && company.zohoOrganizationId) {
      try {
        zohoBooksService.setCompany(company._id, company.zohoOrganizationId);
        const zohoResult = await zohoBooksService.updateContact(updatedCustomer.zohoId, {
          name: updatedCustomer.name,
          companyName: updatedCustomer.companyName || updatedCustomer.name,
          email: updatedCustomer.email,
          phone: updatedCustomer.phone,
          address: updatedCustomer.address,
          city: updatedCustomer.city,
          state: updatedCustomer.state,
          zipcode: updatedCustomer.zipcode,
          taxTreatment: updatedCustomer.taxTreatment,
          placeOfSupply: updatedCustomer.placeOfSupply,
          taxRegistrationNumber: updatedCustomer.taxRegistrationNumber,
          currencyCode: updatedCustomer.defaultCurrency?.code,
          contactPersons: updatedCustomer.contactPersons || []
        });

        if (!zohoResult.success) {
          await Customer.findByIdAndUpdate(id, customer.toObject(), { runValidators: false });
          await clearCustomerCache(customer.companyId);
          throw new Error(`Zoho update failed: ${zohoResult.error || 'Unknown error'}`);
        }

        if (zohoResult.success && zohoResult.contact?.contact_persons) {
          const zohoPersons = zohoResult.contact.contact_persons;
          
          for (let i = 0; i < updatedCustomer.contactPersons.length; i++) {
            updatedCustomer.contactPersons[i].zohoContactPersonId = null;
          }
          
          for (const zohoPerson of zohoPersons) {
            const matchingIndex = updatedCustomer.contactPersons.findIndex(mongoPerson => 
              (mongoPerson.email && zohoPerson.email && 
               mongoPerson.email.toLowerCase() === zohoPerson.email.toLowerCase()) ||
              (mongoPerson.firstName === zohoPerson.first_name)
            );
            
            if (matchingIndex !== -1) {
              updatedCustomer.contactPersons[matchingIndex].zohoContactPersonId = zohoPerson.contact_person_id;
            }
          }
          
          await updatedCustomer.save();
        }
        
      } catch (zohoErr) {
        logger.error(`Zoho customer update failed: ${zohoErr.message}`, {
          customerId: id,
          customerName: customer.name,
          companyId: company._id,
          error: zohoErr.message
        });
        
        return res.status(400).json({
          success: false,
          message: 'Failed to update customer in Zoho Books',
          error: zohoErr.message,
          zohoFailure: true,
          reverted: true
        });
      }
    }

    await clearCustomerCache(customer.companyId);

    logger.info(`Customer updated: ${updatedCustomer.name}`, {
      customerId: id,
      customerName: updatedCustomer.name,
      companyId: customer.companyId,
      changes: {
        name: oldCustomerData.name !== updatedCustomer.name ? { from: oldCustomerData.name, to: updatedCustomer.name } : undefined,
        email: oldCustomerData.email !== updatedCustomer.email ? { from: oldCustomerData.email, to: updatedCustomer.email } : undefined,
        taxTreatment: oldCustomerData.taxTreatment !== updatedCustomer.taxTreatment ? 
          { from: oldCustomerData.taxTreatment, to: updatedCustomer.taxTreatment } : undefined
      },
      updatedBy: req.user?.id
    });

    res.status(200).json({
      success: true,
      message: 'Customer updated successfully',
      data: updatedCustomer.getFormattedData()
    });

  } catch (error) {
    logger.error(`Update customer error: ${error.message}`, {
      error: error.message,
      customerId: req.params.id
    });
    sendErrorResponse(res, 500, 'Error updating customer', error);
  }
};

exports.deleteCustomer = async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = req.companyId || req.headers['x-company-id'];

    if (!id?.trim()) return sendErrorResponse(res, 400, 'Invalid customer ID');

    const customer = await Customer.findOne({ _id: id, companyId });
    if (!customer) return sendErrorResponse(res, 404, 'Customer not found');

    const quotationCount = await Quotation.countDocuments({ customerId: id, companyId });
    if (quotationCount > 0) {
      logger.warn(`Cannot delete customer with associated quotations`, {
        customerId: id,
        customerName: customer.name,
        quotationCount,
        companyId
      });
      return sendErrorResponse(res, 400, `Cannot delete customer: ${quotationCount} associated quotation(s) exist`);
    }

    if (customer.zohoId) {
      const company = await Company.findById(companyId);
      if (!company?.zohoOrganizationId) {
        return sendErrorResponse(res, 400, 'Company Zoho Organization ID not found');
      }

      zohoBooksService.setCompany(company._id, company.zohoOrganizationId);
      const zohoResult = await zohoBooksService.deleteContact(customer.zohoId);

      if (!zohoResult.success) {
        return sendErrorResponse(res, 400, `Failed to delete from Zoho Books: ${zohoResult.error}`);
      }
    }

    await Customer.deleteOne({ _id: id, companyId });
    await clearCustomerCache(companyId);

    logger.warn(`Customer deleted: ${customer.name} (${customer.email})`, {
      customerId: id,
      customerName: customer.name,
      customerEmail: customer.email,
      companyId,
      hadQuotations: quotationCount > 0,
      zohoId: customer.zohoId,
      deletedBy: req.user?.id
    });

    res.status(200).json({
      success: true,
      message: customer.zohoId ? 'Customer deleted from both local and Zoho Books' : 'Customer deleted successfully',
      data: { id: customer._id, name: customer.name, email: customer.email }
    });

  } catch (error) {
    logger.error(`Delete customer error: ${error.message}`, {
      error: error.message,
      customerId: req.params.id
    });
    sendErrorResponse(res, 500, 'Error deleting customer', error);
  }
};

// ─────────────────────────────────────────────────────────────────────────
// QUERY OPERATIONS
// ─────────────────────────────────────────────────────────────────────────

const buildCustomerQuery = (companyId, filters) => {
  const query = {};
  
  if (companyId && companyId !== 'all') {
    query.companyId = companyId;
  }
  
  const {
    status, taxStatus, placeOfSupply, hasTRN,
    zohoSyncStatus, search
  } = filters;

  if (status === 'active') query.isActive = true;
  else if (status === 'inactive') query.isActive = false;

  if (taxStatus && taxStatus !== 'all') query.taxTreatment = taxStatus;
  if (placeOfSupply && placeOfSupply !== 'all') query.placeOfSupply = placeOfSupply;

  if (hasTRN === 'yes') query.taxRegistrationNumber = { $gt: '' };
  else if (hasTRN === 'no') query.$or = [{ taxRegistrationNumber: '' }, { taxRegistrationNumber: { $exists: false } }, { taxRegistrationNumber: null }];

  if (zohoSyncStatus === 'synced') {
    query.zohoSynced = true;
    query.zohoId = { $exists: true, $ne: null };
  } else if (zohoSyncStatus === 'not_synced') {
    query.$or = [{ zohoSynced: { $ne: true } }, { zohoId: { $exists: false } }, { zohoId: null }];
  }

  if (search?.trim()) {
    const searchRegex = { $regex: search.trim(), $options: 'i' };
    const searchConditions = [
      { name: searchRegex }, { email: searchRegex }, { phone: searchRegex },
      { companyName: searchRegex }, { taxRegistrationNumber: searchRegex }
    ];

    if (query.$or) {
      query.$and = [{ $or: query.$or }, { $or: searchConditions }];
      delete query.$or;
    } else {
      query.$or = searchConditions;
    }
  }

  return query;
};

exports.getAllCustomers = async (req, res) => {
  try {
    const {
      page = 1, 
      limit = DEFAULT_LIST_LIMIT, 
      search = '', 
      sortBy = 'createdAt',
      sortOrder = 'desc', 
      status = 'all', 
      taxStatus = 'all',
      placeOfSupply = 'all', 
      hasTRN = 'all', 
      zohoSyncStatus = 'all',
      minQuotations = null, 
      maxQuotations = null,
      minTotalValue = null, 
      maxTotalValue = null
    } = req.query;

    let companyId = req.headers['x-company-id'] || req.query.companyId;
    const isAllCompanies = !companyId || companyId === 'all' || companyId === 'ALL';
    
    const parsedPage = Math.max(1, parseInt(page, 10) || 1);
    const parsedLimit = Math.min(MAX_LIST_LIMIT, Math.max(1, parseInt(limit, 10) || DEFAULT_LIST_LIMIT));
    const skip = (parsedPage - 1) * parsedLimit;

    const allowedSortFields = ['createdAt', 'updatedAt', 'name', 'companyName'];
    const finalSortBy = allowedSortFields.includes(sortBy) ? sortBy : 'createdAt';
    const finalSortOrder = sortOrder === 'asc' || sortOrder === '1' ? 1 : -1;

    let query = {};
    
    if (isAllCompanies) {
      if (search && search.trim()) {
        const searchRegex = new RegExp(search.trim(), 'i');
        query.$or = [
          { name: searchRegex },
          { email: searchRegex },
          { phone: searchRegex },
          { companyName: searchRegex },
          { taxRegistrationNumber: searchRegex }
        ];
      }
      
      if (status === 'active') query.isActive = true;
      else if (status === 'inactive') query.isActive = false;
      
      if (taxStatus && taxStatus !== 'all') query.taxTreatment = taxStatus;
      if (placeOfSupply && placeOfSupply !== 'all') query.placeOfSupply = placeOfSupply;
      
      if (hasTRN === 'yes') {
        query.taxRegistrationNumber = { $gt: '' };
      } else if (hasTRN === 'no') {
        query.$or = [
          { taxRegistrationNumber: '' },
          { taxRegistrationNumber: { $exists: false } },
          { taxRegistrationNumber: null }
        ];
      }
      
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
    } else {
      query = buildCustomerQuery(companyId, { 
        status, taxStatus, placeOfSupply, hasTRN, zohoSyncStatus, search 
      });
    }

    const hasQuotationFilters = minQuotations !== null || maxQuotations !== null ||
      minTotalValue !== null || maxTotalValue !== null;

    if (hasQuotationFilters) {
      const quotationMatchStage = isAllCompanies ? {} : { companyId };
      
      const statsResults = await Quotation.aggregate([
        { $match: quotationMatchStage },
        { 
          $group: { 
            _id: '$customerId', 
            quotationCount: { $sum: 1 }, 
            totalValue: { $sum: '$totalInBaseCurrency' } 
          } 
        }
      ]);

      let filtered = statsResults;
      if (minQuotations !== null) {
        filtered = filtered.filter(r => r.quotationCount >= parseInt(minQuotations));
      }
      if (maxQuotations !== null) {
        filtered = filtered.filter(r => r.quotationCount <= parseInt(maxQuotations));
      }
      if (minTotalValue !== null) {
        filtered = filtered.filter(r => r.totalValue >= parseFloat(minTotalValue));
      }
      if (maxTotalValue !== null) {
        filtered = filtered.filter(r => r.totalValue <= parseFloat(maxTotalValue));
      }

      const customerIds = filtered.map(r => r._id);
      if (customerIds.length === 0) {
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
          isAllCompanies
        });
      }
      query._id = { $in: customerIds };
    }

    const [customers, totalCount] = await Promise.all([
      Customer.find(query)
        .select('-zohoData')
        .sort({ [finalSortBy]: finalSortOrder })
        .skip(skip)
        .limit(parsedLimit)
        .lean(),
      Customer.countDocuments(query)
    ]);

    const totalPages = Math.ceil(totalCount / parsedLimit);

    res.status(200).json({
      success: true,
      data: customers.map(c => ({ 
        ...c, 
        contactPersons: c.contactPersons || [] 
      })),
      pagination: {
        page: parsedPage, 
        limit: parsedLimit, 
        totalItems: totalCount, 
        totalPages,
        hasNextPage: parsedPage < totalPages, 
        hasPreviousPage: parsedPage > 1
      },
      isAllCompanies,
      filterSummary: {
        status,
        taxStatus,
        placeOfSupply,
        hasTRN,
        zohoSyncStatus,
        search,
        companyId: isAllCompanies ? 'ALL' : (companyId || null)
      }
    });

  } catch (error) {
    logger.error(`Get customers error: ${error.message}`, { error: error.message });
    sendErrorResponse(res, 500, 'Error fetching customers', error);
  }
};

exports.getCustomer = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id?.trim()) return sendErrorResponse(res, 400, 'Invalid customer ID');

    const customer = await Customer.findById(id).lean();
    if (!customer) return sendErrorResponse(res, 404, 'Customer not found');

    res.status(200).json({ success: true, data: customer });

  } catch (error) {
    sendErrorResponse(res, 500, 'Error fetching customer', error);
  }
};

exports.searchCustomers = async (req, res) => {
  try {
    const { query, limit = 20, offset = 0 } = req.query;
    if (!query?.trim()) return sendErrorResponse(res, 400, 'Search query is required');

    const searchTerm = query.trim();
    const parsedLimit = Math.min(MAX_SEARCH_LIMIT, Math.max(1, parseInt(limit, 10) || 20));
    const parsedOffset = Math.max(0, parseInt(offset, 10) || 0);

    const companyId = req.companyId || req.headers['x-company-id'];
    const isAllCompanies = !companyId || companyId === 'all' || companyId === 'ALL';
    const searchFilter = {
      isActive: true,
      $or: [
        { name: { $regex: searchTerm, $options: 'i' } },
        { email: { $regex: searchTerm, $options: 'i' } },
        { phone: { $regex: searchTerm, $options: 'i' } },
        { companyName: { $regex: searchTerm, $options: 'i' } }
      ]
    };
    if (!isAllCompanies) searchFilter.companyId = companyId;

    const customers = await Customer.find(searchFilter)
      .limit(parsedLimit + 1)
      .skip(parsedOffset)
      .lean();

    const hasMore = customers.length > parsedLimit;
    const data = customers.slice(0, parsedLimit);

    res.status(200).json({
      success: true, data, offset: parsedOffset, limit: parsedLimit, hasMore, total: data.length
    });

  } catch (error) {
    sendErrorResponse(res, 500, 'Error searching customers', error);
  }
};

// ─────────────────────────────────────────────────────────────────────────
// STATISTICS & UTILITY ENDPOINTS
// ─────────────────────────────────────────────────────────────────────────

exports.getCustomerStats = async (req, res) => {
  try {
    let companyId = req.headers['x-company-id'] || req.query.companyId;
    const isAllCompanies = !companyId || companyId === 'all' || companyId === 'ALL';
    
    const { status = 'all', taxStatus = 'all', placeOfSupply = 'all', hasTRN = 'all', search = '' } = req.query;

    let query = {};
    
    if (isAllCompanies) {
      if (search) {
        query.$or = [
          { name: new RegExp(search, 'i') },
          { email: new RegExp(search, 'i') },
          { phone: new RegExp(search, 'i') }
        ];
      }
      
      if (status !== 'all') query.isActive = status === 'active';
      if (taxStatus !== 'all') query.taxTreatment = taxStatus;
      if (placeOfSupply !== 'all') query.placeOfSupply = placeOfSupply;
      
      if (hasTRN === 'yes') {
        query.taxRegistrationNumber = { $exists: true, $ne: '' };
      } else if (hasTRN === 'no') {
        query.$or = [
          { taxRegistrationNumber: { $exists: false } },
          { taxRegistrationNumber: '' }
        ];
      }
    } else {
      query = buildCustomerQuery(companyId, { status, taxStatus, placeOfSupply, hasTRN, search });
    }

    const [totalCustomers, activeCustomers, vatRegistered, synced] = await Promise.all([
      Customer.countDocuments(query),
      Customer.countDocuments({ ...query, isActive: true }),
      Customer.countDocuments({ ...query, taxTreatment: { $in: ['vat_registered', 'gcc_vat_registered'] } }),
      Customer.countDocuments({ ...query, zohoSynced: true })
    ]);

    res.status(200).json({
      success: true,
      stats: {
        totalCustomers,
        activeCustomers,
        vatRegistered,
        nonVatRegistered: totalCustomers - vatRegistered,
        synced,
        unsynced: totalCustomers - synced
      },
      isAllCompanies
    });

  } catch (error) {
    logger.error(`Get customer stats error: ${error.message}`, { error: error.message });
    sendErrorResponse(res, 500, 'Error calculating statistics', error);
  }
};

exports.getGccCountries = async (req, res) => {
  res.status(200).json({ success: true, data: GCC_COUNTRY_NAMES });
};

exports.getCurrencyOptions = async (req, res) => {
  const currencies = Object.entries(CURRENCY_OPTIONS).map(([code, info]) => ({
    code, name: info.name, symbol: info.symbol
  }));
  res.status(200).json({ success: true, data: currencies });
};

exports.getTaxTreatments = async (req, res) => {
  const treatments = [
    { value: 'vat_registered', label: 'VAT Registered', requiresTrn: true, type: 'vat' },
    { value: 'non_vat_registered', label: 'Non-VAT Registered', requiresTrn: false, type: 'vat' },
    { value: 'gcc_vat_registered', label: 'GCC VAT Registered', requiresTrn: true, type: 'gcc' },
    { value: 'gcc_non_vat_registered', label: 'GCC Non-VAT Registered', requiresTrn: false, type: 'gcc' }
  ];
  res.status(200).json({ success: true, data: treatments });
};

exports.getTaxSummary = async (req, res) => {
  try {
    const companyId = req.headers['x-company-id'] || req.query.companyId;
    if (!companyId) return sendErrorResponse(res, 400, 'Company ID is required');

    const vatRegistered = await Customer.find({
      companyId,
      taxTreatment: { $in: ['vat_registered', 'gcc_vat_registered'] },
      isActive: true
    }).select('name taxRegistrationNumber placeOfSupply defaultCurrency').lean();

    const summary = {
      totalVatRegistered: vatRegistered.length,
      uaeVatRegistered: vatRegistered.filter(c => c.taxTreatment === 'vat_registered').length,
      gccVatRegistered: vatRegistered.filter(c => c.taxTreatment === 'gcc_vat_registered').length,
      breakdownByPlace: {}
    };

    const allPlaces = [...GCC_COUNTRY_NAMES, ...UAE_EMIRATES];
    for (const place of allPlaces) {
      summary.breakdownByPlace[place] = vatRegistered.filter(c => c.placeOfSupply === place).length;
    }

    res.status(200).json({ success: true, data: summary });
  } catch (error) {
    sendErrorResponse(res, 500, 'Error fetching tax summary', error);
  }
};

// ─────────────────────────────────────────────────────────────────────────
// ZOHO SYNC OPERATIONS
// ─────────────────────────────────────────────────────────────────────────

exports.syncCustomerWithZoho = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id?.trim()) return sendErrorResponse(res, 400, 'Invalid customer ID');

    const customer = await Customer.findById(id);
    if (!customer) return sendErrorResponse(res, 404, 'Customer not found');

    const company = await Company.findById(customer.companyId);
    if (!company?.zohoOrganizationId) {
      return sendErrorResponse(res, 400, 'Zoho Organization ID not configured');
    }

    zohoBooksService.setCompany(company._id, company.zohoOrganizationId);

    const contactData = {
      name: customer.name, email: customer.email, phone: customer.phone,
      address: customer.address, city: customer.city, state: customer.state,
      zipcode: customer.zipcode, companyName: customer.companyName,
      website: customer.website, taxTreatment: customer.taxTreatment,
      placeOfSupply: customer.placeOfSupply, currencyCode: customer.defaultCurrency?.code
    };

    if ((customer.taxTreatment === 'vat_registered' || customer.taxTreatment === 'gcc_vat_registered') && customer.taxRegistrationNumber) {
      contactData.taxRegistrationNumber = customer.taxRegistrationNumber;
    }

    const wasNew = !customer.zohoId;
    const result = customer.zohoId
      ? await zohoBooksService.updateContact(customer.zohoId, contactData)
      : await zohoBooksService.createContact(contactData);

    if (result?.success) {
      if (wasNew && result.zohoId) customer.zohoId = result.zohoId;
      customer.zohoSynced = true;
      customer.zohoSyncDate = new Date();
      customer.zohoSyncError = undefined;
      await customer.save();

      logger.info(`Customer synced with Zoho: ${customer.name}`, {
        customerId: customer._id,
        customerName: customer.name,
        companyId: company._id,
        action: wasNew ? 'create' : 'update'
      });

      return res.status(200).json({
        success: true,
        message: 'Customer synced with Zoho successfully',
        data: customer.getFormattedData()
      });
    }

    customer.zohoSyncError = result?.error || 'Unknown error';
    customer.zohoSynced = false;
    await customer.save();

    return sendErrorResponse(res, 400, 'Failed to sync with Zoho', { error: result?.error });

  } catch (error) {
    logger.error(`Sync customer with Zoho error: ${error.message}`, {
      error: error.message,
      customerId: req.params.id
    });
    sendErrorResponse(res, 500, 'Error syncing customer', error);
  }
};

exports.syncFromZoho = async (req, res) => {
  let companyId;
  let acquired = false;
 
  try {
    companyId = req.headers['x-company-id'] || req.body.companyId;
    if (!companyId) return sendErrorResponse(res, 400, 'Company ID is required');
 
    const company = await Company.findById(companyId);
    if (!company) return sendErrorResponse(res, 404, 'Company not found');
    if (!company.zohoOrganizationId) {
      return sendErrorResponse(res, 400, 'Company does not have a Zoho Organization ID configured');
    }
 
    // ATOMIC acquire — replaces the old non-atomic check-then-set.
    acquired = syncManager.tryAcquire(companyId);
    if (!acquired) {
      return res.status(409).json({ success: false, message: 'Sync already in progress for this company' });
    }
 
    // Clear any stale cancellation flags from a previous run (both registries).
    syncManager.clearCancel(companyId);
    const customerServices = require('../zoho/customerServices');
    if (customerServices.customerSyncCancelMap) {
      customerServices.customerSyncCancelMap.delete(String(companyId));
    }
 
    syncManager.setProgress(companyId, {
      stage: 'starting', message: 'Starting customer sync...', fetched: 0, total: 0, startTime: Date.now()
    });
 
    // Respond immediately; sync continues in background.
    res.status(202).json({
      success: true, message: `Customer sync started for ${company.name}`, status: 'started'
    });
 
    logger.info(`Customer sync started from Zoho for company: ${company.code}`, {
      companyId: company._id, companyCode: company.code, startedBy: req.user?.id
    });
 
    // Pass a cancelToken OBJECT (not a bare companyId string) so the service
    // has one unambiguous way to check cancellation.
    const cancelToken = {
      isCancelRequested: () =>
        syncManager.isCancelRequested(companyId) ||
        (customerServices.customerSyncCancelMap &&
         customerServices.customerSyncCancelMap.get(String(companyId)) === true)
    };
 
    const result = await zohoBooksService.syncContactsToDatabase(
      company,
      !req.query.fullSync,
      null,
      (progress) => syncManager.setProgress(companyId, progress),
      cancelToken
    );
 
    const wasCancelled = result?.cancelled === true || result?.message === 'Sync cancelled by user';
 
    syncManager.setStatus(companyId, {
      isSyncing: false, lastSyncTime: new Date(), lastSyncResult: result
    });
 
    syncManager.setProgress(companyId, wasCancelled ? {
      stage: 'cancelled', message: 'Sync was cancelled',
      fetched: result?.totalFromZoho || 0, total: result?.totalFromZoho || 0
    } : {
      stage: 'completed',
      message: `Sync completed! ${result?.created || 0} created, ${result?.updated || 0} updated`,
      fetched: result?.totalFromZoho || 0, total: result?.totalFromZoho || 0,
      created: result?.created || 0, updated: result?.updated || 0,
      errors: result?.errors || 0, duration: result?.duration
    });
 
    if (!wasCancelled && result?.success) {
      logger.info(`Customer sync completed for company: ${company.code}`, {
        companyId: company._id, companyCode: company.code,
        created: result?.created || 0, updated: result?.updated || 0,
        errors: result?.errors || 0, total: result?.totalFromZoho || 0, duration: result?.duration
      });
    } else if (!wasCancelled && result && result.success === false) {
      // Sync ran but failed at the fetch/processing level — surface it in progress.
      syncManager.setProgress(companyId, {
        stage: 'error', message: `Sync failed: ${result.error || 'Unknown error'}`, error: result.error
      });
      logger.error(`Customer sync failed for company: ${company.code}: ${result.error}`, { companyId: company._id });
    } else if (wasCancelled) {
      logger.warn(`Customer sync cancelled for company: ${company.code}`, { companyId: company._id });
    }
 
    setTimeout(() => syncManager.clearSyncState(companyId), 15000);
 
  } catch (error) {
    logger.error(`Customer sync from Zoho error: ${error.message}`, { error: error.message, companyId });
    if (companyId) {
      syncManager.setProgress(companyId, { stage: 'error', message: `Sync failed: ${error.message}`, error: error.message });
      setTimeout(() => syncManager.clearSyncState(companyId), 10000);
    }
  } finally {
    // ALWAYS release the lock, even on a thrown error or early return after acquire.
    if (acquired && companyId) syncManager.release(companyId);
  }
};

exports.cancelCustomerSync = async (req, res) => {
  try {
    const companyId = req.headers['x-company-id'] || req.body.companyId;
    if (!companyId) return sendErrorResponse(res, 400, 'Company ID is required');
 
    if (!syncManager.getStatus(companyId).isSyncing) {
      return sendErrorResponse(res, 400, 'No sync is currently running');
    }
 
    const customerServices = require('../zoho/customerServices');
    if (customerServices.customerSyncCancelMap) {
      customerServices.customerSyncCancelMap.set(String(companyId), true); // String key — matches service
    }
    syncManager.requestCancel(companyId);
 
    // Do NOT flip isSyncing to false here — let the sync loop observe the
    // cancel flag, finish its current batch cleanly, and report 'cancelled'.
    syncManager.setProgress(companyId, { stage: 'cancelling', message: 'Cancellation requested…', startTime: Date.now() });
 
    logger.info(`Customer sync cancellation requested for company: ${companyId}`, { companyId });
    res.json({ success: true, message: 'Cancellation requested' });
 
  } catch (error) {
    sendErrorResponse(res, 500, 'Failed to cancel sync', error);
  }
};

exports.getCustomerSyncProgress = async (req, res) => {
  try {
    const companyId = req.headers['x-company-id'] || req.query.companyId;
    if (!companyId) return sendErrorResponse(res, 400, 'Company ID is required');

    const progress = syncManager.getProgress(companyId);
    const syncStatus = syncManager.getStatus(companyId);

    let estimatedRemaining = null;
    if (progress.stage === 'processing' && progress.fetched > 0 && progress.total > 0 && progress.startTime) {
      const elapsed = (Date.now() - progress.startTime) / 1000;
      const rate = progress.fetched / elapsed;
      const remainingSeconds = Math.ceil((progress.total - progress.fetched) / rate);
      if (remainingSeconds > 0 && remainingSeconds < 3600) {
        estimatedRemaining = `${remainingSeconds}s`;
      }
    }

    res.json({
      success: true, isSyncing: syncStatus.isSyncing,
      progress: {
        stage: progress.stage, message: progress.message,
        fetched: progress.fetched, total: progress.total,
        created: progress.created, updated: progress.updated,
        errors: progress.errors, duration: progress.duration,
        estimatedRemaining, startTime: progress.startTime
      }
    });

  } catch (error) {
    sendErrorResponse(res, 500, 'Error fetching sync progress', error);
  }
};

exports.getSyncStatus = async (req, res) => {
  try {
    const companyId = req.headers['x-company-id'] || req.query.companyId;
    if (!companyId) return sendErrorResponse(res, 400, 'Company ID is required');

    const [total, synced, lastSync] = await Promise.all([
      Customer.countDocuments({ companyId }),
      Customer.countDocuments({ companyId, zohoSynced: true }),
      Customer.findOne({ companyId, zohoSyncDate: { $ne: null } }).sort({ zohoSyncDate: -1 }).select('zohoSyncDate lastModifiedTime')
    ]);

    res.status(200).json({
      success: true, data: {
        total, synced, notSynced: total - synced,
        lastSyncDate: lastSync?.zohoSyncDate || null,
        lastModifiedTime: lastSync?.lastModifiedTime || null
      }
    });

  } catch (error) {
    sendErrorResponse(res, 500, 'Error getting sync status', error);
  }
};

exports.getPendingSync = async (req, res) => {
  try {
    const companyId = req.headers['x-company-id'] || req.query.companyId;
    if (!companyId) return sendErrorResponse(res, 400, 'Company ID is required');

    const pendingCustomers = await Customer.find({
      companyId, isActive: true,
      $or: [{ zohoSynced: false }, { lastModifiedTime: { $exists: false } }]
    }).select('name email zohoId zohoSynced lastModifiedTime').lean();

    res.status(200).json({ success: true, data: pendingCustomers, count: pendingCustomers.length });

  } catch (error) {
    sendErrorResponse(res, 500, 'Error fetching pending sync customers', error);
  }
};

exports.forceSyncCustomer = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id?.trim()) return sendErrorResponse(res, 400, 'Invalid customer ID');

    const customer = await Customer.findById(id);
    if (!customer) return sendErrorResponse(res, 404, 'Customer not found');
    if (!customer.zohoId) {
      return sendErrorResponse(res, 400, 'Customer has no Zoho ID. Please sync from Zoho first.');
    }

    const company = await Company.findById(customer.companyId);
    if (!company?.zohoOrganizationId) {
      return sendErrorResponse(res, 400, 'Zoho Organization ID not configured');
    }

    zohoBooksService.setCompany(company._id, company.zohoOrganizationId);
    const zohoResult = await zohoBooksService.getContact(customer.zohoId);

    if (!zohoResult.success) {
      return sendErrorResponse(res, 400, 'Failed to fetch customer from Zoho', { error: zohoResult.error });
    }

    const mappedData = zohoBooksService._mapZohoContactToCustomer(zohoResult.contact);
    const updatedCustomer = await Customer.findByIdAndUpdate(
      id,
      {
        $set: {
          ...mappedData, zohoSynced: true, zohoSyncDate: new Date(),
          zohoSyncError: null, lastModifiedTime: zohoResult.contact.last_modified_time,
          zohoData: zohoResult.contact
        }
      },
      { new: true, runValidators: false }
    );

    await clearCustomerCache(customer.companyId);

    logger.info(`Customer force synced from Zoho: ${customer.name}`, {
      customerId: id,
      customerName: customer.name,
      companyId: company._id
    });

    res.status(200).json({
      success: true, message: 'Customer force synced successfully',
      data: updatedCustomer.getFormattedData()
    });

  } catch (error) {
    logger.error(`Force sync customer error: ${error.message}`, {
      error: error.message,
      customerId: req.params.id
    });
    sendErrorResponse(res, 500, 'Error force syncing customer', error);
  }
};

 
const calculatePlaceStats = (customers) => {
  const stats = {
    uae: {},
    gcc: {},
    other: []
  };

  UAE_EMIRATES.forEach(emirate => {
    stats.uae[emirate] = 0;
  });

  GCC_COUNTRIES.forEach(country => {
    stats.gcc[country.name] = 0;
  });

  customers.forEach(customer => {
    const place = customer.placeOfSupply;
    
    if (UAE_EMIRATES.includes(place)) {
      stats.uae[place]++;
    } else if (GCC_COUNTRY_NAMES.includes(place)) {
      stats.gcc[place]++;
    } else if (place && place !== 'Dubai') {
      stats.other.push({
        name: customer.name,
        placeOfSupply: place,
        email: customer.email,
        phone: customer.phone
      });
    } else {
      stats.uae['Dubai']++;
    }
  });

  stats.uae.total = Object.values(stats.uae).reduce((a, b) => a + b, 0);
  stats.gcc.total = Object.values(stats.gcc).reduce((a, b) => a + b, 0);
  
  return stats;
};

const getCountryFromPlace = (place) => {
  if (UAE_EMIRATES.includes(place)) return 'UAE';
  if (GCC_COUNTRY_NAMES.includes(place)) return place;
  return 'Other';
};

const getTaxTreatmentLabel = (taxTreatment) => {
  const treatment = TAX_TREATMENTS.find(t => t.value === taxTreatment);
  return treatment ? treatment.label : taxTreatment;
};


exports.exportCustomers = async (req, res) => {
  try {
    let companyId = req.headers['x-company-id'] || req.query.companyId;
    const isAllCompanies = !companyId || companyId === 'all' || companyId === 'ALL';
    
    if (!companyId && !isAllCompanies) {
      return sendErrorResponse(res, 400, 'Company ID is required');
    }

    const {
      format = 'xlsx',
      status = 'all',
      taxStatus = 'all',
      placeOfSupply = 'all',
      search = ''
    } = req.query;

    const effectiveCompanyId = isAllCompanies ? null : companyId;
    const query = buildCustomerQuery(effectiveCompanyId, { status, taxStatus, placeOfSupply, search });

    const customers = await Customer.find(query)
      .populate('companyId', 'name code')
      .sort({ name: 1 })
      .lean();

    if (customers.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No customers found to export'
      });
    }

    const placeStats = calculatePlaceStats(customers);

    const exportData = customers.map(customer => ({
      'Name': customer.name,
      'Email': customer.email || '',
      'Phone': customer.phone || '',
      'Company Name': customer.companyId?.name || '',
      'Address': customer.address || '',
      'City': customer.city || '',
      'State': customer.state || '',
      'Country': getCountryFromPlace(customer.placeOfSupply),
      'Place of Supply': customer.placeOfSupply || '',
      'Tax Treatment': getTaxTreatmentLabel(customer.taxTreatment),
      'Tax Registration Number (TRN)': customer.taxRegistrationNumber || '',
      'Default Currency': customer.defaultCurrency?.code || 'AED',
      'Website': customer.website || '',
      'Notes': customer.notes || '',
      'Status': customer.isActive ? 'Active' : 'Inactive',
      'Zoho Synced': customer.zohoSynced ? 'Yes' : 'No',
      'Zoho ID': customer.zohoId || '',
      'Created At': customer.createdAt ? new Date(customer.createdAt).toLocaleDateString() : '',
      'Last Modified': customer.lastModifiedTime ? new Date(customer.lastModifiedTime).toLocaleDateString() : ''
    }));

    // Group customers by company using companyId name
    const customersByCompany = {};
    customers.forEach(customer => {
      const companyName = customer.companyId?.name || 'Unknown Company';
      if (!customersByCompany[companyName]) {
        customersByCompany[companyName] = [];
      }
      // Find the matching export data for this customer
      const exportCustomer = exportData.find(c => c['Name'] === customer.name);
      if (exportCustomer) {
        customersByCompany[companyName].push(exportCustomer);
      }
    });

    const responseData = {
      summary: {
        totalCustomers: customers.length,
        activeCustomers: customers.filter(c => c.isActive).length,
        inactiveCustomers: customers.filter(c => !c.isActive).length,
        vatRegistered: customers.filter(c => c.taxTreatment === 'vat_registered' || c.taxTreatment === 'gcc_vat_registered').length,
        nonVatRegistered: customers.filter(c => c.taxTreatment === 'non_vat_registered' || c.taxTreatment === 'gcc_non_vat_registered').length,
        syncedToZoho: customers.filter(c => c.zohoSynced).length,
        unsyncedToZoho: customers.filter(c => !c.zohoSynced).length,
        isAllCompanies
      },
      placeStats,
      customers: exportData,
      customersByCompany,
      isAllCompanies
    };

    logger.info(`Customers exported: ${customers.length} records`, {
      companyId: isAllCompanies ? 'ALL' : companyId,
      format,
      recordCount: customers.length,
      exportedBy: req.user?.id
    });

    if (format === 'csv') {
      return exportToCSV(responseData, res);
    } else {
      return exportToExcelJS(responseData, res);
    }

  } catch (error) {
    logger.error(`Export customers error: ${error.message}`, { error: error.message });
    sendErrorResponse(res, 500, 'Error exporting customers', error);
  }
};

const exportToExcelJS = async (data, res) => {
  try {
    const { summary, placeStats, customers, customersByCompany, isAllCompanies } = data;
    
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Customer Management System';
    workbook.created = new Date();
    
    // ==================== 1. CUSTOMER DETAILS SHEET (FIRST) ====================
    const customerSheet = workbook.addWorksheet("📋 Customer Details", {
      pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    });
    
    const headers = Object.keys(customers[0] || {});
    // Remove 'Company Name' from headers if it exists (since we'll use company as separator)
    const displayHeaders = headers.filter(h => h !== 'Company Name');
    const lastColLetter = String.fromCharCode(64 + displayHeaders.length);
    
    // Title row
    customerSheet.mergeCells(`A1:${lastColLetter}1`);
    const titleCell = customerSheet.getCell('A1');
    titleCell.value = "CUSTOMER DETAILS REPORT";
    titleCell.font = { name: "Arial", size: 20, bold: true, color: { argb: "FFFFFFFF" } };
    titleCell.alignment = { horizontal: "center", vertical: "middle" };
    titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF111827" } };
    customerSheet.getRow(1).height = 35;
    
    // Summary row
    customerSheet.mergeCells("A2:D2");
    customerSheet.getCell("A2").value = `Generated: ${new Date().toLocaleString()}`;
    customerSheet.mergeCells("E2:H2");
    customerSheet.getCell("E2").value = `Total Customers: ${summary.totalCustomers}`;
    customerSheet.mergeCells("I2:L2");
    customerSheet.getCell("I2").value = `Active: ${summary.activeCustomers}`;
    customerSheet.mergeCells("M2:P2");
    customerSheet.getCell("M2").value = `Inactive: ${summary.inactiveCustomers}`;
    customerSheet.mergeCells("Q2:T2");
    customerSheet.getCell("Q2").value = `VAT Registered: ${summary.vatRegistered}`;
    
    ["A2", "E2", "I2", "M2", "Q2"].forEach((cell) => {
      customerSheet.getCell(cell).font = { name: "Arial", bold: true, size: 10 };
      customerSheet.getCell(cell).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3F4F6" } };
      customerSheet.getCell(cell).border = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
    });
    
    customerSheet.addRow([]);
    
    // Header row
    const headerRow = customerSheet.addRow(displayHeaders);
    headerRow.height = 32;
    headerRow.eachCell((cell) => {
      cell.font = { name: "Arial", bold: true, size: 11, color: { argb: "FFFFFFFF" } };
      cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2563EB" } };
      cell.border = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
    });
    
    const headerRowNumber = headerRow.number;
    
    // Data rows with company separators
    let globalIndex = 1;
    
    if (isAllCompanies && customersByCompany && Object.keys(customersByCompany).length > 0) {
      // Sort company names alphabetically
      const sortedCompanyNames = Object.keys(customersByCompany).sort();
      
      for (const companyName of sortedCompanyNames) {
        const companyCustomers = customersByCompany[companyName];
        
        if (companyCustomers && companyCustomers.length > 0) {
          // Add company separator row
          const separatorRow = customerSheet.addRow({});
          separatorRow.height = 24;
          
          // Merge cells across all columns for the company name
          const separatorCells = [];
          for (let i = 0; i < displayHeaders.length; i++) {
            separatorCells.push(String.fromCharCode(65 + i));
          }
          const separatorRange = `${separatorCells[0]}${separatorRow.number}:${separatorCells[separatorCells.length - 1]}${separatorRow.number}`;
          customerSheet.mergeCells(separatorRange);
          
          const companyCell = customerSheet.getCell(`${separatorCells[0]}${separatorRow.number}`);
          companyCell.value = `=== ${companyName.toUpperCase()} ===`;
          companyCell.font = { name: "Arial", bold: true, size: 12, color: { argb: "FF1E40AF" } };
          companyCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFF6FF" } };
          companyCell.alignment = { horizontal: "left", vertical: "middle" }; // Changed from "center" to "left"
          
          // Add border to separator row
          for (let i = 0; i < displayHeaders.length; i++) {
            const cell = customerSheet.getCell(`${separatorCells[i]}${separatorRow.number}`);
            cell.border = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
          }
          
          // Add customers for this company
          companyCustomers.forEach((customer, idx) => {
            const values = displayHeaders.map(header => {
              // Skip Company Name as we're using company separators
              if (header === 'Company Name') return '';
              return customer[header] || '';
            });
            const row = customerSheet.addRow(values);
            row.height = 22;
            row.eachCell((cell, colIndex) => {
              cell.border = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
              cell.alignment = { vertical: "middle", horizontal: "left" };
              cell.font = { name: "Arial", size: 10 };
            });
            
            // Alternate row coloring
            if (globalIndex % 2 === 0) {
              row.eachCell((cell) => { 
                cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF9FAFB" } }; 
              });
            }
            
            // Status coloring
            const statusIndex = displayHeaders.indexOf('Status');
            if (statusIndex !== -1) {
              const statusCell = row.getCell(statusIndex + 1);
              if (customer['Status'] === 'Active') {
                statusCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD1FAE5" } };
                statusCell.font = { name: "Arial", size: 10, bold: true, color: { argb: "FF065F46" } };
              } else {
                statusCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEE2E2" } };
                statusCell.font = { name: "Arial", size: 10, bold: true, color: { argb: "FF991B1B" } };
              }
            }
            
            globalIndex++;
          });
        }
      }
    } else {
      // Single company - just show customers without company separators
      customers.forEach((customer, index) => {
        const values = displayHeaders.map(header => customer[header] || '');
        const row = customerSheet.addRow(values);
        row.height = 22;
        row.eachCell((cell) => {
          cell.border = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
          cell.alignment = { vertical: "middle", horizontal: "left" };
          cell.font = { name: "Arial", size: 10 };
        });
        
        // Alternate row coloring
        if ((index + 1) % 2 === 0) {
          row.eachCell((cell) => { 
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF9FAFB" } }; 
          });
        }
        
        // Status coloring
        const statusIndex = displayHeaders.indexOf('Status');
        if (statusIndex !== -1) {
          const statusCell = row.getCell(statusIndex + 1);
          if (customer['Status'] === 'Active') {
            statusCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD1FAE5" } };
            statusCell.font = { name: "Arial", size: 10, bold: true, color: { argb: "FF065F46" } };
          } else {
            statusCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEE2E2" } };
            statusCell.font = { name: "Arial", size: 10, bold: true, color: { argb: "FF991B1B" } };
          }
        }
      });
    }
    
    // Auto-filter and freeze
    customerSheet.autoFilter = {
      from: { row: headerRowNumber, column: 1 },
      to: { row: headerRowNumber, column: displayHeaders.length },
    };
    customerSheet.views = [{ state: "frozen", ySplit: headerRowNumber }];
    
    // Auto-size columns
    customerSheet.columns.forEach((column, idx) => {
      let maxLength = displayHeaders[idx]?.length || 10;
      column.eachCell?.({ includeEmpty: true }, (cell) => {
        const cellValue = cell.value ? cell.value.toString().length : 0;
        maxLength = Math.max(maxLength, cellValue);
      });
      column.width = Math.min(maxLength + 2, 50);
    });
    
    // ==================== 2. SUMMARY & ANALYTICS SHEET (SECOND) ====================
    const summarySheet = workbook.addWorksheet("📊 Summary & Analytics");
    
    // Header
    summarySheet.mergeCells('A1:B1');
    const summaryTitle = summarySheet.getCell('A1');
    summaryTitle.value = "CUSTOMER ANALYTICS SUMMARY";
    summaryTitle.font = { name: "Arial", size: 16, bold: true, color: { argb: "FFFFFFFF" } };
    summaryTitle.alignment = { horizontal: "center", vertical: "middle" };
    summaryTitle.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF111827" } };
    summarySheet.getRow(1).height = 35;
    
    summarySheet.addRow([]);
    
    // Key Metrics
    summarySheet.getCell('A3').value = "KEY METRICS";
    summarySheet.getCell('A3').font = { name: "Arial", size: 12, bold: true };
    summarySheet.getCell('A3').fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE5E7EB" } };
    
    summarySheet.getCell('A4').value = "Total Customers";
    summarySheet.getCell('B4').value = summary.totalCustomers;
    summarySheet.getCell('A5').value = "Active Customers";
    summarySheet.getCell('B5').value = summary.activeCustomers;
    summarySheet.getCell('A6').value = "Inactive Customers";
    summarySheet.getCell('B6').value = summary.inactiveCustomers;
    summarySheet.getCell('A7').value = "VAT Registered";
    summarySheet.getCell('B7').value = summary.vatRegistered;
    summarySheet.getCell('A8').value = "Non-VAT Registered";
    summarySheet.getCell('B8').value = summary.nonVatRegistered;
    
    summarySheet.addRow([]);
    
    // UAE Emirates Distribution
    summarySheet.getCell('A10').value = "UAE EMIRATES DISTRIBUTION";
    summarySheet.getCell('A10').font = { name: "Arial", size: 12, bold: true };
    summarySheet.getCell('A10').fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE5E7EB" } };
    
    summarySheet.getCell('A11').value = "Emirate";
    summarySheet.getCell('B11').value = "Count";
    
    ['A11', 'B11'].forEach(cell => {
      const headerCell = summarySheet.getCell(cell);
      headerCell.font = { name: "Arial", bold: true, size: 11, color: { argb: "FFFFFFFF" } };
      headerCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2563EB" } };
      headerCell.alignment = { horizontal: "center", vertical: "middle" };
      headerCell.border = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
    });
    
    let uaeRow = 12;
    const uaeEntries = Object.entries(placeStats.uae || {}).filter(([key]) => key !== 'total');
    
    uaeEntries.forEach(([emirate, count], idx) => {
      summarySheet.getCell(`A${uaeRow}`).value = emirate;
      summarySheet.getCell(`B${uaeRow}`).value = count;
      
      if (idx % 2 === 0) {
        summarySheet.getRow(uaeRow).eachCell(cell => {
          if (!cell.fill) {
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF9FAFB" } };
          }
        });
      }
      uaeRow++;
    });
    
    if (uaeEntries.length > 0) {
      summarySheet.getCell(`A${uaeRow}`).value = "TOTAL UAE";
      summarySheet.getCell(`B${uaeRow}`).value = placeStats.uae.total;
      summarySheet.getRow(uaeRow).font = { bold: true };
      summarySheet.getRow(uaeRow).eachCell(cell => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE5E7EB" } };
      });
      uaeRow++;
    }
    
    summarySheet.addRow([]);
    
    // GCC Countries Distribution
    const gccStartRow = uaeRow + 1;
    summarySheet.getCell(`A${gccStartRow}`).value = "GCC COUNTRIES DISTRIBUTION";
    summarySheet.getCell(`A${gccStartRow}`).font = { name: "Arial", size: 12, bold: true };
    summarySheet.getCell(`A${gccStartRow}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE5E7EB" } };
    
    summarySheet.getCell(`A${gccStartRow + 1}`).value = "Country";
    summarySheet.getCell(`B${gccStartRow + 1}`).value = "Count";
    
    [`A${gccStartRow + 1}`, `B${gccStartRow + 1}`].forEach(cell => {
      const headerCell = summarySheet.getCell(cell);
      headerCell.font = { name: "Arial", bold: true, size: 11, color: { argb: "FFFFFFFF" } };
      headerCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2563EB" } };
      headerCell.alignment = { horizontal: "center", vertical: "middle" };
      headerCell.border = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
    });
    
    let gccRow = gccStartRow + 2;
    const gccEntries = Object.entries(placeStats.gcc || {}).filter(([key]) => key !== 'total');
    
    gccEntries.forEach(([country, count], idx) => {
      summarySheet.getCell(`A${gccRow}`).value = country;
      summarySheet.getCell(`B${gccRow}`).value = count;
      
      if (idx % 2 === 0) {
        summarySheet.getRow(gccRow).eachCell(cell => {
          if (!cell.fill) {
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF9FAFB" } };
          }
        });
      }
      gccRow++;
    });
    
    if (gccEntries.length > 0) {
      summarySheet.getCell(`A${gccRow}`).value = "TOTAL GCC";
      summarySheet.getCell(`B${gccRow}`).value = placeStats.gcc.total;
      summarySheet.getRow(gccRow).font = { bold: true };
      summarySheet.getRow(gccRow).eachCell(cell => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE5E7EB" } };
      });
      gccRow++;
    }
    
    // Other Places section
    if (placeStats.other && placeStats.other.length > 0) {
      const otherStartRow = gccRow + 1;
      summarySheet.getCell(`A${otherStartRow}`).value = "OTHER PLACES";
      summarySheet.getCell(`A${otherStartRow}`).font = { name: "Arial", size: 12, bold: true };
      summarySheet.getCell(`A${otherStartRow}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE5E7EB" } };
      
      summarySheet.getCell(`A${otherStartRow + 1}`).value = "Customer Name";
      summarySheet.getCell(`B${otherStartRow + 1}`).value = "Place of Supply";
      summarySheet.getCell(`C${otherStartRow + 1}`).value = "Email";
      summarySheet.getCell(`D${otherStartRow + 1}`).value = "Phone";
      
      [`A${otherStartRow + 1}`, `B${otherStartRow + 1}`, `C${otherStartRow + 1}`, `D${otherStartRow + 1}`].forEach(cell => {
        const headerCell = summarySheet.getCell(cell);
        headerCell.font = { name: "Arial", bold: true, size: 11, color: { argb: "FFFFFFFF" } };
        headerCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2563EB" } };
        headerCell.alignment = { horizontal: "center", vertical: "middle" };
        headerCell.border = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
      });
      
      let otherRow = otherStartRow + 2;
      placeStats.other.forEach((customer, idx) => {
        summarySheet.getCell(`A${otherRow}`).value = customer.name || '';
        summarySheet.getCell(`B${otherRow}`).value = customer.placeOfSupply || '';
        summarySheet.getCell(`C${otherRow}`).value = customer.email || '';
        summarySheet.getCell(`D${otherRow}`).value = customer.phone || '';
        
        if (idx % 2 === 0) {
          summarySheet.getRow(otherRow).eachCell(cell => {
            if (!cell.fill) {
              cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF9FAFB" } };
            }
          });
        }
        otherRow++;
      });
      
      summarySheet.getColumn('C').width = 30;
      summarySheet.getColumn('D').width = 20;
    }
    
    summarySheet.getColumn('A').width = 30;
    summarySheet.getColumn('B').width = 15;
    
    // Footer
    const lastRow = summarySheet.rowCount + 1;
    summarySheet.mergeCells(`A${lastRow}:B${lastRow}`);
    summarySheet.getCell(`A${lastRow}`).value = `Report generated on ${new Date().toLocaleString()} | Total Customers: ${summary.totalCustomers}`;
    summarySheet.getCell(`A${lastRow}`).font = { name: "Arial", size: 9, italic: true };
    summarySheet.getCell(`A${lastRow}`).alignment = { horizontal: "center" };
    
    summarySheet.views = [{ state: "frozen", ySplit: 3 }];
    
    // ==================== 3. VISUAL STATISTICS SHEET ====================
    const chartSheet = workbook.addWorksheet("📈 Visual Statistics");
    
    chartSheet.mergeCells('A1:B1');
    const chartTitle = chartSheet.getCell('A1');
    chartTitle.value = "CUSTOMER DISTRIBUTION DATA";
    chartTitle.font = { name: "Arial", size: 16, bold: true, color: { argb: "FFFFFFFF" } };
    chartTitle.alignment = { horizontal: "center", vertical: "middle" };
    chartTitle.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF111827" } };
    chartSheet.getRow(1).height = 35;
    
    chartSheet.addRow([]);
    
    // UAE Distribution
    chartSheet.getCell('A3').value = "UAE Emirates Distribution";
    chartSheet.getCell('A3').font = { name: "Arial", size: 12, bold: true };
    chartSheet.getCell('A4').value = "Emirate";
    chartSheet.getCell('B4').value = "Count";
    
    let chartRow = 5;
    uaeEntries.forEach(([emirate, count]) => {
      chartSheet.getCell(`A${chartRow}`).value = emirate;
      chartSheet.getCell(`B${chartRow}`).value = count;
      chartRow++;
    });
    
    chartSheet.addRow([]);
    chartSheet.addRow([]);
    
    // GCC Distribution
    chartSheet.getCell(`A${chartRow + 1}`).value = "GCC Countries Distribution";
    chartSheet.getCell(`A${chartRow + 1}`).font = { name: "Arial", size: 12, bold: true };
    chartSheet.getCell(`A${chartRow + 2}`).value = "Country";
    chartSheet.getCell(`B${chartRow + 2}`).value = "Count";
    
    let gccChartRow = chartRow + 3;
    gccEntries.forEach(([country, count]) => {
      chartSheet.getCell(`A${gccChartRow}`).value = country;
      chartSheet.getCell(`B${gccChartRow}`).value = count;
      gccChartRow++;
    });
    
    chartSheet.getColumn('A').width = 30;
    chartSheet.getColumn('B').width = 15;
    
    const filename = `customers_export_${new Date().toISOString().split('T')[0]}.xlsx`;
    
    // Set headers BEFORE writing
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
    res.setHeader('X-Summary', JSON.stringify({ 
      total: summary.totalCustomers, 
      uaeTotal: placeStats.uae?.total || 0, 
      gccTotal: placeStats.gcc?.total || 0 
    }));
    
    // Write to buffer first, then send
    const buffer = await workbook.xlsx.writeBuffer();
    res.send(buffer);
    
  } catch (error) {
    console.error('Excel export error:', error);
    throw error;
  }
};

const exportToCSV = (data, res) => {
  const { summary, placeStats, customers } = data;
  
  let csvRows = [];
  
  csvRows.push(['="CUSTOMER EXPORT REPORT"']);
  csvRows.push(['="Generated on: ' + new Date().toLocaleString() + '"']);
  csvRows.push([]);
  
  csvRows.push(['="=== SUMMARY ==="']);
  csvRows.push(['Total Customers', summary.totalCustomers]);
  csvRows.push(['Active Customers', summary.activeCustomers]);
  csvRows.push(['Inactive Customers', summary.inactiveCustomers]);
  csvRows.push(['VAT Registered', summary.vatRegistered]);
  csvRows.push(['Non-VAT Registered', summary.nonVatRegistered]);
  csvRows.push(['Synced to Zoho', summary.syncedToZoho]);
  csvRows.push(['Unsynced to Zoho', summary.unsyncedToZoho]);
  csvRows.push([]);
  
  csvRows.push(['="=== PLACE STATISTICS ==="']);
  csvRows.push(['="UAE EMIRATES"']);
  for (const [emirate, count] of Object.entries(placeStats.uae)) {
    if (emirate !== 'total') {
      csvRows.push([emirate, count]);
    }
  }
  csvRows.push(['Total UAE Customers', placeStats.uae.total]);
  csvRows.push([]);
  
  csvRows.push(['="GCC COUNTRIES"']);
  for (const [country, count] of Object.entries(placeStats.gcc)) {
    if (country !== 'total') {
      csvRows.push([country, count]);
    }
  }
  csvRows.push(['Total GCC Customers', placeStats.gcc.total]);
  csvRows.push([]);
  
  if (placeStats.other.length > 0) {
    csvRows.push(['="OTHER PLACES"']);
    csvRows.push(['Customer Name', 'Place of Supply', 'Email', 'Phone']);
    placeStats.other.forEach(customer => {
      csvRows.push([customer.name, customer.placeOfSupply, customer.email, customer.phone]);
    });
    csvRows.push([]);
  }
  
  csvRows.push(['="=== CUSTOMER DETAILS ==="']);
  
  const headers = Object.keys(customers[0] || {});
  csvRows.push(headers.map(h => `="${h}"`));
  
  for (const customer of customers) {
    const values = headers.map(header => {
      let value = customer[header] || '';
      if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
        value = `"${value.replace(/"/g, '""')}"`;
      }
      return value;
    });
    csvRows.push(values);
  }
  
  const csvContent = csvRows.map(row => row.join(',')).join('\n');
  
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename=customers_export_${new Date().toISOString().split('T')[0]}.csv`);
  res.setHeader('X-Summary', JSON.stringify({ total: summary.totalCustomers, uaeTotal: placeStats.uae.total, gccTotal: placeStats.gcc.total }));
  
  res.status(200).send(csvContent);
};

// ==================== MAIN EXPORT FUNCTION ====================
 
 

exports.getCustomerPlaceStats = async (req, res) => {
  try {
    let companyId = req.headers['x-company-id'] || req.query.companyId;
    const isAllCompanies = !companyId || companyId === 'all' || companyId === 'ALL';
    
    if (!companyId && !isAllCompanies) {
      return sendErrorResponse(res, 400, 'Company ID is required');
    }

    const effectiveCompanyId = isAllCompanies ? null : companyId;
    let query = {};
    
    if (effectiveCompanyId) {
      query.companyId = effectiveCompanyId;
    }
    
    const customers = await Customer.find(query).lean();
    const placeStats = calculatePlaceStats(customers);

    const taxBreakdown = {};
    const allPlaces = [...UAE_EMIRATES, ...GCC_COUNTRY_NAMES];
    
    allPlaces.forEach(place => {
      const customersInPlace = customers.filter(c => c.placeOfSupply === place);
      taxBreakdown[place] = {
        total: customersInPlace.length,
        vatRegistered: customersInPlace.filter(c => c.taxTreatment === 'vat_registered' || c.taxTreatment === 'gcc_vat_registered').length,
        nonVatRegistered: customersInPlace.filter(c => c.taxTreatment === 'non_vat_registered' || c.taxTreatment === 'gcc_non_vat_registered').length
      };
    });

    const chartData = {
      uae: Object.entries(placeStats.uae)
        .filter(([key]) => key !== 'total')
        .map(([label, value]) => ({ label, value })),
      gcc: Object.entries(placeStats.gcc)
        .filter(([key]) => key !== 'total')
        .map(([label, value]) => ({ label, value }))
    };

    res.status(200).json({
      success: true,
      data: {
        summary: {
          totalCustomers: customers.length,
          uaeTotal: placeStats.uae.total,
          gccTotal: placeStats.gcc.total,
          otherTotal: placeStats.other.length,
          isAllCompanies
        },
        uaeBreakdown: placeStats.uae,
        gccBreakdown: placeStats.gcc,
        taxBreakdown,
        chartData,
        otherPlaces: placeStats.other
      }
    });

  } catch (error) {
    logger.error(`Get place stats error: ${error.message}`, { error: error.message });
    sendErrorResponse(res, 500, 'Error fetching place statistics', error);
  }
};

exports.constants = {
  GCC_COUNTRIES: GCC_COUNTRY_NAMES, UAE_EMIRATES,
  TAX_TREATMENTS, TAX_TREATMENT_VALUES,
  CURRENCY_OPTIONS, CURRENCY_CODES
};

exports.syncManager = syncManager;