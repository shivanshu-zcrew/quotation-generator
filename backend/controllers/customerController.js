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
    placeOfSupply, defaultCurrency, contactPersons, mainContactSalutation
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
      defaultCurrency = 'AED', contactPersons = [], mainContactSalutation = 'Mr.'
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
      taxRegistrationNumber: (taxTreatment.includes('vat_registered') && taxRegistrationNumber) ? taxRegistrationNumber.trim() : '',
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

        console.log(">>>>>>>>>>",zohoResult);
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

    const result = customer.zohoId
      ? await zohoBooksService.updateContact(customer.zohoId, contactData)
      : await zohoBooksService.createContact(contactData);

    if (result?.success) {
      if (!customer.zohoId && result.zohoId) customer.zohoId = result.zohoId;
      customer.zohoSynced = true;
      customer.zohoSyncDate = new Date();
      customer.zohoSyncError = undefined;
      await customer.save();

      logger.info(`Customer synced with Zoho: ${customer.name}`, {
        customerId: customer._id,
        customerName: customer.name,
        companyId: company._id,
        action: customer.zohoId ? 'update' : 'create'
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

  try {
    companyId = req.headers['x-company-id'] || req.body.companyId;
    if (!companyId) return sendErrorResponse(res, 400, 'Company ID is required');

    const company = await Company.findById(companyId);
    if (!company) return sendErrorResponse(res, 404, 'Company not found');
    if (!company.zohoOrganizationId) {
      return sendErrorResponse(res, 400, 'Company does not have a Zoho Organization ID configured');
    }

    if (syncManager.getStatus(companyId).isSyncing) {
      return res.status(409).json({ success: false, message: 'Sync already in progress' });
    }

    syncManager.clearCancel(companyId);
    syncManager.setSyncing(companyId, true);
    syncManager.setProgress(companyId, {
      stage: 'starting', message: 'Starting customer sync...', fetched: 0, total: 0, startTime: Date.now()
    });

    res.status(202).json({
      success: true, message: `Customer sync started for ${company.name}`, status: 'started'
    });

    logger.info(`Customer sync started from Zoho for company: ${company.code}`, {
      companyId: company._id,
      companyCode: company.code,
      startedBy: req.user?.id
    });

    const result = await zohoBooksService.syncContactsToDatabase(
      company, !req.query.fullSync, null,
      (progress) => syncManager.setProgress(companyId, progress),
      { isCancelRequested: () => syncManager.isCancelRequested(companyId) }
    );

    const wasCancelled = result?.message === 'Sync cancelled by user' || result?.cancelled === true;

    syncManager.setStatus(companyId, {
      isSyncing: false, lastSyncTime: new Date(), lastSyncResult: result
    });

    syncManager.setProgress(companyId, wasCancelled ? {
      stage: 'cancelled', message: 'Sync was cancelled', fetched: result?.totalFromZoho || 0, total: result?.totalFromZoho || 0
    } : {
      stage: 'completed', message: `Sync completed! ${result?.created || 0} created, ${result?.updated || 0} updated`,
      fetched: result?.totalFromZoho || 0, total: result?.totalFromZoho || 0,
      created: result?.created || 0, updated: result?.updated || 0, errors: result?.errors || 0, duration: result?.duration
    });

    if (!wasCancelled && result) {
      logger.info(`Customer sync completed for company: ${company.code}`, {
        companyId: company._id,
        companyCode: company.code,
        created: result?.created || 0,
        updated: result?.updated || 0,
        errors: result?.errors || 0,
        total: result?.totalFromZoho || 0,
        duration: result?.duration
      });
    } else if (wasCancelled) {
      logger.warn(`Customer sync cancelled for company: ${company.code}`, {
        companyId: company._id,
        companyCode: company.code
      });
    }

    setTimeout(() => syncManager.clearSyncState(companyId), 15000);

  } catch (error) {
    logger.error(`Customer sync from Zoho error: ${error.message}`, {
      error: error.message,
      companyId
    });
    if (companyId) {
      syncManager.setSyncing(companyId, false);
      syncManager.setProgress(companyId, { stage: 'error', message: `Sync failed: ${error.message}`, error: error.message });
      setTimeout(() => syncManager.clearSyncState(companyId), 10000);
    }
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
      customerServices.customerSyncCancelMap.set(companyId, true);
    }
    syncManager.requestCancel(companyId);
    syncManager.setSyncing(companyId, false);
    syncManager.setProgress(companyId, { stage: 'cancelled', message: 'Sync cancelled by user', startTime: Date.now() });

    logger.info(`Customer sync cancelled for company: ${companyId}`, { companyId });

    res.json({ success: true, message: 'Sync cancelled successfully' });

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
      'Company Name': customer.companyName || '',
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
      customers: exportData
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
  const { summary, placeStats, customers } = data;
  
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Customer Management System';
  workbook.created = new Date();
  
  const summarySheet = workbook.addWorksheet('Summary', {
    properties: { tabColor: { argb: 'FF4CAF50' } }
  });
  
  summarySheet.getColumn('A').width = 30;
  summarySheet.getColumn('B').width = 20;
  
  summarySheet.mergeCells('A1:B1');
  const titleCell = summarySheet.getCell('A1');
  titleCell.value = 'CUSTOMER EXPORT REPORT';
  titleCell.font = { size: 16, bold: true, color: { argb: 'FF1F2937' } };
  titleCell.alignment = { horizontal: 'center' };
  
  summarySheet.addRow([]);
  summarySheet.addRow(['Generated on:', new Date().toLocaleString()]);
  summarySheet.addRow([]);
  
  summarySheet.addRow(['=== SUMMARY ===']).font = { bold: true, size: 12 };
  summarySheet.addRow(['Total Customers', summary.totalCustomers]);
  summarySheet.addRow(['Active Customers', summary.activeCustomers]);
  summarySheet.addRow(['Inactive Customers', summary.inactiveCustomers]);
  summarySheet.addRow(['VAT Registered', summary.vatRegistered]);
  summarySheet.addRow(['Non-VAT Registered', summary.nonVatRegistered]);
  summarySheet.addRow(['Synced to Zoho', summary.syncedToZoho]);
  summarySheet.addRow(['Unsynced to Zoho', summary.unsyncedToZoho]);
  summarySheet.addRow([]);
  
  for (let i = 8; i <= 14; i++) {
    const row = summarySheet.getRow(i);
    row.getCell(2).alignment = { horizontal: 'right' };
    row.getCell(2).font = { bold: true };
  }
  
  summarySheet.addRow(['=== PLACE STATISTICS ===']).font = { bold: true, size: 12 };
  summarySheet.addRow(['UAE EMIRATES']).font = { italic: true };
  
  for (const [emirate, count] of Object.entries(placeStats.uae)) {
    if (emirate !== 'total') {
      summarySheet.addRow([emirate, count]);
    }
  }
  summarySheet.addRow(['Total UAE Customers', placeStats.uae.total]).font = { bold: true };
  summarySheet.addRow([]);
  
  summarySheet.addRow(['GCC COUNTRIES']).font = { italic: true };
  for (const [country, count] of Object.entries(placeStats.gcc)) {
    if (country !== 'total') {
      summarySheet.addRow([country, count]);
    }
  }
  summarySheet.addRow(['Total GCC Customers', placeStats.gcc.total]).font = { bold: true };
  summarySheet.addRow([]);
  
  if (placeStats.other.length > 0) {
    summarySheet.addRow(['OTHER PLACES']).font = { italic: true };
    summarySheet.addRow(['Customer Name', 'Place of Supply', 'Email', 'Phone']);
    placeStats.other.forEach(customer => {
      summarySheet.addRow([customer.name, customer.placeOfSupply, customer.email, customer.phone]);
    });
    summarySheet.addRow([]);
  }
  
  summarySheet.eachRow((row, rowNumber) => {
    row.eachCell((cell) => {
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };
    });
  });
  
  const customerSheet = workbook.addWorksheet('Customer Details', {
    properties: { tabColor: { argb: 'FF2196F3' } }
  });
  
  const headers = Object.keys(customers[0] || {});
  const headerRow = customerSheet.addRow(headers);
  
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1F2937' }
    };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' }
    };
  });
  
  customers.forEach(customer => {
    const row = customerSheet.addRow(Object.values(customer));
    
    row.eachCell((cell) => {
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };
      cell.alignment = { vertical: 'middle' };
    });
  });
  
  customerSheet.columns.forEach(column => {
    let maxLength = 0;
    column.eachCell({ includeEmpty: true }, (cell) => {
      const columnLength = cell.value ? cell.value.toString().length : 10;
      if (columnLength > maxLength) {
        maxLength = columnLength;
      }
    });
    column.width = Math.min(maxLength + 2, 50);
  });
  
  customerSheet.views = [
    { state: 'frozen', ySplit: 1 }
  ];
  
  const chartSheet = workbook.addWorksheet('Visual Statistics', {
    properties: { tabColor: { argb: 'FFFF9800' } }
  });
  
  chartSheet.addRow(['UAE Emirates Distribution']).font = { bold: true, size: 14 };
  chartSheet.addRow([]);
  
  const uaeData = Object.entries(placeStats.uae)
    .filter(([key]) => key !== 'total')
    .map(([emirate, count]) => [emirate, count]);
  
  chartSheet.addRows([['Emirate', 'Number of Customers'], ...uaeData]);
  
  chartSheet.addRow([]);
  chartSheet.addRow(['GCC Countries Distribution']).font = { bold: true, size: 14 };
  chartSheet.addRow([]);
  
  const gccData = Object.entries(placeStats.gcc)
    .filter(([key]) => key !== 'total')
    .map(([country, count]) => [country, count]);
  
  chartSheet.addRows([['Country', 'Number of Customers'], ...gccData]);
  
  chartSheet.columns.forEach(column => {
    column.width = 25;
  });
  
  const filename = `customers_export_${new Date().toISOString().split('T')[0]}.xlsx`;
  
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
  res.setHeader('X-Summary', JSON.stringify({ 
    total: summary.totalCustomers, 
    uaeTotal: placeStats.uae.total, 
    gccTotal: placeStats.gcc.total 
  }));
  
  await workbook.xlsx.write(res);
  res.end();
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