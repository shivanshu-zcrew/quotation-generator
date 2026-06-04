const axios = require('axios');
const fs = require('fs');
const path = require('path');
const logger = require('../config/logger');
const { Customer } = require('../models/customer');
const { Item } = require('../models/items');
const Company = require('../models/company');

// ─────────────────────────────────────────────────────────────────────────
// SHARED CANCELLATION REGISTRY (keyed by companyId)
// ─────────────────────────────────────────────────────────────────────────
const customerSyncCancelMap = new Map();

// ─────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────
const REQUEST_TIMEOUT_MS = 30000;
const TOKEN_REFRESH_TIMEOUT_MS = 10000;
const MAX_REQUEST_RETRIES = 3;
const MAX_PAGES_SAFETY = 1000;        // was 50 (10k cap) — now ~200k records
const PER_PAGE = 200;
const PAGE_DELAY_MS = 400;
const BATCH_SIZE = 10;
const BATCH_DELAY_MS = 500;
const TOKEN_EXPIRY_BUFFER_MS = 5 * 60 * 1000;

// ─────────────────────────────────────────────────────────────────────────
// SCOPED CLIENT
// Returned by setCompany(). Carries its OWN companyId/organizationId so that
// concurrent syncs for different companies can never clobber each other.
// Delegates token + low-level HTTP to the shared ZohoBooksService instance,
// but always passes its own organizationId explicitly.
// ─────────────────────────────────────────────────────────────────────────
class ScopedZohoClient {
  constructor(service, companyId, organizationId) {
    if (!companyId || !organizationId) {
      throw new Error('ScopedZohoClient requires both companyId and organizationId');
    }
    this._service = service;
    this.companyId = String(companyId);
    this.organizationId = String(organizationId);
  }

  getCompanyContext() {
    return { companyId: this.companyId, organizationId: this.organizationId };
  }

  // Low-level request bound to THIS scope's organizationId
  _request(method, endpoint, data = null) {
    return this._service._request(method, endpoint, data, this.organizationId);
  }

  // ---- cache helpers (delegate; keys already namespaced by companyId) ----
  _getFromCache(key) { return this._service._getFromCache(key); }
  _setToCache(key, data, ttl) { return this._service._setToCache(key, data, ttl); }
  _clearCache(key) { return this._service._clearCache(key); }
  _clearCachePattern(p) { return this._service._clearCachePattern(p); }
  get CACHE_KEYS() { return this._service.CACHE_KEYS; }

  // ---- delegate pure mappers to the shared service ----
  _mapTaxTreatmentToZoho(t) { return this._service._mapTaxTreatmentToZoho(t); }
  _getPlaceOfSupplyData(t, p) { return this._service._getPlaceOfSupplyData(t, p); }
  _mapTaxTreatment(c) { return this._service._mapTaxTreatment(c); }
  _buildCurrencyObject(c) { return this._service._buildCurrencyObject(c); }
  _mapContactPersons(c) { return this._service._mapContactPersons(c); }
  _createDefaultContact(c) { return this._service._createDefaultContact(c); }
  _ensurePrimaryContact(c) { return this._service._ensurePrimaryContact(c); }
  _mergeContactPersons(a, b) { return this._service._mergeContactPersons(a, b); }
  _hasCustomerChanged(a, b, c) { return this._service._hasCustomerChanged(a, b, c); }
  _extractPrimaryEmail(c) { return this._service._extractPrimaryEmail(c); }
  _extractPrimaryPhone(c) { return this._service._extractPrimaryPhone(c); }
  _mapZohoContactToCustomer(c) { return this._service._mapZohoContactToCustomer(c); }
  _getPlaceOfSupplyFromZoho(c) { return this._service._getPlaceOfSupplyFromZoho(c); }
  _getCurrencySymbol(c) { return this._service._getCurrencySymbol(c); }
  _getCurrencyName(c) { return this._service._getCurrencyName(c); }
  _mapZohoItemToItem(i) { return this._service._mapZohoItemToItem(i); }
  _hasItemChanged(a, b) { return this._service._hasItemChanged(a, b); }
  _cleanPayload(p) { return this._service._cleanPayload(p); }
  _buildAddress(d, prefix) { return this._service._buildAddress(d, prefix); }
  _getCurrencyId(code) { return this._service._getCurrencyId(code, this.organizationId); }

