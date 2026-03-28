const Item = require('../models/items');
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

// ─────────────────────────────────────────────────────────────────────────
// HELPER FUNCTIONS
// ─────────────────────────────────────────────────────────────────────────

/**
 * Validate and sanitize pagination parameters
 */
function validatePaginationParams(query) {
  let page = parseInt(query.page, 10) || 1;
  let limit = parseInt(query.limit, 10) || DEFAULT_PAGE_SIZE;
  const search = query.search ? String(query.search).trim() : '';
  const sortBy = query.sortBy || 'name';
  const sortOrder = query.sortOrder === 'desc' ? -1 : 1;

  // Validate page number
  if (page < 1) page = 1;

  // Validate limit
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
    is_taxable: item.is_taxable !== false, // Default to true
    can_be_sold: item.can_be_sold !== false,
    can_be_purchased: item.can_be_purchased === true,
    track_inventory: item.track_inventory === true,
    item_type: item.item_type || 'sales',
    // Include full Zoho data
    zohoData: item
  };
}

/**
 * Filter items based on search criteria
 */
function filterItems(items, searchTerm) {
  if (!searchTerm || searchTerm.length === 0) {
    return items;
  }

  const searchLower = searchTerm.toLowerCase();

  return items.filter(item => {
    // Search in name, description, SKU
    const name = (item.name || '').toLowerCase();
    const description = (item.description || '').toLowerCase();
    const sku = (item.sku || '').toLowerCase();

    return (
      name.includes(searchLower) ||
      description.includes(searchLower) ||
      sku.includes(searchLower)
    );
  });
}

/**
 * Sort items based on sort criteria
 */
function sortItems(items, sortBy, sortOrder) {
  const validSortFields = ['name', 'price', 'sku', 'status', 'created_time'];

  // Default to name if invalid sort field
  const field = validSortFields.includes(sortBy) ? sortBy : 'name';

  return items.sort((a, b) => {
    let aValue = a[field] || '';
    let bValue = b[field] || '';

    // Handle numeric comparisons
    if (field === 'price' || field === 'tax_percentage') {
      aValue = parseFloat(aValue) || 0;
      bValue = parseFloat(bValue) || 0;
    } else {
      // String comparison
      aValue = String(aValue).toLowerCase();
      bValue = String(bValue).toLowerCase();
    }

    if (aValue < bValue) return -1 * sortOrder;
    if (aValue > bValue) return 1 * sortOrder;
    return 0;
  });
}

/**
 * Paginate items array
 */
function paginateItems(items, skip, limit) {
  return items.slice(skip, skip + limit);
}

// ─────────────────────────────────────────────────────────────────────────
// GET ALL ITEMS WITH PAGINATION
// ─────────────────────────────────────────────────────────────────────────
 
exports.getAllItems = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 50, 
      search = '', 
      forceRefresh = false 
    } = req.query;
    
    const result = await ItemSyncService.getItems({
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
    
    // Add cache headers
    res.setHeader('X-Data-Source', result.source);
    res.setHeader('X-Cache-Hit', result.source === 'mongodb_cache' ? 'true' : 'false');
    
    res.json({
      success: true,
      data: result.data,
      pagination: result.pagination,
      source: result.source,
      stats: await ItemSyncService.getStats()
    });
    
  } catch (error) {
     
    res.status(500).json({
      success: false,
      message: 'Error fetching items',
      error: error.message
    });
  }
};

exports.getItem = async (req, res) => {
  try {
    const { id } = req.params;
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
     
    res.status(500).json({
      success: false,
      message: 'Error fetching item',
      error: error.message
    });
  }
};

exports.syncItems = async (req, res) => {
  try {
    const result = await ItemSyncService.syncFromZoho();
    
    if (result.success) {
      res.json({
        success: true,
        message: 'Items synced successfully',
        created: result.created,
        updated: result.updated,
        total: result.total
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Failed to sync items',
        error: result.error
      });
    }
  } catch (error) {
     
    res.status(500).json({
      success: false,
      message: 'Error syncing items',
      error: error.message
    });
  }
};

