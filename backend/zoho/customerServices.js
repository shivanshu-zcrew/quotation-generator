const axios = require('axios');
const fs = require('fs');
const path = require('path');
const logger = require('../config/logger');
const { Customer } = require('../models/customer');
const { Item } = require('../models/items');
const Company = require('../models/company');

const customerSyncCancelMap = new Map();

class ZohoBooksService {
  constructor() {
    const requiredEnvVars = ['ZOHO_CLIENT_ID', 'ZOHO_CLIENT_SECRET', 'ZOHO_REFRESH_TOKEN'];
    const missing = requiredEnvVars.filter(v => !process.env[v]);
    if (missing.length > 0) {
      throw new Error(`❌ Missing required Zoho environment variables: ${missing.join(', ')}`);
    }
    
    this.clientId = process.env.ZOHO_CLIENT_ID;
    this.clientSecret = process.env.ZOHO_CLIENT_SECRET;
    this.refreshToken = process.env.ZOHO_REFRESH_TOKEN;
    this.organizationId = null;
    this.currentCompanyId = null;
    this.apiDomain = 'https://www.zohoapis.com/books/v3';
    
    this.CACHE_KEYS = {
      ALL_ITEMS: (companyId) => `zoho_items_${companyId}`,
      ITEM: (id, companyId) => `zoho_item_${companyId}_${id}`,
      ALL_CONTACTS: (companyId) => `zoho_contacts_${companyId}`,
      CONTACT: (id, companyId) => `zoho_contact_${companyId}_${id}`,
      CURRENCIES: 'zoho_currencies'
    };
    
    this.accessToken = null;
    this.tokenExpiry = null;
    this.tokenFilePath = path.join(__dirname, '../.zoho-token.json');
    this.currencyCache = null;
    this.currencyCacheExpiry = null;
    this.lastRefreshAttempt = 0;
    this.minRefreshInterval = 60000;
    
    this.memoryCache = new Map();
    this.cacheTTL = 600000;
    
    this.EMIRATE_CODE_MAP = {
      'Abu Dhabi': 'AB', 'Ajman': 'AJ', 'Dubai': 'DU', 'Fujairah': 'FU',
      'Ras al-Khaimah': 'RA', 'Sharjah': 'SH', 'Umm al-Quwain': 'UM'
    };
      
    this.COUNTRY_CODE_MAP = {
      'Saudi Arabia': 'SA', 'Kuwait': 'KW', 'Qatar': 'QA', 'Bahrain': 'BH', 'Oman': 'OM'
    };
      
    this._loadToken();
  }

  _getFromCache(key) {
    const cached = this.memoryCache.get(key);
    if (cached && cached.expiry > Date.now()) return cached.data;
    if (cached) this.memoryCache.delete(key);
    return null;
  }

  _setToCache(key, data, ttlSeconds = 600) {
    this.memoryCache.set(key, { data, expiry: Date.now() + (ttlSeconds * 1000) });
  }

  _clearCache(key) { this.memoryCache.delete(key); }

  _clearCachePattern(pattern) {
    for (const key of this.memoryCache.keys()) {
      if (key.includes(pattern)) this.memoryCache.delete(key);
    }
  }

  setCompany(companyId, organizationId) {
    this.currentCompanyId = companyId;
    this.organizationId = organizationId;
  }

  getCompanyContext() {
    if (!this.currentCompanyId || !this.organizationId) {
      throw new Error('Company context not set. Call setCompany() first.');
    }
    return { companyId: this.currentCompanyId, organizationId: this.organizationId };
  }

  _loadToken() {
    try {
      if (fs.existsSync(this.tokenFilePath)) {
        const data = JSON.parse(fs.readFileSync(this.tokenFilePath, 'utf8'));
        if (!data.accessToken || !data.tokenExpiry) throw new Error('Invalid token file format');
        this.accessToken = data.accessToken;
        this.tokenExpiry = parseInt(data.tokenExpiry, 10);
        if (isNaN(this.tokenExpiry)) throw new Error('Token expiry is not a valid number');
      }
    } catch (error) {
      this.accessToken = null;
      this.tokenExpiry = null;
    }
  }

  async _saveToken() {
    try {
      const data = { accessToken: this.accessToken, tokenExpiry: this.tokenExpiry, updatedAt: Date.now() };
      const tempPath = `${this.tokenFilePath}.tmp`;
      await fs.promises.writeFile(tempPath, JSON.stringify(data, null, 2));
      await fs.promises.rename(tempPath, this.tokenFilePath);
    } catch (error) {
      logger.warn(`Could not save token file: ${error.message}`);
    }
  }

  _isTokenValid() {
    if (!this.accessToken || !this.tokenExpiry) return false;
    const buffer = 10 * 60 * 1000;
    return Date.now() < (this.tokenExpiry - buffer);
  }

  _canRefresh() {
    const now = Date.now();
    const timeSinceLastRefresh = now - this.lastRefreshAttempt;
    return timeSinceLastRefresh > this.minRefreshInterval;
  }

  async getValidAccessToken() {
    if (this._isTokenValid()) return this.accessToken;
    if (!this._canRefresh()) {
      const waitTime = Math.ceil((this.minRefreshInterval - (Date.now() - this.lastRefreshAttempt)) / 1000);
      throw new Error(`Rate limited by Zoho. Please wait ${waitTime} seconds before retrying.`);
    }
    return await this.refreshAccessToken();
  }