  // ───────────────────────────── CONTACTS ─────────────────────────────
  async getContact(contactId, bypassCache = false) {
    const cacheKey = this.CACHE_KEYS.CONTACT(contactId, this.companyId);
    try {
      if (!bypassCache) {
        const cached = this._getFromCache(cacheKey);
        if (cached && Array.isArray(cached.contact_persons)) {
          return { success: true, contact: cached, source: 'cache' };
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
      const fallback = this._getFromCache(cacheKey);
      if (fallback && Array.isArray(fallback.contact_persons)) {
        return { success: true, contact: fallback, source: 'cache-fallback' };
      }
      logger.error(`Error fetching contact ${contactId}: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  async getAllContacts(params = {}) {
    const cacheKey = this.CACHE_KEYS.ALL_CONTACTS(this.companyId);
    try {
      const bypassCache = params.bypassCache === true;
      if (!bypassCache) {
        const cached = this._getFromCache(cacheKey);
        if (cached) return { success: true, contacts: cached, source: 'cache' };
      }
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
      const fallback = this._getFromCache(cacheKey);
      if (fallback) return { success: true, contacts: fallback, source: 'cache-fallback' };
      logger.error(`Error fetching contacts: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  async getAllCustomersPaginated(lastSyncDate = null) {
    const uniqueCustomers = new Map();
    let page = 1;
    let hasMorePages = true;
    let totalWithDuplicates = 0;

    logger.info(`Starting customer fetch for company ${this.companyId}`, {
      companyId: this.companyId, mode: lastSyncDate ? 'INCREMENTAL' : 'FULL SYNC'
    });

    while (hasMorePages && page <= MAX_PAGES_SAFETY) {
      let url = `/contacts?page=${page}&per_page=${PER_PAGE}&filter_by=Status.All`;
      if (lastSyncDate) url += `&last_modified_time=after.${lastSyncDate}`;

      const result = await this._request('GET', url);

      if (result.success && result.data?.contacts) {
        const customers = result.data.contacts.filter(c => c.contact_type === 'customer');
        for (const c of customers) {
          if (!uniqueCustomers.has(c.contact_id)) uniqueCustomers.set(c.contact_id, c);
        }
        totalWithDuplicates += customers.length;
        hasMorePages = result.data.page_context?.has_more_page === true;
        if (hasMorePages) { page++; await sleep(PAGE_DELAY_MS); }
      } else {
        // A failed page mid-pagination: surface it instead of silently truncating
        if (page === 1) {
          return { success: false, error: result.error || 'Failed to fetch contacts from Zoho' };
        }
        logger.warn(`Stopping pagination early at page ${page}: ${result.error || 'no contacts'}`, { companyId: this.companyId });
        hasMorePages = false;
      }
    }

    if (page > MAX_PAGES_SAFETY) {
      logger.warn(`Hit MAX_PAGES_SAFETY (${MAX_PAGES_SAFETY}) for company ${this.companyId} — result may be truncated`);
    }

    logger.info(`Customer fetch completed for company ${this.companyId}`, {
      companyId: this.companyId, totalUnique: uniqueCustomers.size, totalWithDuplicates
    });

    return { success: true, customers: Array.from(uniqueCustomers.values()), totalUnique: uniqueCustomers.size, totalWithDuplicates };
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

    if (Array.isArray(contactPersons) && contactPersons.length > 0) {
      const valid = contactPersons.filter(p => p.firstName && p.firstName.trim());
      if (valid.length > 0) contactPayload.contact_persons = valid.map(mapContactPersonToZoho);
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

    const result = await this._request('POST', '/contacts', this._cleanPayload(contactPayload));
    if (result.success && result.data?.contact) {
      await this.clearContactsCache();
      logger.info(`Contact created in Zoho: ${customerData.name}`, { contactId: result.data.contact.contact_id, companyId: this.companyId });
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
      const email = (p.email || '').trim().toLowerCase();
      const key1 = email ? `email:${email}` : null;
      const key2 = `${(p.firstName || '').trim().toLowerCase()}-${(p.mobile || p.workPhone || '').trim()}`;
      if ((key1 && seen.has(key1)) || seen.has(key2)) continue;
      if (key1) seen.add(key1);
      seen.add(key2);
      uniqueContacts.push(p);
    }

    const contactPayload = {
      contact_name: customerData.name,
      company_name: customerData.companyName || customerData.name,
      contact_type: 'customer',
      tax_treatment: this._mapTaxTreatmentToZoho(taxTreatment) || 'vat_not_registered',
      country_code: countryCode,
      place_of_contact: placeOfSupplyCode,
      contact_persons: uniqueContacts.map(mapContactPersonToZoho)
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
      logger.info(`Contact updated in Zoho: ${customerData.name}`, { contactId, companyId: this.companyId });
    } else {
      logger.error(`Failed to update contact in Zoho: ${result.error}`, { contactId, customerName: customerData.name });
    }
    return { success: result.success, message: result.success ? 'Contact updated successfully' : (result.error || 'Zoho update failed'), contact: result.data?.contact || result.contact, error: result.success ? undefined : result.error };
  }

  async deleteContact(contactId) {
    const result = await this._request('DELETE', `/contacts/${contactId}`);
    if (result.success) {
      await this.clearContactsCache();
      this._clearCache(this.CACHE_KEYS.CONTACT(contactId, this.companyId));
      logger.info(`Contact deleted from Zoho: ${contactId}`, { contactId, companyId: this.companyId });
      return { success: true, message: 'Contact deleted from Zoho Books' };
    }
    logger.error(`Failed to delete contact from Zoho: ${result.error}`, { contactId });
    return result;
  }

  async markContactInactive(contactId) {
    const result = await this._request('POST', `/contacts/${contactId}/inactive`);
    if (result.success) {
      this._clearCache(this.CACHE_KEYS.CONTACT(contactId, this.companyId));
      await this.clearContactsCache();
      logger.info(`Contact marked inactive in Zoho: ${contactId}`, { contactId, companyId: this.companyId });
      return { success: true, message: 'Contact marked inactive in Zoho Books' };
    }
    logger.error(`Failed to mark contact inactive in Zoho: ${result.error}`, { contactId });
    return { success: false, error: result.error, details: result.details };
  }

  async clearContactsCache() {
    this._clearCache(this.CACHE_KEYS.ALL_CONTACTS(this.companyId));
    this._clearCachePattern(`zoho_contact_${this.companyId}_`);
  }

  async clearItemsCache() {
    this._clearCache(this.CACHE_KEYS.ALL_ITEMS(this.companyId));
    this._clearCachePattern(`zoho_item_${this.companyId}_`);
  }

  async getContactRaw(contactId) { return this.getContact(contactId, true); }

  // ───────────────────────── SYNC (the big one) ─────────────────────────
  async syncContactsToDatabase(company, incremental = true, syncJobId = null, onProgress = null, cancelToken = null) {
    const startTime = Date.now();
    const companyIdStr = String(company._id);

    // Normalize the cancellation interface — accept either the legacy
    // companyId string OR an object exposing isCancelRequested().
    const isCancelled = () => {
      if (cancelToken && typeof cancelToken.isCancelRequested === 'function') {
        return cancelToken.isCancelRequested() === true;
      }
      return customerSyncCancelMap.get(companyIdStr) === true;
    };

    try {
      logger.info(`Starting customer sync for company: ${company.name} (${company.code})`, {
        companyId: companyIdStr, companyCode: company.code, mode: incremental ? 'INCREMENTAL' : 'FULL SYNC'
      });

      if (onProgress) onProgress({ stage: 'starting', message: 'Starting customer sync...', fetched: 0, total: 0, startTime });

      await this.clearContactsCache();

      // Determine incremental cursor
      let lastSyncDate = null;
      if (incremental) {
        const lastSynced = await Customer.findOne({
          companyId: company._id, zohoSyncDate: { $ne: null }, zohoSynced: true
        }).sort({ zohoSyncDate: -1 }).select('zohoSyncDate').lean();
        if (lastSynced?.zohoSyncDate) {
          const d = new Date(lastSynced.zohoSyncDate);
          d.setHours(d.getHours() - 1);
          lastSyncDate = d.toISOString().split('T')[0];
        } else {
          const d = new Date();
          d.setDate(d.getDate() - 90);
          lastSyncDate = d.toISOString().split('T')[0];
        }
      }

      if (onProgress) onProgress({ stage: 'fetching', message: 'Fetching customers from Zoho...', fetched: 0, total: 0, startTime });

      const fetchResult = await this.getAllCustomersPaginated(lastSyncDate);
      if (!fetchResult.success) throw new Error(fetchResult.error || 'Failed to fetch customers from Zoho');

      const zohoCustomers = fetchResult.customers || [];
      if (zohoCustomers.length === 0) {
        if (onProgress) onProgress({ stage: 'completed', message: 'No customers found to sync', fetched: 0, total: 0 });
        return { success: true, message: 'No customers found to sync', totalFromZoho: 0, created: 0, updated: 0, unchanged: 0, errors: 0 };
      }

      let created = 0, updated = 0, unchanged = 0, errors = 0, totalContactPersons = 0;
      const failedRecords = [];
      const total = zohoCustomers.length;

      if (onProgress) onProgress({ stage: 'processing', message: `Processing ${total} customers...`, fetched: 0, total, startTime });

      for (let i = 0; i < total; i += BATCH_SIZE) {
        if (isCancelled()) {
          logger.info(`Customer sync cancelled by user for company ${companyIdStr}`);
          if (onProgress) onProgress({ stage: 'cancelled', message: 'Sync was cancelled by user', fetched: Math.min(i, total), total, startTime });
          customerSyncCancelMap.delete(companyIdStr);
          return { success: false, message: 'Sync cancelled by user', cancelled: true, created, updated, unchanged, errors };
        }

        const batch = zohoCustomers.slice(i, i + BATCH_SIZE);
        const results = await Promise.all(batch.map(async (zc) => {
          if (isCancelled()) return { action: 'cancelled' };
          try {
            // Use the list payload directly; only fetch full detail when the
            // list entry lacks contact_persons (avoids the N+1 fetch storm).
            let fullContact = zc;
            if (!Array.isArray(zc.contact_persons) || zc.contact_persons.length === 0) {
              const detail = await this.getContact(zc.contact_id, true);
              if (detail.success && detail.contact) fullContact = detail.contact;
            }
            return await this.processCustomerRecord(company._id, zc, fullContact);
          } catch (err) {
            logger.error(`Error processing customer ${zc.contact_name || zc.contact_id}: ${err.message}`);
            return { action: 'error', error: err.message, zohoId: zc.contact_id, name: zc.contact_name };
          }
        }));

        for (const r of results) {
          if (r.action === 'cancelled') {
            customerSyncCancelMap.delete(companyIdStr);
            return { success: false, message: 'Sync cancelled by user', cancelled: true, created, updated, unchanged, errors };
          }
          if (r.action === 'created') created++;
          else if (r.action === 'updated') updated++;
          else if (r.action === 'unchanged') unchanged++;
          if (r.action === 'error') {
            errors++;
            failedRecords.push({ zohoId: r.zohoId, name: r.name, error: r.error });
          }
          if (r.contactPersonsCount) totalContactPersons += r.contactPersonsCount;
        }

        const processed = Math.min(i + BATCH_SIZE, total);
        if (onProgress) onProgress({ stage: 'processing', message: `Processing ${processed}/${total} customers...`, fetched: processed, total, created, updated, unchanged, errors, startTime });

        if (i + BATCH_SIZE < total) await sleep(BATCH_DELAY_MS);
      }

      const duration = `${((Date.now() - startTime) / 1000).toFixed(2)}s`;

      if (onProgress) onProgress({ stage: 'completed', message: `Sync completed! ${created} created, ${updated} updated, ${unchanged} unchanged`, fetched: total, total, created, updated, unchanged, errors, duration, startTime });

      await this.clearContactsCache();

      logger.info(`Customer sync completed for ${company.code}: Created ${created}, Updated ${updated}, Unchanged ${unchanged}, Errors ${errors}, Duration ${duration}`, {
        companyId: companyIdStr, companyCode: company.code, created, updated, unchanged, errors, totalContactPersons, duration,
        syncType: incremental ? 'incremental' : 'full',
        failedRecords: failedRecords.slice(0, 20)
      });

      return {
        success: true, totalFromZoho: total, created, updated, unchanged, errors, totalContactPersons, duration,
        failedRecords, lastSyncDate: new Date().toISOString(), syncType: incremental ? 'incremental' : 'full'
      };
    } catch (error) {
      logger.error(`Customer sync error for ${company?.code}: ${error.message}`, { companyId: companyIdStr, error: error.message, stack: error.stack });
      if (onProgress) onProgress({ stage: 'error', message: `Sync failed: ${error.message}`, error: error.message, startTime });
      return { success: false, error: error.message };
    } finally {
      // Always clear the cancellation flag for this company so a stale `true`
      // can never auto-cancel the next sync.
      customerSyncCancelMap.delete(companyIdStr);
    }
  }

  async processCustomerRecord(companyId, zc, fullContact = null) {
    try {
      let contactData = fullContact || zc;
      if (!contactData.contact_persons) contactData.contact_persons = [];

      const mapped = {
        name: (contactData.contact_name || 'Unnamed Customer').trim().toUpperCase(),
        email: this._extractPrimaryEmail(contactData),
        phone: this._extractPrimaryPhone(contactData),
        address: contactData.billing_address?.address || '',
        city: contactData.billing_address?.city || '',
        state: contactData.billing_address?.state || '',
        zipcode: contactData.billing_address?.zip || '', // FIX: was `zip` (schema field is zipcode)
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
        companyId,
        zohoSynced: true,
        zohoSyncDate: new Date(),
        zohoSyncError: null
      };

      const contactPersons = this._mapContactPersons(contactData.contact_persons);
      if (contactPersons.length === 0 && mapped.name) contactPersons.push(this._createDefaultContact(mapped));
      this._ensurePrimaryContact(contactPersons);
      mapped.contactPersons = contactPersons;

      const existing = await Customer.findOne({ companyId, zohoId: mapped.zohoId });

      if (!existing) {
        await new Customer(mapped).save({ validateBeforeSave: false });
        return { action: 'created', contactPersonsCount: contactPersons.length };
      }

      const merged = this._mergeContactPersons(existing.contactPersons || [], contactPersons);
      if (!this._hasCustomerChanged(existing, mapped, merged)) {
        await Customer.updateOne({ _id: existing._id }, { $set: { zohoSynced: true, zohoSyncDate: new Date(), zohoSyncError: null } });
        return { action: 'unchanged', contactPersonsCount: contactPersons.length };
      }

      await Customer.updateOne({ _id: existing._id }, { $set: { ...mapped, contactPersons: merged, zohoData: contactData } }, { runValidators: false });
      return { action: 'updated', contactPersonsCount: contactPersons.length };
    } catch (error) {
      logger.error(`Error processing customer record: ${error.message}`);
      return { action: 'error', error: error.message, zohoId: zc?.contact_id, name: zc?.contact_name, contactPersonsCount: 0 };
    }
  }

  // ───────────────────────────── ITEMS ─────────────────────────────
  async getAllItemsPaginated(lastSyncDate = null) {
    const allItems = [];
    let page = 1;
    let hasMorePages = true;
    while (hasMorePages && page <= MAX_PAGES_SAFETY) {
      let url = `/items?page=${page}&per_page=${PER_PAGE}&filter_by=Status.All`;
      if (lastSyncDate) url += `&filter_by=Date.Modified.After.${lastSyncDate}`;
      const result = await this._request('GET', url);
      if (result.success && result.data?.items) {
        allItems.push(...result.data.items);
        hasMorePages = result.data.page_context?.has_more_page === true;
        if (hasMorePages) { page++; await sleep(200); }
      } else {
        if (page === 1) return { success: false, error: result.error || 'Failed to fetch items from Zoho' };
        hasMorePages = false;
      }
    }
    return { success: true, items: allItems };
  }

  async syncItemsToDatabase(company, incremental = true) {
    try {
      logger.info(`Starting item sync for company: ${company.name} (${company.code})`, { companyId: this.companyId });
      let lastSyncDate = null;
      if (incremental) {
        const last = await Item.findOne({ companyId: company._id, lastSyncedAt: { $ne: null } }).sort({ lastSyncedAt: -1 }).select('lastSyncedAt').lean();
        if (last?.lastSyncedAt) {
          const d = new Date(last.lastSyncedAt);
          d.setHours(d.getHours() - 1);
          lastSyncDate = d.toISOString().split('T')[0];
        }
      }
      const fetchResult = await this.getAllItemsPaginated(lastSyncDate);
      if (!fetchResult.success) throw new Error(fetchResult.error || 'Failed to fetch items from Zoho');

      const zohoItems = fetchResult.items || [];
      let created = 0, updated = 0, unchanged = 0;
      for (const zi of zohoItems) {
        if (!zi.item_id) continue;
        const mapped = this._mapZohoItemToItem(zi);
        mapped.companyId = company._id;
        const existing = await Item.findOne({ companyId: company._id, zohoId: mapped.zohoId });
        if (existing) {
          if (this._hasItemChanged(existing, mapped)) {
            await Item.findOneAndUpdate({ companyId: company._id, zohoId: mapped.zohoId }, { $set: { ...mapped, lastSyncedAt: new Date() } }, { new: true });
            updated++;
          } else unchanged++;
        } else {
          await Item.create({ ...mapped, lastSyncedAt: new Date() });
          created++;
        }
      }
      await this.clearItemsCache();
      logger.info(`Item sync completed for ${company.code}: Created ${created}, Updated ${updated}, Unchanged ${unchanged}`, { companyId: this.companyId, created, updated, unchanged, total: zohoItems.length });
      return { success: true, created, updated, unchanged, total: zohoItems.length };
    } catch (error) {
      logger.error(`Item sync error for ${company.code}: ${error.message}`, { companyId: this.companyId, error: error.message });
      return { success: false, error: error.message };
    }
  }

  async getAllItems(params = {}) {
    const cacheKey = this.CACHE_KEYS.ALL_ITEMS(this.companyId);
    try {
      const cached = this._getFromCache(cacheKey);
      if (cached && !params.forceRefresh) return { success: true, items: cached, source: 'cache', total: cached.length };
      let allItems = [];
      let page = 1;
      let hasMorePages = true;
      while (hasMorePages && page <= MAX_PAGES_SAFETY) {
        const result = await this._request('GET', `/items?page=${page}&per_page=${PER_PAGE}`);
        if (result.success && result.data) {
          let items = result.data.items || (result.data.item ? [result.data.item] : []);
          if (items.length > 0) {
            allItems = [...allItems, ...items];
            hasMorePages = result.data.page_context?.has_more_page === true;
            if (hasMorePages) { page++; await sleep(200); } else hasMorePages = false;
          } else hasMorePages = false;
        } else {
          if (page === 1) throw new Error(result.error || 'Failed to fetch items');
          hasMorePages = false;
        }
      }
      if (allItems.length > 0) this._setToCache(cacheKey, allItems, 600);
      return { success: true, items: allItems, total: allItems.length, source: 'api', pages: page };
    } catch (error) {
      const fallback = this._getFromCache(cacheKey);
      if (fallback) return { success: true, items: fallback, source: 'cache-fallback', total: fallback.length, warning: 'Using cached data - API unavailable' };
      logger.error(`Zoho Items API Error: ${error.message}`);
      return { success: false, error: error.message, items: [], total: 0 };
    }
  }

  async getItem(itemId) {
    const cacheKey = this.CACHE_KEYS.ITEM(itemId, this.companyId);
    try {
      const cached = this._getFromCache(cacheKey);
      if (cached) return { success: true, item: cached, source: 'cache' };
      const result = await this._request('GET', `/items/${itemId}`);
      if (result.success && result.data?.item) {
        this._setToCache(cacheKey, result.data.item, 600);
        return { success: true, item: result.data.item, source: 'api' };
      }
      return result;
    } catch (error) {
      const fallback = this._getFromCache(cacheKey);
      if (fallback) return { success: true, item: fallback, source: 'cache-fallback' };
      return { success: false, error: error.message };
    }
  }

  async createItem(itemData) {
    try {
      const payload = { name: itemData.name, rate: itemData.rate, description: itemData.description, sku: itemData.sku, unit: itemData.unit, product_type: itemData.product_type || 'goods' };
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
      const payload = { name: itemData.name, rate: itemData.rate, description: itemData.description, sku: itemData.sku, unit: itemData.unit, product_type: itemData.product_type };
      const result = await this._request('PUT', `/items/${itemId}`, this._cleanPayload(payload));
      if (result.success && result.data?.item) {
        await this.clearItemsCache();
        this._clearCache(this.CACHE_KEYS.ITEM(itemId, this.companyId));
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
      this._clearCache(this.CACHE_KEYS.ITEM(itemId, this.companyId));
      return { success: true, message: 'Item deleted from Zoho Books' };
    }
    return result;
  }

  async getContactForMapping(contactId) {
    const r = await this.getContact(contactId, true);
    return r;
  }

  _mapZohoContactToCustomerPublic(contact) { return this._mapZohoContactToCustomer(contact); }

  async createEstimate(estimateData) {
    return this._service._createEstimate(estimateData, this.organizationId);
  }
}

// Helper: map an internal contact-person shape to Zoho's payload shape
function mapContactPersonToZoho(p) {
  const obj = {
    salutation: (p.salutation || 'Mr.').trim(),
    first_name: (p.firstName || '').trim(),
    last_name: (p.lastName || '').trim(),
    phone: (p.workPhone || p.phone || '').trim(),
    mobile: (p.mobile || '').trim(),
    designation: (p.designation || '').trim(),
    department: (p.department || '').trim()
  };
  if (p.email && p.email.trim()) obj.email = p.email.trim().toLowerCase();
  if (p.isPrimaryContact === true) obj.is_primary_contact = true;
  if (p.zohoContactPersonId) obj.contact_person_id = p.zohoContactPersonId;
  return obj;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─────────────────────────────────────────────────────────────────────────
// SHARED SERVICE — token management + low-level HTTP + pure mappers.
// Holds NO per-request company state anymore.
// ─────────────────────────────────────────────────────────────────────────
class ZohoBooksService {
  constructor() {
    const required = ['ZOHO_CLIENT_ID', 'ZOHO_CLIENT_SECRET', 'ZOHO_REFRESH_TOKEN'];
    const missing = required.filter(v => !process.env[v]);
    if (missing.length > 0) throw new Error(`❌ Missing required Zoho environment variables: ${missing.join(', ')}`);

    this.clientId = process.env.ZOHO_CLIENT_ID;
    this.clientSecret = process.env.ZOHO_CLIENT_SECRET;
    this.refreshToken = process.env.ZOHO_REFRESH_TOKEN;
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

    // Single in-flight refresh promise shared by all callers (refresh mutex)
    this._refreshPromise = null;

    this.memoryCache = new Map();

    this.EMIRATE_CODE_MAP = { 'Abu Dhabi': 'AB', 'Ajman': 'AJ', 'Dubai': 'DU', 'Fujairah': 'FU', 'Ras al-Khaimah': 'RA', 'Sharjah': 'SH', 'Umm al-Quwain': 'UM' };
    this.COUNTRY_CODE_MAP = { 'Saudi Arabia': 'SA', 'Kuwait': 'KW', 'Qatar': 'QA', 'Bahrain': 'BH', 'Oman': 'OM' };

    // Legacy single-context fields (kept ONLY for backward-compat with any
    // caller that still does setCompany() then service.createContact()).
    this._legacyClient = null;

    this._loadToken();
  }

  // ── Public entry point. Returns a scoped client AND sets legacy context. ──
  setCompany(companyId, organizationId) {
    const client = new ScopedZohoClient(this, companyId, organizationId);
    this._legacyClient = client; // backward-compat for legacy call sites
    return client;
  }

  // ── CACHE ──
  _getFromCache(key) {
    const c = this.memoryCache.get(key);
    if (c && c.expiry > Date.now()) return c.data;
    if (c) this.memoryCache.delete(key);
    return null;
  }
  _setToCache(key, data, ttlSeconds = 600) { this.memoryCache.set(key, { data, expiry: Date.now() + ttlSeconds * 1000 }); }
  _clearCache(key) { this.memoryCache.delete(key); }
  _clearCachePattern(pattern) { for (const k of this.memoryCache.keys()) if (k.includes(pattern)) this.memoryCache.delete(k); }

  // ── TOKEN ──
  _loadToken() {
    try {
      if (fs.existsSync(this.tokenFilePath)) {
        const data = JSON.parse(fs.readFileSync(this.tokenFilePath, 'utf8'));
        if (!data.accessToken || !data.tokenExpiry) throw new Error('Invalid token file');
        this.accessToken = data.accessToken;
        this.tokenExpiry = parseInt(data.tokenExpiry, 10);
        if (isNaN(this.tokenExpiry)) throw new Error('Token expiry not a number');
      }
    } catch {
      this.accessToken = null;
      this.tokenExpiry = null;
    }
  }

  async _saveToken() {
    try {
      const data = { accessToken: this.accessToken, tokenExpiry: this.tokenExpiry, updatedAt: Date.now() };
      const tmp = `${this.tokenFilePath}.tmp`;
      await fs.promises.writeFile(tmp, JSON.stringify(data, null, 2));
      await fs.promises.rename(tmp, this.tokenFilePath);
    } catch (e) {
      logger.warn(`Could not save token file: ${e.message}`);
    }
  }

  _isTokenValid() {
    if (!this.accessToken || !this.tokenExpiry) return false;
    return Date.now() < (this.tokenExpiry - TOKEN_EXPIRY_BUFFER_MS);
  }

  // Token mutex: all concurrent callers await the SAME refresh promise instead
  // of stampeding Zoho. No more hard "rate limited" throw.
  async getValidAccessToken() {
    if (this._isTokenValid()) return this.accessToken;
    if (this._refreshPromise) return this._refreshPromise;

    this._refreshPromise = this._doRefresh()
      .finally(() => { this._refreshPromise = null; });
    return this._refreshPromise;
  }

  async _doRefresh() {
    try {
      const params = new URLSearchParams({
        refresh_token: this.refreshToken,
        client_id: this.clientId,
        client_secret: this.clientSecret,
        grant_type: 'refresh_token'
      });
      const response = await axios.post('https://accounts.zoho.com/oauth/v2/token', params, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: TOKEN_REFRESH_TIMEOUT_MS
      });
      if (response.data?.access_token) {
        this.accessToken = response.data.access_token;
        this.tokenExpiry = Date.now() + parseInt(response.data.expires_in, 10) * 1000;
        await this._saveToken();
        logger.info('Zoho access token refreshed successfully');
        return this.accessToken;
      }
      throw new Error('Invalid response from Zoho: missing access_token');
    } catch (error) {
      const msg = error.response?.data?.error_description || error.message;
      logger.error(`Zoho token refresh failed: ${msg}`);
      // If we still have a (possibly stale) token, let the request layer try it
      // and handle the 401 → it will trigger exactly one more refresh.
      if (this.accessToken) return this.accessToken;
      throw new Error(`Zoho token refresh failed: ${msg}`);
    }
  }

  // ── LOW-LEVEL REQUEST with retry/backoff. organizationId passed explicitly. ──
  async _request(method, endpoint, data = null, organizationId, retryCount = 0) {
    if (!organizationId) return { success: false, error: 'organizationId is required for Zoho request', status: 400 };

    let timeoutId = null;
    try {
      const token = await this.getValidAccessToken();
      const separator = endpoint.includes('?') ? '&' : '?';
      const url = `${this.apiDomain}${endpoint}${separator}organization_id=${organizationId}`;
      const controller = new AbortController();
      timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      const config = {
        method, url,
        headers: { 'Authorization': `Zoho-oauthtoken ${token}`, 'Content-Type': 'application/json' },
        signal: controller.signal
      };
      if (data) config.data = data;

      const response = await axios(config);
      clearTimeout(timeoutId);
      return { success: true, data: response.data };
    } catch (error) {
      if (timeoutId) clearTimeout(timeoutId);

      const status = error.response?.status;
      const isAbort = error.name === 'AbortError' || error.code === 'ERR_CANCELED';
      const zohoCode = error.response?.data?.code;

      // 401 → token invalid: clear and retry (one extra refresh)
      if (status === 401 && retryCount < MAX_REQUEST_RETRIES) {
        this.accessToken = null;
        this.tokenExpiry = null;
        return this._request(method, endpoint, data, organizationId, retryCount + 1);
      }

      // 429 (rate limit) or transient 5xx / network / timeout → backoff & retry
      const retryable = status === 429 || (status >= 500 && status < 600) || isAbort
        || error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT' || error.code === 'ENOTFOUND';
      if (retryable && retryCount < MAX_REQUEST_RETRIES) {
        const base = status === 429 ? 2000 : 1000;
        const delay = base * Math.pow(2, retryCount) + Math.floor(Math.random() * 300); // jitter
        logger.warn(`Zoho ${method} ${endpoint} ${status || error.code} — retry ${retryCount + 1}/${MAX_REQUEST_RETRIES} in ${delay}ms`);
        await sleep(delay);
        return this._request(method, endpoint, data, organizationId, retryCount + 1);
      }

      if (isAbort) return { success: false, error: 'Request timeout', status: 408 };
      return {
        success: false,
        error: error.response?.data?.message || error.message,
        code: zohoCode,
        details: error.response?.data,
        status
      };
    }
  }

  async _getCurrencyId(currencyCode, organizationId) {
    try {
      if (this.currencyCache && this.currencyCacheExpiry && Date.now() < this.currencyCacheExpiry) {
        return this.currencyCache[currencyCode];
      }
      const result = await this._request('GET', '/settings/currencies', null, organizationId);
      if (result.success && result.data?.currencies) {
        const map = {};
        result.data.currencies.forEach(c => { map[c.currency_code] = c.currency_id; });
        this.currencyCache = map;
        this.currencyCacheExpiry = Date.now() + 3600000;
        return map[currencyCode];
      }
      return null;
    } catch (e) {
      logger.warn(`Error fetching currency ID for ${currencyCode}: ${e.message}`);
      return null;
    }
  }

  // ───────────────────── PURE MAPPERS (no shared state) ─────────────────────
  _mapTaxTreatmentToZoho(t) {
    return ({ vat_registered: 'vat_registered', non_vat_registered: 'vat_not_registered', gcc_vat_registered: 'gcc_vat_registered', gcc_non_vat_registered: 'gcc_vat_not_registered' })[t] || 'vat_not_registered';
  }

  _getPlaceOfSupplyData(taxTreatment, placeOfSupply) {
    let countryCode, placeOfSupplyCode;
    const isUAE = this.EMIRATE_CODE_MAP[placeOfSupply] !== undefined;
    if (taxTreatment === 'vat_registered') {
      if (isUAE) { countryCode = 'AE'; placeOfSupplyCode = this.EMIRATE_CODE_MAP[placeOfSupply] || 'DU'; }
      else { countryCode = this.COUNTRY_CODE_MAP[placeOfSupply] || 'AE'; placeOfSupplyCode = countryCode; }
    } else if (taxTreatment === 'gcc_vat_registered') {
      const isGCC = this.COUNTRY_CODE_MAP[placeOfSupply] !== undefined;
      if (isGCC && placeOfSupply !== 'United Arab Emirates (UAE)') { countryCode = this.COUNTRY_CODE_MAP[placeOfSupply] || 'AE'; placeOfSupplyCode = countryCode; }
      else if (placeOfSupply === 'United Arab Emirates (UAE)' || this.EMIRATE_CODE_MAP[placeOfSupply]) { countryCode = 'AE'; placeOfSupplyCode = this.EMIRATE_CODE_MAP[placeOfSupply] || 'DU'; }
      else { countryCode = 'AE'; placeOfSupplyCode = 'AE'; }
    } else if (taxTreatment === 'non_vat_registered') {
      countryCode = 'AE'; placeOfSupplyCode = this.EMIRATE_CODE_MAP[placeOfSupply] || 'DU';
    } else if (taxTreatment === 'gcc_non_vat_registered') {
      countryCode = this.COUNTRY_CODE_MAP[placeOfSupply] || 'AE'; placeOfSupplyCode = countryCode;
    }
    return { countryCode, placeOfSupplyCode };
  }

  _extractPrimaryEmail(c) {
    const primary = c.contact_persons?.find(p => p.is_primary_contact === true);
    if (primary?.email) return primary.email.trim().toLowerCase();
    if (c.email) return c.email.trim().toLowerCase();
    const any = c.contact_persons?.find(p => p.email);
    return any?.email ? any.email.trim().toLowerCase() : null;
  }

  _extractPrimaryPhone(c) {
    const primary = c.contact_persons?.find(p => p.is_primary_contact === true);
    if (primary?.phone) return primary.phone.trim();
    if (primary?.mobile) return primary.mobile.trim();
    if (c.phone) return c.phone.trim();
    const any = c.contact_persons?.find(p => p.phone || p.mobile);
    if (any?.phone) return any.phone.trim();
    if (any?.mobile) return any.mobile.trim();
    return '';
  }

  _mapTaxTreatment(c) {
    const t = c.tax_treatment || c.contact_category;
    if (t === 'vat_registered') return 'vat_registered';
    if (t === 'gcc_vat_registered') return 'gcc_vat_registered';
    if (t === 'gcc_vat_not_registered') return 'gcc_non_vat_registered';
    return 'non_vat_registered';
  }

  _buildCurrencyObject(code) {
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
    return currencies[code] || currencies.AED;
  }

  _mapContactPersons(zohoContactPersons) {
    if (!Array.isArray(zohoContactPersons)) return [];
    return zohoContactPersons.filter(cp => cp.first_name && cp.first_name.trim()).map(cp => ({
      salutation: cp.salutation || '', firstName: cp.first_name.trim(), lastName: (cp.last_name || '').trim(),
      email: (cp.email || '').trim().toLowerCase(), workPhone: (cp.phone || '').trim(), mobile: (cp.mobile || '').trim(),
      designation: cp.designation || '', department: cp.department || '', isPrimaryContact: cp.is_primary_contact === true,
      notes: cp.notes || '', zohoContactPersonId: cp.contact_person_id || null, createdAt: new Date(), updatedAt: new Date()
    }));
  }

  _createDefaultContact(customer) {
    return { salutation: 'Mr.', firstName: customer.name, lastName: '', email: customer.email, workPhone: customer.phone, mobile: '', designation: '', department: '', isPrimaryContact: true, notes: '', zohoContactPersonId: null, createdAt: new Date(), updatedAt: new Date() };
  }

  _ensurePrimaryContact(contactPersons) {
    if (!contactPersons.some(cp => cp.isPrimaryContact === true) && contactPersons.length > 0) contactPersons[0].isPrimaryContact = true;
  }

  _mergeContactPersons(existing, incoming) {
    const map = new Map();
    existing.forEach(c => { if (c.zohoContactPersonId) map.set(c.zohoContactPersonId, { _id: c._id, createdAt: c.createdAt }); });
    return incoming.map(c => {
      if (c.zohoContactPersonId && map.has(c.zohoContactPersonId)) {
        const e = map.get(c.zohoContactPersonId);
        return { ...c, _id: e._id, createdAt: e.createdAt, updatedAt: new Date() };
      }
      return c;
    });
  }

  _hasCustomerChanged(existing, updated, merged) {
    if ((existing.contactPersons?.length || 0) !== merged.length) return true;
    if (updated.lastModifiedTime !== existing.lastModifiedTime) return true;
    for (const f of ['name', 'email', 'phone', 'taxTreatment', 'taxRegistrationNumber', 'placeOfSupply']) {
      if (updated[f] !== existing[f]) return true;
    }
    return false;
  }

  _mapZohoItemToItem(zi) {
    return {
      zohoId: zi.item_id, name: zi.name || 'Unnamed Item', price: parseFloat(zi.rate) || 0, description: zi.description || '',
      sku: zi.sku || '', unit: zi.unit || 'pcs', product_type: zi.product_type || 'goods', tax_percentage: parseFloat(zi.tax_percentage) || 0,
      status: zi.status || 'active', is_taxable: zi.is_taxable !== false, can_be_sold: zi.can_be_sold !== false, isActive: zi.status === 'active', zohoData: zi
    };
  }

  _hasItemChanged(existing, updated) {
    for (const f of ['name', 'price', 'description', 'sku', 'unit', 'product_type', 'tax_percentage', 'status']) {
      if (String(existing[f] || '') !== String(updated[f] || '')) return true;
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
    if (zohoContact.contact_persons?.length > 0) {
      const primary = zohoContact.contact_persons.find(cp => cp.is_primary_contact) || zohoContact.contact_persons[0];
      email = email || primary.email || '';
      phone = phone || primary.mobile || primary.phone || '';
      mainContactSalutation = primary.salutation || '';
    }
    const finalEmail = email && email.trim() !== '' ? email.toLowerCase().trim() : null;

    const allowed = ['AED', 'SAR', 'KWD', 'QAR', 'BHD', 'OMR', 'USD', 'EUR', 'GBP'];
    const currencyCode = zohoContact.currency_code || 'AED';
    let finalCurrencyCode = allowed.includes(currencyCode) ? currencyCode : 'AED';
    let currencyWarning = null;
    if (!allowed.includes(currencyCode)) {
      logger.warn(`Unsupported currency "${currencyCode}" for customer "${zohoContact.contact_name}". Defaulting to AED.`);
      currencyWarning = `Currency "${currencyCode}" was not supported and has been defaulted to AED`;
    }

    return {
      name: (zohoContact.contact_name || 'Unnamed Customer').trim(), email: finalEmail, phone: (phone || '').trim(),
      address: zohoContact.billing_address?.address || '', city: zohoContact.billing_address?.city || '',
      state: zohoContact.billing_address?.state || '', zipcode: zohoContact.billing_address?.zip || '', // FIX: zipcode
      companyName: (zohoContact.company_name || '').trim(), website: zohoContact.website || '', notes: zohoContact.notes || '',
      taxTreatment, taxRegistrationNumber: zohoContact.tax_reg_no || zohoContact.vat_reg_no || '',
      placeOfSupply: this._getPlaceOfSupplyFromZoho(zohoContact) || 'Dubai',
      defaultCurrency: { code: finalCurrencyCode, symbol: this._getCurrencySymbol(finalCurrencyCode), name: this._getCurrencyName(finalCurrencyCode) },
      zohoId: zohoContact.contact_id, isActive: zohoContact.status === 'active', lastModifiedTime: zohoContact.last_modified_time,
      mainContactSalutation, ...(currencyWarning && { currencyWarning })
    };
  }

  _getPlaceOfSupplyFromZoho(c) {
    if (c.country_code === 'AE') {
      const m = { AB: 'Abu Dhabi', AJ: 'Ajman', DU: 'Dubai', FU: 'Fujairah', RA: 'Ras al-Khaimah', SH: 'Sharjah', UM: 'Umm al-Quwain' };
      return m[c.place_of_contact] || 'Dubai';
    }
    const m = { SA: 'Saudi Arabia', KW: 'Kuwait', QA: 'Qatar', BH: 'Bahrain', OM: 'Oman' };
    return m[c.country_code] || 'Dubai';
  }

  _getCurrencySymbol(code) {
    return ({ AED: 'د.إ', SAR: 'ر.س', KWD: 'د.ك', QAR: 'ر.ق', BHD: '.د.ب', OMR: 'ر.ع.', USD: '$', EUR: '€', GBP: '£' })[code] || 'د.إ';
  }

  _getCurrencyName(code) {
    return ({ AED: 'United Arab Emirates Dirham', SAR: 'Saudi Riyal', KWD: 'Kuwaiti Dinar', QAR: 'Qatari Riyal', BHD: 'Bahraini Dinar', OMR: 'Omani Rial', USD: 'US Dollar', EUR: 'Euro', GBP: 'British Pound' })[code] || 'United Arab Emirates Dirham';
  }

  _cleanPayload(payload) {
    return JSON.parse(JSON.stringify(payload, (_, v) => (v === undefined || v === '' ? undefined : v)));
  }

  _buildAddress(data, prefix = '') {
    const address = {
      address: data[`${prefix}address`] || data.address || '', street2: data[`${prefix}street2`] || data.street2 || '',
      city: data[`${prefix}city`] || data.city || '', state: data[`${prefix}state`] || data.state || '',
      state_code: data[`${prefix}state_code`] || data.state_code || '',
      zip: data[`${prefix}zip`] || data[`${prefix}zipCode`] || data[`${prefix}zipcode`] || data.zipCode || data.zipcode || '',
      country: data[`${prefix}country`] || data.country || '', phone: data[`${prefix}phone`] || data.phone || '',
      fax: data[`${prefix}fax`] || data.fax || '', attention: data[`${prefix}attention`] || data.attention || ''
    };
    Object.keys(address).forEach(k => { if (!address[k] || address[k].toString().trim() === '') delete address[k]; });
    return Object.keys(address).length > 0 ? address : null;
  }

  async _createEstimate(estimateData, organizationId) {
    try {
      let currencyId = estimateData.currency_id;
      if (!currencyId && estimateData.currency_code) currencyId = await this._getCurrencyId(estimateData.currency_code, organizationId);

      const lineItems = estimateData.line_items.map((item, index) => {
        const li = {
          description: item.description || '', quantity: Number(item.quantity) || 1, rate: Number(item.rate) || 0,
          item_total: Number(item.item_total) || (Number(item.quantity) * Number(item.rate)), item_order: item.item_order || index + 1
        };
        if (item.discount && item.discount > 0) { li.discount = item.discount; li.discount_amount = item.discount_amount || 0; }
        if (item.tax_id && item.tax_percentage > 0) { li.tax_id = item.tax_id; li.tax_percentage = item.tax_percentage; li.tax_name = item.tax_name || 'VAT'; li.tax_type = 'tax'; }
        return li;
      });

      const payload = {
        customer_id: estimateData.customer_id, date: estimateData.date, expiry_date: estimateData.expiry_date,
        line_items: lineItems, notes: estimateData.notes || '', terms: estimateData.terms || '',
        reference_number: estimateData.reference_number, exchange_rate: estimateData.exchange_rate || 1,
        price_precision: estimateData.price_precision || 2, tax_treatment: estimateData.tax_treatment || 'vat_not_registered',
        place_of_supply: estimateData.place_of_supply || 'AE'
      };
      if (estimateData.estimate_number) payload.estimate_number = estimateData.estimate_number;
      if (currencyId) payload.currency_id = currencyId;
      if (estimateData.tax_id && estimateData.tax_percentage > 0) payload.tax_id = estimateData.tax_id;
      const hasItemDiscount = lineItems.some(i => i.discount && i.discount > 0);
      if (estimateData.discount && estimateData.discount > 0 && !hasItemDiscount) {
        payload.discount = estimateData.discount; payload.is_discount_before_tax = estimateData.is_discount_before_tax || false; payload.discount_type = estimateData.discount_type || 'entity_level';
      }
      if (estimateData.is_inclusive_tax !== undefined) payload.is_inclusive_tax = estimateData.is_inclusive_tax;
      if (estimateData.contact_persons_associated) payload.contact_persons_associated = estimateData.contact_persons_associated;
      if (estimateData.template_id) payload.template_id = estimateData.template_id;
      if (estimateData.custom_fields) payload.custom_fields = estimateData.custom_fields;
      if (estimateData.shipping_charge) payload.shipping_charge = estimateData.shipping_charge;
      if (estimateData.adjustment) payload.adjustment = estimateData.adjustment;
      if (estimateData.adjustment_description) payload.adjustment_description = estimateData.adjustment_description;
      if (estimateData.tags?.length > 0) payload.tags = estimateData.tags;
      if (estimateData.salesperson_name) payload.salesperson_name = estimateData.salesperson_name;
      if (estimateData.custom_body) payload.custom_body = estimateData.custom_body;
      if (estimateData.custom_subject) payload.custom_subject = estimateData.custom_subject;

      const result = await this._request('POST', '/estimates', this._cleanPayload(payload), organizationId);
      if (result.success && result.data?.estimate) {
        const est = result.data.estimate;
        logger.info('Zoho estimate created successfully', { estimateId: est.estimate_id, estimateNumber: est.estimate_number, customerId: estimateData.customer_id, lineItemsCount: lineItems.length });
        return { success: true, estimateId: est.estimate_id, estimateNumber: est.estimate_number, estimateUrl: est.estimate_url, estimate: est };
      }
      throw new Error(result.error || 'Invalid response from Zoho');
    } catch (error) {
      logger.error(`Zoho estimate creation error: ${error.message}`, { error: error.message });
      return { success: false, error: error.message, details: error.response?.data };
    }
  }

  // ── BACKWARD-COMPAT SHIMS ──
  // Any legacy call site that did `service.setCompany(...)` then
  // `service.createContact(...)` still works by delegating to the last scope.
  _legacy() {
    if (!this._legacyClient) throw new Error('Company context not set. Call setCompany() first.');
    return this._legacyClient;
  }
  getCompanyContext() { return this._legacy().getCompanyContext(); }
  getContact(id, bypass) { return this._legacy().getContact(id, bypass); }
  getAllContacts(p) { return this._legacy().getAllContacts(p); }
  getAllCustomersPaginated(companyId, lastSyncDate) {
    // legacy signature passed companyId explicitly; scope already has it
    return this._legacy().getAllCustomersPaginated(lastSyncDate);
  }
  createContact(d) { return this._legacy().createContact(d); }
  updateContact(id, d) { return this._legacy().updateContact(id, d); }
  deleteContact(id) { return this._legacy().deleteContact(id); }
  markContactInactive(id) { return this._legacy().markContactInactive(id); }
  clearContactsCache() { return this._legacy().clearContactsCache(); }
  clearItemsCache() { return this._legacy().clearItemsCache(); }
  getAllItems(p) { return this._legacy().getAllItems(p); }
  getItem(id) { return this._legacy().getItem(id); }
  createItem(d) { return this._legacy().createItem(d); }
  updateItem(id, d) { return this._legacy().updateItem(id, d); }
  deleteItem(id) { return this._legacy().deleteItem(id); }
  createEstimate(d) { return this._legacy().createEstimate(d); }
  syncItemsToDatabase(c, inc) { return this._legacy().syncItemsToDatabase(c, inc); }
  processCustomerRecord(companyId, zc, full) { return this._legacy().processCustomerRecord(companyId, zc, full); }

  // syncContactsToDatabase: legacy callers passed (company, incremental, jobId,
  // onProgress, companyIdForCancel-string). We build a fresh scoped client from
  // the company so this works even without a prior setCompany().
  syncContactsToDatabase(company, incremental = true, syncJobId = null, onProgress = null, cancelArg = null) {
    const client = new ScopedZohoClient(this, company._id, company.zohoOrganizationId);
    return client.syncContactsToDatabase(company, incremental, syncJobId, onProgress, cancelArg);
  }
}

const service = new ZohoBooksService();
service.customerSyncCancelMap = customerSyncCancelMap; // preserve existing export used by controller
module.exports = service;