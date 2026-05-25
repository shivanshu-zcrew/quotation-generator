// controllers/itemController.js
const Item = require('../models/items');
const Company = require('../models/company');
const { uploadToCloudinary, deleteFromCloudinary } = require('../utils/uploadCloudnary');
const zohoBooksService = require('../zoho/customerServices');
const ItemSyncService = require('../utils/itemsSync');
const logger = require('../config/logger');

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 500;
const MIN_PAGE_SIZE = 1;
const PAGINATION_CACHE_TTL = 300;

const syncStatusMap = new Map();
const syncProgressMap = new Map(); // Track sync progress per company
const memoryCache = new Map();
const CACHE_TTL = 600000;

function getFromCache(key) {
  const cached = memoryCache.get(key);
  if (cached && cached.expiry > Date.now()) {
    return cached.data;
  }
  if (cached) memoryCache.delete(key);
  return null;
}

function setToCache(key, data, ttlSeconds = 600) {
  memoryCache.set(key, { data, expiry: Date.now() + (ttlSeconds * 1000) });
}

function clearCache(pattern) {
  if (pattern) {
    for (const key of memoryCache.keys()) {
      if (key.includes(pattern)) memoryCache.delete(key);
    }
  } else {
    memoryCache.clear();
  }
}

function getSyncStatusForCompany(companyId) {
  if (!syncStatusMap.has(companyId)) {
    syncStatusMap.set(companyId, { isSyncing: false, lastSyncTime: null, lastSyncResult: null });
  }
  return syncStatusMap.get(companyId);
}

function setSyncStatusForCompany(companyId, updates) {
  const current = getSyncStatusForCompany(companyId);
  syncStatusMap.set(companyId, { ...current, ...updates });
}

// ✅ Progress tracking helpers
function updateSyncProgress(companyId, progress) {
  syncProgressMap.set(companyId, {
    ...progress,
    updatedAt: Date.now()
  });
}

function getSyncProgress(companyId) {
  return syncProgressMap.get(companyId) || {
    stage: 'idle',
    message: 'No sync in progress',
    fetched: 0,
    total: 0,
    page: 0,
    totalPages: 0,
    startTime: null
  };
}

function mapZohoItem(item) {
  if (!item || typeof item !== 'object') {
    throw new Error('Invalid item object');
  }
  return {
    _id: item.item_id || '',
    name: item.name || 'Unknown',
    price: parseFloat(item.rate) || 0,
    description: item.description || '',
    sku: item.sku || '',
    unit: item.unit || '',
    product_type: item.product_type || 'goods',
    tax_id: item.tax_id || '',
    tax_name: item.tax_name || '',
    tax_percentage: parseFloat(item.tax_percentage) || 0,
    zohoId: item.item_id || '',
    status: item.status || 'active',
    is_taxable: item.is_taxable !== false,
    can_be_sold: item.can_be_sold !== false,
    can_be_purchased: item.can_be_purchased === true,
    track_inventory: item.track_inventory === true,
    item_type: item.item_type || 'sales',
    zohoData: item
  };
}

// ─────────────────────────────────────────────────────────────────────────
// GET ALL ITEMS WITH FILTERS
// ─────────────────────────────────────────────────────────────────────────

