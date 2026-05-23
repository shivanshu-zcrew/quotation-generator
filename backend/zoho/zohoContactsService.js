const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { Customer } = require('../models/customer');
const Company = require('../models/company');

class ZohoContactsService {
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
    
    // In-memory cache
    this.memoryCache = new Map();
    this.cacheTTL = 600000; // 10 minutes
    
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

  // Cache Helper Methods
  _getFromCache(key) {
    const cached = this.memoryCache.get(key);
    if (cached && cached.expiry > Date.now()) {
      return cached.data;
    }
    if (cached) this.memoryCache.delete(key);
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

  // Company Context
  setCompany(companyId, organizationId) {
    this.currentCompanyId = companyId;
    this.organizationId = organizationId;
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

  // Token Management
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
      const data = {
        accessToken: this.accessToken,
        tokenExpiry: this.tokenExpiry,
        updatedAt: Date.now()
      };
      const tempPath = `${this.tokenFilePath}.tmp`;
      await fs.promises.writeFile(tempPath, JSON.stringify(data, null, 2));
      await fs.promises.rename(tempPath, this.tokenFilePath);
    } catch (error) {
      // Silent fail
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
      const response = await axios.post(
        'https://accounts.zoho.com/oauth/v2/token',
        params,
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 10000 }
      );
      if (response.data && response.data.access_token) {
        this.accessToken = response.data.access_token;
        const expiresIn = parseInt(response.data.expires_in, 10);
        this.tokenExpiry = Date.now() + (expiresIn * 1000);
        await this._saveToken();
        return this.accessToken;
      }
      throw new Error('Invalid response from Zoho: missing access_token');
    } catch (error) {
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
      if (this.currencyCache && this.currencyCacheExpiry && Date.now() < this.currencyCacheExpiry) {
        return this.currencyCache[currencyCode];
      }
      
      const result = await this._request('GET', '/settings/currencies');
      if (result.success && result.data?.currencies) {
        const currencyMap = {};
        result.data.currencies.forEach(currency => {
          currencyMap[currency.currency_code] = currency.currency_id;
        });
        this.currencyCache = currencyMap;
        this.currencyCacheExpiry = Date.now() + 3600000;
        return currencyMap[currencyCode];
      }
      return null;
    } catch (error) {
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

  _cleanPayload(payload) {
    return JSON.parse(JSON.stringify(payload, (_, value) => 
      value === undefined || value === '' ? undefined : value
    ));
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
    
    Object.keys(address).forEach(key => {
      if (!address[key] || address[key].toString().trim() === '') {
        delete address[key];
      }
    });
    
    return Object.keys(address).length > 0 ? address : null;
  }

  // Contact CRUD Operations
  async getAllCustomersPaginated(companyId, lastSyncDate = null) {
    const allCustomers = [];
    const uniqueCustomers = new Map();
    let page = 1;
    const perPage = 200;
    let hasMorePages = true;
    
    console.log(`\n🔍 Starting customer fetch for company ${companyId}`);
    console.log(`📅 Mode: ${lastSyncDate ? 'INCREMENTAL' : 'FULL SYNC'}`);
    
    while (hasMorePages && page <= 50) {
      try {
        let url = `/contacts?page=${page}&per_page=${perPage}&filter_by=Status.All`;
        
        if (lastSyncDate) {
          url += `&last_modified_time=after.${lastSyncDate}`;
          console.log(`📡 Fetching page ${page} (modified after ${lastSyncDate})...`);
        } else {
          console.log(`📡 Fetching page ${page} (ALL customers)...`);
        }
        
        const result = await this._request('GET', url);
        
        if (result.success && result.data?.contacts) {
          const contacts = result.data.contacts;
          const pageContext = result.data.page_context || {};
          const customers = contacts.filter(contact => contact.contact_type === 'customer');
          
          console.log(`📥 Page ${page}: ${contacts.length} total contacts, ${customers.length} customers`);
          
          for (const customer of customers) {
            if (!uniqueCustomers.has(customer.contact_id)) {
              uniqueCustomers.set(customer.contact_id, customer);
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
        console.error(`❌ Error fetching page ${page}:`, error.message);
        hasMorePages = false;
      }
    }
    
    console.log(`\n📊 FINAL RESULT: ${uniqueCustomers.size} unique customers`);
    
    return { 
      success: true, 
      customers: Array.from(uniqueCustomers.values()),
      totalUnique: uniqueCustomers.size
    };
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
        
        if (!contact.contact_persons) {
          contact.contact_persons = [];
        } else {
          console.log(`   ✅ Retrieved ${contact.contact_persons.length} contact persons`);
        }
        
        this._setToCache(cacheKey, contact, contact.contact_persons?.length > 0 ? 300 : 60);
        return { success: true, contact, source: 'api' };
      }
      return result;
    } catch (error) {
      const fallbackCache = this._getFromCache(cacheKey);
      if (fallbackCache && fallbackCache.contact_persons) {
        return { success: true, contact: fallbackCache, source: 'cache-fallback' };
      }
      return { success: false, error: error.message };
    }
  }

  async createContact(customerData) {
    const { 
      taxTreatment, placeOfSupply, uaeEmirate, taxRegistrationNumber, 
      currencyCode, contactPersons, address, city, state, zipcode, phone, street2, attention
    } = customerData;
    
    let effectivePlaceOfSupply = placeOfSupply;
    if (taxTreatment === 'vat_registered' && uaeEmirate) {
      effectivePlaceOfSupply = uaeEmirate;
    }
    
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
      const validContactPersons = contactPersons.filter(person => {
        const firstName = person.firstName || person.first_name;
        return firstName && firstName.trim();
      });
      
      if (validContactPersons.length > 0) {
        contactPayload.contact_persons = validContactPersons.map(person => ({
          salutation: (person.salutation || '').trim(),
          first_name: (person.firstName || person.first_name || '').trim(),
          last_name: (person.lastName || person.last_name || '').trim(),
          email: (person.email || '').trim(),
          phone: (person.workPhone || person.phone || '').trim(),
          mobile: (person.mobile || '').trim(),
          designation: (person.designation || '').trim(),
          department: (person.department || '').trim(),
          is_primary_contact: person.isPrimaryContact === true,
          notes: (person.notes || '').trim()
        }));
      }
    }
    
    const billingAddress = this._buildAddress({ address, street2, city, state, zipcode, phone, attention, country: 'United Arab Emirates' });
    if (billingAddress && Object.keys(billingAddress).length > 0) {
      contactPayload.billing_address = billingAddress;
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
    const { 
      taxTreatment, placeOfSupply, uaeEmirate, taxRegistrationNumber, 
      currencyCode, contactPersons = [], address, city, state, zipcode, phone, street2, attention
    } = customerData;
  
    let effectivePlaceOfSupply = placeOfSupply;
    if (taxTreatment === 'vat_registered' && uaeEmirate) {
      effectivePlaceOfSupply = uaeEmirate;
    }
    
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
      contact_persons: uniqueContacts.map((p) => {
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
    if (billingAddress && Object.keys(billingAddress).length > 0) {
      contactPayload.billing_address = billingAddress;
    }
  
    if ((taxTreatment === 'vat_registered' || taxTreatment === 'gcc_vat_registered') && taxRegistrationNumber) {
      contactPayload.tax_reg_no = taxRegistrationNumber;
    }
  
    if (currencyCode) {
      const currencyId = await this._getCurrencyId(currencyCode);
      if (currencyId) contactPayload.currency_id = currencyId;
    }
  
    const result = await this._request('PUT', `/contacts/${contactId}`, this._cleanPayload(contactPayload));
  
    return {
      success: result.success,
      message: result.success ? 'Contact updated successfully' : (result.error || 'Zoho update failed'),
      contact: result.data?.contact || result.contact
    };
  }

  async deleteContact(contactId) {
    const result = await this._request('DELETE', `/contacts/${contactId}`);
    if (result.success) {
      await this.clearContactsCache();
      this._clearCache(this.CACHE_KEYS.CONTACT(contactId, this.currentCompanyId));
      return { success: true, message: 'Contact deleted from Zoho Books' };
    }
    return result;
  }

  async clearContactsCache() {
    const { companyId } = this.getCompanyContext();
    this._clearCache(this.CACHE_KEYS.ALL_CONTACTS(companyId));
    this._clearCachePattern(`zoho_contact_${companyId}:`);
  }
}

module.exports = ZohoContactsService;