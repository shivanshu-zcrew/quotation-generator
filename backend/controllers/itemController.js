const Item = require('../models/items');
const Company = require('../models/company'); // Add this import
const { uploadToCloudinary, deleteFromCloudinary } = require('../utils/uploadCloudnary');
const zohoBooksService = require('../zoho/customerServices');
const ItemSyncService = require('../utils/itemsSync');

// ─────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────
const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 500;
const MIN_PAGE_SIZE = 1;

// Cache TTL for paginated results (5 minutes)
const PAGINATION_CACHE_TTL = 300;

// Track sync status per company
const syncStatusMap = new Map(); // key: companyId, value: { isSyncing, lastSyncTime, lastSyncResult }

// ─────────────────────────────────────────────────────────────────────────
// HELPER FUNCTIONS
// ─────────────────────────────────────────────────────────────────────────

/**
 * Get sync status for a specific company
 */
function getSyncStatusForCompany(companyId) {
  if (!syncStatusMap.has(companyId)) {
    syncStatusMap.set(companyId, {
      isSyncing: false,
      lastSyncTime: null,
      lastSyncResult: null
    });
  }
  return syncStatusMap.get(companyId);
}

/**
 * Set sync status for a specific company
 */
function setSyncStatusForCompany(companyId, updates) {
  const current = getSyncStatusForCompany(companyId);
  syncStatusMap.set(companyId, { ...current, ...updates });
}

/**
 * Validate and sanitize pagination parameters
 */
function validatePaginationParams(query) {
  let page = parseInt(query.page, 10) || 1;
  let limit = parseInt(query.limit, 10) || DEFAULT_PAGE_SIZE;
  const search = query.search ? String(query.search).trim() : '';
  const sortBy = query.sortBy || 'name';
  const sortOrder = query.sortOrder === 'desc' ? -1 : 1;

  if (page < 1) page = 1;
  if (limit < MIN_PAGE_SIZE) limit = MIN_PAGE_SIZE;
  if (limit > MAX_PAGE_SIZE) limit = MAX_PAGE_SIZE;

  return {
    page,
    limit,
    skip: (page - 1) * limit,
    search,
    sortBy,
    sortOrder
  };
}

/**
 * Map Zoho item to application format
 */
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
// GET ALL ITEMS WITH PAGINATION (Multi-Company Support)
// ─────────────────────────────────────────────────────────────────────────
exports.getAllItems = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 50, 
      search = '', 
      forceRefresh = false 
    } = req.query;
    
    // Get company from headers or query
    const companyId = req.headers['x-company-id'] || req.query.companyId;
    
    if (!companyId) {
      return res.status(400).json({
        success: false,
        message: 'Company ID is required. Please select a company first.'
      });
    }
    
    // Set company context in zohoBooksService
    const company = await Company.findById(companyId);
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
      forceRefresh: forceRefresh === 'true'
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
      company: {
        id: company._id,
        name: company.name,
        code: company.code
      }
    });
    
  } catch (error) {
    console.error('❌ Error fetching items:', error);
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
    console.error('❌ Error fetching item:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching item',
      error: error.message
    });
  }
};

// ─────────────────────────────────────────────────────────────────────────
// SYNC ITEMS FROM ZOHO (Multi-Company Support)
// ─────────────────────────────────────────────────────────────────────────
exports.syncItems = async (req, res) => {
  try {
    const companyId = req.headers['x-company-id'] || req.body.companyId;
    
    if (!companyId) {
      return res.status(400).json({
        success: false,
        message: 'Company ID is required. Please select a company first.'
      });
    }
    
    // Get company details
    const company = await Company.findById(companyId);
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
    
    // Check if sync is already in progress for this company
    const syncStatus = getSyncStatusForCompany(companyId);
    if (syncStatus.isSyncing) {
      return res.status(409).json({
        success: false,
        message: 'Sync already in progress for this company. Please wait.',
        status: {
          isSyncing: true,
          lastSyncTime: syncStatus.lastSyncTime
        }
      });
    }
    
    // Set sync flag for this company
    setSyncStatusForCompany(companyId, { isSyncing: true });
    
    // Send immediate response that sync started
    res.json({
      success: true,
      message: `Item sync started for company: ${company.name}`,
      status: 'started',
      company: {
        id: company._id,
        name: company.name,
        code: company.code
      },
      estimatedTime: '30-60 seconds'
    });
    
    // Perform sync in background
    const result = await ItemSyncService.syncFromZoho(company);
    
    // Update sync status
    setSyncStatusForCompany(companyId, {
      isSyncing: false,
      lastSyncTime: new Date(),
      lastSyncResult: result
    });
    
    console.log(`✅ Item sync completed for ${company.name}: ${result.created} created, ${result.updated} updated`);
    
  } catch (error) {
    console.error('❌ Error syncing items:', error);
    setSyncStatusForCompany(companyId, {
      isSyncing: false,
      lastSyncResult: { success: false, error: error.message }
    });
  }
};