exports.getAllItems = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 50, 
      search = '', 
      forceRefresh = false,
      product_type
    } = req.query;
    
    let companyId = req.headers['x-company-id'] || req.query.companyId;
    const isAllCompanies = !companyId || companyId === 'all' || companyId === 'ALL';
    
    // For ALL COMPANIES, fetch items from all companies and combine
    if (isAllCompanies) {
      const companies = await Company.find({ isActive: true }).select('_id name code zohoOrganizationId');
      
      if (companies.length === 0) {
        return res.status(200).json({
          success: true,
          data: [],
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            totalItems: 0,
            totalPages: 0,
            hasNextPage: false,
            hasPreviousPage: false
          },
          isAllCompanies: true
        });
      }
      
      const allItemsPromises = companies.map(async (company) => {
        if (!company.zohoOrganizationId) {
          return { companyId: company._id, companyName: company.name, items: [], error: 'No Zoho Org ID' };
        }
        
        try {
          zohoBooksService.setCompany(company._id, company.zohoOrganizationId);
          
          const result = await ItemSyncService.getItems({
            companyId: company._id,
            page: 1,
            limit: 1000,
            search: search.trim(),
            forceRefresh: forceRefresh === 'true',
            product_type: product_type && product_type !== 'all' ? product_type : undefined
          });
          
          return {
            companyId: company._id,
            companyName: company.name,
            companyCode: company.code,
            items: result.success ? result.data : [],
            count: result.success ? result.data.length : 0
          };
        } catch (error) {
          logger.error(`Error fetching items for company ${company.name}: ${error.message}`, {
            companyId: company._id,
            companyName: company.name,
            error: error.message
          });
          return {
            companyId: company._id,
            companyName: company.name,
            items: [],
            error: error.message
          };
        }
      });
      
      const results = await Promise.all(allItemsPromises);
      
      let allItems = [];
      results.forEach(result => {
        allItems = allItems.concat(result.items);
      });
      
      if (search && search.trim()) {
        const searchTerm = search.toLowerCase();
        allItems = allItems.filter(item => 
          (item.name || '').toLowerCase().includes(searchTerm) ||
          (item.sku || '').toLowerCase().includes(searchTerm) ||
          (item.description || '').toLowerCase().includes(searchTerm)
        );
      }
      
      if (product_type && product_type !== 'all') {
        allItems = allItems.filter(item => item.product_type === product_type);
      }
      
      allItems.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      
      const parsedPage = Math.max(1, parseInt(page, 10) || 1);
      const parsedLimit = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
      const startIndex = (parsedPage - 1) * parsedLimit;
      const paginatedItems = allItems.slice(startIndex, startIndex + parsedLimit);
      const totalItems = allItems.length;
      const totalPages = Math.ceil(totalItems / parsedLimit);
      
      return res.status(200).json({
        success: true,
        data: paginatedItems,
        pagination: {
          page: parsedPage,
          limit: parsedLimit,
          totalItems,
          totalPages,
          hasNextPage: parsedPage < totalPages,
          hasPreviousPage: parsedPage > 1
        },
        source: 'all_companies',
        isAllCompanies: true,
        companiesSummary: results.map(r => ({
          id: r.companyId,
          name: r.companyName,
          itemCount: r.count
        }))
      });
    }
    
    const actualCompanyId = companyId;
    
    if (!actualCompanyId) {
      return res.status(400).json({
        success: false,
        message: 'Company ID is required. Please select a company first.'
      });
    }
    
    const company = await Company.findById(actualCompanyId);
    if (!company) {
      return res.status(404).json({
        success: false,
        message: 'Company not found'
      });
    }
    
    if (!company.zohoOrganizationId) {
      return res.status(400).json({
        success: false,
        message: 'Company does not have a Zoho Organization ID configured.'
      });
    }
    
    zohoBooksService.setCompany(company._id, company.zohoOrganizationId);
    
    const result = await ItemSyncService.getItems({
      companyId: company._id,
      page: parseInt(page),
      limit: parseInt(limit),
      search: search.trim(),
      forceRefresh: forceRefresh === 'true',
      product_type: product_type && product_type !== 'all' ? product_type : undefined
    });
    
    if (!result.success) {
      return res.status(500).json({
        success: false,
        message: result.error || 'Failed to fetch items'
      });
    }
    
    res.setHeader('X-Data-Source', result.source);
    res.setHeader('X-Cache-Hit', result.source === 'mongodb_cache' ? 'true' : 'false');
    
    res.json({
      success: true,
      data: result.data,
      pagination: result.pagination,
      source: result.source,
      isAllCompanies: false,
      company: {
        id: company._id,
        name: company.name,
        code: company.code
      }
    });
    
  } catch (error) {
    logger.error(`Error fetching items: ${error.message}`, {
      error: error.message,
      stack: error.stack,
      companyId: req.headers['x-company-id']
    });
    res.status(500).json({
      success: false,
      message: 'Error fetching items',
      error: error.message
    });
  }
};

