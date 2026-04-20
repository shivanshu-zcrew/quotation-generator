const axios = require('axios');
const fs = require('fs');
const path = require('path');
// const redisService = require('../config/redisService');
const SyncLogger = require('../utils/syncLogger');
const { Customer } = require('../models/customer');
const { Item } = require('../models/items');
const Company = require('../models/company');

class ZohoBooksService {
  constructor() {
    // Required environment variables validation
    const requiredEnvVars = [
      'ZOHO_CLIENT_ID',
      'ZOHO_CLIENT_SECRET',
      'ZOHO_REFRESH_TOKEN'
    ];
    
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
    
    // In-memory cache as fallback (instead of Redis)
    this.memoryCache = new Map();
    this.cacheTTL = 600000; // 10 minutes in milliseconds
    
    this.EMIRATE_CODE_MAP = {
      'Abu Dhabi': 'AB',
      'Ajman': 'AJ',
      'Dubai': 'DU',
      'Fujairah': 'FU',
      'Ras al-Khaimah': 'RA',
      'Sharjah': 'SH',
      'Umm al-Quwain': 'UM'
    };
      
    this.COUNTRY_CODE_MAP = {
      'Saudi Arabia': 'SA',
      'Kuwait': 'KW',
      'Qatar': 'QA',
      'Bahrain': 'BH',
      'Oman': 'OM'
    };
      
    this._loadToken();
  }

  // Helper method for in-memory cache
  _getFromCache(key) {
    const cached = this.memoryCache.get(key);
    if (cached && cached.expiry > Date.now()) {
      return cached.data;
    }
    if (cached) {
      this.memoryCache.delete(key);
    }
    return null;
  }

  _setToCache(key, data, ttlSeconds = 600) {
    this.memoryCache.set(key, {
      data,
      expiry: Date.now() + (ttlSeconds * 1000)
    });
  }

  _clearCache(key) {
    this.memoryCache.delete(key);
  }

  _clearCachePattern(pattern) {
    for (const key of this.memoryCache.keys()) {
      if (key.includes(pattern)) {
        this.memoryCache.delete(key);
      }
    }
  }

  setCompany(companyId, organizationId) {
    this.currentCompanyId = companyId;
    this.organizationId = organizationId;
    // console.log(`🏢 Company context set: ${companyId} (Org: ${organizationId})`);
  }

  getCompanyContext() {
    if (!this.currentCompanyId || !this.organizationId) {
      throw new Error('Company context not set. Call setCompany() first.');
    }
    return {
      companyId: this.currentCompanyId,
      organizationId: this.organizationId
    };
  }

  _loadToken() {
    try {
      if (fs.existsSync(this.tokenFilePath)) {
        const data = JSON.parse(fs.readFileSync(this.tokenFilePath, 'utf8'));
        if (!data.accessToken || !data.tokenExpiry) {
          throw new Error('Invalid token file format');
        }
        this.accessToken = data.accessToken;
        this.tokenExpiry = parseInt(data.tokenExpiry, 10);
        if (isNaN(this.tokenExpiry)) {
          throw new Error('Token expiry is not a valid number');
        }
      }
    } catch (error) {
      // console.warn('⚠️ Could not load token file:', error.message);
      this.accessToken = null;
      this.tokenExpiry = null;
    }
  }

