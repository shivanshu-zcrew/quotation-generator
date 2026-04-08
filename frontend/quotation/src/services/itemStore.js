// stores/itemStore.js
import { create } from 'zustand';
import { itemAPI } from '../services/api';

const DEFAULT_PAGE_SIZE = 100;
const MAX_PAGES = 20;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

const useItemStore = create((set, get) => ({
  // ============================================================================
  // State
  // ============================================================================
  items: [],
  isLoading: false,
  error: null,
  totalCount: 0,
  isLoaded: false,
  lastFetched: null,
  abortController: null,
  currentCompanyId: null, // Track which company's items are loaded

  // ============================================================================
  // Load ALL items for a specific company
  // ============================================================================
  loadAllItems: async (companyId, forceRefresh = false) => {
    const { isLoading, isLoaded, lastFetched, currentCompanyId, abortController } = get();
    
    // Check if we're loading the same company and cache is valid
    const isSameCompany = currentCompanyId === companyId;
    const isCacheValid = isSameCompany && isLoaded && lastFetched && 
                        (Date.now() - lastFetched) < CACHE_TTL;
    
    // Cancel ongoing request if force refresh
    if (forceRefresh && abortController) {
      abortController.abort();
    }
    
    // Return cached data if valid
    if (!forceRefresh && isCacheValid) {
      console.log('📦 Using cached items for company:', companyId);
      return { success: true, items: get().items };
    }
    
    // Prevent duplicate loading
    if (isLoading && !forceRefresh) {
      return { success: false, error: 'Already loading' };
    }
    
    // Create new abort controller
    const newAbortController = new AbortController();
    set({ 
      isLoading: true, 
      error: null, 
      abortController: newAbortController,
      currentCompanyId: companyId 
    });
    
    try {
      let allItems = [];
      let page = 1;
      let hasMore = true;
      
      console.log(`🔄 Loading items for company: ${companyId}`);
      
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Request timeout')), 30000);
      });
      
      while (hasMore && page <= MAX_PAGES) {
        const fetchPromise = itemAPI.getAll({ 
          page, 
          limit: DEFAULT_PAGE_SIZE,
          can_be_sold: true,
          companyId // Pass companyId to API
        }, { signal: newAbortController.signal });
        
        const response = await Promise.race([fetchPromise, timeoutPromise]);
        const data = response.data;
        const itemsPage = data.data || data.items || [];
        const pagination = data.pagination || {};
        
        if (itemsPage.length === 0) {
          hasMore = false;
        } else {
          allItems = [...allItems, ...itemsPage];
          console.log(`📦 Page ${page}: loaded ${itemsPage.length} items (total: ${allItems.length})`);
          hasMore = pagination.hasNextPage === true && pagination.totalPages > page;
          page++;
        }
      }
      
      console.log(`✅ Loaded ${allItems.length} items for company ${companyId}`);
      
      set({ 
        items: allItems, 
        isLoading: false, 
        isLoaded: true,
        totalCount: allItems.length,
        error: null,
        lastFetched: Date.now(),
        abortController: null
      });
      
      return { success: true, items: allItems, count: allItems.length };
      
    } catch (error) {
      if (error.name === 'AbortError') {
        console.log('Request cancelled');
        return { success: false, error: 'Request cancelled' };
      }
      
      console.error('❌ Error loading items:', error);
      set({ 
        isLoading: false, 
        error: error.message || 'Failed to load items',
        isLoaded: false,
        abortController: null
      });
      return { success: false, error: error.message };
    }
  },
  
  // ============================================================================
  // Get item by ID
  // ============================================================================
  getItemById: async (id, fetchIfMissing = false) => {
    const { items } = get();
    const found = items.find(item => item._id === id);
    
    if (found) return found;
    
    if (fetchIfMissing) {
      try {
        const response = await itemAPI.getById(id);
        const item = response.data;
        if (item) {
          set(state => ({ 
            items: [...state.items, item],
            totalCount: state.totalCount + 1
          }));
          return item;
        }
      } catch (error) {
        console.error('Error fetching item by ID:', error);
        return null;
      }
    }
    
    return null;
  },
  
  // ============================================================================
  // Get items formatted for dropdown
  // ============================================================================
  getItemOptions: (searchTerm = '') => {
    const { items } = get();
    let filteredItems = items;
    
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filteredItems = items.filter(item => 
        item.name?.toLowerCase().includes(term) ||
        item.sku?.toLowerCase().includes(term) ||
        item.description?.toLowerCase().includes(term)
      );
    }
    
    return filteredItems.map(item => ({
      value: item._id,
      label: item.name,
      sku: item.sku,
      price: item.price,
      description: item.description,
      fullData: item
    }));
  },
  
  // ============================================================================
  // Reset items (for company change)
  // ============================================================================
  resetItems: () => {
    console.log('🔄 Resetting item store');
    
    const { abortController } = get();
    if (abortController) {
      abortController.abort();
    }
    
    set({
      items: [],
      isLoading: false,
      error: null,
      totalCount: 0,
      isLoaded: false,
      lastFetched: null,
      abortController: null,
      currentCompanyId: null,
    });
  },
  
  // ============================================================================
  // Refresh items (force reload)
  // ============================================================================
  refreshItems: async (companyId) => {
    if (!companyId) {
      return { success: false, error: 'Company ID is required' };
    }
    set({ isLoaded: false, items: [], lastFetched: null });
    return get().loadAllItems(companyId, true);
  },
  
  // ============================================================================
  // Clear items (legacy - use resetItems instead)
  // ============================================================================
  clearItems: () => {
    console.warn('clearItems is deprecated, use resetItems instead');
    get().resetItems();
  },
  
  // ============================================================================
  // Batch update items
  // ============================================================================
  updateItemsBulk: (updates) => {
    set(state => ({
      items: state.items.map(item => {
        const update = updates.find(u => u._id === item._id);
        return update ? { ...item, ...update } : item;
      })
    }));
  }
}));

export default useItemStore;