// ─────────────────────────────────────────────────────────────────────────
// GET SINGLE ITEM
// ─────────────────────────────────────────────────────────────────────────
exports.getItem = async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = req.headers['x-company-id'] || req.query.companyId;
    
    if (!companyId) {
      return res.status(400).json({
        success: false,
        message: 'Company ID is required'
      });
    }
    
    const company = await Company.findById(companyId);
    if (company) {
      zohoBooksService.setCompany(company._id, company.zohoOrganizationId);
    }
    
    const item = await ItemSyncService.getItemByIdentifier(id);
    
    if (!item) {
      return res.status(404).json({
        success: false,
        message: 'Item not found'
      });
    }
    
    res.json({
      success: true,
      data: item
    });
    
  } catch (error) {
    logger.error(`Error fetching item ${req.params.id}: ${error.message}`, {
      error: error.message,
      itemId: req.params.id
    });
    res.status(500).json({
      success: false,
      message: 'Error fetching item',
      error: error.message
    });
  }
};

// ─────────────────────────────────────────────────────────────────────────
// SYNC ITEMS FROM ZOHO
// ───────────────────────────────────────────────────────────────────────── 
exports.syncItems = async (req, res) => {
  let companyId;
  let result;
  
  try {
    companyId = req.headers['x-company-id'] || req.body.companyId;
    
    if (!companyId) {
      return res.status(400).json({
        success: false,
        message: 'Company ID is required'
      });
    }
    
    const company = await Company.findById(companyId);
    if (!company) {
      return res.status(404).json({ success: false, message: 'Company not found' });
    }
    
    if (!company.zohoOrganizationId) {
      return res.status(400).json({
        success: false,
        message: 'Company does not have a Zoho Organization ID configured.'
      });
    }
    
    const syncStatus = getSyncStatusForCompany(companyId);
    if (syncStatus.isSyncing) {
      logger.warn(`Item sync already in progress for company ${company.code}`, {
        companyId,
        companyCode: company.code
      });
      return res.status(409).json({
        success: false,
        message: 'Sync already in progress. Please wait.',
        status: { isSyncing: true }
      });
    }
    
    setSyncStatusForCompany(companyId, { isSyncing: true });
    
    updateSyncProgress(companyId, {
      stage: 'starting',
      message: 'Starting sync...',
      fetched: 0,
      total: 0,
      page: 0,
      totalPages: 0,
      startTime: Date.now()
    });
    
    logger.info(`Item sync started for company: ${company.code}`, {
      companyId,
      companyCode: company.code,
      startedBy: req.user?.id
    });
    
    res.json({
      success: true,
      message: `Item sync started for company: ${company.name}`,
      status: 'started'
    });
    
    result = await ItemSyncService.syncFromZoho(company, (progress) => {
      updateSyncProgress(companyId, progress);
    });
    
    clearCache(`zoho_items_${companyId}`);
    clearCache(`zoho_items_stats_${companyId}`);
    
    if (result && result.success && result.total > 0) {
      company.lastItemSyncAt = new Date();
      await company.save();
    }
    
    setSyncStatusForCompany(companyId, {
      isSyncing: false,
      lastSyncTime: new Date(),
      lastSyncResult: result
    });
    
    updateSyncProgress(companyId, {
      stage: 'completed',
      message: `Sync completed! ${result?.created || 0} new, ${result?.updated || 0} updated, ${result?.deleted || 0} deleted`,
      fetched: result?.total || 0,
      total: result?.total || 0,
      created: result?.created || 0,
      updated: result?.updated || 0,
      deleted: result?.deleted || 0,
      errors: result?.errors || 0,
      duration: result?.duration,
      startTime: Date.now()
    });
    
    logger.info(`Item sync completed for company: ${company.code}`, {
      companyId,
      companyCode: company.code,
      totalItems: result?.total || 0,
      created: result?.created || 0,
      updated: result?.updated || 0,
      deleted: result?.deleted || 0,
      errors: result?.errors || 0,
      duration: result?.duration
    });
    
    setTimeout(() => {
      const current = syncProgressMap.get(companyId);
      if (current?.stage === 'completed') {
        syncProgressMap.delete(companyId);
      }
    }, 15000);
    
  } catch (error) {
    logger.error(`Item sync error for company ${companyId}: ${error.message}`, {
      error: error.message,
      stack: error.stack,
      companyId
    });
    
    if (companyId) {
      setSyncStatusForCompany(companyId, {
        isSyncing: false,
        lastSyncResult: { success: false, error: error.message }
      });
      
      updateSyncProgress(companyId, {
        stage: 'error',
        message: `Sync failed: ${error.message}`,
        error: error.message,
        startTime: Date.now()
      });
      
      setTimeout(() => {
        syncProgressMap.delete(companyId);
      }, 10000);
    }
  }
};