// ─────────────────────────────────────────────────────────────────────────
// SEARCH ITEMS BY NAME/SKU
// ─────────────────────────────────────────────────────────────────────────
exports.searchItems = async (req, res) => {
  try {
    const { query, limit = 20, offset = 0 } = req.query;

    // ✅ Validate search query
    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Search query is required'
      });
    }

    const searchTerm = query.trim().toLowerCase();
    const parsedLimit = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
    const parsedOffset = Math.max(parseInt(offset, 10) || 0, 0);

    // Create cache key
    const redisService = require('../config/redisService');
    const cacheKey = `zoho_items_search:${searchTerm}:${parsedLimit}:${parsedOffset}`;

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

    // Fetch all items
    const result = await zohoBooksService.getAllItems();

    if (!result.success || !Array.isArray(result.items)) {
      return res.status(500).json({
        success: false,
        message: 'Error fetching items'
      });
    }

    // ✅ Map and filter items
    const mappedItems = result.items
      .map(item => {
        try {
          return mapZohoItem(item);
        } catch (error) {
          return null;
        }
      })
      .filter(item => item !== null);

    // ✅ Search items
    const searchResults = mappedItems.filter(item => {
      const name = (item.name || '').toLowerCase();
      const sku = (item.sku || '').toLowerCase();
      const description = (item.description || '').toLowerCase();

      return (
        name.includes(searchTerm) ||
        sku.includes(searchTerm) ||
        description.includes(searchTerm)
      );
    });

    // ✅ Apply offset and limit
    const paginatedResults = searchResults.slice(
      parsedOffset,
      parsedOffset + parsedLimit
    );

    const responseData = {
      data: paginatedResults,
      total: searchResults.length,
      limit: parsedLimit,
      offset: parsedOffset,
      hasMore: parsedOffset + parsedLimit < searchResults.length
    };

    // Cache results
    await redisService.set(cacheKey, responseData, 300).catch(err => {
      console.warn('Failed to cache search results:', err.message);
    });

    res.status(200).json({
      success: true,
      ...responseData,
      source: result.source || 'api'
    });

  } catch (error) {
     
    res.status(500).json({
      success: false,
      message: 'Error searching items',
      error: error.message
    });
  }
};

// ─────────────────────────────────────────────────────────────────────────
// GET ITEMS BY CATEGORY
// ─────────────────────────────────────────────────────────────────────────
exports.getItemsByCategory = async (req, res) => {
  try {
    const { category, page = 1, limit = DEFAULT_PAGE_SIZE } = req.query;

    // ✅ Validate category
    if (!category || typeof category !== 'string' || category.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Category is required'
      });
    }

    const pagination = validatePaginationParams({
      page,
      limit,
      search: ''
    });

    // Create cache key
    const redisService = require('../config/redisService');
    const cacheKey = `zoho_items_category:${category.toLowerCase()}:${pagination.page}:${pagination.limit}`;

    const cachedResult = await redisService.get(cacheKey).catch(() => null);
    if (cachedResult) {
      return res.status(200).json({
        success: true,
        ...cachedResult,
        source: 'cache'
      });
    }

    // Fetch all items
    const result = await zohoBooksService.getAllItems();

    if (!result.success || !Array.isArray(result.items)) {
      return res.status(500).json({
        success: false,
        message: 'Error fetching items'
      });
    }

    // ✅ Map and filter by category
    const categoryLower = category.toLowerCase();
    const categoryItems = result.items
      .map(item => {
        try {
          return mapZohoItem(item);
        } catch (error) {
          return null;
        }
      })
      .filter(item => item !== null && (item.category_name || '').toLowerCase().includes(categoryLower));

    // ✅ Apply pagination
    const totalCount = categoryItems.length;
    const totalPages = Math.ceil(totalCount / pagination.limit);

    if (pagination.page > totalPages && totalPages > 0) {
      return res.status(400).json({
        success: false,
        message: `Page ${pagination.page} exceeds total pages (${totalPages})`
      });
    }

    const paginatedItems = paginateItems(
      categoryItems,
      pagination.skip,
      pagination.limit
    );

    const responseData = {
      data: paginatedItems,
      pagination: {
        page: pagination.page,
        limit: pagination.limit,
        totalItems: totalCount,
        totalPages,
        hasNextPage: pagination.page < totalPages,
        hasPreviousPage: pagination.page > 1
      }
    };

    // Cache results
    await redisService.set(cacheKey, responseData, PAGINATION_CACHE_TTL).catch(err => {
      console.warn('Failed to cache category items:', err.message);
    });

    res.status(200).json({
      success: true,
      ...responseData,
      source: result.source || 'api'
    });

  } catch (error) {
     
    res.status(500).json({
      success: false,
      message: 'Error fetching items by category',
      error: error.message
    });
  }
};

