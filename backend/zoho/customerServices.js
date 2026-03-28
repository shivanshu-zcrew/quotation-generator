const axios = require('axios');
const fs = require('fs');
const path = require('path');
const redisService = require('../config/redisService');
const SyncLogger = require('../utils/syncLogger');

class ZohoBooksService {
  constructor() {
    // Required environment variables validation
    const requiredEnvVars = [
      'ZOHO_CLIENT_ID',
      'ZOHO_CLIENT_SECRET',
      'ZOHO_REFRESH_TOKEN',
      'ZOHO_ORGANIZATION_ID'
    ];
    
    const missing = requiredEnvVars.filter(v => !process.env[v]);
    if (missing.length > 0) {
      throw new Error(`❌ Missing required Zoho environment variables: ${missing.join(', ')}`);
    }
    
    this.clientId = process.env.ZOHO_CLIENT_ID;
    this.clientSecret = process.env.ZOHO_CLIENT_SECRET;
    this.refreshToken = process.env.ZOHO_REFRESH_TOKEN;
    this.organizationId = process.env.ZOHO_ORGANIZATION_ID;
    this.apiDomain = 'https://www.zohoapis.com/books/v3';
    
    // Redis Cache Keys
    this.CACHE_KEYS = {
      ALL_ITEMS: 'zoho_items',
      ITEM: (id) => `zoho_item:${id}`,
      ALL_CONTACTS: 'zoho_contacts',
      CONTACT: (id) => `zoho_contact:${id}`,
      CURRENCIES: 'zoho_currencies'
    };
    
    // Token storage
    this.accessToken = null;
    this.tokenExpiry = null;
    this.tokenFilePath = path.join(__dirname, '../.zoho-token.json');
    
    // Currency cache
    this.currencyCache = null;
    this.currencyCacheExpiry = null;
    
    // Rate limiting
    this.lastRefreshAttempt = 0;
    this.minRefreshInterval = 60000;
    
    // Mappings
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

  // ====================== TOKEN MANAGEMENT ======================
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
      console.warn('⚠️ Could not load token file:', error.message);
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
      console.warn('⚠️ Could not save token file:', error.message);
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

  // ====================== CORE REQUEST METHOD ======================
  async _request(method, endpoint, data = null, retryCount = 0) {
    const MAX_RETRIES = 2;
    let abortController = null;
    let timeoutId = null;
    
    try {
      const token = await this.getValidAccessToken();
      
      const separator = endpoint.includes('?') ? '&' : '?';
      const url = `${this.apiDomain}${endpoint}${separator}organization_id=${this.organizationId}`;
      
       
      
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

  // ====================== CURRENCY METHODS ======================
  async _getCurrencyId(currencyCode) {
    try {
      if (this.currencyCache && this.currencyCacheExpiry && Date.now() < this.currencyCacheExpiry) {
        return this.currencyCache[currencyCode];
      }

      const cachedCurrencies = await redisService.get(this.CACHE_KEYS.CURRENCIES);
      if (cachedCurrencies) {
        this.currencyCache = cachedCurrencies;
        this.currencyCacheExpiry = Date.now() + 3600000;
        return cachedCurrencies[currencyCode];
      }

      const result = await this._request('GET', '/settings/currencies');
      
      if (result.success && result.data?.currencies) {
        const currencyMap = {};
        result.data.currencies.forEach(currency => {
          currencyMap[currency.currency_code] = currency.currency_id;
        });
        
        this.currencyCache = currencyMap;
        this.currencyCacheExpiry = Date.now() + 3600000;
        await redisService.set(this.CACHE_KEYS.CURRENCIES, currencyMap, 3600);
        
        return currencyMap[currencyCode];
      }
      
      return null;
    } catch (error) {
       
      return null;
    }
  }

  // ====================== TAX MAPPING ======================
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

  // ====================== CUSTOMER SYNC METHODS ======================
  async getAllCustomersPaginated() {
    const allCustomers = [];
    let page = 1;
    const perPage = 200;
    let hasMorePages = true;
    
    while (hasMorePages) {
      try {
         
        
        const result = await this._request('GET', 
          `/contacts?page=${page}&per_page=${perPage}&filter_by=Status.All`
        );
        
        if (result.success && result.data?.contacts) {
          const contacts = result.data.contacts;
          const customers = contacts.filter(contact => contact.contact_type === 'customer');
          allCustomers.push(...customers);
          
          const pageContext = result.data.page_context || {};
          hasMorePages = pageContext.has_more_page === true;
          
           
          
          if (hasMorePages) {
            page++;
            await new Promise(resolve => setTimeout(resolve, 400));
          }
        } else {
          hasMorePages = false;
        }
      } catch (error) {
         
        hasMorePages = false;
      }
    }
    
     
    return { success: true, customers: allCustomers };
  }

 
  async syncContactsToDatabase() {
    try {
       
  
      const { Customer } = require('../models/customer');
  
      const fetchResult = await this.getAllCustomersPaginated();
      if (!fetchResult.success) {
        throw new Error(fetchResult.error || 'Failed to fetch customers from Zoho');
      }
  
      const zohoCustomers = fetchResult.customers || [];
       
  
      if (!zohoCustomers.length) {
        return { success: true, message: 'No customers found in Zoho', total: 0 };
      }
  
      let created = 0;
      let updated = 0;
      let skippedNoEmail = 0;
      let skippedNoZohoId = 0;
      let skippedCurrencyError = 0;
  
      for (const zc of zohoCustomers) {
        // Validate Zoho ID exists
        if (!zc.contact_id) {
          console.warn(`⏭️ Skipping - No Zoho ID for: ${zc.contact_name || 'Unknown'}`);
          skippedNoZohoId++;
          continue;
        }
  
        const mapped = this._mapZohoContactToCustomer(zc);
        
        // Log currency warnings if any
        if (mapped.currencyWarning) {
           
        }
        
        // CRITICAL: Match ONLY by Zoho ID (allow duplicate emails)
        const existingCustomer = await Customer.findOne({ zohoId: mapped.zohoId });
        
        if (existingCustomer) {
          // UPDATE: Customer exists by Zoho ID
          try {
            await Customer.findOneAndUpdate(
              { zohoId: mapped.zohoId },
              {
                $set: {
                  ...mapped,
                  zohoSynced: true,
                  zohoSyncDate: new Date(),
                  zohoSyncError: null
                }
              },
              { new: true, runValidators: false } // Disable validators to avoid validation issues
            );
            updated++;
             
          } catch (updateError) {
             
            // Mark with error but continue
            await Customer.findOneAndUpdate(
              { zohoId: mapped.zohoId },
              {
                $set: {
                  zohoSynced: false,
                  zohoSyncDate: new Date(),
                  zohoSyncError: updateError.message
                }
              }
            );
          }
          
        } else {
          // CREATE: New customer with this Zoho ID
          const hasEmail = mapped.email && mapped.email.trim() !== '';
          
          if (!hasEmail) {
            console.warn(`⏭️ Skipping creation - No email for: ${mapped.name} (Zoho ID: ${mapped.zohoId})`);
            skippedNoEmail++;
            continue;
          }
          
          try {
            // Check if a customer with this email already exists (just for logging)
            const existingByEmail = await Customer.findOne({ email: mapped.email });
            if (existingByEmail) {
               
               
            }
            
            // Remove currencyWarning before saving to database
            const { currencyWarning, ...customerData } = mapped;
            
            await Customer.create({
              ...customerData,
              zohoSynced: true,
              zohoSyncDate: new Date(),
              zohoSyncError: null
            });
            created++;
             
            
          } catch (error) {
            if (error.code === 11000) {
               
            } else if (error.message.includes('defaultCurrency.code')) {
              console.warn(`⚠️ Currency validation error for ${mapped.name}: ${error.message}`);
              skippedCurrencyError++;
            } else {
               
            }
            // Don't throw error, continue with next customer
            continue;
          }
        }
      }
  
      // Verify that we have multiple customers with same email (for logging)
      const duplicateEmailStats = await Customer.aggregate([
        { $group: { _id: "$email", count: { $sum: 1 } } },
        { $match: { count: { $gt: 1 } } },
        { $sort: { count: -1 } }
      ]);
      
      if (duplicateEmailStats.length > 0) {
         
        duplicateEmailStats.slice(0, 5).forEach(stat => {
           
        });
      }
  
       
       
       
       
       
       
       
  
      return {
        success: true,
        total: zohoCustomers.length,
        created,
        updated,
        skippedNoEmail,
        skippedNoZohoId,
        skippedCurrencyError
      };
  
    } catch (error) {
       
      return { success: false, error: error.message };
    }
  }

  _mapZohoContactToCustomer(zohoContact) {
    // Tax treatment
    let taxTreatment = 'non_vat_registered';
    if (zohoContact.tax_treatment === 'vat_registered' || zohoContact.contact_category === 'vat_registered') {
      taxTreatment = 'vat_registered';
    } else if (zohoContact.tax_treatment === 'gcc_vat_registered' || zohoContact.gcc_vat_treatment === 'vat_registered') {
      taxTreatment = 'gcc_vat_registered';
    } else if (zohoContact.tax_treatment === 'gcc_vat_not_registered') {
      taxTreatment = 'gcc_non_vat_registered';
    }
  
    // Email & Phone with fallback
    let email = zohoContact.email || '';
    let phone = zohoContact.phone || '';
  
    if (!email && zohoContact.contact_persons && zohoContact.contact_persons.length > 0) {
      const primary = zohoContact.contact_persons.find(cp => cp.is_primary_contact) || zohoContact.contact_persons[0];
      email = primary.email || '';
      phone = primary.mobile || primary.phone || '';
    }
  
    // Validate and handle currency
    const currencyCode = zohoContact.currency_code || 'AED';
    const allowedCurrencies = ['AED', 'SAR', 'KWD', 'QAR', 'BHD', 'OMR', 'USD', 'EUR', 'GBP'];
    let finalCurrencyCode = currencyCode;
    let currencyWarning = null;
    
    // If currency is not in allowed list, default to AED
    if (!allowedCurrencies.includes(currencyCode)) {
      console.warn(`⚠️ Unsupported currency "${currencyCode}" for customer "${zohoContact.contact_name}". Defaulting to AED.`);
      finalCurrencyCode = 'AED';
      currencyWarning = `Currency "${currencyCode}" was not supported and has been defaulted to AED`;
    }
  
    return {
      name: (zohoContact.contact_name || 'Unnamed Customer').trim(),
      email: (email || '').toLowerCase().trim(),
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
      isActive: true,
      // Store the original currency if it was changed
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

  // ====================== CONTACT CRUD METHODS ======================
  async getAllContacts(params = {}) {
    const cacheKey = this.CACHE_KEYS.ALL_CONTACTS;
    const loadingFlagKey = `${cacheKey}:loading`;
    let isLoadingFlagSet = false;
    
    try {
      const cachedData = await redisService.get(cacheKey);
      if (cachedData) {
        return { success: true, contacts: cachedData, source: 'cache' };
      }

      const isAlreadyLoading = await redisService.get(loadingFlagKey);
      if (isAlreadyLoading) {
        await new Promise(r => setTimeout(r, 500));
        const retryCache = await redisService.get(cacheKey);
        if (retryCache) {
          return { success: true, contacts: retryCache, source: 'cache' };
        }
      }

      await redisService.set(loadingFlagKey, true, 30);
      isLoadingFlagSet = true;
      
      const queryString = new URLSearchParams(params).toString();
      const endpoint = `/contacts${queryString ? '?' + queryString : ''}`;
      
      const result = await this._request('GET', endpoint);
      
      if (result.success) {
        const contacts = result.data.contacts || [];
        await redisService.set(cacheKey, contacts, 600);
        return { success: true, contacts, source: 'api' };
      }
      
      return result;
    } catch (error) {
      const fallbackCache = await redisService.get(cacheKey).catch(() => null);
      if (fallbackCache) {
        return { success: true, contacts: fallbackCache, source: 'cache-fallback' };
      }
      return { success: false, error: error.message };
    } finally {
      if (isLoadingFlagSet) {
        await redisService.del(loadingFlagKey).catch(() => {});
      }
    }
  }

  async getContact(contactId) {
    const cacheKey = this.CACHE_KEYS.CONTACT(contactId);
    
    try {
      const cachedData = await redisService.get(cacheKey);
      if (cachedData) {
        return { success: true, contact: cachedData, source: 'cache' };
      }

      const result = await this._request('GET', `/contacts/${contactId}`);
      
      if (result.success && result.data?.contact) {
        const contact = result.data.contact;
        await redisService.set(cacheKey, contact, 600);
        return { success: true, contact, source: 'api' };
      }
      
      return result;
    } catch (error) {
      const fallbackCache = await redisService.get(cacheKey).catch(() => null);
      if (fallbackCache) {
        return { success: true, contact: fallbackCache, source: 'cache-fallback' };
      }
      return { success: false, error: error.message };
    }
  }

  async searchContactByEmail(email) {
    try {
       
      
      const result = await this.getAllContacts({ email: email });
      
      if (result.success && result.contacts && result.contacts.length > 0) {
         
        return {
          success: true,
          contacts: result.contacts
        };
      }
      
       
      return {
        success: true,
        contacts: []
      };
    } catch (error) {
       
      return {
        success: false,
        error: error.message,
        contacts: []
      };
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
      company_name: customerData.companyName || customerData.name,
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
      await redisService.del(this.CACHE_KEYS.CONTACT(contactId));
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
      await redisService.del(this.CACHE_KEYS.CONTACT(contactId));
      return { success: true, message: 'Contact deleted from Zoho Books' };
    }
    return result;
  }

  async clearContactsCache() {
    await Promise.all([
      redisService.del(this.CACHE_KEYS.ALL_CONTACTS),
      redisService.delPattern('zoho_contact:*')
    ]);
     
  }

  // ====================== ITEM METHODS ======================
  async getAllItems(params = {}) {
    const cacheKey = this.CACHE_KEYS.ALL_ITEMS;
    const loadingFlagKey = `${cacheKey}:loading`;
    let isLoadingFlagSet = false;
    
    try {
      const cachedData = await redisService.get(cacheKey);
      if (cachedData) {
        return { success: true, items: cachedData, source: 'cache' };
      }
  
      const isAlreadyLoading = await redisService.get(loadingFlagKey);
      if (isAlreadyLoading) {
        await new Promise(r => setTimeout(r, 500));
        const retryCache = await redisService.get(cacheKey);
        if (retryCache) {
          return { success: true, items: retryCache, source: 'cache' };
        }
      }
  
      await redisService.set(loadingFlagKey, true, 60);
      isLoadingFlagSet = true;
      
      let allItems = [];
      let currentPage = 1;
      let hasMorePages = true;
      
      const token = await this.getValidAccessToken();
      
      while (hasMorePages) {
        const url = `${this.apiDomain}/items?organization_id=${this.organizationId}&page=${currentPage}&filter_by=Status.All`;
        
        try {
          const response = await axios.get(url, {
            headers: { 'Authorization': `Zoho-oauthtoken ${token}` },
            timeout: 30000
          });
          
          if (response.data && response.data.items) {
            const items = response.data.items;
            const pageContext = response.data.page_context || {};
            
            allItems = [...allItems, ...items];
            hasMorePages = pageContext.has_more_page === true;
            if (hasMorePages) {
              currentPage++;
              await new Promise(resolve => setTimeout(resolve, 200));
            }
          } else {
            hasMorePages = false;
          }
        } catch (error) {
          if (currentPage === 1) throw error;
          hasMorePages = false;
        }
      }
      
      if (allItems.length > 0) {
        await redisService.set(cacheKey, allItems, 600);
      }
      
      return { success: true, items: allItems, total: allItems.length, source: 'api' };
      
    } catch (error) {
      const fallbackCache = await redisService.get(cacheKey).catch(() => null);
      if (fallbackCache) {
        return { success: true, items: fallbackCache, source: 'cache-fallback' };
      }
      return { success: false, error: error.message };
    } finally {
      if (isLoadingFlagSet) {
        await redisService.del(loadingFlagKey).catch(() => {});
      }
    }
  }

  async getItem(itemId) {
    const cacheKey = this.CACHE_KEYS.ITEM(itemId);
    
    try {
      const cachedData = await redisService.get(cacheKey);
      if (cachedData) {
        return { success: true, item: cachedData, source: 'cache' };
      }

      const result = await this._request('GET', `/items/${itemId}`);
      
      if (result.success && result.data?.item) {
        await redisService.set(cacheKey, result.data.item, 600);
        return { success: true, item: result.data.item, source: 'api' };
      }
      
      return result;
    } catch (error) {
      const fallbackCache = await redisService.get(cacheKey).catch(() => null);
      if (fallbackCache) {
        return { success: true, item: fallbackCache, source: 'cache-fallback' };
      }
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
        await redisService.del(this.CACHE_KEYS.ITEM(itemId));
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
      await redisService.del(this.CACHE_KEYS.ITEM(itemId));
      return { success: true, message: 'Item deleted from Zoho Books' };
    }
    return result;
  }

  async clearItemsCache() {
    await Promise.all([
      redisService.del(this.CACHE_KEYS.ALL_ITEMS),
      redisService.delPattern('zoho_item:*')
    ]);
     
  }

  // ====================== ESTIMATE METHOD ======================
  async createEstimate(estimateData) {
    try {
       
      
      const token = await this.getValidAccessToken();
      
      const payload = {
        customer_id: estimateData.customer_id,
        estimate_number: estimateData.estimate_number,
        date: estimateData.date,
        expiry_date: estimateData.expiry_date,
        line_items: estimateData.line_items,
        notes: estimateData.notes || '',
        terms: estimateData.terms || '',
        reference_number: estimateData.reference_number,
        exchange_rate: estimateData.exchange_rate || 1,
        price_precision: estimateData.price_precision || 2,
        tax_treatment: estimateData.tax_treatment || 'vat_not_registered',
        place_of_supply: estimateData.place_of_supply || 'AE',
        currency_id: estimateData.currency_id,
        template_id: estimateData.template_id,
        salesperson_name: estimateData.salesperson_name,
        custom_body: estimateData.custom_body || '',
        custom_subject: estimateData.custom_subject || ''
      };
      
      // Add optional fields
      if (estimateData.contact_persons_associated) payload.contact_persons_associated = estimateData.contact_persons_associated;
      if (estimateData.custom_fields) payload.custom_fields = estimateData.custom_fields;
      if (estimateData.shipping_charge) payload.shipping_charge = estimateData.shipping_charge;
      if (estimateData.adjustment) payload.adjustment = estimateData.adjustment;
      if (estimateData.adjustment_description) payload.adjustment_description = estimateData.adjustment_description;
      if (estimateData.tags && estimateData.tags.length > 0) payload.tags = estimateData.tags;

      const cleanPayload = this._cleanPayload(payload);
      
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
         
        return {
          success: true,
          estimateId: response.data.estimate.estimate_id,
          estimateNumber: response.data.estimate.estimate_number,
          estimate: response.data.estimate
        };
      }
      
      throw new Error('Invalid response from Zoho');
      
    } catch (error) {
       
      return {
        success: false,
        error: error.response?.data?.message || error.message,
        details: error.response?.data
      };
    }
  }

  // ====================== HELPER METHODS ======================
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