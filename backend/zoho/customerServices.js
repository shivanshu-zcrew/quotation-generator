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
const MAX_PAGES_SAFETY = 1000;
const PER_PAGE = 200;
const PAGE_DELAY_MS = 400;
const BATCH_SIZE = 10;
const BATCH_DELAY_MS = 500;
const TOKEN_EXPIRY_BUFFER_MS = 5 * 60 * 1000;

// Circuit breaker thresholds
const CIRCUIT_BREAKER_THRESHOLD = 5;   // consecutive failures before opening
const CIRCUIT_BREAKER_RESET_MS = 60000; // 60s before half-open probe
const CIRCUIT_BREAKER_PROBE_TIMEOUT_MS = 10000; // shorter timeout for probe requests

// Per-page retry
const MAX_PAGE_RETRIES = 2;

// Mutation retry (create / update / delete / markInactive)
// _request already did its own HTTP retries; this layer retries the whole
// operation (re-acquiring a fresh token if needed) for transient outages.
const MAX_MUTATION_RETRIES = 2;
const MUTATION_RETRY_KINDS = new Set(['timeout', 'network', 'server_error', 'rate_limit']);

// ─────────────────────────────────────────────────────────────────────────
// ERROR CLASSIFIER
// Attaches a .kind to every error returned by _request so callers can
// branch on type instead of parsing strings.
// Kinds: 'auth' | 'rate_limit' | 'server_error' | 'timeout' | 'network' | 'client_error' | 'unknown'
// ─────────────────────────────────────────────────────────────────────────
function classifyError(status, errorCode, isAbort) {
  if (status === 401 || status === 403) return 'auth';
  if (status === 429) return 'rate_limit';
  if (status >= 500 && status < 600) return 'server_error';
  if (isAbort) return 'timeout';
  if (errorCode === 'ECONNRESET' || errorCode === 'ETIMEDOUT' || errorCode === 'ENOTFOUND' || errorCode === 'ECONNREFUSED') return 'network';
  if (status >= 400 && status < 500) return 'client_error';
  return 'unknown';
}

// ─────────────────────────────────────────────────────────────────────────
// CIRCUIT BREAKER
// Prevents hammering Zoho when it's clearly down. State per-service
// instance (one global service = one breaker covers all orgs).
// States: CLOSED (normal) → OPEN (failing) → HALF_OPEN (probe)
// ─────────────────────────────────────────────────────────────────────────
class CircuitBreaker {
  constructor() {
    this.state = 'CLOSED'; // CLOSED | OPEN | HALF_OPEN
    this.failures = 0;
    this.lastFailureAt = null;
    this.openedAt = null;
  }

  // Returns true if this request should be allowed through
  allowRequest() {
    if (this.state === 'CLOSED') return true;
    if (this.state === 'OPEN') {
      const elapsed = Date.now() - this.openedAt;
      if (elapsed >= CIRCUIT_BREAKER_RESET_MS) {
        this.state = 'HALF_OPEN';
        logger.info('Circuit breaker entering HALF_OPEN — probing Zoho API');
        return true;
      }
      return false;
    }
    // HALF_OPEN: allow exactly one probe
    return true;
  }

  onSuccess() {
    if (this.state === 'HALF_OPEN') {
      logger.info('Circuit breaker probe succeeded — returning to CLOSED');
    }
    this.state = 'CLOSED';
    this.failures = 0;
    this.lastFailureAt = null;
    this.openedAt = null;
  }

  onFailure(kind) {
    // Auth and client-side (4xx) errors are not Zoho outage signals
    if (kind === 'auth' || kind === 'client_error') return;

    this.failures++;
    this.lastFailureAt = Date.now();

    if (this.state === 'HALF_OPEN') {
      logger.warn('Circuit breaker probe failed — returning to OPEN');
      this.state = 'OPEN';
      this.openedAt = Date.now();
      return;
    }

    if (this.failures >= CIRCUIT_BREAKER_THRESHOLD) {
      logger.error(`Circuit breaker OPENED after ${this.failures} consecutive failures`);
      this.state = 'OPEN';
      this.openedAt = Date.now();
    }
  }

  get isOpen() { return this.state === 'OPEN'; }
  get status() { return { state: this.state, failures: this.failures, openedAt: this.openedAt }; }
}

