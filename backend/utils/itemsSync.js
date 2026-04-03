// services/itemSyncService.js
const Item = require('../models/items');
const Company = require('../models/company'); // Add this import
const zohoBooksService = require('../zoho/customerServices');
const Redis = require('../config/redisService');

class ItemSyncService {
  
  /**
   * Get items with smart caching strategy
   * Priority: MongoDB Cache → Zoho API → Fallback
   */
  static async getItems(options = {}) {
    const { forceRefresh = false, search = '', page = 1, limit = 50, companyId = null } = options;
    
    if (!companyId) {
      throw new Error('Company ID is required');
    }
    
    // Get company to set context
    const company = await Company.findById(companyId);
    if (!company) {
      throw new Error('Company not found');
    }
    
    // If force refresh, sync from Zoho first
    if (forceRefresh) {
      await this.syncFromZoho(company);
    }
    
    // Build MongoDB query with company filter
    const query = { isActive: true, companyId: company._id };
    if (search) {
      query.$text = { $search: search };
    }
    
    // Try to get from MongoDB first (fast)
    const totalItems = await Item.countDocuments(query);
    const items = await Item.find(query)
      .sort({ name: 1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();
    
    // If MongoDB has data, return it
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
    
    // If MongoDB is empty, fetch from Zoho and cache
    const zohoResult = await this.fetchFromZoho({ ...options, company });
    
    if (zohoResult.success && zohoResult.data.length > 0) {
      // Background sync to populate cache
      this.syncFromZoho(company).catch(console.error);
    }
    
    return zohoResult;
  }
  
  /**
   * Sync all items from Zoho to MongoDB for a specific company
   */
  static async syncFromZoho(company) {
    if (!company) {
      throw new Error('Company is required for sync');
    }
    
    const startTime = Date.now();
    
    try {
      console.log(`\n🔄 Starting item sync for company: ${company.name} (${company.code})`);
      
      // Set company context in zohoBooksService
      zohoBooksService.setCompany(company._id, company.zohoOrganizationId);
      
      // Use getAllItems which handles pagination
      const result = await zohoBooksService.getAllItems();
      
      if (!result.success || !Array.isArray(result.items)) {
        throw new Error('Failed to fetch items from Zoho');
      }
      
      console.log(`✅ Fetched ${result.items.length} items from Zoho for ${company.name}`);
      
      let created = 0;
      let updated = 0;
      let errors = 0;
      
      // Process in batches for better performance
      const batchSize = 100;
      for (let i = 0; i < result.items.length; i += batchSize) {
        const batch = result.items.slice(i, i + batchSize);
        
        await Promise.all(batch.map(async (zohoItem) => {
          try {
            // Check if item exists for this company
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
            
            // Upsert item
            await Item.findOneAndUpdate(
              { companyId: company._id, zohoId: zohoItem.item_id },
              itemData,
              { upsert: true, new: true }
            );
            
            if (!existingItem) {
              created++;
            } else {
              updated++;
            }
          } catch (itemError) {
            console.error(`Error processing item ${zohoItem.item_id}:`, itemError.message);
            errors++;
          }
        }));
        
        console.log(`   Processed ${Math.min(i + batchSize, result.items.length)}/${result.items.length} items`);
      }
      
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      
      console.log(`✅ Item sync completed for ${company.name}: ${created} created, ${updated} updated, ${errors} errors in ${duration}s`);
      
      // Clear Redis cache for this company
      await Redis.delPattern(`zoho_items_${company._id}*`).catch(() => {});
      
      return { 
        success: true, 
        created, 
        updated, 
        errors,
        total: result.items.length,
        duration: `${duration}s`,
        companyId: company._id
      };
      
    } catch (error) {
      console.error(`❌ Error syncing items for ${company.name}:`, error);
      return { success: false, error: error.message };
    }
  }
  
  /**
   * Fetch directly from Zoho (fallback)
   */
  static async fetchFromZoho(options = {}) {
    const { company, search = '', page = 1, limit = 50 } = options;
    
    if (!company) {
      return {
        success: false,
        error: 'Company is required',
        data: [],
        source: 'error'
      };
    }
    
    try {
      // Set company context
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
      
      // Apply search filter
      if (search) {
        const searchLower = search.toLowerCase();
        items = items.filter(item => 
          item.name.toLowerCase().includes(searchLower) ||
          item.sku?.toLowerCase().includes(searchLower)
        );
      }
      
      // Apply pagination
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
  
  /**
   * Get single item by identifier (supports both MongoDB ObjectId and Zoho ID)
   */
  static async getItemByIdentifier(identifier, companyId = null) {
    const mongoose = require('mongoose');
    
    let query = {};
    if (companyId) {
      query.companyId = companyId;
    }
    
    // Try MongoDB ObjectId first
    if (mongoose.Types.ObjectId.isValid(identifier)) {
      query._id = identifier;
      const item = await Item.findOne(query);
      if (item) return this.formatItem(item);
    }
    
    // Try Zoho ID
    query.zohoId = identifier;
    const item = await Item.findOne(query);
    if (item) return this.formatItem(item);
    
    // If not in MongoDB and we have companyId, fetch from Zoho
    if (companyId) {
      const company = await Company.findById(companyId);
      if (company) {
        zohoBooksService.setCompany(company._id, company.zohoOrganizationId);
        const zohoResult = await zohoBooksService.getItem(identifier);
        if (zohoResult.success && zohoResult.item) {
          // Background sync
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
  
  /**
   * Format item for API response
   */
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
      companyId: item.companyId
    };
  }
  
  /**
   * Get item statistics for a company
   */
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
  
  /**
   * Clear all items for a company
   */
  static async clearCompanyItems(companyId) {
    const result = await Item.deleteMany({ companyId });
    console.log(`🗑️ Cleared ${result.deletedCount} items for company ${companyId}`);
    return result;
  }
}

module.exports = ItemSyncService;