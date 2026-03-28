// services/itemSyncService.js
const Item = require('../models/items');
const zohoBooksService = require('../zoho/customerServices');
const Redis = require('../config/redisService');

class ItemSyncService {
  
  /**
   * Get items with smart caching strategy
   * Priority: MongoDB Cache → Zoho API → Fallback
   */
  static async getItems(options = {}) {
    const { forceRefresh = false, search = '', page = 1, limit = 50 } = options;
    
    // If force refresh, sync from Zoho first
    if (forceRefresh) {
      await this.syncFromZoho();
    }
    
    // Build MongoDB query
    const query = { isActive: true };
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
     
    const zohoResult = await this.fetchFromZoho(options);
    
    if (zohoResult.success && zohoResult.data.length > 0) {
      // Background sync to populate cache
      this.syncFromZoho().catch(console.error);
    }
    
    return zohoResult;
  }
  
  /**
   * Sync all items from Zoho to MongoDB
   */
 
static async syncFromZoho() {
     
    const startTime = Date.now();
    
    try {
      // ✅ Use getAllItems which now handles pagination
      const result = await zohoBooksService.getAllItems();
      
      if (!result.success || !Array.isArray(result.items)) {
        throw new Error('Failed to fetch items from Zoho');
      }
      
       
      
      let created = 0;
      let updated = 0;
      
      // Process in batches for better performance
      const batchSize = 100;
      for (let i = 0; i < result.items.length; i += batchSize) {
        const batch = result.items.slice(i, i + batchSize);
        
        await Promise.all(batch.map(async (zohoItem) => {
          // Check if item exists
          const existingItem = await Item.findOne({ zohoId: zohoItem.item_id });
          
          const itemData = {
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
            zohoData: zohoItem
          };
          
          // Upsert item
          await Item.findOneAndUpdate(
            { zohoId: zohoItem.item_id },
            itemData,
            { upsert: true, new: true }
          );
          
          if (!existingItem) {
            created++;
          } else {
            updated++;
          }
        }));
        
         
      }
      
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
       
      
      return { 
        success: true, 
        created, 
        updated, 
        total: result.items.length,
        duration: `${duration}s`
      };
      
    } catch (error) {
      console.error('❌ Error syncing items:', error);
      return { success: false, error: error.message };
    }
  }
  
  /**
   * Fetch directly from Zoho (fallback)
   */
  static async fetchFromZoho(options = {}) {
    try {
      const result = await zohoBooksService.getAllItems();
      
      if (!result.success || !Array.isArray(result.items)) {
        throw new Error('Failed to fetch from Zoho');
      }
      
      let items = result.items.map(zohoItem => ({
        _id: zohoItem.item_id, // Use Zoho ID as temporary ID
        zohoId: zohoItem.item_id,
        name: zohoItem.name || 'Unknown',
        price: parseFloat(zohoItem.rate) || 0,
        description: zohoItem.description || '',
        sku: zohoItem.sku || '',
        unit: zohoItem.unit || ''
      }));
      
      // Apply search filter
      if (options.search) {
        const searchLower = options.search.toLowerCase();
        items = items.filter(item => 
          item.name.toLowerCase().includes(searchLower) ||
          item.sku?.toLowerCase().includes(searchLower)
        );
      }
      
      // Apply pagination
      const page = options.page || 1;
      const limit = options.limit || 50;
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
        source: 'zoho_api'
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
  static async getItemByIdentifier(identifier) {
    // Try MongoDB ObjectId first
    if (mongoose.Types.ObjectId.isValid(identifier)) {
      const item = await Item.findById(identifier);
      if (item) return this.formatItem(item);
    }
    
    // Try Zoho ID
    const item = await Item.findOne({ zohoId: identifier });
    if (item) return this.formatItem(item);
    
    // If not in MongoDB, fetch from Zoho
    const zohoResult = await zohoBooksService.getItem(identifier);
    if (zohoResult.success && zohoResult.item) {
      // Background sync
      this.syncFromZoho().catch(console.error);
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
    
    return null;
  }
  
  /**
   * Format item for API response
   */
  static formatItem(item) {
    return {
      _id: item._id,           // MongoDB ObjectId (24 chars)
      zohoId: item.zohoId,     // Zoho ID (19 digits)
      name: item.name,
      price: item.price,
      description: item.description,
      sku: item.sku,
      unit: item.unit,
      product_type: item.product_type,
      tax_percentage: item.tax_percentage,
      imagePath: item.imagePath
    };
  }
  
  /**
   * Get item statistics
   */
  static async getStats() {
    const total = await Item.countDocuments({ isActive: true });
    const avgPrice = await Item.aggregate([
      { $match: { isActive: true } },
      { $group: { _id: null, avg: { $avg: '$price' } } }
    ]);
    
    return {
      totalItems: total,
      averagePrice: avgPrice[0]?.avg || 0,
      lastSync: await Item.findOne().sort('-lastSyncedAt').select('lastSyncedAt')
    };
  }
}

module.exports = ItemSyncService;