// ─────────────────────────────────────────────────────────────────────────
// SCOPED CLIENT
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

  _request(method, endpoint, data = null) {
    return this._service._request(method, endpoint, data, this.organizationId);
  }

  _getFromCache(key) { return this._service._getFromCache(key); }
  _setToCache(key, data, ttl) { return this._service._setToCache(key, data, ttl); }
  _clearCache(key) { return this._service._clearCache(key); }
  _clearCachePattern(p) { return this._service._clearCachePattern(p); }
  get CACHE_KEYS() { return this._service.CACHE_KEYS; }

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

  // ─────────────────────────── MUTATION RETRY ─────────────────────────
  // Wraps a single write operation (fn) with operation-level retry logic.
  // _request already handles HTTP-level retries; this layer retries the
  // *entire operation* (including token re-acquisition) for transient
  // infrastructure failures — timeouts, network resets, 5xx bursts — that
  // slip through after _request exhausts its own budget.
  //
  // Usage:
  //   return this._mutationWithRetry('updateContact', () =>
  //     this._request('PUT', `/contacts/${contactId}`, payload));
  //
  // opName is only used for logging.
  async _mutationWithRetry(opName, fn, attempt = 0) {
    const result = await fn();
    if (result.success) return result;

    // Don't retry permanent errors — bad data, auth exhausted, circuit open
    if (!MUTATION_RETRY_KINDS.has(result.kind)) return result;
    if (result.kind === 'circuit_open') return result;
    if (attempt >= MAX_MUTATION_RETRIES) return result;

    const delay = 1500 * Math.pow(2, attempt) + Math.floor(Math.random() * 400);
    logger.warn(
      `${opName} failed (${result.kind}) — mutation retry ${attempt + 1}/${MAX_MUTATION_RETRIES} in ${delay}ms`,
      { companyId: this.companyId }
    );
    await sleep(delay);
    return this._mutationWithRetry(opName, fn, attempt + 1);
  }

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
      // Non-success but not an exception — check cache before propagating
      const fallback = this._getFromCache(cacheKey);
      if (fallback && Array.isArray(fallback.contact_persons)) {
        logger.warn(`getContact ${contactId}: Zoho returned non-success, using cache`, { kind: result.kind });
        return { success: true, contact: fallback, source: 'cache-fallback' };
      }
      return result;
    } catch (error) {
      const fallback = this._getFromCache(cacheKey);
      if (fallback && Array.isArray(fallback.contact_persons)) {
        return { success: true, contact: fallback, source: 'cache-fallback' };
      }
      logger.error(`Error fetching contact ${contactId}: ${error.message}`);
      return { success: false, error: error.message, kind: 'unknown' };
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
      // Zoho returned an error — fall back to cache if available
      const fallback = this._getFromCache(cacheKey);
      if (fallback) {
        logger.warn(`getAllContacts: Zoho error (${result.kind}), serving stale cache`, { companyId: this.companyId });
        return { success: true, contacts: fallback, source: 'cache-stale', warning: `Serving cached data: Zoho returned ${result.kind}` };
      }
      return result;
    } catch (error) {
      const fallback = this._getFromCache(cacheKey);
      if (fallback) return { success: true, contacts: fallback, source: 'cache-fallback' };
      logger.error(`Error fetching contacts: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  // ─── Paginated customer fetch with per-page retry ───────────────────
  async getAllCustomersPaginated(lastSyncDate = null) {
    const uniqueCustomers = new Map();
    let page = 1;
    let hasMorePages = true;
    let totalWithDuplicates = 0;
    let consecutiveFailures = 0;
    const MAX_CONSECUTIVE_PAGE_FAILURES = 3;

    logger.info(`Starting customer fetch for company ${this.companyId}`, {
      companyId: this.companyId, mode: lastSyncDate ? 'INCREMENTAL' : 'FULL SYNC'
    });

    // Check circuit breaker before starting a potentially long paginated fetch
    if (this._service.circuitBreaker.isOpen) {
      return {
        success: false,
        error: 'Zoho API circuit breaker is open — Zoho appears to be unavailable. Retry later.',
        kind: 'circuit_open'
      };
    }

    while (hasMorePages && page <= MAX_PAGES_SAFETY) {
      // Zoho Books v3 does not support last_modified_time or Date.Modified.After
      // filtering on the /contacts endpoint for all plans. Always fetch all contacts
      // and let processCustomerRecord skip unchanged records via _hasCustomerChanged.
      let url = `/contacts?page=${page}&per_page=${PER_PAGE}&filter_by=Status.All`;

      // Per-page retry with backoff
      let result = null;
      for (let attempt = 0; attempt <= MAX_PAGE_RETRIES; attempt++) {
        result = await this._request('GET', url);
        if (result.success) break;

        // Don't retry permanent client errors (bad params, not-found etc.)
        if (result.kind === 'client_error' || result.kind === 'auth') break;

        // Circuit open mid-pagination — surface immediately
        if (result.kind === 'circuit_open') {
          return {
            success: false,
            error: 'Zoho API became unavailable mid-pagination. Partial results discarded.',
            kind: 'circuit_open',
            partialCount: uniqueCustomers.size
          };
        }

        if (attempt < MAX_PAGE_RETRIES) {
          const delay = 1000 * Math.pow(2, attempt) + Math.floor(Math.random() * 200);
          logger.warn(`Page ${page} failed (${result.kind}), retry ${attempt + 1}/${MAX_PAGE_RETRIES} in ${delay}ms`, { companyId: this.companyId });
          await sleep(delay);
        }
      }

      if (result.success && result.data?.contacts) {
        consecutiveFailures = 0;
        const customers = result.data.contacts.filter(c => c.contact_type === 'customer');
        for (const c of customers) {
          if (!uniqueCustomers.has(c.contact_id)) uniqueCustomers.set(c.contact_id, c);
        }
        totalWithDuplicates += customers.length;
        hasMorePages = result.data.page_context?.has_more_page === true;
        if (hasMorePages) { page++; await sleep(PAGE_DELAY_MS); }
      } else {
        consecutiveFailures++;

        // First page failure is fatal — nothing to return
        if (page === 1) {
          logger.error(`Customer fetch failed on first page: ${result.error}`, { companyId: this.companyId, kind: result.kind });
          return { success: false, error: result.error || 'Failed to fetch contacts from Zoho', kind: result.kind };
        }

        // Mid-pagination: allow a few consecutive failures before giving up
        if (consecutiveFailures >= MAX_CONSECUTIVE_PAGE_FAILURES) {
          logger.error(`Stopping pagination: ${consecutiveFailures} consecutive page failures at page ${page}`, {
            companyId: this.companyId, kind: result.kind, partialCount: uniqueCustomers.size
          });
          // Return what we have so the sync is not entirely lost, but flag as partial
          return {
            success: true,
            customers: Array.from(uniqueCustomers.values()),
            totalUnique: uniqueCustomers.size,
            totalWithDuplicates,
            partial: true,
            partialReason: `Stopped at page ${page} after ${consecutiveFailures} consecutive failures (${result.kind})`
          };
        }

        logger.warn(`Page ${page} failed after retries (${result.kind}), skipping`, { companyId: this.companyId });
        page++;
        await sleep(PAGE_DELAY_MS * 2); // extra back-off before next page
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

    const cleanPayload = this._cleanPayload(contactPayload);
    const result = await this._mutationWithRetry(
      'createContact',
      () => this._request('POST', '/contacts', cleanPayload)
    );
    if (result.success && result.data?.contact) {
      await this.clearContactsCache();
      logger.info(`Contact created in Zoho: ${customerData.name}`, { contactId: result.data.contact.contact_id, companyId: this.companyId });
      return { success: true, zohoId: result.data.contact.contact_id, message: 'Contact created in Zoho Books', contact: result.data.contact };
    }
    logger.error(`Failed to create contact in Zoho: ${result.error}`, { customerName: customerData.name, kind: result.kind });
    return { success: false, message: result.error || 'Failed to create contact in Zoho', error: result.error, kind: result.kind, details: result.details };
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

    const cleanPayload = this._cleanPayload(contactPayload);
    const result = await this._mutationWithRetry(
      `updateContact:${contactId}`,
      () => this._request('PUT', `/contacts/${contactId}`, cleanPayload)
    );
    if (result.success) {
      logger.info(`Contact updated in Zoho: ${customerData.name}`, { contactId, companyId: this.companyId });
    } else {
      logger.error(`Failed to update contact in Zoho: ${result.error}`, { contactId, customerName: customerData.name, kind: result.kind });
    }
    return {
      success: result.success,
      message: result.success ? 'Contact updated successfully' : (result.error || 'Zoho update failed'),
      contact: result.data?.contact || result.contact,
      kind: result.kind,
      error: result.success ? undefined : result.error
    };
  }

  async deleteContact(contactId) {
    const result = await this._mutationWithRetry(
      `deleteContact:${contactId}`,
      () => this._request('DELETE', `/contacts/${contactId}`)
    );
    if (result.success) {
      await this.clearContactsCache();
      this._clearCache(this.CACHE_KEYS.CONTACT(contactId, this.companyId));
      logger.info(`Contact deleted from Zoho: ${contactId}`, { contactId, companyId: this.companyId });
      return { success: true, message: 'Contact deleted from Zoho Books' };
    }
    logger.error(`Failed to delete contact from Zoho: ${result.error}`, { contactId, kind: result.kind });
    return result;
  }

  async markContactInactive(contactId) {
    const result = await this._mutationWithRetry(
      `markContactInactive:${contactId}`,
      () => this._request('POST', `/contacts/${contactId}/inactive`)
    );
    if (result.success) {
      this._clearCache(this.CACHE_KEYS.CONTACT(contactId, this.companyId));
      await this.clearContactsCache();
      logger.info(`Contact marked inactive in Zoho: ${contactId}`, { contactId, companyId: this.companyId });
      return { success: true, message: 'Contact marked inactive in Zoho Books' };
    }
    logger.error(`Failed to mark contact inactive in Zoho: ${result.error}`, { contactId, kind: result.kind });
    return { success: false, error: result.error, kind: result.kind, details: result.details };
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

    const isCancelled = () => {
      if (cancelToken && typeof cancelToken.isCancelRequested === 'function') {
        return cancelToken.isCancelRequested() === true;
      }
      return customerSyncCancelMap.get(companyIdStr) === true;
    };

    try {
      // ── Pre-flight: check circuit breaker before starting sync ──────────
      if (this._service.circuitBreaker.isOpen) {
        const cbStatus = this._service.circuitBreaker.status;
        const msg = `Cannot start customer sync: Zoho API circuit breaker is OPEN (${cbStatus.failures} failures, opened ${Math.round((Date.now() - cbStatus.openedAt) / 1000)}s ago)`;
        logger.warn(msg, { companyId: companyIdStr });
        if (onProgress) onProgress({ stage: 'error', message: msg, kind: 'circuit_open' });
        return { success: false, error: msg, kind: 'circuit_open' };
      }

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
          lastSyncDate = d.toISOString().replace('T', ' ').split('.')[0]; // "yyyy-MM-dd HH:mm:ss"
        } else {
          const d = new Date();
          d.setDate(d.getDate() - 90);
          lastSyncDate = d.toISOString().replace('T', ' ').split('.')[0];
        }
      }

      if (onProgress) onProgress({ stage: 'fetching', message: 'Fetching customers from Zoho...', fetched: 0, total: 0, startTime });

      const fetchResult = await this.getAllCustomersPaginated(lastSyncDate);

      if (!fetchResult.success) {
        // Distinguish circuit-open (Zoho down) from other errors
        const msg = fetchResult.kind === 'circuit_open'
          ? 'Zoho API is currently unavailable (circuit breaker open). Try again in a minute.'
          : (fetchResult.error || 'Failed to fetch customers from Zoho');
        if (onProgress) onProgress({ stage: 'error', message: msg, kind: fetchResult.kind, startTime });
        return { success: false, error: msg, kind: fetchResult.kind };
      }

      // Warn if we only got a partial result set
      if (fetchResult.partial) {
        logger.warn(`Customer fetch was partial for company ${companyIdStr}: ${fetchResult.partialReason}`, { companyId: companyIdStr });
        if (onProgress) onProgress({
          stage: 'processing',
          message: `⚠️ Partial fetch: ${fetchResult.partialReason}. Processing ${fetchResult.totalUnique} customers...`,
          fetched: 0, total: fetchResult.totalUnique, startTime, partial: true
        });
      }

      const zohoCustomers = fetchResult.customers || [];
      if (zohoCustomers.length === 0) {
        if (onProgress) onProgress({ stage: 'completed', message: 'No customers found to sync', fetched: 0, total: 0 });
        return { success: true, message: 'No customers found to sync', totalFromZoho: 0, created: 0, updated: 0, unchanged: 0, errors: 0 };
      }

      let created = 0, updated = 0, unchanged = 0, errors = 0, totalContactPersons = 0;
      let zohoErrors = 0; // specifically Zoho-side errors (to detect mid-sync outage)
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

        // ── Mid-sync circuit breaker check ──────────────────────────────
        if (this._service.circuitBreaker.isOpen) {
          logger.error(`Customer sync aborting mid-batch: circuit breaker opened (${zohoErrors} Zoho errors so far)`, { companyId: companyIdStr });
          if (onProgress) onProgress({
            stage: 'error',
            message: `Sync stopped: Zoho API became unavailable after processing ${i}/${total} customers. Saved: ${created} created, ${updated} updated.`,
            fetched: i, total, created, updated, unchanged, errors, kind: 'circuit_open', startTime
          });
          return {
            success: false, error: 'Zoho API unavailable mid-sync (circuit breaker open)',
            kind: 'circuit_open', created, updated, unchanged, errors,
            processedBefore: i, totalFromZoho: total
          };
        }

        const batch = zohoCustomers.slice(i, i + BATCH_SIZE);
        const results = await Promise.all(batch.map(async (zc) => {
          if (isCancelled()) return { action: 'cancelled' };
          try {
            let fullContact = zc;
            if (!Array.isArray(zc.contact_persons) || zc.contact_persons.length === 0) {
              const detail = await this.getContact(zc.contact_id, true);
              if (detail.success && detail.contact) fullContact = detail.contact;
              // If getContact fails, proceed with the list-level data rather than
              // hard-failing the whole record — it's better than losing the customer
              else if (!detail.success) {
                logger.warn(`Could not fetch contact detail for ${zc.contact_id} (${detail.kind || 'unknown'}) — using list data`, { companyId: this.companyId });
              }
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
            if (r.kind && r.kind !== 'client_error') zohoErrors++;
            failedRecords.push({ zohoId: r.zohoId, name: r.name, error: r.error, kind: r.kind });
          }
          if (r.contactPersonsCount) totalContactPersons += r.contactPersonsCount;
        }

        const processed = Math.min(i + BATCH_SIZE, total);
        if (onProgress) onProgress({ stage: 'processing', message: `Processing ${processed}/${total} customers...`, fetched: processed, total, created, updated, unchanged, errors, startTime });

        if (i + BATCH_SIZE < total) await sleep(BATCH_DELAY_MS);
      }

      const duration = `${((Date.now() - startTime) / 1000).toFixed(2)}s`;
      const wasPartial = fetchResult.partial === true;

      if (onProgress) onProgress({
        stage: 'completed',
        message: `Sync completed${wasPartial ? ' (partial)' : ''}! ${created} created, ${updated} updated, ${unchanged} unchanged`,
        fetched: total, total, created, updated, unchanged, errors, duration, startTime,
        ...(wasPartial && { warning: fetchResult.partialReason })
      });

      await this.clearContactsCache();

      logger.info(`Customer sync completed for ${company.code}: Created ${created}, Updated ${updated}, Unchanged ${unchanged}, Errors ${errors}, Duration ${duration}`, {
        companyId: companyIdStr, companyCode: company.code, created, updated, unchanged, errors, totalContactPersons, duration,
        syncType: incremental ? 'incremental' : 'full',
        partial: wasPartial,
        failedRecords: failedRecords.slice(0, 20)
      });

      return {
        success: true, totalFromZoho: total, created, updated, unchanged, errors, totalContactPersons, duration,
        failedRecords, lastSyncDate: new Date().toISOString(), syncType: incremental ? 'incremental' : 'full',
        ...(wasPartial && { partial: true, partialReason: fetchResult.partialReason })
      };
    } catch (error) {
      logger.error(`Customer sync error for ${company?.code}: ${error.message}`, { companyId: companyIdStr, error: error.message, stack: error.stack });
      if (onProgress) onProgress({ stage: 'error', message: `Sync failed: ${error.message}`, error: error.message, startTime });
      return { success: false, error: error.message };
    } finally {
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
        zipcode: contactData.billing_address?.zip || '',
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

      // Separate DB errors from Zoho errors for better observability
      let existing;
      try {
        existing = await Customer.findOne({ companyId, zohoId: mapped.zohoId });
      } catch (dbErr) {
        logger.error(`DB error looking up customer ${mapped.zohoId}: ${dbErr.message}`);
        return { action: 'error', error: `DB lookup failed: ${dbErr.message}`, kind: 'db_error', zohoId: zc?.contact_id, name: zc?.contact_name, contactPersonsCount: 0 };
      }

      if (!existing) {
        try {
          await new Customer(mapped).save({ validateBeforeSave: false });
          return { action: 'created', contactPersonsCount: contactPersons.length };
        } catch (dbErr) {
          logger.error(`DB error creating customer ${mapped.zohoId}: ${dbErr.message}`);
          return { action: 'error', error: `DB create failed: ${dbErr.message}`, kind: 'db_error', zohoId: zc?.contact_id, name: zc?.contact_name, contactPersonsCount: 0 };
        }
      }

      const merged = this._mergeContactPersons(existing.contactPersons || [], contactPersons);
      if (!this._hasCustomerChanged(existing, mapped, merged)) {
        try {
          await Customer.updateOne({ _id: existing._id }, { $set: { zohoSynced: true, zohoSyncDate: new Date(), zohoSyncError: null } });
        } catch (dbErr) {
          // Stamp update failure is non-critical — log and continue
          logger.warn(`DB error updating zohoSyncDate for ${mapped.zohoId}: ${dbErr.message}`);
        }
        return { action: 'unchanged', contactPersonsCount: contactPersons.length };
      }

      try {
        await Customer.updateOne({ _id: existing._id }, { $set: { ...mapped, contactPersons: merged, zohoData: contactData } }, { runValidators: false });
        return { action: 'updated', contactPersonsCount: contactPersons.length };
      } catch (dbErr) {
        logger.error(`DB error updating customer ${mapped.zohoId}: ${dbErr.message}`);
        return { action: 'error', error: `DB update failed: ${dbErr.message}`, kind: 'db_error', zohoId: zc?.contact_id, name: zc?.contact_name, contactPersonsCount: 0 };
      }
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
    let consecutiveFailures = 0;
    const MAX_CONSECUTIVE_PAGE_FAILURES = 3;

    if (this._service.circuitBreaker.isOpen) {
      return { success: false, error: 'Zoho API circuit breaker is open', kind: 'circuit_open' };
    }

    while (hasMorePages && page <= MAX_PAGES_SAFETY) {
      let url = `/items?page=${page}&per_page=${PER_PAGE}&filter_by=Status.All`;
      if (lastSyncDate) url += `&filter_by=Date.Modified.After.${lastSyncDate}`;

      // Per-page retry
      let result = null;
      for (let attempt = 0; attempt <= MAX_PAGE_RETRIES; attempt++) {
        result = await this._request('GET', url);
        if (result.success) break;
        if (result.kind === 'client_error' || result.kind === 'auth' || result.kind === 'circuit_open') break;
        if (attempt < MAX_PAGE_RETRIES) {
          const delay = 1000 * Math.pow(2, attempt) + Math.floor(Math.random() * 200);
          logger.warn(`Items page ${page} failed (${result.kind}), retry ${attempt + 1}/${MAX_PAGE_RETRIES} in ${delay}ms`);
          await sleep(delay);
        }
      }

      if (result.kind === 'circuit_open') {
        return { success: false, error: 'Zoho API became unavailable mid-pagination', kind: 'circuit_open', partialItems: allItems };
      }

      if (result.success && result.data?.items) {
        consecutiveFailures = 0;
        allItems.push(...result.data.items);
        hasMorePages = result.data.page_context?.has_more_page === true;
        if (hasMorePages) { page++; await sleep(200); }
      } else {
        consecutiveFailures++;
        if (page === 1) return { success: false, error: result.error || 'Failed to fetch items from Zoho', kind: result.kind };
        if (consecutiveFailures >= MAX_CONSECUTIVE_PAGE_FAILURES) {
          logger.error(`Items pagination: stopping after ${consecutiveFailures} consecutive failures at page ${page}`);
          return { success: true, items: allItems, partial: true, partialReason: `Stopped at page ${page} after consecutive failures` };
        }
        logger.warn(`Items page ${page} skipped (${result.kind})`);
        page++;
        await sleep(200 * 2);
      }
    }
    return { success: true, items: allItems };
  }

  async syncItemsToDatabase(company, incremental = true) {
    try {
      // Pre-flight circuit breaker check
      if (this._service.circuitBreaker.isOpen) {
        return { success: false, error: 'Zoho API circuit breaker is open — cannot start item sync', kind: 'circuit_open' };
      }

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
      if (!fetchResult.success) {
        const msg = fetchResult.kind === 'circuit_open'
          ? 'Zoho API is currently unavailable. Try again later.'
          : (fetchResult.error || 'Failed to fetch items from Zoho');
        return { success: false, error: msg, kind: fetchResult.kind };
      }

      if (fetchResult.partial) {
        logger.warn(`Item sync is partial for company ${this.companyId}: ${fetchResult.partialReason}`);
      }

      const zohoItems = fetchResult.items || [];
      let created = 0, updated = 0, unchanged = 0, dbErrors = 0;
      for (const zi of zohoItems) {
        if (!zi.item_id) continue;
        const mapped = this._mapZohoItemToItem(zi);
        mapped.companyId = company._id;
        try {
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
        } catch (dbErr) {
          dbErrors++;
          logger.error(`DB error syncing item ${zi.item_id}: ${dbErr.message}`);
        }
      }
      await this.clearItemsCache();
      logger.info(`Item sync completed for ${company.code}: Created ${created}, Updated ${updated}, Unchanged ${unchanged}, DB errors ${dbErrors}`, {
        companyId: this.companyId, created, updated, unchanged, dbErrors, total: zohoItems.length
      });
      return {
        success: true, created, updated, unchanged, dbErrors, total: zohoItems.length,
        ...(fetchResult.partial && { partial: true, partialReason: fetchResult.partialReason })
      };
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
      // Try cache before propagating failure
      const fallback = this._getFromCache(cacheKey);
      if (fallback && !result.success) return { success: true, item: fallback, source: 'cache-fallback' };
      return result;
    } catch (error) {
      const fallback = this._getFromCache(cacheKey);
      if (fallback) return { success: true, item: fallback, source: 'cache-fallback' };
      return { success: false, error: error.message };
    }
  }

  async createItem(itemData) {
    try {
      const payload = this._cleanPayload({ name: itemData.name, rate: itemData.rate, description: itemData.description, sku: itemData.sku, unit: itemData.unit, product_type: itemData.product_type || 'goods' });
      const result = await this._mutationWithRetry(
        'createItem',
        () => this._request('POST', '/items', payload)
      );
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
      const payload = this._cleanPayload({ name: itemData.name, rate: itemData.rate, description: itemData.description, sku: itemData.sku, unit: itemData.unit, product_type: itemData.product_type });
      const result = await this._mutationWithRetry(
        `updateItem:${itemId}`,
        () => this._request('PUT', `/items/${itemId}`, payload)
      );
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
    const result = await this._mutationWithRetry(
      `deleteItem:${itemId}`,
      () => this._request('DELETE', `/items/${itemId}`)
    );
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

  // Expose circuit breaker status for health checks / admin endpoints
  getCircuitBreakerStatus() {
    return this._service.circuitBreaker.status;
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
    this.currencyCacheByOrg = new Map();

    this._refreshPromise = null;

    this.memoryCache = new Map();

    // Circuit breaker shared across all requests through this service instance
    this.circuitBreaker = new CircuitBreaker();

    this.EMIRATE_CODE_MAP = { 'Abu Dhabi': 'AB', 'Ajman': 'AJ', 'Dubai': 'DU', 'Fujairah': 'FU', 'Ras al-Khaimah': 'RA', 'Sharjah': 'SH', 'Umm al-Quwain': 'UM' };
    this.COUNTRY_CODE_MAP = { 'Saudi Arabia': 'SA', 'Kuwait': 'KW', 'Qatar': 'QA', 'Bahrain': 'BH', 'Oman': 'OM' };

    this._legacyClient = null;

    this._loadToken();
  }

  setCompany(companyId, organizationId) {
    const client = new ScopedZohoClient(this, companyId, organizationId);
    this._legacyClient = client;
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

  async getValidAccessToken() {
    if (this._isTokenValid()) return this.accessToken;
    if (this._refreshPromise) return this._refreshPromise;

    this._refreshPromise = this._doRefresh()
      .finally(() => { this._refreshPromise = null; });
    return this._refreshPromise;
  }

  async _doRefresh() {
    // Race the OAuth call against a hard deadline so a hanging Zoho auth
    // endpoint cannot suspend the entire process indefinitely.
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(
        () => reject(Object.assign(new Error('Token refresh timed out — Zoho OAuth endpoint did not respond'), { code: 'ETIMEDOUT' })),
        TOKEN_REFRESH_TIMEOUT_MS
      )
    );
    try {
      const params = new URLSearchParams({
        refresh_token: this.refreshToken,
        client_id: this.clientId,
        client_secret: this.clientSecret,
        grant_type: 'refresh_token'
      });
      const response = await Promise.race([
        axios.post('https://accounts.zoho.com/oauth/v2/token', params, {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          // axios timeout covers response-body transfer; Promise.race above
          // covers total wall-clock time including connection establishment.
          timeout: TOKEN_REFRESH_TIMEOUT_MS
        }),
        timeoutPromise
      ]);

      // Guard: Zoho occasionally returns 200 with an empty or non-JSON body
      if (!response?.data?.access_token) {
        const body = JSON.stringify(response?.data ?? null);
        throw new Error(`Zoho OAuth returned no access_token (body: ${body})`);
      }

      const expiresIn = parseInt(response.data.expires_in, 10);
      if (isNaN(expiresIn) || expiresIn <= 0) {
        throw new Error(`Zoho OAuth returned invalid expires_in: ${response.data.expires_in}`);
      }

      this.accessToken = response.data.access_token;
      this.tokenExpiry = Date.now() + expiresIn * 1000;
      await this._saveToken();
      logger.info('Zoho access token refreshed successfully');
      return this.accessToken;
    } catch (error) {
      const msg = error.response?.data?.error_description || error.message;
      logger.error(`Zoho token refresh failed: ${msg}`);
      // If we still have any token (possibly stale), return it so _request
      // can attempt the call and handle a 401 with a clean retry.
      if (this.accessToken) {
        logger.warn('Using potentially stale access token after refresh failure — will retry on 401');
        return this.accessToken;
      }
      throw new Error(`Zoho token refresh failed: ${msg}`);
    }
  }

  // ── LOW-LEVEL REQUEST with circuit breaker + retry/backoff ──────────────
  async _request(method, endpoint, data = null, organizationId, retryCount = 0) {
    if (!organizationId) return { success: false, error: 'organizationId is required for Zoho request', status: 400, kind: 'client_error' };

    // ── Circuit breaker gate ──────────────────────────────────────────────
    if (!this.circuitBreaker.allowRequest()) {
      const cbStatus = this.circuitBreaker.status;
      const waitSec = Math.max(0, Math.round((CIRCUIT_BREAKER_RESET_MS - (Date.now() - cbStatus.openedAt)) / 1000));
      logger.warn(`Zoho request blocked by circuit breaker (${cbStatus.state}, retry in ~${waitSec}s)`, { method, endpoint });
      return {
        success: false,
        error: `Zoho API circuit breaker is OPEN — Zoho appears to be unavailable. Retry in ~${waitSec}s.`,
        kind: 'circuit_open',
        status: 503
      };
    }

    // Use a shorter timeout for circuit-breaker probe requests (HALF_OPEN)
    const requestTimeout = this.circuitBreaker.state === 'HALF_OPEN'
      ? CIRCUIT_BREAKER_PROBE_TIMEOUT_MS
      : REQUEST_TIMEOUT_MS;

    // ── Hard wall-clock deadline wrapping token fetch + HTTP call ─────────
    // getValidAccessToken() can hang if Zoho's OAuth endpoint is unresponsive.
    // The AbortController only fires after the token is obtained, leaving a
    // window where the process can block indefinitely. This outer race closes
    // that window: if the entire _request operation (token + HTTP) hasn't
    // resolved within requestTimeout + TOKEN_REFRESH_TIMEOUT_MS, we abort.
    const TOTAL_DEADLINE_MS = requestTimeout + TOKEN_REFRESH_TIMEOUT_MS + 2000;
    let hardDeadlineId = null;
    const hardDeadline = new Promise((_, reject) => {
      hardDeadlineId = setTimeout(
        () => reject(Object.assign(new Error('Zoho request hard deadline exceeded — no response received'), { code: 'ETIMEDOUT', isHardDeadline: true })),
        TOTAL_DEADLINE_MS
      );
    });

    let timeoutId = null;
    try {
      const result = await Promise.race([
        this._doRequest(method, endpoint, data, organizationId, requestTimeout, retryCount),
        hardDeadline
      ]);
      clearTimeout(hardDeadlineId);
      return result;
    } catch (error) {
      clearTimeout(hardDeadlineId);
      if (timeoutId) clearTimeout(timeoutId);

      // Hard deadline fired — treat as timeout + inform circuit breaker
      if (error.isHardDeadline) {
        logger.error(`Zoho ${method} ${endpoint} hard deadline exceeded (>${TOTAL_DEADLINE_MS}ms) — Zoho returned no response`, { organizationId, retryCount });
        this.circuitBreaker.onFailure('timeout');
        return { success: false, error: 'Zoho returned no response within the maximum allowed time', status: 408, kind: 'timeout' };
      }
      // Rethrow unexpected errors (should not normally reach here)
      logger.error(`Unexpected _request error for ${method} ${endpoint}: ${error.message}`);
      this.circuitBreaker.onFailure('unknown');
      return { success: false, error: error.message, kind: 'unknown' };
    }
  }

  // Separated from _request so the hard-deadline race wrapper stays clean
  async _doRequest(method, endpoint, data, organizationId, requestTimeout, retryCount) {
    let timeoutId = null;
    try {
      // Token fetch is now inside _doRequest so it participates in the
      // hard deadline race in _request above.
      const token = await this.getValidAccessToken();
      const separator = endpoint.includes('?') ? '&' : '?';
      const url = `${this.apiDomain}${endpoint}${separator}organization_id=${organizationId}`;
      const controller = new AbortController();
      timeoutId = setTimeout(() => controller.abort(), requestTimeout);

      const config = {
        method, url,
        headers: { 'Authorization': `Zoho-oauthtoken ${token}`, 'Content-Type': 'application/json' },
        signal: controller.signal
      };
      if (data) config.data = data;

      const response = await axios(config);
      clearTimeout(timeoutId);

      // Guard: 200 with empty/unparseable body
      if (response.data === undefined || response.data === null) {
        // Treat as a server error — the circuit breaker will track it
        logger.warn(`Zoho ${method} ${endpoint} returned 200 with empty body`, { organizationId });
        this.circuitBreaker.onFailure('server_error');
        return { success: false, error: 'Zoho returned an empty response body', status: response.status, kind: 'server_error' };
      }

      // Success → reset the circuit breaker
      this.circuitBreaker.onSuccess();
      return { success: true, data: response.data };
    } catch (error) {
      if (timeoutId) clearTimeout(timeoutId);

      const status = error.response?.status;
      const isAbort = error.name === 'AbortError' || error.code === 'ERR_CANCELED';
      const zohoCode = error.response?.data?.code;
      const kind = classifyError(status, error.code, isAbort);

      // 401 → token invalid: clear and retry (once)
      if (kind === 'auth' && retryCount < MAX_REQUEST_RETRIES) {
        this.accessToken = null;
        this.tokenExpiry = null;
        return this._doRequest(method, endpoint, data, organizationId, requestTimeout, retryCount + 1);
      }

      // Retryable: rate limit, server errors, network, timeout
      const retryable = kind === 'rate_limit' || kind === 'server_error' || kind === 'timeout' || kind === 'network';
      if (retryable && retryCount < MAX_REQUEST_RETRIES) {
        const base = kind === 'rate_limit' ? 2000 : 1000;
        const delay = base * Math.pow(2, retryCount) + Math.floor(Math.random() * 300);
        logger.warn(`Zoho ${method} ${endpoint} (${kind}/${status || error.code}) — retry ${retryCount + 1}/${MAX_REQUEST_RETRIES} in ${delay}ms`);
        await sleep(delay);
        return this._doRequest(method, endpoint, data, organizationId, requestTimeout, retryCount + 1);
      }

      // Exhausted retries (or non-retryable) → notify circuit breaker
      this.circuitBreaker.onFailure(kind);

      if (kind === 'timeout') return { success: false, error: 'Request timeout — Zoho did not respond in time', status: 408, kind };
      return {
        success: false,
        error: error.response?.data?.message || error.message,
        code: zohoCode,
        details: error.response?.data,
        status,
        kind
      };
    }
  }

  async _getCurrencyId(currencyCode, organizationId) {
    if (!organizationId) {
      logger.warn(`_getCurrencyId called without organizationId for ${currencyCode}`);
      return null;
    }
    try {
      const orgId = String(organizationId);
      const cached = this.currencyCacheByOrg.get(orgId);
      if (cached && Date.now() < cached.expiry) {
        return cached.map[currencyCode] || null;
      }

      const result = await this._request('GET', '/settings/currencies', null, orgId);
      if (result.success && result.data?.currencies) {
        const map = {};
        result.data.currencies.forEach(c => { map[c.currency_code] = c.currency_id; });
        this.currencyCacheByOrg.set(orgId, { map, expiry: Date.now() + 3600000 });
        return map[currencyCode] || null;
      }
      // Non-fatal: log and return null so the caller omits currency_id
      logger.warn(`Could not fetch currencies for org ${orgId} (${result.kind}): ${result.error}`);
      return null;
    } catch (e) {
      logger.warn(`Error fetching currency ID for ${currencyCode} (org ${organizationId}): ${e.message}`);
      return null;
    }
  }

  // ───────────────────── PURE MAPPERS ─────────────────────────────────────
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
      state: zohoContact.billing_address?.state || '', zipcode: zohoContact.billing_address?.zip || '',
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

      const cleanedPayload = this._cleanPayload(payload);
      let estResult = null;
      for (let attempt = 0; attempt <= MAX_MUTATION_RETRIES; attempt++) {
        estResult = await this._request('POST', '/estimates', cleanedPayload, organizationId);
        if (estResult.success) break;
        if (!MUTATION_RETRY_KINDS.has(estResult.kind) || estResult.kind === 'circuit_open') break;
        if (attempt < MAX_MUTATION_RETRIES) {
          const delay = 1500 * Math.pow(2, attempt) + Math.floor(Math.random() * 400);
          logger.warn(`createEstimate failed (${estResult.kind}) — retry ${attempt + 1}/${MAX_MUTATION_RETRIES} in ${delay}ms`);
          await sleep(delay);
        }
      }
      if (estResult.success && estResult.data?.estimate) {
        const est = estResult.data.estimate;
        logger.info('Zoho estimate created successfully', { estimateId: est.estimate_id, estimateNumber: est.estimate_number, customerId: estimateData.customer_id, lineItemsCount: lineItems.length });
        return { success: true, estimateId: est.estimate_id, estimateNumber: est.estimate_number, estimateUrl: est.estimate_url, estimate: est };
      }
      // Return the structured failure (preserves kind/code from _request) instead
      // of throwing, which would strip kind and make the controller log 'unknown'.
      if (!estResult.success) {
        logger.error(`Zoho estimate creation failed`, { error: estResult.error, kind: estResult.kind, customerId: estimateData.customer_id });
        return { success: false, error: estResult.error || 'Zoho request failed', kind: estResult.kind, code: estResult.code, details: estResult.details };
      }
      // Zoho said success but returned no estimate object — unexpected
      return { success: false, error: 'Zoho returned success but no estimate object', kind: 'unknown' };
    } catch (error) {
      logger.error(`Zoho estimate creation threw unexpectedly: ${error.message}`, { error: error.message });
      return { success: false, error: error.message, kind: 'unknown', details: error.response?.data };
    }
  }

  // ── BACKWARD-COMPAT SHIMS ──
  _legacy() {
    if (!this._legacyClient) throw new Error('Company context not set. Call setCompany() first.');
    return this._legacyClient;
  }
  getCompanyContext() { return this._legacy().getCompanyContext(); }
  getContact(id, bypass) { return this._legacy().getContact(id, bypass); }
  getAllContacts(p) { return this._legacy().getAllContacts(p); }
  getAllCustomersPaginated(companyId, lastSyncDate) { return this._legacy().getAllCustomersPaginated(lastSyncDate); }
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
  getCircuitBreakerStatus() { return this.circuitBreaker.status; }

  syncContactsToDatabase(company, incremental = true, syncJobId = null, onProgress = null, cancelArg = null) {
    const client = new ScopedZohoClient(this, company._id, company.zohoOrganizationId);
    return client.syncContactsToDatabase(company, incremental, syncJobId, onProgress, cancelArg);
  }
}

const service = new ZohoBooksService();
service.customerSyncCancelMap = customerSyncCancelMap;
module.exports = service;