// ─────────────────────────────────────────────────────────────────────────
// GET SYNC STATUS (Multi-Company Support)
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
      companyId
    });
  } catch (error) {
    console.error('❌ Error getting sync status:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting sync status',
      error: error.message
    });
  }
};

// ─────────────────────────────────────────────────────────────────────────
// SEARCH ITEMS BY NAME/SKU (Multi-Company Support)
// ─────────────────────────────────────────────────────────────────────────
exports.searchItems = async (req, res) => {
  try {
    const { query, limit = 20, offset = 0 } = req.query;
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

    const redisService = require('../config/redisService');
    const cacheKey = `zoho_items_search_${companyId}:${searchTerm}:${parsedLimit}:${parsedOffset}`;

    const cachedResult = await redisService.get(cacheKey).catch(() => null);
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

    // Set company context
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

    const mappedItems = result.items
      .map(item => {
        try {
          return mapZohoItem(item);
        } catch (error) {
          return null;
        }
      })
      .filter(item => item !== null);

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

    await redisService.set(cacheKey, responseData, 300).catch(() => {});

    res.status(200).json({
      success: true,
      ...responseData,
      source: result.source || 'api'
    });

  } catch (error) {
    console.error('❌ Error searching items:', error);
    res.status(500).json({
      success: false,
      message: 'Error searching items',
      error: error.message
    });
  }
};

// ─────────────────────────────────────────────────────────────────────────
// GET ITEMS STATISTICS (Multi-Company Support)
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
    
    const redisService = require('../config/redisService');
    const cacheKey = `zoho_items_stats_${companyId}`;

    const cachedStats = await redisService.get(cacheKey).catch(() => null);
    if (cachedStats) {
      return res.status(200).json({
        success: true,
        stats: cachedStats,
        source: 'cache'
      });
    }

    // Set company context
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

        if (item.is_taxable) {
          stats.byTaxable.taxable++;
        } else {
          stats.byTaxable.nonTaxable++;
        }

        if (item.can_be_sold) {
          stats.bySellable.sellable++;
        } else {
          stats.bySellable.notSellable++;
        }
      } catch (error) {
        console.warn('Error calculating stats for item:', error.message);
      }
    });

    stats.averagePrice = validPrices.length > 0 ? stats.totalValue / validPrices.length : 0;
    stats.lowestPrice = stats.lowestPrice === Infinity ? 0 : stats.lowestPrice;

    await redisService.set(cacheKey, stats, 600).catch(() => {});

    res.status(200).json({
      success: true,
      stats,
      source: result.source || 'api'
    });

  } catch (error) {
    console.error('❌ Error calculating statistics:', error);
    res.status(500).json({
      success: false,
      message: 'Error calculating statistics',
      error: error.message
    });
  }
};

// ─────────────────────────────────────────────────────────────────────────
// CLEAR ITEMS CACHE (ADMIN ONLY) - Multi-Company Support
// ─────────────────────────────────────────────────────────────────────────
exports.clearItemsCache = async (req, res) => {
  try {
    const redisService = require('../config/redisService');
    const companyId = req.headers['x-company-id'] || req.query.companyId;

    let patterns = ['zoho_items*', 'zoho_item:*'];
    
    if (companyId) {
      patterns = [`zoho_items_${companyId}*`, `zoho_item_${companyId}:*`];
    }

    let totalCleared = 0;

    for (const pattern of patterns) {
      const result = await redisService.delPattern(pattern).catch(() => false);
      if (result) totalCleared++;
    }

    res.status(200).json({
      success: true,
      message: `Cache cleared successfully (${totalCleared} patterns)`,
      companyId: companyId || 'all'
    });
  } catch (error) {
    console.error('❌ Error clearing cache:', error);
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
  res.status(501).json({
    success: false,
    message: 'Create operation is currently disabled. Items are managed in Zoho Books directly.',
    note: 'Please use Zoho Books interface to create items.'
  });
};

exports.updateItem = (req, res) => {
  res.status(501).json({
    success: false,
    message: 'Update operation is currently disabled. Items are managed in Zoho Books directly.',
    note: 'Please use Zoho Books interface to update items.'
  });
};

exports.deleteItem = (req, res) => {
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