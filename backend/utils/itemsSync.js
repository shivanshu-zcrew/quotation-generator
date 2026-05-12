// services/itemSyncService.js
const Item = require('../models/items');
const Company = require('../models/company');
const zohoBooksService = require('../zoho/customerServices');
const Redis = require('../config/redisService');

class ItemSyncService {
  
  static async getItems(options = {}) {
    const { 
      forceRefresh = false, 
      search = '', 
      page = 1, 
      limit = 50, 
      companyId = null,
      product_type
    } = options;
    
    if (!companyId) {
      throw new Error('Company ID is required');
    }
    
    const company = await Company.findById(companyId);
    if (!company) {
      throw new Error('Company not found');
    }
    
    if (forceRefresh) {
      await this.syncFromZoho(company);
    }
    
    const query = { companyId: company._id };
    
    if (product_type && product_type !== 'all') {
      query.product_type = product_type;
    }
    
    if (search) {
      query.$text = { $search: search };
    }
    
    const totalItems = await Item.countDocuments(query);
    const items = await Item.find(query)
      .sort({ name: 1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();
    
    if (items.length > 0) {
      return {
        success: true,
        data: items.map(this.formatItem),
        pagination: {
          page,
          limit,
          totalItems,
          totalPages: Math.ceil(totalItems / limit),
          hasNextPage: page < Math.ceil(totalItems / limit)
        },
        source: 'mongodb_cache'
      };
    }
    
    const zohoResult = await this.fetchFromZoho({ ...options, company });
    
    if (zohoResult.success && zohoResult.data.length > 0) {
      this.syncFromZoho(company).catch(console.error);
    }
    
    return zohoResult;
  }
  
 
static async syncFromZoho(company, onProgress = null) {
  if (!company) {
    throw new Error('Company is required for sync');
  }
  
  const startTime = Date.now();
  
  try {
    console.log(`\n🔄 Starting item sync for company: ${company.name} (${company.code})`);
    
    if (onProgress) {
      onProgress({
        stage: 'fetching',
        message: 'Connecting to Zoho...',
        fetched: 0,
        total: 0,
        page: 0,
        totalPages: 0,
        startTime: startTime
      });
    }
    
    zohoBooksService.setCompany(company._id, company.zohoOrganizationId);
    
    // Fetch ALL items from Zoho (including status filter)
    let allZohoItems = [];
    let page = 1;
    let hasMore = true;
    let totalPages = 0;
    
    while (hasMore && page <= 50) {
      if (onProgress) {
        onProgress({
          stage: 'fetching',
          message: `Fetching page ${page}...`,
          fetched: allZohoItems.length,
          total: 0,
          page: page,
          totalPages: totalPages,
          startTime: startTime
        });
      }
      
      // ✅ Fetch items with status filter to get all items (active + inactive)
      const result = await zohoBooksService._request('GET', `/items?page=${page}&per_page=200&filter_by=Status.All`);
      
      if (result.success && result.data?.items) {
        const items = result.data.items;
        allZohoItems = [...allZohoItems, ...items];
        
        const pageContext = result.data.page_context || {};
        totalPages = pageContext.total_pages || 0;
        hasMore = pageContext.has_more_page === true;
        
        console.log(`📥 Page ${page}: ${items.length} items (Total: ${allZohoItems.length})`);
        
        page++;
        await new Promise(resolve => setTimeout(resolve, 100));
      } else {
        hasMore = false;
      }
    }
    
    console.log(`✅ Fetched ${allZohoItems.length} items from Zoho for ${company.name}`);
    
    // ✅ Extract Zoho IDs from fetched items
    const zohoItemIds = new Set(allZohoItems.map(item => item.item_id));
    
    if (onProgress) {
      onProgress({
        stage: 'saving',
        message: `Processing ${allZohoItems.length} items...`,
        fetched: allZohoItems.length,
        total: allZohoItems.length,
        startTime: startTime
      });
    }
    
    let created = 0;
    let updated = 0;
    let deleted = 0;
    let errors = 0;
    
    const batchSize = 100;
    const totalBatches = Math.ceil(allZohoItems.length / batchSize);
    
    // ✅ Process Zoho items (create/update)
    for (let i = 0; i < allZohoItems.length; i += batchSize) {
      const batch = allZohoItems.slice(i, i + batchSize);
      const processed = Math.min(i + batchSize, allZohoItems.length);
      const currentBatch = Math.floor(i / batchSize) + 1;
      
      if (onProgress) {
        onProgress({
          stage: 'saving',
          message: `Processing batch ${currentBatch}/${totalBatches} (${processed}/${allZohoItems.length} items)...`,
          fetched: processed,
          total: allZohoItems.length,
          processed: processed,
          batch: currentBatch,
          totalBatches: totalBatches,
          startTime: startTime
        });
      }
      
      await Promise.all(batch.map(async (zohoItem) => {
        try {
          const existingItem = await Item.findOne({ 
            companyId: company._id,
            zohoId: zohoItem.item_id 
          });
          
          const itemData = {
            companyId: company._id,
            zohoId: zohoItem.item_id,
            name: zohoItem.name || 'Unknown',
            price: parseFloat(zohoItem.rate) || 0,
            description: zohoItem.description || '',
            sku: zohoItem.sku || '',
            unit: zohoItem.unit || '',
            product_type: zohoItem.product_type || 'goods',
            tax_percentage: parseFloat(zohoItem.tax_percentage) || 0,
            status: zohoItem.status || 'active',
            is_taxable: zohoItem.is_taxable !== false,
            can_be_sold: zohoItem.can_be_sold !== false,
            lastSyncedAt: new Date(),
            zohoData: zohoItem,
            isActive: zohoItem.status === 'active'
          };
          
          await Item.findOneAndUpdate(
            { companyId: company._id, zohoId: zohoItem.item_id },
            itemData,
            { upsert: true, new: true }
          );
          
          if (!existingItem) created++;
          else updated++;
        } catch (itemError) {
          console.error(`Error processing item ${zohoItem.item_id}:`, itemError.message);
          errors++;
        }
      }));
      
      console.log(`   Batch ${currentBatch}/${totalBatches}: Processed ${processed}/${allZohoItems.length} items`);
    }
    
    // ✅ DELETE items that exist in DB but NOT in Zoho
    if (onProgress) {
      onProgress({
        stage: 'deleting',
        message: 'Checking for deleted items...',
        fetched: allZohoItems.length,
        total: allZohoItems.length,
        startTime: startTime
      });
    }
    
    // Find items in DB that are not in Zoho
    const dbItems = await Item.find({ 
      companyId: company._id,
      zohoId: { $nin: Array.from(zohoItemIds) }
    });
    
    if (dbItems.length > 0) {
      console.log(`🗑️ Found ${dbItems.length} items to delete (exist in DB but not in Zoho)`);
      
      const deletePromises = dbItems.map(async (item) => {
        try {
          await Item.deleteOne({ _id: item._id });
          console.log(`   Deleted: ${item.name} (${item.zohoId})`);
          deleted++;
        } catch (deleteError) {
          console.error(`   Error deleting ${item.name}:`, deleteError.message);
          errors++;
        }
      });
      
      await Promise.all(deletePromises);
      console.log(`✅ Deleted ${deleted} items that no longer exist in Zoho`);
    } else {
      console.log('✅ No items to delete - DB is in sync with Zoho');
    }
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    
    console.log(`✅ Item sync completed for ${company.name}:`);
    console.log(`   Created: ${created}, Updated: ${updated}, Deleted: ${deleted}, Errors: ${errors}`);
    console.log(`   Duration: ${duration}s`);
    
    if (onProgress) {
      onProgress({
        stage: 'completed',
        message: `Sync completed! ${created} new, ${updated} updated, ${deleted} deleted`,
        fetched: allZohoItems.length,
        total: allZohoItems.length,
        created: created,
        updated: updated,
        deleted: deleted,
        errors: errors,
        duration: duration,
        startTime: startTime
      });
    }
    
    return { 
      success: true, 
      created, 
      updated, 
      deleted,
      errors,
      total: allZohoItems.length,
      duration: `${duration}s`,
      companyId: company._id
    };
    
  } catch (error) {
    console.error(`❌ Error syncing items for ${company.name}:`, error);
    if (onProgress) {
      onProgress({
        stage: 'error',
        message: `Sync failed: ${error.message}`,
        error: error.message,
        startTime: startTime
      });
    }
    return { success: false, error: error.message };
  }
}
  
  static async fetchFromZoho(options = {}) {
    const { company, search = '', page = 1, limit = 50, product_type } = options;
    
    if (!company) {
      return {
        success: false,
        error: 'Company is required',
        data: [],
        source: 'error'
      };
    }
    
    try {
      zohoBooksService.setCompany(company._id, company.zohoOrganizationId);
      
      const result = await zohoBooksService.getAllItems();
      
      if (!result.success || !Array.isArray(result.items)) {
        throw new Error('Failed to fetch from Zoho');
      }
      
      let items = result.items.map(zohoItem => ({
        _id: zohoItem.item_id,
        zohoId: zohoItem.item_id,
        name: zohoItem.name || 'Unknown',
        price: parseFloat(zohoItem.rate) || 0,
        description: zohoItem.description || '',
        sku: zohoItem.sku || '',
        unit: zohoItem.unit || '',
        product_type: zohoItem.product_type || 'goods',
        tax_percentage: parseFloat(zohoItem.tax_percentage) || 0
      }));
      
      if (product_type && product_type !== 'all') {
        items = items.filter(item => item.product_type === product_type);
      }
      
      if (search) {
        const searchLower = search.toLowerCase();
        items = items.filter(item => 
          item.name.toLowerCase().includes(searchLower) ||
          item.sku?.toLowerCase().includes(searchLower)
        );
      }
      
      const start = (page - 1) * limit;
      const paginatedItems = items.slice(start, start + limit);
      
      return {
        success: true,
        data: paginatedItems,
        pagination: {
          page,
          limit,
          totalItems: items.length,
          totalPages: Math.ceil(items.length / limit),
          hasNextPage: page < Math.ceil(items.length / limit)
        },
        source: 'zoho_api',
        companyId: company._id
      };
      
    } catch (error) {
      console.error('Error fetching from Zoho:', error);
      return {
        success: false,
        error: error.message,
        data: [],
        source: 'error'
      };
    }
  }
  
  static async getItemByIdentifier(identifier, companyId = null) {
    const mongoose = require('mongoose');
    
    let query = {};
    if (companyId) {
      query.companyId = companyId;
    }
    
    if (mongoose.Types.ObjectId.isValid(identifier)) {
      query._id = identifier;
      const item = await Item.findOne(query);
      if (item) return this.formatItem(item);
    }
    
    query.zohoId = identifier;
    const item = await Item.findOne(query);
    if (item) return this.formatItem(item);
    
    if (companyId) {
      const company = await Company.findById(companyId);
      if (company) {
        zohoBooksService.setCompany(company._id, company.zohoOrganizationId);
        const zohoResult = await zohoBooksService.getItem(identifier);
        if (zohoResult.success && zohoResult.item) {
          this.syncFromZoho(company).catch(console.error);
          return {
            _id: zohoResult.item.item_id,
            zohoId: zohoResult.item.item_id,
            name: zohoResult.item.name,
            price: parseFloat(zohoResult.item.rate) || 0,
            description: zohoResult.item.description,
            sku: zohoResult.item.sku,
            source: 'zoho_api'
          };
        }
      }
    }
    
    return null;
  }
  
  static formatItem(item) {
    return {
      _id: item._id,
      zohoId: item.zohoId,
      name: item.name,
      price: item.price,
      description: item.description,
      sku: item.sku,
      unit: item.unit,
      product_type: item.product_type,
      tax_percentage: item.tax_percentage,
      imagePath: item.imagePath,
      can_be_sold: item.can_be_sold,
      isActive: item.isActive,
      status: item.status,
      companyId: item.companyId
    };
  }
  
  static async getStats(companyId = null) {
    const query = { isActive: true };
    if (companyId) {
      query.companyId = companyId;
    }
    
    const total = await Item.countDocuments(query);
    const avgPrice = await Item.aggregate([
      { $match: query },
      { $group: { _id: null, avg: { $avg: '$price' } } }
    ]);
    
    const lastSync = await Item.findOne(query).sort('-lastSyncedAt').select('lastSyncedAt');
    
    return {
      totalItems: total,
      averagePrice: avgPrice[0]?.avg || 0,
      lastSync: lastSync?.lastSyncedAt || null
    };
  }
  
  static async clearCompanyItems(companyId) {
    const result = await Item.deleteMany({ companyId });
    console.log(`🗑️ Cleared ${result.deletedCount} items for company ${companyId}`);
    return result;
  }
}

module.exports = ItemSyncService;