// ─────────────────────────────────────────────────────────────────────────
// GET SYNC PROGRESS (NEW ENDPOINT)
// ─────────────────────────────────────────────────────────────────────────
exports.getSyncProgress = async (req, res) => {
  try {
    const companyId = req.headers['x-company-id'] || req.query.companyId;
    
    if (!companyId) {
      return res.status(400).json({ 
        success: false, 
        message: 'Company ID is required' 
      });
    }
    
    const progress = getSyncProgress(companyId);
    const syncStatus = getSyncStatusForCompany(companyId);
    
    let estimatedRemaining = null;
    if (progress.stage === 'fetching' && progress.fetched > 0 && progress.total > 0 && progress.startTime) {
      const elapsed = (Date.now() - progress.startTime) / 1000;
      const rate = progress.fetched / elapsed;
      const remainingItems = progress.total - progress.fetched;
      const remainingSeconds = remainingItems / rate;
      estimatedRemaining = Math.ceil(remainingSeconds);
    }
    
    const isActuallySyncing = syncStatus.isSyncing;
    const isCompleted = progress.stage === 'completed';
    const isError = progress.stage === 'error';
    
    if (isCompleted || isError) {
      const progressAge = Date.now() - (progress.updatedAt || Date.now());
      if (progressAge > 10000) {
        syncProgressMap.delete(companyId);
      }
    }
    
    res.json({
      success: true,
      isSyncing: isActuallySyncing,
      progress: {
        stage: progress.stage,
        message: progress.message,
        fetched: progress.fetched || 0,
        total: progress.total || 0,
        page: progress.page || 0,
        totalPages: progress.totalPages || 0,
        created: progress.created,
        updated: progress.updated,
        deleted: progress.deleted,
        errors: progress.errors,
        estimatedRemaining: estimatedRemaining ? `${estimatedRemaining}s` : null,
        startTime: progress.startTime
      }
    });
  } catch (error) {
    logger.error(`Error getting sync progress: ${error.message}`, { error: error.message });
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
};

// ─────────────────────────────────────────────────────────────────────────
// GET SYNC STATUS (LEGACY - KEPT FOR COMPATIBILITY)
// ─────────────────────────────────────────────────────────────────────────
exports.getSyncStatus = async (req, res) => {
  try {
    const companyId = req.headers['x-company-id'] || req.query.companyId;
    
    if (!companyId) {
      return res.status(400).json({
        success: false,
        message: 'Company ID is required'
      });
    }
    
    const syncStatus = getSyncStatusForCompany(companyId);
    const progress = getSyncProgress(companyId);
    const stats = await ItemSyncService.getStats(companyId);
    
    res.json({
      success: true,
      status: {
        isSyncing: syncStatus.isSyncing,
        lastSyncTime: syncStatus.lastSyncTime,
        lastSyncResult: syncStatus.lastSyncResult,
        totalItems: stats.totalItems || 0,
        lastSyncDate: stats.lastSync
      },
      progress: {
        stage: progress.stage,
        message: progress.message,
        fetched: progress.fetched,
        total: progress.total,
        page: progress.page,
        totalPages: progress.totalPages
      },
      companyId
    });
  } catch (error) {
    logger.error(`Error getting sync status: ${error.message}`, { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Error getting sync status',
      error: error.message
    });
  }
};

// ─────────────────────────────────────────────────────────────────────────
// SEARCH ITEMS
// ─────────────────────────────────────────────────────────────────────────
exports.searchItems = async (req, res) => {
  try {
    const { query, limit = 20, offset = 0, product_type } = req.query;
    const companyId = req.headers['x-company-id'] || req.query.companyId;
    
    if (!companyId) {
      return res.status(400).json({
        success: false,
        message: 'Company ID is required'
      });
    }

    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Search query is required'
      });
    }

    const searchTerm = query.trim().toLowerCase();
    const parsedLimit = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
    const parsedOffset = Math.max(parseInt(offset, 10) || 0, 0);

    const cacheKey = `zoho_items_search_${companyId}:${searchTerm}:${parsedLimit}:${parsedOffset}:${product_type || 'all'}`;
    const cachedResult = getFromCache(cacheKey);
    
    if (cachedResult) {
      return res.status(200).json({
        success: true,
        data: cachedResult.data,
        total: cachedResult.total,
        limit: parsedLimit,
        offset: parsedOffset,
        source: 'cache'
      });
    }

    const company = await Company.findById(companyId);
    if (company) {
      zohoBooksService.setCompany(company._id, company.zohoOrganizationId);
    }
    
    const result = await zohoBooksService.getAllItems();

    if (!result.success || !Array.isArray(result.items)) {
      return res.status(500).json({
        success: false,
        message: 'Error fetching items'
      });
    }

    let mappedItems = result.items
      .map(item => {
        try {
          return mapZohoItem(item);
        } catch (error) {
          return null;
        }
      })
      .filter(item => item !== null);

    if (product_type && product_type !== 'all') {
      mappedItems = mappedItems.filter(item => item.product_type === product_type);
    }

    const searchResults = mappedItems.filter(item => {
      const name = (item.name || '').toLowerCase();
      const sku = (item.sku || '').toLowerCase();
      const description = (item.description || '').toLowerCase();
      return name.includes(searchTerm) || sku.includes(searchTerm) || description.includes(searchTerm);
    });

    const paginatedResults = searchResults.slice(parsedOffset, parsedOffset + parsedLimit);

    const responseData = {
      data: paginatedResults,
      total: searchResults.length,
      limit: parsedLimit,
      offset: parsedOffset,
      hasMore: parsedOffset + parsedLimit < searchResults.length
    };

    setToCache(cacheKey, responseData, 300);

    res.status(200).json({
      success: true,
      ...responseData,
      source: result.source || 'api'
    });

  } catch (error) {
    logger.error(`Error searching items: ${error.message}`, {
      error: error.message,
      query: req.query.query
    });
    res.status(500).json({
      success: false,
      message: 'Error searching items',
      error: error.message
    });
  }
};