// ─────────────────────────────────────────────────────────────────────────
// GET ITEMS STATISTICS
// ─────────────────────────────────────────────────────────────────────────
exports.getItemsStats = async (req, res) => {
  try {
    const redisService = require('../config/redisService');
    const cacheKey = 'zoho_items_stats';

    const cachedStats = await redisService.get(cacheKey).catch(() => null);
    if (cachedStats) {
      return res.status(200).json({
        success: true,
        stats: cachedStats,
        source: 'cache'
      });
    }

    // Fetch all items
    const result = await zohoBooksService.getAllItems();

    if (!result.success || !Array.isArray(result.items)) {
      return res.status(500).json({
        success: false,
        message: 'Error fetching items'
      });
    }

    // ✅ Calculate statistics safely
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
        // Price stats
        const price = parseFloat(item.rate) || 0;
        if (price > 0) {
          stats.totalValue += price;
          validPrices.push(price);
          stats.highestPrice = Math.max(stats.highestPrice, price);
          stats.lowestPrice = Math.min(stats.lowestPrice, price);
        }

        // Status stats
        const status = item.status || 'unknown';
        stats.byStatus[status] = (stats.byStatus[status] || 0) + 1;

        // Type stats
        const type = item.item_type || 'unknown';
        stats.byType[type] = (stats.byType[type] || 0) + 1;

        // Taxable stats
        if (item.is_taxable) {
          stats.byTaxable.taxable++;
        } else {
          stats.byTaxable.nonTaxable++;
        }

        // Sellable stats
        if (item.can_be_sold) {
          stats.bySellable.sellable++;
        } else {
          stats.bySellable.notSellable++;
        }
      } catch (error) {
        console.warn('Error calculating stats for item:', error.message);
      }
    });

    // ✅ Calculate average safely
    stats.averagePrice = validPrices.length > 0
      ? stats.totalValue / validPrices.length
      : 0;
    stats.lowestPrice = stats.lowestPrice === Infinity ? 0 : stats.lowestPrice;

    // Cache stats (longer TTL)
    await redisService.set(cacheKey, stats, 600).catch(err => {
      console.warn('Failed to cache stats:', err.message);
    });

    res.status(200).json({
      success: true,
      stats,
      source: result.source || 'api'
    });

  } catch (error) {
     
    res.status(500).json({
      success: false,
      message: 'Error calculating statistics',
      error: error.message
    });
  }
};

// ─────────────────────────────────────────────────────────────────────────
// CREATE ITEM (DISABLED)
// ─────────────────────────────────────────────────────────────────────────
exports.createItem = (req, res) => {
  res.status(501).json({
    success: false,
    message: 'Create operation is currently disabled. Items are managed in Zoho Books directly.',
    note: 'Please use Zoho Books interface to create items.'
  });
};

// ─────────────────────────────────────────────────────────────────────────
// UPDATE ITEM (DISABLED)
// ─────────────────────────────────────────────────────────────────────────
exports.updateItem = (req, res) => {
  res.status(501).json({
    success: false,
    message: 'Update operation is currently disabled. Items are managed in Zoho Books directly.',
    note: 'Please use Zoho Books interface to update items.'
  });
};

// ─────────────────────────────────────────────────────────────────────────
// DELETE ITEM (DISABLED)
// ─────────────────────────────────────────────────────────────────────────
exports.deleteItem = (req, res) => {
  res.status(501).json({
    success: false,
    message: 'Delete operation is currently disabled. Items are managed in Zoho Books directly.',
    note: 'Please use Zoho Books interface to delete items.'
  });
};

// ─────────────────────────────────────────────────────────────────────────
// CLEAR ITEMS CACHE (ADMIN ONLY)
// ─────────────────────────────────────────────────────────────────────────
exports.clearItemsCache = async (req, res) => {
  try {
    const redisService = require('../config/redisService');

    // ✅ Clear all item-related caches
    const patterns = [
      'zoho_items*',
      'zoho_item:*'
    ];

    let totalCleared = 0;

    for (const pattern of patterns) {
      const result = await redisService.delPattern(pattern).catch(() => false);
      if (result) totalCleared++;
    }

    res.status(200).json({
      success: true,
      message: `Cache cleared successfully (${totalCleared} patterns)`
    });
  } catch (error) {
     
    res.status(500).json({
      success: false,
      message: 'Error clearing cache',
      error: error.message
    });
  }
};

// Add this to your itemController.js

// Track sync status globally
let syncInProgress = false;
let lastSyncTime = null;
let lastSyncResult = null;

/**
 * Get sync status
 */
exports.getSyncStatus = async (req, res) => {
  try {
    const stats = await ItemSyncService.getStats();
    
    res.json({
      success: true,
      status: {
        isSyncing: syncInProgress,
        lastSyncTime: lastSyncTime,
        lastSyncResult: lastSyncResult,
        totalItems: stats.totalItems,
        lastSyncDate: stats.lastSync
      }
    });
  } catch (error) {
     
    res.status(500).json({
      success: false,
      message: 'Error getting sync status',
      error: error.message
    });
  }
};

/**
 * Sync items from Zoho (with status tracking)
 */
exports.syncItems = async (req, res) => {
  // Check if sync is already in progress
  if (syncInProgress) {
    return res.status(409).json({
      success: false,
      message: 'Sync already in progress. Please wait.',
      status: {
        isSyncing: true,
        lastSyncTime: lastSyncTime
      }
    });
  }
  
  // Set sync flag
  syncInProgress = true;
  
  try {
    // Send immediate response that sync started
    res.json({
      success: true,
      message: 'Sync started successfully',
      status: 'started',
      estimatedTime: '30-60 seconds'
    });
    
    // Perform sync in background
    const result = await ItemSyncService.syncFromZoho();
    
    // Update sync status
    lastSyncTime = new Date();
    lastSyncResult = result;
    syncInProgress = false;
    
     
    
  } catch (error) {
     
    syncInProgress = false;
    lastSyncResult = { success: false, error: error.message };
  }
};