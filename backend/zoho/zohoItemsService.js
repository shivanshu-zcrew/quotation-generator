const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { Item } = require('../models/items');

class ZohoItemsService {
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
      ITEM: (id, companyId) => `zoho_item_${companyId}_${id}`
    };
    
    this.accessToken = null;
    this.tokenExpiry = null;
    this.tokenFilePath = path.join(__dirname, '../.zoho-token.json');
    this.lastRefreshAttempt = 0;
    this.minRefreshInterval = 60000;
    
    this.memoryCache = new Map();
    this.cacheTTL = 600000;
    
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

  _clearCache(key) {
    this.memoryCache.delete(key);
  }

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
        if (data.accessToken && data.tokenExpiry) {
          this.accessToken = data.accessToken;
          this.tokenExpiry = parseInt(data.tokenExpiry, 10);
        }
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
    } catch (error) {}
  }

  _isTokenValid() {
    if (!this.accessToken || !this.tokenExpiry) return false;
    const buffer = 10 * 60 * 1000;
    return Date.now() < (this.tokenExpiry - buffer);
  }

  _canRefresh() {
    const now = Date.now();
    return (now - this.lastRefreshAttempt) > this.minRefreshInterval;
  }

  async getValidAccessToken() {
    if (this._isTokenValid()) return this.accessToken;
    if (!this._canRefresh()) {
      const waitTime = Math.ceil((this.minRefreshInterval - (Date.now() - this.lastRefreshAttempt)) / 1000);
      throw new Error(`Rate limited. Please wait ${waitTime} seconds.`);
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
        this.tokenExpiry = Date.now() + (parseInt(response.data.expires_in, 10) * 1000);
        await this._saveToken();
        return this.accessToken;
      }
      throw new Error('Invalid response from Zoho');
    } catch (error) {
      throw new Error(`Token refresh failed: ${error.response?.data?.error_description || error.message}`);
    }
  }

  async _request(method, endpoint, data = null, retryCount = 0) {
    const MAX_RETRIES = 2;
    try {
      const token = await this.getValidAccessToken();
      const { organizationId } = this.getCompanyContext();
      const separator = endpoint.includes('?') ? '&' : '?';
      const url = `${this.apiDomain}${endpoint}${separator}organization_id=${organizationId}`;
      
      const config = {
        method,
        url,
        headers: {
          'Authorization': `Zoho-oauthtoken ${token}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      };
      if (data) config.data = data;
      
      const response = await axios(config);
      return { success: true, data: response.data };
    } catch (error) {
      if (error.response?.status === 401 && retryCount < MAX_RETRIES) {
        this.accessToken = null;
        this.tokenExpiry = null;
        return this._request(method, endpoint, data, retryCount + 1);
      }
      return { 
        success: false, 
        error: error.response?.data?.message || error.message,
        status: error.response?.status
      };
    }
  }

  _cleanPayload(payload) {
    return JSON.parse(JSON.stringify(payload, (_, value) => 
      value === undefined || value === '' ? undefined : value
    ));
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
          const items = result.data.items;
          allItems.push(...items);
          const pageContext = result.data.page_context || {};
          hasMorePages = pageContext.has_more_page === true;
          
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

  async getAllItems(params = {}) {
    const { companyId } = this.getCompanyContext();
    const cacheKey = this.CACHE_KEYS.ALL_ITEMS(companyId);
    const loadingFlagKey = `${cacheKey}:loading`;
    let isLoadingFlagSet = false;
    
    try {
      const cachedData = this._getFromCache(cacheKey);
      if (cachedData && !params.forceRefresh) {
        return { success: true, items: cachedData, source: 'cache', total: cachedData.length };
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
              if (hasMorePages) currentPage++;
              else hasMorePages = false;
            } else {
              hasMorePages = false;
            }
          } else {
            hasMorePages = false;
          }
        } catch (pageError) {
          if (currentPage === 1) throw pageError;
          hasMorePages = false;
        }
      }
      
      if (allItems.length > 0) {
        this._setToCache(cacheKey, allItems, 600);
      }
      
      return { success: true, items: allItems, total: allItems.length, source: 'api' };
    } catch (error) {
      const fallbackCache = this._getFromCache(cacheKey);
      if (fallbackCache) {
        return { success: true, items: fallbackCache, source: 'cache-fallback', total: fallbackCache.length };
      }
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

  async syncItemsToDatabase(company, incremental = true) {
    try {
      this.setCompany(company._id, company.zohoOrganizationId);
      
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
      if (!fetchResult.success) throw new Error(fetchResult.error || 'Failed to fetch items');
      
      const zohoItems = fetchResult.items || [];
      let created = 0, updated = 0, unchanged = 0;
      
      for (const zi of zohoItems) {
        if (!zi.item_id) continue;
        const mapped = this._mapZohoItemToItem(zi);
        mapped.companyId = company._id;
        
        const existingItem = await Item.findOne({ companyId: company._id, zohoId: mapped.zohoId });
        
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
      
      this._clearCache(this.CACHE_KEYS.ALL_ITEMS(company._id));
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
      if (String(existing[field] || '') !== String(updated[field] || '')) return true;
    }
    return false;
  }

  async clearItemsCache() {
    const { companyId } = this.getCompanyContext();
    this._clearCache(this.CACHE_KEYS.ALL_ITEMS(companyId));
    this._clearCachePattern(`zoho_item_${companyId}:`);
  }
}

module.exports = ZohoItemsService;