// ─────────────────────────────────────────────────────────────────────────
// GET ITEMS STATISTICS
// ─────────────────────────────────────────────────────────────────────────
exports.getItemsStats = async (req, res) => {
  try {
    const companyId = req.headers['x-company-id'] || req.query.companyId;
    
    if (!companyId) {
      return res.status(400).json({
        success: false,
        message: 'Company ID is required'
      });
    }
    
    const cacheKey = `zoho_items_stats_${companyId}`;
    const cachedStats = getFromCache(cacheKey);
    
    if (cachedStats) {
      return res.status(200).json({
        success: true,
        stats: cachedStats,
        source: 'cache'
      });
    }

    const company = await Company.findById(companyId);
    if (company) {
      zohoBooksService.setCompany(company._id, company.zohoOrganizationId);
    }
    
    const result = await zohoBooksService.getAllItems();

    if (!result.success || !Array.isArray(result.items)) {
      return res.status(500).json({
        success: false,
        message: 'Error fetching items'
      });
    }

    const stats = {
      totalItems: result.items.length,
      totalValue: 0,
      averagePrice: 0,
      highestPrice: 0,
      lowestPrice: Infinity,
      byStatus: {},
      byType: {},
      byProductType: { goods: 0, service: 0 },
      byTaxable: { taxable: 0, nonTaxable: 0 },
      bySellable: { sellable: 0, notSellable: 0 }
    };

    let validPrices = [];

    result.items.forEach(item => {
      try {
        const price = parseFloat(item.rate) || 0;
        if (price > 0) {
          stats.totalValue += price;
          validPrices.push(price);
          stats.highestPrice = Math.max(stats.highestPrice, price);
          stats.lowestPrice = Math.min(stats.lowestPrice, price);
        }

        const status = item.status || 'unknown';
        stats.byStatus[status] = (stats.byStatus[status] || 0) + 1;

        const type = item.item_type || 'unknown';
        stats.byType[type] = (stats.byType[type] || 0) + 1;

        const productType = item.product_type || 'goods';
        if (productType === 'goods') stats.byProductType.goods++;
        else if (productType === 'service') stats.byProductType.service++;

        if (item.is_taxable) stats.byTaxable.taxable++;
        else stats.byTaxable.nonTaxable++;

        if (item.can_be_sold) stats.bySellable.sellable++;
        else stats.bySellable.notSellable++;
      } catch (error) {
        logger.warn(`Error calculating stats for item: ${error.message}`);
      }
    });

    stats.averagePrice = validPrices.length > 0 ? stats.totalValue / validPrices.length : 0;
    stats.lowestPrice = stats.lowestPrice === Infinity ? 0 : stats.lowestPrice;

    setToCache(cacheKey, stats, 600);

    res.status(200).json({
      success: true,
      stats,
      source: result.source || 'api'
    });

  } catch (error) {
    logger.error(`Error calculating statistics: ${error.message}`, { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Error calculating statistics',
      error: error.message
    });
  }
};