  async refreshAccessToken() {
    this.lastRefreshAttempt = Date.now();
    try {
      const params = new URLSearchParams({
        refresh_token: this.refreshToken,
        client_id: this.clientId,
        client_secret: this.clientSecret,
        grant_type: 'refresh_token'
      });
      const response = await axios.post('https://accounts.zoho.com/oauth/v2/token', params, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 10000
      });
      if (response.data && response.data.access_token) {
        this.accessToken = response.data.access_token;
        const expiresIn = parseInt(response.data.expires_in, 10);
        this.tokenExpiry = Date.now() + (expiresIn * 1000);
        await this._saveToken();
        logger.info(`Zoho access token refreshed successfully`);
        return this.accessToken;
      } else {
        throw new Error('Invalid response from Zoho: missing access_token');
      }
    } catch (error) {
      logger.error(`Zoho token refresh failed: ${error.response?.data?.error_description || error.message}`);
      if (this.accessToken) return this.accessToken;
      throw new Error(`Zoho token refresh failed: ${error.response?.data?.error_description || error.message}`);
    }
  }

  async _request(method, endpoint, data = null, retryCount = 0) {
    const MAX_RETRIES = 2;
    let abortController = null;
    let timeoutId = null;
    try {
      const token = await this.getValidAccessToken();
      const { organizationId } = this.getCompanyContext();
      const separator = endpoint.includes('?') ? '&' : '?';
      const url = `${this.apiDomain}${endpoint}${separator}organization_id=${organizationId}`;
      abortController = new AbortController();
      timeoutId = setTimeout(() => abortController.abort(), 30000);
      const config = {
        method, url,
        headers: { 'Authorization': `Zoho-oauthtoken ${token}`, 'Content-Type': 'application/json' },
        signal: abortController.signal
      };
      if (data) config.data = data;
      const response = await axios(config);
      clearTimeout(timeoutId);
      return { success: true, data: response.data };
    } catch (error) {
      if (timeoutId) clearTimeout(timeoutId);
      if (error.name === 'AbortError') return { success: false, error: 'Request timeout', status: 408 };
      if (error.response?.status === 401 && retryCount < MAX_RETRIES) {
        this.accessToken = null;
        this.tokenExpiry = null;
        return this._request(method, endpoint, data, retryCount + 1);
      }
      return { success: false, error: error.response?.data?.message || error.message, details: error.response?.data, status: error.response?.status };
    }
  }

  async _getCurrencyId(currencyCode) {
    try {
      if (this.currencyCache && this.currencyCacheExpiry && Date.now() < this.currencyCacheExpiry) {
        return this.currencyCache[currencyCode];
      }
      const result = await this._request('GET', '/settings/currencies');
      if (result.success && result.data?.currencies) {
        const currencyMap = {};
        result.data.currencies.forEach(currency => { currencyMap[currency.currency_code] = currency.currency_id; });
        this.currencyCache = currencyMap;
        this.currencyCacheExpiry = Date.now() + 3600000;
        return currencyMap[currencyCode];
      }
      return null;
    } catch (error) {
      logger.warn(`Error fetching currency ID for ${currencyCode}: ${error.message}`);
      return null;
    }
  }

  _mapTaxTreatmentToZoho(taxTreatment) {
    const mapping = {
      'vat_registered': 'vat_registered',
      'non_vat_registered': 'vat_not_registered',
      'gcc_vat_registered': 'gcc_vat_registered',
      'gcc_non_vat_registered': 'gcc_vat_not_registered'
    };
    return mapping[taxTreatment] || 'vat_not_registered';
  }
  
  _getPlaceOfSupplyData(taxTreatment, placeOfSupply) {
    let countryCode, placeOfSupplyCode;
    const isUAEPlace = this.EMIRATE_CODE_MAP[placeOfSupply] !== undefined;
    
    if (taxTreatment === 'vat_registered') {
      if (isUAEPlace) {
        countryCode = 'AE';
        placeOfSupplyCode = this.EMIRATE_CODE_MAP[placeOfSupply] || 'DU';
      } else {
        countryCode = this.COUNTRY_CODE_MAP[placeOfSupply] || 'AE';
        placeOfSupplyCode = countryCode;
      }
    } else if (taxTreatment === 'gcc_vat_registered') {
      const isGCCCountry = this.COUNTRY_CODE_MAP[placeOfSupply] !== undefined;
      if (isGCCCountry && placeOfSupply !== 'United Arab Emirates (UAE)') {
        countryCode = this.COUNTRY_CODE_MAP[placeOfSupply] || 'AE';
        placeOfSupplyCode = countryCode;
      } else if (placeOfSupply === 'United Arab Emirates (UAE)' || this.EMIRATE_CODE_MAP[placeOfSupply]) {
        countryCode = 'AE';
        placeOfSupplyCode = this.EMIRATE_CODE_MAP[placeOfSupply] || 'DU';
      } else {
        countryCode = 'AE';
        placeOfSupplyCode = 'AE';
      }
    } else if (taxTreatment === 'non_vat_registered') {
      countryCode = 'AE';
      placeOfSupplyCode = this.EMIRATE_CODE_MAP[placeOfSupply] || 'DU';
    } else if (taxTreatment === 'gcc_non_vat_registered') {
      countryCode = this.COUNTRY_CODE_MAP[placeOfSupply] || 'AE';
      placeOfSupplyCode = countryCode;
    }
    return { countryCode, placeOfSupplyCode };
  }

  async getAllCustomersPaginated(companyId, lastSyncDate = null) {
    const allCustomers = [];
    const uniqueCustomers = new Map();
    let page = 1;
    const perPage = 200;
    let hasMorePages = true;
    
    logger.info(`Starting customer fetch for company ${companyId}`, { companyId, mode: lastSyncDate ? 'INCREMENTAL' : 'FULL SYNC' });
    
    while (hasMorePages && page <= 50) {
      try {
        let url = `/contacts?page=${page}&per_page=${perPage}&filter_by=Status.All`;
        if (lastSyncDate) url += `&last_modified_time=after.${lastSyncDate}`;
        
        const result = await this._request('GET', url);
        
        if (result.success && result.data?.contacts) {
          const contacts = result.data.contacts;
          const customers = contacts.filter(contact => contact.contact_type === 'customer');
          
          for (const customer of customers) {
            if (!uniqueCustomers.has(customer.contact_id)) {
              uniqueCustomers.set(customer.contact_id, customer);
            }
          }
          allCustomers.push(...customers);
          hasMorePages = result.data.page_context?.has_more_page === true;
          if (hasMorePages) { page++; await new Promise(resolve => setTimeout(resolve, 400)); }
        } else {
          hasMorePages = false;
        }
      } catch (error) {
        logger.error(`Error fetching customers page ${page}: ${error.message}`, { companyId, page });
        hasMorePages = false;
      }
    }
    
    logger.info(`Customer fetch completed for company ${companyId}`, {
      companyId,
      totalUnique: uniqueCustomers.size,
      totalWithDuplicates: allCustomers.length
    });
    
    return { success: true, customers: Array.from(uniqueCustomers.values()), totalUnique: uniqueCustomers.size, totalWithDuplicates: allCustomers.length };
  }
  
  async syncContactsToDatabase(company, incremental = true, syncJobId = null, onProgress = null, companyIdForCancel = null) {
    try {
      this.setCompany(company._id, company.zohoOrganizationId);
      const startTime = Date.now();
      const CustomerModel = Customer;
      
      logger.info(`Starting customer sync for company: ${company.name} (${company.code})`, {
        companyId: company._id,
        companyCode: company.code,
        mode: incremental ? 'INCREMENTAL' : 'FULL SYNC'
      });

      if (onProgress) onProgress({ stage: 'starting', message: 'Starting customer sync...', fetched: 0, total: 0, startTime });

      await this.clearContactsCache();

      let lastSyncDate = null;
      if (incremental) {
        const lastSyncedCustomer = await CustomerModel.findOne({ companyId: company._id, zohoSyncDate: { $ne: null }, zohoSynced: true }).sort({ zohoSyncDate: -1 });
        if (lastSyncedCustomer && lastSyncedCustomer.zohoSyncDate) {
          const syncDate = new Date(lastSyncedCustomer.zohoSyncDate);
          syncDate.setHours(syncDate.getHours() - 1);
          lastSyncDate = syncDate.toISOString().split('T')[0];
        } else {
          const ninetyDaysAgo = new Date();
          ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
          lastSyncDate = ninetyDaysAgo.toISOString().split('T')[0];
        }
      }

      if (onProgress) onProgress({ stage: 'fetching', message: 'Fetching customers from Zoho...', fetched: 0, total: 0, startTime });

      const fetchResult = await this.getAllCustomersPaginated(company._id, lastSyncDate);
      if (!fetchResult.success) throw new Error(fetchResult.error || 'Failed to fetch customers from Zoho');
      
      const zohoCustomers = fetchResult.customers || [];
      logger.info(`Fetched ${zohoCustomers.length} customers from Zoho for ${company.code}`, { companyId: company._id, count: zohoCustomers.length });

      if (zohoCustomers.length === 0) {
        if (onProgress) onProgress({ stage: 'completed', message: 'No customers found to sync', fetched: 0, total: 0 });
        return { success: true, message: 'No customers found to sync', totalFromZoho: 0, created: 0, updated: 0, unchanged: 0, errors: 0 };
      }

      let created = 0, updated = 0, unchanged = 0, errors = 0, totalContactPersons = 0;
      const batchSize = 10;
      const totalCustomers = zohoCustomers.length;

      if (onProgress) onProgress({ stage: 'processing', message: `Processing ${totalCustomers} customers...`, fetched: 0, total: totalCustomers, startTime });

      const checkCancellation = () => {
        if (companyIdForCancel && customerSyncCancelMap && customerSyncCancelMap.get(companyIdForCancel) === true) {
          logger.warn(`Customer sync cancellation requested for company ${companyIdForCancel}`);
          return true;
        }
        return false;
      };

      for (let i = 0; i < totalCustomers; i += batchSize) {
        if (checkCancellation()) {
          logger.info(`Customer sync cancelled by user for company ${companyIdForCancel}`);
          if (onProgress) onProgress({ stage: 'cancelled', message: 'Sync was cancelled by user', fetched: Math.min(i, totalCustomers), total: totalCustomers, startTime });
          if (customerSyncCancelMap) customerSyncCancelMap.delete(companyIdForCancel);
          return { success: false, message: 'Sync cancelled by user', cancelled: true };
        }

        const batch = zohoCustomers.slice(i, i + batchSize);
        
        const batchResults = await Promise.all(batch.map(async (zc) => {
          if (checkCancellation()) return { action: 'cancelled', error: 'Sync cancelled' };
          try {
            const contactResult = await this.getContact(zc.contact_id, true);
            let result;
            if (contactResult.success && contactResult.contact) {
              result = await this.processCustomerRecord(company._id, zc, contactResult.contact);
              if (result.contactPersonsCount) totalContactPersons += result.contactPersonsCount;
            } else {
              result = await this.processCustomerRecord(company._id, zc, zc);
            }
            return result;
          } catch (error) {
            logger.error(`Error processing customer ${zc.contact_name}: ${error.message}`);
            return { action: 'error', error: error.message };
          }
        }));

        for (const result of batchResults) {
          if (result.action === 'cancelled') return { success: false, message: 'Sync cancelled by user', cancelled: true };
          if (result.action === 'created') created++;
          else if (result.action === 'updated') updated++;
          else if (result.action === 'unchanged') unchanged++;
          if (result.error) errors++;
        }

        const processedSoFar = Math.min(i + batchSize, totalCustomers);
        if (onProgress) onProgress({ stage: 'processing', message: `Processing ${processedSoFar}/${totalCustomers} customers...`, fetched: processedSoFar, total: totalCustomers, created, updated, unchanged, errors, startTime });

        if (i + batchSize < totalCustomers) await new Promise(resolve => setTimeout(resolve, 500));
      }
      
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);

      if (onProgress) onProgress({ stage: 'completed', message: `Sync completed! ${created} created, ${updated} updated, ${unchanged} unchanged`, fetched: totalCustomers, total: totalCustomers, created, updated, unchanged, errors, duration: `${duration}s`, startTime });

      this._clearCache(this.CACHE_KEYS.ALL_CONTACTS(company._id));
      await this.clearContactsCache();

      logger.info(`Customer sync completed for ${company.code}: Created: ${created}, Updated: ${updated}, Unchanged: ${unchanged}, Errors: ${errors}, Duration: ${duration}s`, {
        companyId: company._id,
        companyCode: company.code,
        created,
        updated,
        unchanged,
        errors,
        totalContactPersons,
        duration: `${duration}s`,
        syncType: incremental ? 'incremental' : 'full'
      });

      return { success: true, totalFromZoho: totalCustomers, created, updated, unchanged, errors, totalContactPersons, duration: `${duration}s`, lastSyncDate: new Date().toISOString(), syncType: incremental ? 'incremental' : 'full' };
    } catch (error) {
      logger.error(`Customer sync error for ${company?.code}: ${error.message}`, { companyId: company?._id, error: error.message, stack: error.stack });
      const syncStartTime = typeof startTime !== 'undefined' ? startTime : Date.now();
      if (onProgress) onProgress({ stage: 'error', message: `Sync failed: ${error.message}`, error: error.message, startTime: syncStartTime });
      return { success: false, error: error.message };
    }
  }

  async processCustomerRecord(companyId, zc, fullContact = null) {
    try {
      let contactData = fullContact;
      if (!contactData) {
        const fetched = await this.getContact(zc.contact_id, true);
        contactData = (fetched.success && fetched.contact) ? fetched.contact : zc;
      }
      
      if (!contactData.contact_persons) contactData.contact_persons = [];
      
      const mappedCustomer = {
        name: (contactData.contact_name || 'Unnamed Customer').trim().toUpperCase(),
        email: this._extractPrimaryEmail(contactData),
        phone: this._extractPrimaryPhone(contactData),
        address: contactData.billing_address?.address || '',
        city: contactData.billing_address?.city || '',
        state: contactData.billing_address?.state || '',
        zip: contactData.billing_address?.zip || '',
        companyName: (contactData.company_name || contactData.contact_name || '').trim(),
        website: contactData.website || '',
        notes: contactData.notes || '',
        taxTreatment: this._mapTaxTreatment(contactData),
        taxRegistrationNumber: contactData.tax_reg_no || '',
        placeOfSupply: contactData.place_of_contact || 'Dubai',
        defaultCurrency: this._buildCurrencyObject(contactData.currency_code || 'AED'),
        zohoId: contactData.contact_id,
        isActive: contactData.status === 'active',
        lastModifiedTime: contactData.last_modified_time,
        companyId: companyId,
        zohoSynced: true,
        zohoSyncDate: new Date(),
        zohoSyncError: null
      };
      
      const contactPersons = this._mapContactPersons(contactData.contact_persons);
      if (contactPersons.length === 0 && mappedCustomer.name) contactPersons.push(this._createDefaultContact(mappedCustomer));
      this._ensurePrimaryContact(contactPersons);
      mappedCustomer.contactPersons = contactPersons;
      
      const existingCustomer = await Customer.findOne({ companyId: companyId, zohoId: mappedCustomer.zohoId });
      
      if (!existingCustomer) {
        const newCustomer = new Customer(mappedCustomer);
        await newCustomer.save({ validateBeforeSave: false });
        return { action: 'created', contactPersonsCount: contactPersons.length };
      }
      
      const mergedContactPersons = this._mergeContactPersons(existingCustomer.contactPersons || [], contactPersons);
      const hasChanges = this._hasCustomerChanged(existingCustomer, mappedCustomer, mergedContactPersons);
      
      if (!hasChanges) {
        await Customer.updateOne({ _id: existingCustomer._id }, { $set: { zohoSynced: true, zohoSyncDate: new Date(), zohoSyncError: null } });
        return { action: 'unchanged', contactPersonsCount: contactPersons.length };
      }
      
      await Customer.updateOne({ _id: existingCustomer._id }, { $set: { ...mappedCustomer, contactPersons: mergedContactPersons, zohoData: contactData } }, { runValidators: false });
      return { action: 'updated', contactPersonsCount: contactPersons.length };
    } catch (error) {
      logger.error(`Error processing customer record: ${error.message}`);
      return { action: 'error', error: error.message, contactPersonsCount: 0 };
    }
  }
  
  _extractPrimaryEmail(contactData) {
    const primaryContact = contactData.contact_persons?.find(cp => cp.is_primary_contact === true);
    if (primaryContact?.email) return primaryContact.email.trim().toLowerCase();
    if (contactData.email) return contactData.email.trim().toLowerCase();
    const anyContactWithEmail = contactData.contact_persons?.find(cp => cp.email);
    if (anyContactWithEmail?.email) return anyContactWithEmail.email.trim().toLowerCase();
    return null;
  }
  
  _extractPrimaryPhone(contactData) {
    const primaryContact = contactData.contact_persons?.find(cp => cp.is_primary_contact === true);
    if (primaryContact?.phone) return primaryContact.phone.trim();
    if (primaryContact?.mobile) return primaryContact.mobile.trim();
    if (contactData.phone) return contactData.phone.trim();
    const anyContact = contactData.contact_persons?.find(cp => cp.phone || cp.mobile);
    if (anyContact?.phone) return anyContact.phone.trim();
    if (anyContact?.mobile) return anyContact.mobile.trim();
    return '';
  }
  
  _mapTaxTreatment(contactData) {
    const taxTreatment = contactData.tax_treatment || contactData.contact_category;
    if (taxTreatment === 'vat_registered') return 'vat_registered';
    if (taxTreatment === 'gcc_vat_registered') return 'gcc_vat_registered';
    if (taxTreatment === 'gcc_vat_not_registered') return 'gcc_non_vat_registered';
    return 'non_vat_registered';
  }
  
  _buildCurrencyObject(currencyCode) {
    const currencies = {
      AED: { code: 'AED', symbol: 'د.إ', name: 'United Arab Emirates Dirham' },
      USD: { code: 'USD', symbol: '$', name: 'US Dollar' },
      EUR: { code: 'EUR', symbol: '€', name: 'Euro' },
      GBP: { code: 'GBP', symbol: '£', name: 'British Pound' },
      SAR: { code: 'SAR', symbol: 'ر.س', name: 'Saudi Riyal' },
      KWD: { code: 'KWD', symbol: 'د.ك', name: 'Kuwaiti Dinar' },
      QAR: { code: 'QAR', symbol: 'ر.ق', name: 'Qatari Riyal' },
      BHD: { code: 'BHD', symbol: 'د.ب', name: 'Bahraini Dinar' },
      OMR: { code: 'OMR', symbol: 'ر.ع', name: 'Omani Rial' }
    };
    return currencies[currencyCode] || currencies.AED;
  }
  
  _mapContactPersons(zohoContactPersons) {
    if (!Array.isArray(zohoContactPersons)) return [];
    return zohoContactPersons.filter(cp => cp.first_name && cp.first_name.trim()).map(cp => ({
      salutation: cp.salutation || '',
      firstName: cp.first_name.trim(),
      lastName: (cp.last_name || '').trim(),
      email: (cp.email || '').trim().toLowerCase(),
      workPhone: (cp.phone || '').trim(),
      mobile: (cp.mobile || '').trim(),
      designation: cp.designation || '',
      department: cp.department || '',
      isPrimaryContact: cp.is_primary_contact === true,
      notes: cp.notes || '',
      zohoContactPersonId: cp.contact_person_id || null,
      createdAt: new Date(),
      updatedAt: new Date()
    }));
  }
  
  _createDefaultContact(customer) {
    return {
      salutation: 'Mr.',
      firstName: customer.name,
      lastName: '',
      email: customer.email,
      workPhone: customer.phone,
      mobile: '',
      designation: '',
      department: '',
      isPrimaryContact: true,
      notes: '',
      zohoContactPersonId: null,
      createdAt: new Date(),
      updatedAt: new Date()
    };
  }
  
  _ensurePrimaryContact(contactPersons) {
    const hasPrimary = contactPersons.some(cp => cp.isPrimaryContact === true);
    if (!hasPrimary && contactPersons.length > 0) contactPersons[0].isPrimaryContact = true;
  }
  
  _mergeContactPersons(existingContacts, newContacts) {
    const existingMap = new Map();
    existingContacts.forEach(contact => {
      if (contact.zohoContactPersonId) existingMap.set(contact.zohoContactPersonId, { _id: contact._id, createdAt: contact.createdAt });
    });
    return newContacts.map(contact => {
      if (contact.zohoContactPersonId && existingMap.has(contact.zohoContactPersonId)) {
        const existing = existingMap.get(contact.zohoContactPersonId);
        return { ...contact, _id: existing._id, createdAt: existing.createdAt, updatedAt: new Date() };
      }
      return contact;
    });
  }
  
  _hasCustomerChanged(existing, updated, mergedContactPersons) {
    const existingCount = existing.contactPersons?.length || 0;
    const newCount = mergedContactPersons.length;
    if (existingCount !== newCount) return true;
    if (updated.lastModifiedTime !== existing.lastModifiedTime) return true;
    const criticalFields = ['name', 'email', 'phone', 'taxTreatment', 'taxRegistrationNumber', 'placeOfSupply'];
    for (const field of criticalFields) {
      if (updated[field] !== existing[field]) return true;
    }
    return false;
  }

  async getAllItemsPaginated(companyId, lastSyncDate = null) {
    const allItems = [];
    let page = 1;
    const perPage = 200;
    let hasMorePages = true;
    
    while (hasMorePages) {
      try {
        let url = `/items?page=${page}&per_page=${perPage}&filter_by=Status.All`;
        if (lastSyncDate) url += `&filter_by=Date.Modified.After.${lastSyncDate}`;
        const result = await this._request('GET', url);
        
        if (result.success && result.data?.items) {
          allItems.push(...result.data.items);
          const pageContext = result.data.page_context || {};
          hasMorePages = pageContext.has_more_page === true;
          if (hasMorePages) { page++; await new Promise(resolve => setTimeout(resolve, 200)); }
        } else {
          hasMorePages = false;
        }
      } catch (error) {
        logger.error(`Error fetching items page ${page}: ${error.message}`);
        hasMorePages = false;
      }
    }
    return { success: true, items: allItems };
  }

  async syncItemsToDatabase(company, incremental = true) {
    try {
      this.setCompany(company._id, company.zohoOrganizationId);
      logger.info(`Starting item sync for company: ${company.name} (${company.code})`, { companyId: company._id, companyCode: company.code });
      
      let lastSyncDate = null;
      if (incremental) {
        const lastSyncedItem = await Item.findOne({ companyId: company._id, lastSyncedAt: { $ne: null } }).sort({ lastSyncedAt: -1 });
        if (lastSyncedItem && lastSyncedItem.lastSyncedAt) {
          const syncDate = new Date(lastSyncedItem.lastSyncedAt);
          syncDate.setHours(syncDate.getHours() - 1);
          lastSyncDate = syncDate.toISOString().split('T')[0];
        }
      }
      
      const fetchResult = await this.getAllItemsPaginated(company._id, lastSyncDate);
      if (!fetchResult.success) throw new Error(fetchResult.error || 'Failed to fetch items from Zoho');
      
      const zohoItems = fetchResult.items || [];
      logger.info(`Fetched ${zohoItems.length} items from Zoho for ${company.code}`, { companyId: company._id, itemCount: zohoItems.length });
      
      let created = 0, updated = 0, unchanged = 0;
      
      for (const zi of zohoItems) {
        if (!zi.item_id) continue;
        const mapped = this._mapZohoItemToItem(zi);
        mapped.companyId = company._id;
        
        const existingItem = await Item.findOne({ companyId: company._id, zohoId: mapped.zohoId });
        
        if (existingItem) {
          const hasChanges = this._hasItemChanged(existingItem, mapped);
          if (hasChanges) {
            await Item.findOneAndUpdate({ companyId: company._id, zohoId: mapped.zohoId }, { $set: { ...mapped, lastSyncedAt: new Date() } }, { new: true });
            updated++;
          } else {
            unchanged++;
          }
        } else {
          await Item.create({ ...mapped, lastSyncedAt: new Date() });
          created++;
        }
      }
      
      logger.info(`Item sync completed for ${company.code}: Created: ${created}, Updated: ${updated}, Unchanged: ${unchanged}`, { companyId: company._id, created, updated, unchanged, total: zohoItems.length });
      
      this._clearCache(this.CACHE_KEYS.ALL_ITEMS(company._id));
      return { success: true, created, updated, unchanged, total: zohoItems.length };
    } catch (error) {
      logger.error(`Item sync error for ${company.code}: ${error.message}`, { companyId: company._id, error: error.message });
      return { success: false, error: error.message };
    }
  }

  _mapZohoItemToItem(zohoItem) {
    return {
      zohoId: zohoItem.item_id,
      name: zohoItem.name || 'Unnamed Item',
      price: parseFloat(zohoItem.rate) || 0,
      description: zohoItem.description || '',
      sku: zohoItem.sku || '',
      unit: zohoItem.unit || 'pcs',
      product_type: zohoItem.product_type || 'goods',
      tax_percentage: parseFloat(zohoItem.tax_percentage) || 0,
      status: zohoItem.status || 'active',
      is_taxable: zohoItem.is_taxable !== false,
      can_be_sold: zohoItem.can_be_sold !== false,
      isActive: zohoItem.status === 'active',
      zohoData: zohoItem
    };
  }

  _hasItemChanged(existing, updated) {
    const fieldsToCompare = ['name', 'price', 'description', 'sku', 'unit', 'product_type', 'tax_percentage', 'status'];
    for (const field of fieldsToCompare) {
      if (String(existing[field] || '') !== String(updated[field] || '')) return true;
    }
    return false;
  }

  _mapZohoContactToCustomer(zohoContact) {
    let taxTreatment = 'non_vat_registered';
    if (zohoContact.tax_treatment === 'vat_registered' || zohoContact.contact_category === 'vat_registered') taxTreatment = 'vat_registered';
    else if (zohoContact.tax_treatment === 'gcc_vat_registered' || zohoContact.gcc_vat_treatment === 'vat_registered') taxTreatment = 'gcc_vat_registered';
    else if (zohoContact.tax_treatment === 'gcc_vat_not_registered') taxTreatment = 'gcc_non_vat_registered';
  
    let email = zohoContact.email || '';
    let phone = zohoContact.phone || '';
    let mainContactSalutation = '';
    
    if (zohoContact.contact_persons && zohoContact.contact_persons.length > 0) {
      const primaryContact = zohoContact.contact_persons.find(cp => cp.is_primary_contact) || zohoContact.contact_persons[0];
      email = email || primaryContact.email || '';
      phone = phone || primaryContact.mobile || primaryContact.phone || '';
      mainContactSalutation = primaryContact.salutation || '';
    }
    
    const finalEmail = email && email.trim() !== '' ? email.toLowerCase().trim() : null;
    
    const currencyCode = zohoContact.currency_code || 'AED';
    const allowedCurrencies = ['AED', 'SAR', 'KWD', 'QAR', 'BHD', 'OMR', 'USD', 'EUR', 'GBP'];
    let finalCurrencyCode = allowedCurrencies.includes(currencyCode) ? currencyCode : 'AED';
    let currencyWarning = null;
    
    if (!allowedCurrencies.includes(currencyCode)) {
      logger.warn(`Unsupported currency "${currencyCode}" for customer "${zohoContact.contact_name}". Defaulting to AED.`);
      finalCurrencyCode = 'AED';
      currencyWarning = `Currency "${currencyCode}" was not supported and has been defaulted to AED`;
    }
  
    const placeOfSupply = this._getPlaceOfSupplyFromZoho(zohoContact);
  
    return {
      name: (zohoContact.contact_name || 'Unnamed Customer').trim(),
      email: finalEmail,
      phone: (phone || '').trim(),
      address: zohoContact.billing_address?.address || '',
      city: zohoContact.billing_address?.city || '',
      state: zohoContact.billing_address?.state || '',
      zip: zohoContact.billing_address?.zip || '',
      companyName: (zohoContact.company_name || '').trim(),
      website: zohoContact.website || '',
      notes: zohoContact.notes || '',
      taxTreatment,
      taxRegistrationNumber: zohoContact.tax_reg_no || zohoContact.vat_reg_no || '',
      placeOfSupply: placeOfSupply || 'Dubai',
      defaultCurrency: { code: finalCurrencyCode, symbol: this._getCurrencySymbol(finalCurrencyCode), name: this._getCurrencyName(finalCurrencyCode) },
      zohoId: zohoContact.contact_id,
      isActive: zohoContact.status === 'active',
      lastModifiedTime: zohoContact.last_modified_time,
      mainContactSalutation: mainContactSalutation,
      ...(currencyWarning && { currencyWarning })
    };
  }

  _getPlaceOfSupplyFromZoho(zohoContact) {
    if (zohoContact.country_code === 'AE') {
      const emirateCodeMap = { 'AB': 'Abu Dhabi', 'AJ': 'Ajman', 'DU': 'Dubai', 'FU': 'Fujairah', 'RA': 'Ras al-Khaimah', 'SH': 'Sharjah', 'UM': 'Umm al-Quwain' };
      return emirateCodeMap[zohoContact.place_of_contact] || 'Dubai';
    }
    const countryCodeMap = { 'SA': 'Saudi Arabia', 'KW': 'Kuwait', 'QA': 'Qatar', 'BH': 'Bahrain', 'OM': 'Oman' };
    return countryCodeMap[zohoContact.country_code] || 'Dubai';
  }

  _getCurrencySymbol(currencyCode) {
    const symbols = { 'AED': 'د.إ', 'SAR': 'ر.س', 'KWD': 'د.ك', 'QAR': 'ر.ق', 'BHD': '.د.ب', 'OMR': 'ر.ع.', 'USD': '$', 'EUR': '€', 'GBP': '£' };
    return symbols[currencyCode] || 'د.إ';
  }

  _getCurrencyName(currencyCode) {
    const names = { 'AED': 'United Arab Emirates Dirham', 'SAR': 'Saudi Riyal', 'KWD': 'Kuwaiti Dinar', 'QAR': 'Qatari Riyal', 'BHD': 'Bahraini Dinar', 'OMR': 'Omani Rial', 'USD': 'US Dollar', 'EUR': 'Euro', 'GBP': 'British Pound' };
    return names[currencyCode] || 'United Arab Emirates Dirham';
  }

  async getContact(contactId, bypassCache = false) {
    const { companyId } = this.getCompanyContext();
    const cacheKey = this.CACHE_KEYS.CONTACT(contactId, companyId);
    
    try {
      if (!bypassCache) {
        const cachedData = this._getFromCache(cacheKey);
        if (cachedData && cachedData.contact_persons && Array.isArray(cachedData.contact_persons)) {
          return { success: true, contact: cachedData, source: 'cache' };
        }
      }
      
      const result = await this._request('GET', `/contacts/${contactId}`);
      
      if (result.success && result.data?.contact) {
        const contact = result.data.contact;
        if (!contact.contact_persons) contact.contact_persons = [];
        this._setToCache(cacheKey, contact, 300);
        return { success: true, contact, source: 'api' };
      }
      return result;
    } catch (error) {
      const fallbackCache = this._getFromCache(cacheKey);
      if (fallbackCache && fallbackCache.contact_persons && Array.isArray(fallbackCache.contact_persons)) {
        return { success: true, contact: fallbackCache, source: 'cache-fallback' };
      }
      logger.error(`Error fetching contact ${contactId}: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  async getAllContacts(params = {}) {
    const { companyId } = this.getCompanyContext();
    const cacheKey = this.CACHE_KEYS.ALL_CONTACTS(companyId);
    const loadingFlagKey = `${cacheKey}:loading`;
    let isLoadingFlagSet = false;
    
    try {
      const bypassCache = params.bypassCache === true;
      
      if (!bypassCache) {
        const cachedData = this._getFromCache(cacheKey);
        if (cachedData) return { success: true, contacts: cachedData, source: 'cache' };
      }
      
      const isAlreadyLoading = this._getFromCache(loadingFlagKey);
      if (isAlreadyLoading && !bypassCache) {
        await new Promise(r => setTimeout(r, 500));
        const retryCache = this._getFromCache(cacheKey);
        if (retryCache) return { success: true, contacts: retryCache, source: 'cache' };
      }
      
      this._setToCache(loadingFlagKey, true, 30);
      isLoadingFlagSet = true;
      
      const queryParams = { ...params };
      if (params.lastSyncDate) queryParams.filter_by = `Date.Modified.After.${params.lastSyncDate}`;
      delete queryParams.bypassCache;
      delete queryParams.lastSyncDate;
      
      const queryString = new URLSearchParams(queryParams).toString();
      const endpoint = `/contacts${queryString ? '?' + queryString : ''}`;
      const result = await this._request('GET', endpoint);
      
      if (result.success) {
        const contacts = result.data.contacts || [];
        if (!bypassCache) this._setToCache(cacheKey, contacts, 600);
        return { success: true, contacts, source: 'api', totalCount: result.data.page_context?.total || contacts.length };
      }
      return result;
    } catch (error) {
      const fallbackCache = this._getFromCache(cacheKey);
      if (fallbackCache) return { success: true, contacts: fallbackCache, source: 'cache-fallback' };
      logger.error(`Error fetching contacts: ${error.message}`);
      return { success: false, error: error.message };
    } finally {
      if (isLoadingFlagSet) this._clearCache(loadingFlagKey);
    }
  }

  async createContact(customerData) {
    const { taxTreatment, placeOfSupply, uaeEmirate, taxRegistrationNumber, currencyCode, contactPersons = [], address, city, state, zipcode, phone, street2, attention } = customerData;
    
    let effectivePlaceOfSupply = placeOfSupply;
    if (taxTreatment === 'vat_registered' && uaeEmirate) effectivePlaceOfSupply = uaeEmirate;
    
    const { countryCode, placeOfSupplyCode } = this._getPlaceOfSupplyData(taxTreatment, effectivePlaceOfSupply);
    let currencyId = null;
    if (currencyCode) currencyId = await this._getCurrencyId(currencyCode);
    
    const contactPayload = {
      contact_name: customerData.name,
      company_name: customerData.companyName || '',
      contact_type: 'customer',
      tax_treatment: this._mapTaxTreatmentToZoho(taxTreatment),
      country_code: countryCode,
      place_of_contact: placeOfSupplyCode
    };
    
    if (currencyId) contactPayload.currency_id = currencyId;
    
    if (contactPersons && Array.isArray(contactPersons) && contactPersons.length > 0) {
      const validContactPersons = contactPersons.filter(person => person.firstName && person.firstName.trim());
      if (validContactPersons.length > 0) {
        contactPayload.contact_persons = validContactPersons.map(p => {
          const obj = {
            salutation: (p.salutation || "Mr.").trim(),
            first_name: (p.firstName || "").trim(),
            last_name: (p.lastName || "").trim(),
            phone: (p.workPhone || p.phone || "").trim(),
            mobile: (p.mobile || "").trim(),
            designation: (p.designation || "").trim(),
            department: (p.department || "").trim()
          };
          if (p.email && p.email.trim()) obj.email = p.email.trim().toLowerCase();
          if (p.isPrimaryContact === true) obj.is_primary_contact = true;
          if (p.zohoContactPersonId) obj.contact_person_id = p.zohoContactPersonId;
          return obj;
        });
      }
    }
    
    const billingAddress = this._buildAddress({ address, street2, city, state, zipcode, phone, attention, country: 'United Arab Emirates' });
    if (billingAddress && Object.keys(billingAddress).length > 0) {
      contactPayload.billing_address = billingAddress;
      contactPayload.shipping_address = { ...billingAddress };
    }
    
    if ((taxTreatment === 'vat_registered' || taxTreatment === 'gcc_vat_registered') && taxRegistrationNumber) {
      contactPayload.tax_reg_no = taxRegistrationNumber;
      contactPayload.vat_reg_no = taxRegistrationNumber;
    }
    
    const cleanPayload = this._cleanPayload(contactPayload);
    const result = await this._request('POST', '/contacts', cleanPayload);
    
    if (result.success && result.data?.contact) {
      await this.clearContactsCache();
      logger.info(`Contact created in Zoho: ${customerData.name}`, { contactId: result.data.contact.contact_id, companyId: this.currentCompanyId });
      return { success: true, zohoId: result.data.contact.contact_id, message: 'Contact created in Zoho Books', contact: result.data.contact };
    }
    
    logger.error(`Failed to create contact in Zoho: ${result.error}`, { customerName: customerData.name });
    return { success: false, message: result.error || 'Failed to create contact in Zoho', error: result.error, details: result.details };
  }
  
  async updateContact(contactId, customerData) {
    const { taxTreatment, placeOfSupply, uaeEmirate, taxRegistrationNumber, currencyCode, contactPersons = [], address, city, state, zipcode, phone, street2, attention } = customerData;
  
    let effectivePlaceOfSupply = placeOfSupply;
    if (taxTreatment === 'vat_registered' && uaeEmirate) effectivePlaceOfSupply = uaeEmirate;
    
    const { countryCode, placeOfSupplyCode } = this._getPlaceOfSupplyData(taxTreatment, effectivePlaceOfSupply);
  
    const seen = new Set();
    const uniqueContacts = [];
    for (const p of contactPersons) {
      const email = (p.email || "").trim().toLowerCase();
      const key1 = email ? `email:${email}` : null;
      const key2 = `${(p.firstName || "").trim().toLowerCase()}-${(p.mobile || p.workPhone || "").trim()}`;
      if ((key1 && seen.has(key1)) || seen.has(key2)) continue;
      if (key1) seen.add(key1);
      seen.add(key2);
      uniqueContacts.push(p);
    }
  
    const contactPayload = {
      contact_name: customerData.name,
      company_name: customerData.companyName || customerData.name,
      contact_type: "customer",
      tax_treatment: this._mapTaxTreatmentToZoho(taxTreatment) || "vat_not_registered",
      country_code: countryCode,
      place_of_contact: placeOfSupplyCode,
      contact_persons: uniqueContacts.map(p => {
        const obj = {
          salutation: (p.salutation || "Mr.").trim(),
          first_name: (p.firstName || "").trim(),
          last_name: (p.lastName || "").trim(),
          phone: (p.workPhone || p.phone || "").trim(),
          mobile: (p.mobile || "").trim(),
          designation: (p.designation || "").trim(),
          department: (p.department || "").trim()
        };
        if (p.email && p.email.trim()) obj.email = p.email.trim().toLowerCase();
        if (p.isPrimaryContact === true) obj.is_primary_contact = true;
        if (p.zohoContactPersonId) obj.contact_person_id = p.zohoContactPersonId;
        return obj;
      })
    };
  
    const billingAddress = this._buildAddress({ address, street2, city, state, zipcode, phone, attention, country: 'United Arab Emirates' });
    if (billingAddress && Object.keys(billingAddress).length > 0) contactPayload.billing_address = billingAddress;
  
    if ((taxTreatment === 'vat_registered' || taxTreatment === 'gcc_vat_registered') && taxRegistrationNumber) {
      contactPayload.tax_reg_no = taxRegistrationNumber;
      contactPayload.vat_reg_no = taxRegistrationNumber;
    }
  
    if (currencyCode) {
      const currencyId = await this._getCurrencyId(currencyCode);
      if (currencyId) contactPayload.currency_id = currencyId;
    }
  
    const result = await this._request('PUT', `/contacts/${contactId}`, this._cleanPayload(contactPayload));
  
    if (result.success) {
      logger.info(`Contact updated in Zoho: ${customerData.name}`, { contactId, companyId: this.currentCompanyId });
    } else {
      logger.error(`Failed to update contact in Zoho: ${result.error}`, { contactId, customerName: customerData.name });
    }
  
    return { success: result.success, message: result.success ? 'Contact updated successfully' : (result.error || 'Zoho update failed'), contact: result.data?.contact || result.contact };
  }

  async deleteContact(contactId) {
    const result = await this._request('DELETE', `/contacts/${contactId}`);
    if (result.success) {
      await this.clearContactsCache();
      this._clearCache(this.CACHE_KEYS.CONTACT(contactId, this.currentCompanyId));
      logger.info(`Contact deleted from Zoho: ${contactId}`, { contactId, companyId: this.currentCompanyId });
      return { success: true, message: 'Contact deleted from Zoho Books' };
    }
    logger.error(`Failed to delete contact from Zoho: ${result.error}`, { contactId });
    return result;
  }

  async clearContactsCache() {
    const { companyId } = this.getCompanyContext();
    this._clearCache(this.CACHE_KEYS.ALL_CONTACTS(companyId));
    this._clearCachePattern(`zoho_contact_${companyId}:`);
  }

  async clearItemsCache() {
    const { companyId } = this.getCompanyContext();
    this._clearCache(this.CACHE_KEYS.ALL_ITEMS(companyId));
    this._clearCachePattern(`zoho_item_${companyId}:`);
  }

  async getAllItems(params = {}) {
    const { companyId } = this.getCompanyContext();
    const cacheKey = this.CACHE_KEYS.ALL_ITEMS(companyId);
    const loadingFlagKey = `${cacheKey}:loading`;
    let isLoadingFlagSet = false;
    
    try {
      const cachedData = this._getFromCache(cacheKey);
      if (cachedData && !params.forceRefresh) return { success: true, items: cachedData, source: 'cache', total: cachedData.length };
      
      const isAlreadyLoading = this._getFromCache(loadingFlagKey);
      if (isAlreadyLoading) {
        await new Promise(r => setTimeout(r, 500));
        const retryCache = this._getFromCache(cacheKey);
        if (retryCache) return { success: true, items: retryCache, source: 'cache' };
      }
      
      this._setToCache(loadingFlagKey, true, 60);
      isLoadingFlagSet = true;
      
      let allItems = [];
      let currentPage = 1;
      let hasMorePages = true;
      
      while (hasMorePages) {
        const url = `${this.apiDomain}/items?organization_id=${this.organizationId}&page=${currentPage}&per_page=200`;
        
        try {
          const token = await this.getValidAccessToken();
          const response = await axios.get(url, {
            headers: { 'Authorization': `Zoho-oauthtoken ${token}`, 'Content-Type': 'application/json' },
            timeout: 30000
          });
          
          if (response.data) {
            let items = [];
            if (response.data.items) items = response.data.items;
            else if (response.data.item) items = [response.data.item];
            else if (Array.isArray(response.data)) items = response.data;
            
            if (items.length > 0) {
              allItems = [...allItems, ...items];
              const pageContext = response.data.page_context || {};
              hasMorePages = pageContext.has_more_page === true;
              if (hasMorePages) { currentPage++; await new Promise(resolve => setTimeout(resolve, 200)); }
              else hasMorePages = false;
            } else {
              hasMorePages = false;
            }
          } else {
            hasMorePages = false;
          }
        } catch (pageError) {
          logger.error(`Error fetching items page ${currentPage}: ${pageError.message}`);
          if (currentPage === 1) throw pageError;
          hasMorePages = false;
        }
      }
      
      if (allItems.length > 0) this._setToCache(cacheKey, allItems, 600);
      return { success: true, items: allItems, total: allItems.length, source: 'api', pages: currentPage };
    } catch (error) {
      const fallbackCache = this._getFromCache(cacheKey);
      if (fallbackCache) return { success: true, items: fallbackCache, source: 'cache-fallback', total: fallbackCache.length, warning: 'Using cached data - API unavailable' };
      logger.error(`Zoho Items API Error: ${error.message}`);
      return { success: false, error: error.message, items: [], total: 0 };
    } finally {
      if (isLoadingFlagSet) this._clearCache(loadingFlagKey);
    }
  }

  async getItem(itemId) {
    const { companyId } = this.getCompanyContext();
    const cacheKey = this.CACHE_KEYS.ITEM(itemId, companyId);
    
    try {
      const cachedData = this._getFromCache(cacheKey);
      if (cachedData) return { success: true, item: cachedData, source: 'cache' };
      
      const result = await this._request('GET', `/items/${itemId}`);
      if (result.success && result.data?.item) {
        this._setToCache(cacheKey, result.data.item, 600);
        return { success: true, item: result.data.item, source: 'api' };
      }
      return result;
    } catch (error) {
      const fallbackCache = this._getFromCache(cacheKey);
      if (fallbackCache) return { success: true, item: fallbackCache, source: 'cache-fallback' };
      return { success: false, error: error.message };
    }
  }

  async createItem(itemData) {
    try {
      const payload = {
        name: itemData.name,
        rate: itemData.rate,
        description: itemData.description,
        sku: itemData.sku,
        unit: itemData.unit,
        product_type: itemData.product_type || 'goods'
      };
      const result = await this._request('POST', '/items', this._cleanPayload(payload));
      if (result.success && result.data?.item) {
        await this.clearItemsCache();
        return { success: true, zohoId: result.data.item.item_id, item: result.data.item };
      }
      return result;
    } catch (error) {
      logger.error(`Error creating item: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  async updateItem(itemId, itemData) {
    try {
      const payload = {
        name: itemData.name,
        rate: itemData.rate,
        description: itemData.description,
        sku: itemData.sku,
        unit: itemData.unit,
        product_type: itemData.product_type
      };
      const result = await this._request('PUT', `/items/${itemId}`, this._cleanPayload(payload));
      if (result.success && result.data?.item) {
        await this.clearItemsCache();
        this._clearCache(this.CACHE_KEYS.ITEM(itemId, this.currentCompanyId));
        return { success: true, item: result.data.item };
      }
      return result;
    } catch (error) {
      logger.error(`Error updating item ${itemId}: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  async deleteItem(itemId) {
    const result = await this._request('DELETE', `/items/${itemId}`);
    if (result.success) {
      await this.clearItemsCache();
      this._clearCache(this.CACHE_KEYS.ITEM(itemId, this.currentCompanyId));
      return { success: true, message: 'Item deleted from Zoho Books' };
    }
    return result;
  }

  async createEstimate(estimateData) {
    try {
      const token = await this.getValidAccessToken();
      let currencyId = estimateData.currency_id;
      if (!currencyId && estimateData.currency_code) currencyId = await this._getCurrencyId(estimateData.currency_code);
      
      // Build line items without requiring item_id
      const lineItems = estimateData.line_items.map((item, index) => {
        const lineItem = {
          
          description: item.description || '',
          quantity: Number(item.quantity) || 1,
          rate: Number(item.rate) || 0,
          item_total: Number(item.item_total) || (Number(item.quantity) * Number(item.rate)),
          item_order: item.item_order || index + 1
        };
        
        // Add discount if present
        if (item.discount && item.discount > 0) {
          lineItem.discount = item.discount;
          lineItem.discount_amount = item.discount_amount || 0;
        }
        
        // Add tax if present
        if (item.tax_id && item.tax_percentage > 0) {
          lineItem.tax_id = item.tax_id;
          lineItem.tax_percentage = item.tax_percentage;
          lineItem.tax_name = item.tax_name || 'VAT';
          lineItem.tax_type = 'tax';
        }
        
        // Remove item_id if it exists (don't send it to Zoho)
        if (lineItem.item_id) delete lineItem.item_id;
        
        return lineItem;
      });
      
      const payload = {
        customer_id: estimateData.customer_id,
        date: estimateData.date,
        expiry_date: estimateData.expiry_date,
        line_items: lineItems,
        notes: estimateData.notes || '',
        terms: estimateData.terms || '',
        reference_number: estimateData.reference_number,
        exchange_rate: estimateData.exchange_rate || 1,
        price_precision: estimateData.price_precision || 2,
        tax_treatment: estimateData.tax_treatment || 'vat_not_registered',
        place_of_supply: estimateData.place_of_supply || 'AE'
      };
      
      // Add optional fields
      if (estimateData.estimate_number) payload.estimate_number = estimateData.estimate_number;
      if (currencyId) payload.currency_id = currencyId;
      if (estimateData.tax_id && estimateData.tax_percentage > 0) payload.tax_id = estimateData.tax_id;
      
      // Handle entity-level discount
      const hasItemLevelDiscount = lineItems.some(item => item.discount && item.discount > 0);
      if (estimateData.discount && estimateData.discount > 0 && !hasItemLevelDiscount) {
        payload.discount = estimateData.discount;
        payload.is_discount_before_tax = estimateData.is_discount_before_tax || false;
        payload.discount_type = estimateData.discount_type || 'entity_level';
      }
      
      // Add other optional fields
      if (estimateData.is_inclusive_tax !== undefined) payload.is_inclusive_tax = estimateData.is_inclusive_tax;
      if (estimateData.contact_persons_associated) payload.contact_persons_associated = estimateData.contact_persons_associated;
      if (estimateData.template_id) payload.template_id = estimateData.template_id;
      if (estimateData.custom_fields) payload.custom_fields = estimateData.custom_fields;
      if (estimateData.shipping_charge) payload.shipping_charge = estimateData.shipping_charge;
      if (estimateData.adjustment) payload.adjustment = estimateData.adjustment;
      if (estimateData.adjustment_description) payload.adjustment_description = estimateData.adjustment_description;
      if (estimateData.tags && estimateData.tags.length > 0) payload.tags = estimateData.tags;
      if (estimateData.salesperson_name) payload.salesperson_name = estimateData.salesperson_name;
      if (estimateData.custom_body) payload.custom_body = estimateData.custom_body;
      if (estimateData.custom_subject) payload.custom_subject = estimateData.custom_subject;
      
      const cleanPayload = this._cleanPayload(payload);
      
      const response = await axios.post(`${this.apiDomain}/estimates?organization_id=${this.organizationId}`, cleanPayload, {
        headers: { 'Authorization': `Zoho-oauthtoken ${token}`, 'Content-Type': 'application/json' },
        timeout: 30000
      });
      
      if (response.data && response.data.estimate) {
        logger.info(`Zoho estimate created successfully`, {
          estimateId: response.data.estimate.estimate_id,
          estimateNumber: response.data.estimate.estimate_number,
          customerId: estimateData.customer_id,
          lineItemsCount: lineItems.length
        });
        
        return {
          success: true,
          estimateId: response.data.estimate.estimate_id,
          estimateNumber: response.data.estimate.estimate_number,
          estimateUrl: response.data.estimate.estimate_url,
          estimate: response.data.estimate
        };
      }
      
      throw new Error('Invalid response from Zoho');
      
    } catch (error) {
      logger.error(`Zoho estimate creation error: ${error.message}`, {
        error: error.message,
        response: error.response?.data,
        status: error.response?.status
      });
      
      return { 
        success: false, 
        error: error.response?.data?.message || error.message, 
        details: error.response?.data 
      };
    }
  }

  _cleanPayload(payload) {
    return JSON.parse(JSON.stringify(payload, (_, value) => value === undefined || value === '' ? undefined : value));
  }

  _buildAddress(data, prefix = '') {
    const address = {
      address: data[`${prefix}address`] || data.address || '',
      street2: data[`${prefix}street2`] || data.street2 || '',
      city: data[`${prefix}city`] || data.city || '',
      state: data[`${prefix}state`] || data.state || '',
      state_code: data[`${prefix}state_code`] || data.state_code || '',
      zip: data[`${prefix}zip`] || data[`${prefix}zipCode`] || data[`${prefix}zipcode`] || data.zipCode || data.zipcode || '',
      country: data[`${prefix}country`] || data.country || '',
      phone: data[`${prefix}phone`] || data.phone || '',
      fax: data[`${prefix}fax`] || data.fax || '',
      attention: data[`${prefix}attention`] || data.attention || ''
    };
    Object.keys(address).forEach(key => { if (!address[key] || address[key].toString().trim() === '') delete address[key]; });
    return Object.keys(address).length > 0 ? address : null;
  }

  _buildContactPerson(data) {
    const nameParts = data.name?.split(' ') || [];
    return {
      first_name: data.contactFirstName || nameParts[0] || '',
      last_name: data.contactLastName || nameParts.slice(1).join(' ') || '',
      email: data.contactEmail || data.email,
      phone: data.contactPhone || data.phone,
      mobile: data.contactMobile || data.mobile || data.phone,
      is_primary_contact: true
    };
  }
}

module.exports = new ZohoBooksService();