  async _saveToken() {
    try {
      const data = {
        accessToken: this.accessToken,
        tokenExpiry: this.tokenExpiry,
        updatedAt: Date.now()
      };
      const tempPath = `${this.tokenFilePath}.tmp`;
      await fs.promises.writeFile(tempPath, JSON.stringify(data, null, 2));
      await fs.promises.rename(tempPath, this.tokenFilePath);
    } catch (error) {
      // console.warn('⚠️ Could not save token file:', error.message);
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
    if (this._isTokenValid()) {
      return this.accessToken;
    }
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
      const response = await axios.post(
        'https://accounts.zoho.com/oauth/v2/token',
        params,
        { 
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          timeout: 10000
        }
      );
      if (response.data && response.data.access_token) {
        this.accessToken = response.data.access_token;
        const expiresIn = parseInt(response.data.expires_in, 10);
        this.tokenExpiry = Date.now() + (expiresIn * 1000);
        await this._saveToken();
        return this.accessToken;
      } else {
        throw new Error('Invalid response from Zoho: missing access_token');
      }
    } catch (error) {
      if (error.response?.data?.error === 'Access Denied' && 
          error.response?.data?.error_description?.includes('too many requests')) {
        if (this.accessToken) {
          return this.accessToken;
        }
      }
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
        method,
        url,
        headers: {
          'Authorization': `Zoho-oauthtoken ${token}`,
          'Content-Type': 'application/json'
        },
        signal: abortController.signal
      };
      if (data) config.data = data;
      const response = await axios(config);
      clearTimeout(timeoutId);
      return { success: true, data: response.data };
    } catch (error) {
      if (timeoutId) clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        return { success: false, error: 'Request timeout', status: 408 };
      }
      if (error.response?.status === 401 && retryCount < MAX_RETRIES) {
        this.accessToken = null;
        this.tokenExpiry = null;
        return this._request(method, endpoint, data, retryCount + 1);
      }
      return { 
        success: false, 
        error: error.response?.data?.message || error.message,
        details: error.response?.data,
        status: error.response?.status
      };
    }
  }

  async _getCurrencyId(currencyCode) {
    try {
      // Check memory cache first
      if (this.currencyCache && this.currencyCacheExpiry && Date.now() < this.currencyCacheExpiry) {
        return this.currencyCache[currencyCode];
      }
      
      // Check Redis cache (commented out)
      // const cachedCurrencies = await redisService.get(this.CACHE_KEYS.CURRENCIES);
      // if (cachedCurrencies) {
      //   this.currencyCache = cachedCurrencies;
      //   this.currencyCacheExpiry = Date.now() + 3600000;
      //   return cachedCurrencies[currencyCode];
      // }
      
      const result = await this._request('GET', '/settings/currencies');
      if (result.success && result.data?.currencies) {
        const currencyMap = {};
        result.data.currencies.forEach(currency => {
          currencyMap[currency.currency_code] = currency.currency_id;
        });
        this.currencyCache = currencyMap;
        this.currencyCacheExpiry = Date.now() + 3600000;
        
        // Store in Redis (commented out)
        // await redisService.set(this.CACHE_KEYS.CURRENCIES, currencyMap, 3600);
        
        return currencyMap[currencyCode];
      }
      return null;
    } catch (error) {
      // console.error('Error fetching currency ID:', error.message);
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
    } 
    else if (taxTreatment === 'gcc_vat_registered') {
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
    } 
    else if (taxTreatment === 'non_vat_registered') {
      countryCode = 'AE';
      placeOfSupplyCode = this.EMIRATE_CODE_MAP[placeOfSupply] || 'DU';
    } 
    else if (taxTreatment === 'gcc_non_vat_registered') {
      countryCode = this.COUNTRY_CODE_MAP[placeOfSupply] || 'AE';
      placeOfSupplyCode = countryCode;
    }
    
    return { countryCode, placeOfSupplyCode };
  }

  async getAllCustomersPaginated(companyId, lastSyncDate = null) {
    const allCustomers = [];
    const uniqueCustomers = new Map(); // Track by contact_id
    let page = 1;
    const perPage = 200;
    let hasMorePages = true;
    
    // console.log(`\n🔍 Starting customer fetch for company ${companyId}`);
    
    while (hasMorePages && page <= 50) {
      try {
        let url = `/contacts?page=${page}&per_page=${perPage}&filter_by=Status.All`;
        
        // console.log(`📡 Fetching page ${page}...`);
        const result = await this._request('GET', url);
        
        if (result.success && result.data?.contacts) {
          const contacts = result.data.contacts;
          const pageContext = result.data.page_context || {};
          
          // Filter customers
          const customers = contacts.filter(contact => contact.contact_type === 'customer');
          
          // console.log(`📥 Page ${page}: ${contacts.length} total contacts, ${customers.length} customers`);
          
          // Check for duplicates within this page
          const pageContactIds = new Set();
          for (const customer of customers) {
            if (pageContactIds.has(customer.contact_id)) {
              // console.log(`⚠️ Duplicate found within same page: ${customer.contact_id} - ${customer.contact_name}`);
            }
            pageContactIds.add(customer.contact_id);
            
            // Check against previously fetched customers
            if (uniqueCustomers.has(customer.contact_id)) {
              const existing = uniqueCustomers.get(customer.contact_id);
              // console.log(`⚠️ DUPLICATE DETECTED: ${customer.contact_id} - ${customer.contact_name}`);
              // console.log(`   First seen on page: ${existing.page}`);
              // console.log(`   Duplicate on page: ${page}`);
            } else {
              uniqueCustomers.set(customer.contact_id, {
                customer,
                page
              });
            }
          }
          
          allCustomers.push(...customers);
          
          hasMorePages = pageContext.has_more_page === true;
          if (hasMorePages) {
            page++;
            await new Promise(resolve => setTimeout(resolve, 400));
          }
        } else {
          hasMorePages = false;
        }
      } catch (error) {
        // console.error(`❌ Error fetching page ${page}:`, error.message);
        hasMorePages = false;
      }
    }
    
    // console.log(`\n📊 FINAL RESULT for company ${companyId}:`);
    // console.log(`   Total customers fetched (including duplicates): ${allCustomers.length}`);
    // console.log(`   Unique customers: ${uniqueCustomers.size}`);
    
    // Log duplicate details if any
    if (allCustomers.length > uniqueCustomers.size) {
      console.log(`\n⚠️ DUPLICATES FOUND: ${allCustomers.length - uniqueCustomers.size} duplicate(s)`);
      
      // Find and log duplicates
      const seen = new Map();
      for (const customer of allCustomers) {
        if (seen.has(customer.contact_id)) {
          console.log(`   Duplicate: ${customer.contact_id} - ${customer.contact_name}`);
        } else {
          seen.set(customer.contact_id, true);
        }
      }
    }
    
    // Return unique customers only
    return { 
      success: true, 
      customers: Array.from(uniqueCustomers.values()).map(item => item.customer),
      totalUnique: uniqueCustomers.size,
      totalWithDuplicates: allCustomers.length
    };
  }

  async syncContactsToDatabase(company, incremental = true) {
    try {
      this.setCompany(company._id, company.zohoOrganizationId);
      const startTime = Date.now();
      const CustomerModel = Customer;
      
      // console.log(`\n${'='.repeat(70)}`);
      // console.log(`🔄 Starting Customer Sync for Company: ${company.name} (${company.code})`);
      // console.log(`📅 Mode: ${incremental ? 'INCREMENTAL' : 'FULL'}`);
      // console.log(`${'='.repeat(70)}`);
      
      let lastSyncDate = null;
      if (incremental) {
        const lastSyncedCustomer = await CustomerModel.findOne({ 
          companyId: company._id,
          zohoSyncDate: { $ne: null },
          zohoSynced: true 
        }).sort({ zohoSyncDate: -1 });
        
        if (lastSyncedCustomer && lastSyncedCustomer.zohoSyncDate) {
          const syncDate = new Date(lastSyncedCustomer.zohoSyncDate);
          syncDate.setHours(syncDate.getHours() - 1);
          lastSyncDate = syncDate.toISOString().split('T')[0];
          // console.log(`📅 Last sync: ${lastSyncedCustomer.zohoSyncDate.toISOString()}`);
          // console.log(`📅 Fetching customers modified after: ${lastSyncDate}`);
        } else {
          const ninetyDaysAgo = new Date();
          ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
          lastSyncDate = ninetyDaysAgo.toISOString().split('T')[0];
          // console.log(`📅 First sync - fetching customers from last 90 days: ${lastSyncDate}`);
        }
      } else {
        // console.log(`📅 Full sync - fetching ALL customers from Zoho`);
      }
      
      console.log(`\n📡 Fetching customers from Zoho...`);
      const fetchResult = await this.getAllCustomersPaginated(company._id, lastSyncDate);
      
      if (!fetchResult.success) {
        throw new Error(fetchResult.error || 'Failed to fetch customers from Zoho');
      }
      
      const zohoCustomers = fetchResult.customers || [];
      // console.log(`✅ Fetched ${zohoCustomers.length} customers from Zoho`);
      
      if (zohoCustomers.length === 0) {
        return {
          success: true,
          message: 'No customers found to sync',
          totalFromZoho: 0,
          created: 0,
          updated: 0,
          unchanged: 0,
          errors: 0
        };
      }
      
      const nonVatCustomers = [];
      const vatCustomers = [];
      
      for (const zc of zohoCustomers) {
        const isVatRegistered = zc.tax_treatment === 'vat_registered' || 
                                 zc.gcc_vat_treatment === 'vat_registered' ||
                                 zc.contact_category === 'vat_registered';
        if (isVatRegistered) {
          vatCustomers.push(zc);
        } else {
          nonVatCustomers.push(zc);
        }
      }
      
      // console.log(`\n📊 Customer Breakdown:`);
      // console.log(`   Non-VAT Customers: ${nonVatCustomers.length}`);
      // console.log(`   VAT Customers: ${vatCustomers.length}`);
      // console.log(`   Total: ${zohoCustomers.length}`);
      
      // console.log(`\n🔄 Processing ${nonVatCustomers.length} Non-VAT Customers...`);
      let created = 0;
      let updated = 0;
      let unchanged = 0;
      let errors = 0;
      
      const batchSize = 50;
      for (let i = 0; i < nonVatCustomers.length; i += batchSize) {
        const batch = nonVatCustomers.slice(i, i + batchSize);
        await Promise.all(batch.map(async (zc) => {
          try {
            const result = await this.processCustomerRecord(company._id, zc, null);
            if (result.action === 'created') created++;
            else if (result.action === 'updated') updated++;
            else if (result.action === 'unchanged') unchanged++;
            if (result.error) errors++;
          } catch (error) {
            // console.error(`❌ Error processing ${zc.contact_name}:`, error.message);
            errors++;
          }
        }));
        // console.log(`   Non-VAT Progress: ${Math.min(i + batchSize, nonVatCustomers.length)}/${nonVatCustomers.length} (Created: ${created}, Updated: ${updated})`);
      }
      
      // console.log(`\n🔄 Processing ${vatCustomers.length} VAT Customers (fetching TRN)...`);
      let vatCreated = 0;
      let vatUpdated = 0;
      let vatUnchanged = 0;
      let vatErrors = 0;
      let trnFetched = 0;
      let trnFailed = 0;
      
      const vatBatchSize = 10;
      for (let i = 0; i < vatCustomers.length; i += vatBatchSize) {
        const batch = vatCustomers.slice(i, i + vatBatchSize);
        const batchResults = await Promise.all(batch.map(async (zc) => {
          try {
            // console.log(`🔍 Fetching TRN for: ${zc.contact_name} (Zoho ID: ${zc.contact_id})`);
            const contactResult = await this.getContact(zc.contact_id);
            if (contactResult.success && contactResult.contact) {
              trnFetched++;
              const trn = contactResult.contact.tax_reg_no || '';
              // console.log(`✅ TRN fetched for ${zc.contact_name}: ${trn || 'No TRN'}`);
              const result = await this.processCustomerRecord(company._id, zc, contactResult.contact);
              return result;
            } else {
              trnFailed++;
              // console.warn(`⚠️ Could not fetch TRN for ${zc.contact_name}, using basic data`);
              const result = await this.processCustomerRecord(company._id, zc, null);
              return result;
            }
          } catch (error) {
            trnFailed++;
            // console.error(`❌ Error fetching TRN for ${zc.contact_name}:`, error.message);
            const result = await this.processCustomerRecord(company._id, zc, null);
            return result;
          }
        }));
        
        for (const result of batchResults) {
          if (result.action === 'created') vatCreated++;
          else if (result.action === 'updated') vatUpdated++;
          else if (result.action === 'unchanged') vatUnchanged++;
          if (result.error) vatErrors++;
        }
        // console.log(`   VAT Progress: ${Math.min(i + vatBatchSize, vatCustomers.length)}/${vatCustomers.length} (TRN: ${trnFetched} fetched)`);
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      
      const totalCreated = created + vatCreated;
      const totalUpdated = updated + vatUpdated;
      const totalUnchanged = unchanged + vatUnchanged;
      const totalErrors = errors + vatErrors;
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      
      // console.log(`\n${'='.repeat(70)}`);
      // console.log(`✅ SYNC COMPLETED in ${duration} seconds for ${company.name}`);
      // console.log(`${'='.repeat(70)}`);
      // console.log(`📊 Results: Created: ${totalCreated}, Updated: ${totalUpdated}, Unchanged: ${totalUnchanged}, Errors: ${totalErrors}`);
      // console.log(`${'='.repeat(70)}\n`);
      
      // Clear cache after sync
      this._clearCache(this.CACHE_KEYS.ALL_CONTACTS(company._id));
      // await redisService.del(this.CACHE_KEYS.ALL_CONTACTS(company._id)).catch(() => {});
      
      return {
        success: true,
        totalFromZoho: zohoCustomers.length,
        created: totalCreated,
        updated: totalUpdated,
        unchanged: totalUnchanged,
        errors: totalErrors,
        vatCount: vatCustomers.length,
        trnFetched,
        trnFailed,
        duration: `${duration}s`,
        lastSyncDate: new Date().toISOString()
      };
    } catch (error) {
      // console.error('❌ Sync error:', error);
      return { success: false, error: error.message };
    }
  }

  async processCustomerRecord(companyId, zc, fullContact = null) {
    try {
      const contactData = fullContact || zc;
      const mapped = this._mapZohoContactToCustomer(contactData);
      
      if (!mapped.email || mapped.email.trim() === '') {
        mapped.email = null;
      }
      mapped.companyId = companyId;
      
      const existingCustomer = await Customer.findOne({ 
        companyId: companyId,
        zohoId: mapped.zohoId 
      });
      
      if (existingCustomer) {
        const zohoLastModified = contactData.last_modified_time;
        const storedLastModified = existingCustomer.lastModifiedTime;
        
        if (zohoLastModified !== storedLastModified) {
          await Customer.findOneAndUpdate(
            { companyId: companyId, zohoId: mapped.zohoId },
            {
              $set: {
                ...mapped,
                zohoSynced: true,
                zohoSyncDate: new Date(),
                zohoSyncError: null,
                lastModifiedTime: zohoLastModified,
                zohoData: contactData
              }
            },
            { new: true, runValidators: false }
          );
          return { action: 'updated' };
        } else {
          await Customer.findOneAndUpdate(
            { companyId: companyId, zohoId: mapped.zohoId },
            {
              $set: {
                zohoSynced: true,
                zohoSyncDate: new Date(),
                zohoSyncError: null
              }
            }
          );
          return { action: 'unchanged' };
        }
      } else {
        await Customer.create({
          ...mapped,
          zohoSynced: true,
          zohoSyncDate: new Date(),
          zohoSyncError: null,
          lastModifiedTime: contactData.last_modified_time,
          zohoData: contactData
        });
        return { action: 'created' };
      }
    } catch (error) {
      // console.error(`   ❌ Error: ${error.message}`);
      return { action: 'error', error: error.message };
    }
  }

  async getAllItemsPaginated(companyId, lastSyncDate = null) {
    const allItems = [];
    let page = 1;
    const perPage = 200;
    let hasMorePages = true;
    
    while (hasMorePages) {
      try {
        let url = `/items?page=${page}&per_page=${perPage}&filter_by=Status.All`;
        if (lastSyncDate) {
          url += `&filter_by=Date.Modified.After.${lastSyncDate}`;
        }
        const result = await this._request('GET', url);
        
        if (result.success && result.data?.items) {
          const items = result.data.items;
          allItems.push(...items);
          const pageContext = result.data.page_context || {};
          hasMorePages = pageContext.has_more_page === true;
          // console.log(`📥 Page ${page}: ${items.length} items (Total: ${allItems.length})`);
          
          if (hasMorePages) {
            page++;
            await new Promise(resolve => setTimeout(resolve, 200));
          }
        } else {
          hasMorePages = false;
        }
      } catch (error) {
        console.error(`❌ Error fetching page ${page}:`, error.message);
        hasMorePages = false;
      }
    }
    
    return { success: true, items: allItems };
  }

  async syncItemsToDatabase(company, incremental = true) {
    try {
      this.setCompany(company._id, company.zohoOrganizationId);
      // console.log(`\n${'='.repeat(70)}`);
      // console.log(`🔄 Starting Item Sync for Company: ${company.name} (${company.code})`);
      // console.log(`${'='.repeat(70)}`);
      
      let lastSyncDate = null;
      if (incremental) {
        const lastSyncedItem = await Item.findOne({ 
          companyId: company._id,
          lastSyncedAt: { $ne: null }
        }).sort({ lastSyncedAt: -1 });
        
        if (lastSyncedItem && lastSyncedItem.lastSyncedAt) {
          const syncDate = new Date(lastSyncedItem.lastSyncedAt);
          syncDate.setHours(syncDate.getHours() - 1);
          lastSyncDate = syncDate.toISOString().split('T')[0];
        }
      }
      
      const fetchResult = await this.getAllItemsPaginated(company._id, lastSyncDate);
      if (!fetchResult.success) {
        throw new Error(fetchResult.error || 'Failed to fetch items from Zoho');
      }
      
      const zohoItems = fetchResult.items || [];
      // console.log(`✅ Fetched ${zohoItems.length} items from Zoho`);
      
      let created = 0;
      let updated = 0;
      let unchanged = 0;
      
      for (const zi of zohoItems) {
        if (!zi.item_id) continue;
        const mapped = this._mapZohoItemToItem(zi);
        mapped.companyId = company._id;
        
        const existingItem = await Item.findOne({ 
          companyId: company._id,
          zohoId: mapped.zohoId 
        });
        
        if (existingItem) {
          const hasChanges = this._hasItemChanged(existingItem, mapped);
          if (hasChanges) {
            await Item.findOneAndUpdate(
              { companyId: company._id, zohoId: mapped.zohoId },
              { $set: { ...mapped, lastSyncedAt: new Date() } },
              { new: true }
            );
            updated++;
          } else {
 
            unchanged++;
          }
        } else {
          await Item.create({ ...mapped, lastSyncedAt: new Date() });
          created++;
        }
      }
      
      // console.log(`📊 Item Sync Results: Created: ${created}, Updated: ${updated}, Unchanged: ${unchanged}`);
      
      // Clear cache after sync
      this._clearCache(this.CACHE_KEYS.ALL_ITEMS(company._id));
      // await redisService.del(this.CACHE_KEYS.ALL_ITEMS(company._id)).catch(() => {});
      
      return { success: true, created, updated, unchanged, total: zohoItems.length };
    } catch (error) {
      console.error('❌ Item sync error:', error);
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
      if (String(existing[field] || '') !== String(updated[field] || '')) {
        return true;
      }
    }
    return false;
  }

  _mapZohoContactToCustomer(zohoContact) {
    let taxTreatment = 'non_vat_registered';
    if (zohoContact.tax_treatment === 'vat_registered' || zohoContact.contact_category === 'vat_registered') {
      taxTreatment = 'vat_registered';
    } else if (zohoContact.tax_treatment === 'gcc_vat_registered' || zohoContact.gcc_vat_treatment === 'vat_registered') {
      taxTreatment = 'gcc_vat_registered';
    } else if (zohoContact.tax_treatment === 'gcc_vat_not_registered') {
      taxTreatment = 'gcc_non_vat_registered';
    }

    let email = zohoContact.email || '';
    let phone = zohoContact.phone || '';
    
    if (!email && zohoContact.contact_persons && zohoContact.contact_persons.length > 0) {
      const primary = zohoContact.contact_persons.find(cp => cp.is_primary_contact) || zohoContact.contact_persons[0];
      email = primary.email || '';
      phone = primary.mobile || primary.phone || '';
    }
    
    const finalEmail = email && email.trim() !== '' ? email.toLowerCase().trim() : null;
    
    const currencyCode = zohoContact.currency_code || 'AED';
    const allowedCurrencies = ['AED', 'SAR', 'KWD', 'QAR', 'BHD', 'OMR', 'USD', 'EUR', 'GBP'];
    let finalCurrencyCode = allowedCurrencies.includes(currencyCode) ? currencyCode : 'AED';
    let currencyWarning = null;
    
    if (!allowedCurrencies.includes(currencyCode)) {
      console.warn(`⚠️ Unsupported currency "${currencyCode}" for customer "${zohoContact.contact_name}". Defaulting to AED.`);
      finalCurrencyCode = 'AED';
      currencyWarning = `Currency "${currencyCode}" was not supported and has been defaulted to AED`;
    }

    return {
      name: (zohoContact.contact_name || 'Unnamed Customer').trim(),
      email: finalEmail,
      phone: (phone || '').trim(),
      address: zohoContact.billing_address?.address || '',
      companyName: (zohoContact.company_name || '').trim(),
      website: zohoContact.website || '',
      notes: zohoContact.notes || '',
      taxTreatment,
      taxRegistrationNumber: zohoContact.tax_reg_no || zohoContact.vat_reg_no || '',
      placeOfSupply: this._getPlaceOfSupplyFromZoho(zohoContact),
      defaultCurrency: {
        code: finalCurrencyCode,
        symbol: this._getCurrencySymbol(finalCurrencyCode),
        name: this._getCurrencyName(finalCurrencyCode)
      },
      zohoId: zohoContact.contact_id,
      isActive: zohoContact.status === 'active',
      lastModifiedTime: zohoContact.last_modified_time,
      ...(currencyWarning && { currencyWarning })
    };
  }

  _getPlaceOfSupplyFromZoho(zohoContact) {
    if (zohoContact.country_code === 'AE') {
      const emirateCodeMap = {
        'AB': 'Abu Dhabi',
        'AJ': 'Ajman',
        'DU': 'Dubai',
        'FU': 'Fujairah',
        'RA': 'Ras al-Khaimah',
        'SH': 'Sharjah',
        'UM': 'Umm al-Quwain'
      };
      return emirateCodeMap[zohoContact.place_of_contact] || 'Dubai';
    }
    
    const countryCodeMap = {
      'SA': 'Saudi Arabia',
      'KW': 'Kuwait',
      'QA': 'Qatar',
      'BH': 'Bahrain',
      'OM': 'Oman'
    };
    return countryCodeMap[zohoContact.country_code] || 'Dubai';
  }

  _getCurrencySymbol(currencyCode) {
    const symbols = {
      'AED': 'د.إ',
      'SAR': 'ر.س',
      'KWD': 'د.ك',
      'QAR': 'ر.ق',
      'BHD': '.د.ب',
      'OMR': 'ر.ع.',
      'USD': '$',
      'EUR': '€',
      'GBP': '£'
    };
    return symbols[currencyCode] || 'د.إ';
  }

  _getCurrencyName(currencyCode) {
    const names = {
      'AED': 'United Arab Emirates Dirham',
      'SAR': 'Saudi Riyal',
      'KWD': 'Kuwaiti Dinar',
      'QAR': 'Qatari Riyal',
      'BHD': 'Bahraini Dinar',
      'OMR': 'Omani Rial',
      'USD': 'US Dollar',
      'EUR': 'Euro',
      'GBP': 'British Pound'
    };
    return names[currencyCode] || 'United Arab Emirates Dirham';
  }

  async getContact(contactId) {
    const { companyId } = this.getCompanyContext();
    const cacheKey = this.CACHE_KEYS.CONTACT(contactId, companyId);
    
    try {
      // Check memory cache first
      const cachedData = this._getFromCache(cacheKey);
      if (cachedData) {
        return { success: true, contact: cachedData, source: 'cache' };
      }
      
      // Check Redis cache (commented out)
      // const cachedData = await redisService.get(cacheKey);
      // if (cachedData) {
      //   return { success: true, contact: cachedData, source: 'cache' };
      // }
      
      const result = await this._request('GET', `/contacts/${contactId}`);
      if (result.success && result.data?.contact) {
        const contact = result.data.contact;
        this._setToCache(cacheKey, contact, 600);
        // await redisService.set(cacheKey, contact, 600);
        return { success: true, contact, source: 'api' };
      }
      return result;
    } catch (error) {
      // Try fallback cache
      const fallbackCache = this._getFromCache(cacheKey);
      if (fallbackCache) {
        return { success: true, contact: fallbackCache, source: 'cache-fallback' };
      }
      // const fallbackCache = await redisService.get(cacheKey).catch(() => null);
      // if (fallbackCache) {
      //   return { success: true, contact: fallbackCache, source: 'cache-fallback' };
      // }
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
        // Check memory cache first
        const cachedData = this._getFromCache(cacheKey);
        if (cachedData) {
          return { success: true, contacts: cachedData, source: 'cache' };
        }
        
        // Check Redis cache (commented out)
        // const cachedData = await redisService.get(cacheKey);
        // if (cachedData) {
        //   return { success: true, contacts: cachedData, source: 'cache' };
        // }
      }
      
      // Check if already loading (to prevent duplicate requests)
      const isAlreadyLoading = this._getFromCache(loadingFlagKey);
      if (isAlreadyLoading && !bypassCache) {
        await new Promise(r => setTimeout(r, 500));
        const retryCache = this._getFromCache(cacheKey);
        if (retryCache) {
          return { success: true, contacts: retryCache, source: 'cache' };
        }
      }
      
      // Set loading flag
      this._setToCache(loadingFlagKey, true, 30);
      // await redisService.set(loadingFlagKey, true, 30);
      isLoadingFlagSet = true;
      
      const queryParams = { ...params };
      if (params.lastSyncDate) {
        queryParams.filter_by = `Date.Modified.After.${params.lastSyncDate}`;
      }
      delete queryParams.bypassCache;
      delete queryParams.lastSyncDate;
      
      const queryString = new URLSearchParams(queryParams).toString();
      const endpoint = `/contacts${queryString ? '?' + queryString : ''}`;
      // console.log(`📡 Fetching contacts from Zoho with params:`, queryParams);
      
      const result = await this._request('GET', endpoint);
      
      if (result.success) {
        const contacts = result.data.contacts || [];
        // console.log(`✅ Retrieved ${contacts.length} contacts from Zoho`);
        
        if (!bypassCache) {
          this._setToCache(cacheKey, contacts, 600);
          // await redisService.set(cacheKey, contacts, 600);
        }
        
        return { 
          success: true, 
          contacts, 
          source: 'api', 
          totalCount: result.data.page_context?.total || contacts.length 
        };
      }
      return result;
    } catch (error) {
      const fallbackCache = this._getFromCache(cacheKey);
      if (fallbackCache) {
        return { success: true, contacts: fallbackCache, source: 'cache-fallback' };
      }
      // const fallbackCache = await redisService.get(cacheKey).catch(() => null);
      // if (fallbackCache) {
      //   return { success: true, contacts: fallbackCache, source: 'cache-fallback' };
      // }
      return { success: false, error: error.message };
    } finally {
      if (isLoadingFlagSet) {
        this._clearCache(loadingFlagKey);
        // await redisService.del(loadingFlagKey).catch(() => {});
      }
    }
  }

  async createContact(customerData) {
    const { taxTreatment, placeOfSupply, uaeEmirate, taxRegistrationNumber, currencyCode } = customerData;
    let effectivePlaceOfSupply = placeOfSupply;
    
    if (taxTreatment === 'vat_registered' && uaeEmirate) {
      effectivePlaceOfSupply = uaeEmirate;
    }
    
    const { countryCode, placeOfSupplyCode } = this._getPlaceOfSupplyData(taxTreatment, effectivePlaceOfSupply);
    let currencyId = null;
    
    if (currencyCode) {
      currencyId = await this._getCurrencyId(currencyCode);
    }
    
    const contactPayload = {
      contact_name: customerData.name,
      company_name: customerData.companyName || '',
      contact_type: 'customer',
      contact_persons: [this._buildContactPerson(customerData)],
      tax_treatment: this._mapTaxTreatmentToZoho(taxTreatment),
      country_code: countryCode,
      place_of_contact: placeOfSupplyCode
    };
    
    if (currencyId) contactPayload.currency_id = currencyId;
    
    const address = this._buildAddress(customerData);
    if (address && Object.values(address).some(v => v)) {
      contactPayload.billing_address = address;
    }
    
    if ((taxTreatment === 'vat_registered' || taxTreatment === 'gcc_vat_registered') && taxRegistrationNumber) {
      contactPayload.tax_reg_no = taxRegistrationNumber;
    }
    
    const cleanPayload = this._cleanPayload(contactPayload);
    const result = await this._request('POST', '/contacts', cleanPayload);
    
    if (result.success && result.data?.contact) {
      await this.clearContactsCache();
      return {
        success: true,
        zohoId: result.data.contact.contact_id,
        message: 'Contact created in Zoho Books',
        contact: result.data.contact
      };
    }
    return result;
  }

  async updateContact(contactId, customerData) {
    const { taxTreatment, placeOfSupply, taxRegistrationNumber, currencyCode } = customerData;
    const contactPayload = {
      contact_name: customerData.name,
      company_name: customerData.companyName || customerData.name,
      contact_persons: [this._buildContactPerson(customerData)]
    };
    
    if (taxTreatment) {
      const { countryCode, placeOfSupplyCode } = this._getPlaceOfSupplyData(taxTreatment, placeOfSupply);
      contactPayload.tax_treatment = this._mapTaxTreatmentToZoho(taxTreatment);
      contactPayload.country_code = countryCode;
      contactPayload.place_of_contact = placeOfSupplyCode;
    }
    
    if (currencyCode) {
      const currencyId = await this._getCurrencyId(currencyCode);
      if (currencyId) contactPayload.currency_id = currencyId;
    }
    
    const address = this._buildAddress(customerData);
    if (address && Object.values(address).some(v => v)) {
      contactPayload.billing_address = address;
    }
    
    if (taxTreatment && (taxTreatment === 'vat_registered' || taxTreatment === 'gcc_vat_registered') && taxRegistrationNumber) {
      contactPayload.tax_reg_no = taxRegistrationNumber;
    }
    
    const cleanPayload = this._cleanPayload(contactPayload);
    const result = await this._request('PUT', `/contacts/${contactId}`, cleanPayload);
    
    if (result.success && result.data?.contact) {
      await this.clearContactsCache();
      this._clearCache(this.CACHE_KEYS.CONTACT(contactId, this.currentCompanyId));
      // await redisService.del(this.CACHE_KEYS.CONTACT(contactId, this.currentCompanyId));
      return {
        success: true,
        message: 'Contact updated successfully',
        contact: result.data.contact
      };
    }
    return result;
  }

  async deleteContact(contactId) {
    const result = await this._request('DELETE', `/contacts/${contactId}`);
    if (result.success) {
      await this.clearContactsCache();
      this._clearCache(this.CACHE_KEYS.CONTACT(contactId, this.currentCompanyId));
      // await redisService.del(this.CACHE_KEYS.CONTACT(contactId, this.currentCompanyId));
      return { success: true, message: 'Contact deleted from Zoho Books' };
    }
    return result;
  }

  async clearContactsCache() {
    const { companyId } = this.getCompanyContext();
    this._clearCache(this.CACHE_KEYS.ALL_CONTACTS(companyId));
    this._clearCachePattern(`zoho_contact_${companyId}:`);
    
    // await Promise.all([
    //   redisService.del(this.CACHE_KEYS.ALL_CONTACTS(companyId)),
    //   redisService.delPattern(`zoho_contact_${companyId}:*`)
    // ]);
  }

  async clearItemsCache() {
    const { companyId } = this.getCompanyContext();
    this._clearCache(this.CACHE_KEYS.ALL_ITEMS(companyId));
    this._clearCachePattern(`zoho_item_${companyId}:`);
    
    // await Promise.all([
    //   redisService.del(this.CACHE_KEYS.ALL_ITEMS(companyId)),
    //   redisService.delPattern(`zoho_item_${companyId}:*`)
    // ]);
  }

  async getAllItems(params = {}) {
    const { companyId } = this.getCompanyContext();
    const cacheKey = this.CACHE_KEYS.ALL_ITEMS(companyId);
    const loadingFlagKey = `${cacheKey}:loading`;
    let isLoadingFlagSet = false;
    
    try {
      // Check memory cache first
      const cachedData = this._getFromCache(cacheKey);
      if (cachedData && !params.forceRefresh) {
        // console.log('✅ Returning cached items');
        return { success: true, items: cachedData, source: 'cache', total: cachedData.length };
      }
      
      // Check Redis cache (commented out)
      // const cachedData = await redisService.get(cacheKey);
      // if (cachedData && !params.forceRefresh) {
      //   console.log('✅ Returning cached items');
      //   return { success: true, items: cachedData, source: 'cache', total: cachedData.length };
      // }
      
      // Check if already loading
      const isAlreadyLoading = this._getFromCache(loadingFlagKey);
      if (isAlreadyLoading) {
        await new Promise(r => setTimeout(r, 500));
        const retryCache = this._getFromCache(cacheKey);
        if (retryCache) {
          return { success: true, items: retryCache, source: 'cache' };
        }
      }
      
      // Set loading flag
      this._setToCache(loadingFlagKey, true, 60);
      // await redisService.set(loadingFlagKey, true, 60);
      isLoadingFlagSet = true;
      
      let allItems = [];
      let currentPage = 1;
      let hasMorePages = true;
      
      console.log(`\n🔄 Fetching items from Zoho...`);
      const token = await this.getValidAccessToken();
      console.log('✅ Access token obtained');
      
      while (hasMorePages) {
        const url = `${this.apiDomain}/items?organization_id=${this.organizationId}&page=${currentPage}&per_page=200`;
        console.log(`📥 Fetching page ${currentPage}...`);
        
        try {
          const response = await axios.get(url, {
            headers: { 
              'Authorization': `Zoho-oauthtoken ${token}`,
              'Content-Type': 'application/json'
            },
            timeout: 30000
          });
          
          console.log(`Response status: ${response.status}`);
          
          if (response.data) {
            let items = [];
            if (response.data.items) {
              items = response.data.items;
              console.log(`✅ Found ${items.length} items on page ${currentPage}`);
            } else if (response.data.item) {
              items = [response.data.item];
              console.log(`✅ Found 1 item on page ${currentPage}`);
            } else if (Array.isArray(response.data)) {
              items = response.data;
              console.log(`✅ Found ${items.length} items (array response)`);
            } else {
              console.log(`⚠️ Unexpected response structure:`, Object.keys(response.data));
            }
            
            if (items.length > 0) {
              allItems = [...allItems, ...items];
              const pageContext = response.data.page_context || {};
              hasMorePages = pageContext.has_more_page === true;
              
              if (hasMorePages) {
                currentPage++;
                await new Promise(resolve => setTimeout(resolve, 200));
              } else {
                hasMorePages = false;
              }
            } else {
              hasMorePages = false;
            }
          } else {
            console.log('⚠️ No data in response');
            hasMorePages = false;
          }
        } catch (pageError) {
          console.error(`❌ Error fetching page ${currentPage}:`, pageError.message);
          if (pageError.response) {
            console.error('Response status:', pageError.response.status);
            console.error('Response data:', JSON.stringify(pageError.response.data, null, 2));
          }
          if (currentPage === 1) {
            throw pageError;
          }
          hasMorePages = false;
        }
      }
      
      console.log(`\n📊 Total items fetched: ${allItems.length}`);
      
      if (allItems.length > 0) {
        this._setToCache(cacheKey, allItems, 600);
        console.log('💾 Items cached in memory');
        // await redisService.set(cacheKey, allItems, 600);
        // console.log('💾 Items cached in Redis');
      }
      
      return { 
        success: true, 
        items: allItems, 
        total: allItems.length, 
        source: 'api',
        pages: currentPage
      };
    } catch (error) {
      console.error('\n❌ Zoho Items API Error:', error.message);
      
      try {
        const fallbackCache = this._getFromCache(cacheKey);
        if (fallbackCache) {
          console.log('⚠️ Using fallback cache');
          return { 
            success: true, 
            items: fallbackCache, 
            source: 'cache-fallback',
            total: fallbackCache.length,
            warning: 'Using cached data - API unavailable'
          };
        }
        
        // const fallbackCache = await redisService.get(cacheKey);
        // if (fallbackCache) {
        //   console.log('⚠️ Using fallback cache');
        //   return { 
        //     success: true, 
        //     items: fallbackCache, 
        //     source: 'cache-fallback',
        //     total: fallbackCache.length,
        //     warning: 'Using cached data - API unavailable'
        //   };
        // }
      } catch (cacheError) {
        console.error('Cache fallback failed:', cacheError.message);
      }
      
      return { 
        success: false, 
        error: error.message,
        items: [],
        total: 0
      };
    } finally {
      if (isLoadingFlagSet) {
        this._clearCache(loadingFlagKey);
        // await redisService.del(loadingFlagKey).catch(() => {});
      }
    }
  }

  async getItem(itemId) {
    const { companyId } = this.getCompanyContext();
    const cacheKey = this.CACHE_KEYS.ITEM(itemId, companyId);
    
    try {
      // Check memory cache first
      const cachedData = this._getFromCache(cacheKey);
      if (cachedData) {
        return { success: true, item: cachedData, source: 'cache' };
      }
      
      // Check Redis cache (commented out)
      // const cachedData = await redisService.get(cacheKey);
      // if (cachedData) {
      //   return { success: true, item: cachedData, source: 'cache' };
      // }
      
      const result = await this._request('GET', `/items/${itemId}`);
      if (result.success && result.data?.item) {
        this._setToCache(cacheKey, result.data.item, 600);
        // await redisService.set(cacheKey, result.data.item, 600);
        return { success: true, item: result.data.item, source: 'api' };
      }
      return result;
    } catch (error) {
      const fallbackCache = this._getFromCache(cacheKey);
      if (fallbackCache) {
        return { success: true, item: fallbackCache, source: 'cache-fallback' };
      }
      // const fallbackCache = await redisService.get(cacheKey).catch(() => null);
      // if (fallbackCache) {
      //   return { success: true, item: fallbackCache, source: 'cache-fallback' };
      // }
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
        // await redisService.del(this.CACHE_KEYS.ITEM(itemId, this.currentCompanyId));
        return { success: true, item: result.data.item };
      }
      return result;
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async deleteItem(itemId) {
    const result = await this._request('DELETE', `/items/${itemId}`);
    if (result.success) {
      await this.clearItemsCache();
      this._clearCache(this.CACHE_KEYS.ITEM(itemId, this.currentCompanyId));
      // await redisService.del(this.CACHE_KEYS.ITEM(itemId, this.currentCompanyId));
      return { success: true, message: 'Item deleted from Zoho Books' };
    }
    return result;
  }

  async createEstimate(estimateData) {
    try {
      const token = await this.getValidAccessToken();
      let currencyId = estimateData.currency_id;
      
      if (!currencyId && estimateData.currency_code) {
        currencyId = await this._getCurrencyId(estimateData.currency_code);
      }
      
      const lineItems = estimateData.line_items.map(item => {
        const lineItem = {
          item_id: item.item_id,
          description: item.description || '',
          quantity: item.quantity,
          rate: item.rate,
          item_total: item.item_total,
          item_order: item.item_order
        };
        
        if (item.discount && item.discount > 0) {
          lineItem.discount = item.discount;
          lineItem.discount_amount = item.discount_amount || 0;
        }
        
        if (item.tax_id && item.tax_percentage > 0) {
          lineItem.tax_id = item.tax_id;
          lineItem.tax_percentage = item.tax_percentage;
          lineItem.tax_name = item.tax_name || 'VAT';
          lineItem.tax_type = 'tax';
        }
        
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
      
      if (estimateData.estimate_number) {
        payload.estimate_number = estimateData.estimate_number;
      }
      
      if (currencyId) {
        payload.currency_id = currencyId;
      }
      
      if (estimateData.tax_id && estimateData.tax_percentage > 0) {
        payload.tax_id = estimateData.tax_id;
      }
      
      const hasItemLevelDiscount = lineItems.some(item => item.discount && item.discount > 0);
      if (estimateData.discount && estimateData.discount > 0 && !hasItemLevelDiscount) {
        payload.discount = estimateData.discount;
        payload.is_discount_before_tax = false;
        payload.discount_type = 'entity_level';
      }
      
      if (estimateData.is_inclusive_tax !== undefined) {
        payload.is_inclusive_tax = estimateData.is_inclusive_tax;
      }
      
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
      console.log('📤 Sending estimate to Zoho:', JSON.stringify(cleanPayload, null, 2));
      
      const response = await axios.post(
        `${this.apiDomain}/estimates?organization_id=${this.organizationId}`,
        cleanPayload,
        {
          headers: {
            'Authorization': `Zoho-oauthtoken ${token}`,
            'Content-Type': 'application/json'
          },
          timeout: 30000
        }
      );
      
      if (response.data && response.data.estimate) {
        console.log('✅ Zoho estimate created successfully:', {
          estimateId: response.data.estimate.estimate_id,
          estimateNumber: response.data.estimate.estimate_number
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
      console.error('❌ Zoho estimate creation error:', {
        message: error.message,
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
    return JSON.parse(JSON.stringify(payload, (_, value) => 
      value === undefined || value === '' ? undefined : value
    ));
  }

  _buildAddress(data, prefix = '') {
    const address = {
      address: data[`${prefix}address`] || data.address,
      city: data[`${prefix}city`] || data.city,
      state: data[`${prefix}state`] || data.state,
      zip: data[`${prefix}zipCode`] || data.zipCode,
      country: data[`${prefix}country`] || data.country,
      phone: data[`${prefix}phone`] || data.phone
    };
    return Object.values(address).some(v => v) ? address : null;
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