// ─────────────────────────────────────────────────────────────────────────
// CLEAR ITEMS CACHE
// ─────────────────────────────────────────────────────────────────────────
exports.clearItemsCache = async (req, res) => {
  try {
    const companyId = req.headers['x-company-id'] || req.query.companyId;

    let patterns = ['zoho_items', 'zoho_item'];
    
    if (companyId) {
      patterns = [`zoho_items_${companyId}`, `zoho_item_${companyId}`];
    }

    let totalCleared = 0;
    for (const pattern of patterns) {
      clearCache(pattern);
      totalCleared++;
    }

    logger.info(`Items cache cleared for company: ${companyId || 'all'}`, {
      companyId: companyId || 'all',
      patterns: totalCleared,
      clearedBy: req.user?.id
    });

    res.status(200).json({
      success: true,
      message: `Cache cleared successfully (${totalCleared} patterns)`,
      companyId: companyId || 'all'
    });
  } catch (error) {
    logger.error(`Error clearing cache: ${error.message}`, { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Error clearing cache',
      error: error.message
    });
  }
};

// ─────────────────────────────────────────────────────────────────────────
// DISABLED OPERATIONS
// ─────────────────────────────────────────────────────────────────────────
exports.createItem = (req, res) => {
  logger.warn(`Create item attempted (disabled) by user: ${req.user?.id}`, {
    userId: req.user?.id,
    companyId: req.headers['x-company-id']
  });
  res.status(501).json({
    success: false,
    message: 'Create operation is currently disabled. Items are managed in Zoho Books directly.',
    note: 'Please use Zoho Books interface to create items.'
  });
};

exports.updateItem = (req, res) => {
  logger.warn(`Update item attempted (disabled) by user: ${req.user?.id}`, {
    userId: req.user?.id,
    itemId: req.params.id
  });
  res.status(501).json({
    success: false,
    message: 'Update operation is currently disabled. Items are managed in Zoho Books directly.',
    note: 'Please use Zoho Books interface to update items.'
  });
};

exports.deleteItem = (req, res) => {
  logger.warn(`Delete item attempted (disabled) by user: ${req.user?.id}`, {
    userId: req.user?.id,
    itemId: req.params.id
  });
  res.status(501).json({
    success: false,
    message: 'Delete operation is currently disabled. Items are managed in Zoho Books directly.',
    note: 'Please use Zoho Books interface to delete items.'
  });
};

exports.getItemsByCategory = async (req, res) => {
  res.status(501).json({
    success: false,
    message: 'Category filtering is temporarily disabled'
  });
};