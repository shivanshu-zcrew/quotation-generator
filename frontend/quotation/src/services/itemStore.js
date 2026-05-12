// stores/itemStore.js
import { create } from 'zustand';
import { itemAPI } from '../services/api';

const DEFAULT_PAGE_SIZE = 100;
const MAX_PAGES = 20;
const CACHE_TTL = 5 * 60 * 1000;

const useItemStore = create((set, get) => ({
  // State
  items: [],
  itemsVersion: 0, // ✅ Add version tracking for UI updates
  isLoading: false,
  isSyncing: false,
  error: null,
  totalCount: 0,
  isLoaded: false,
  lastFetched: null,
  currentCompanyId: null,
  abortController: null,
  
  filters: {
    search: '',
    productType: 'all',
    status: 'all',
    sellable: 'all',
  },

  // Get filtered items
  getFilteredItems: () => {
    const { items, filters } = get();
    
    if (!items || items.length === 0) {
      console.log('⚠️ No items in store');
      return [];
    }
    
    let filtered = [...items];
    
    // Product type filter (goods/service)
    if (filters.productType && filters.productType !== 'all') {
      filtered = filtered.filter(item => item.product_type === filters.productType);
    }
    
    // Status filter (active/inactive)
    if (filters.status === 'active') {
      filtered = filtered.filter(item => item.isActive === true);
    } else if (filters.status === 'inactive') {
      filtered = filtered.filter(item => item.isActive === false || item.isActive === undefined);
    }
    
    // Sellable filter
    if (filters.sellable === 'sellable') {
      filtered = filtered.filter(item => item.can_be_sold !== false);
    } else if (filters.sellable === 'nonSellable') {
      filtered = filtered.filter(item => item.can_be_sold === false);
    }
    
    // Search filter
    if (filters.search && filters.search.trim()) {
      const term = filters.search.toLowerCase();
      filtered = filtered.filter(item => 
        (item.name || '').toLowerCase().includes(term) ||
        (item.sku || '').toLowerCase().includes(term) ||
        (item.description || '').toLowerCase().includes(term)
      );
    }
    
    console.log(`📊 Filtered ${items.length} → ${filtered.length} items`);
    return filtered;
  },
  
  getStats: () => {
    const { items } = get();
    return {
      total: items.length,
      goods: items.filter(i => i.product_type === 'goods').length,
      services: items.filter(i => i.product_type === 'service').length,
      active: items.filter(i => i.isActive === true).length,
      inactive: items.filter(i => i.isActive !== true).length,
      sellable: items.filter(i => i.can_be_sold !== false).length,
      nonSellable: items.filter(i => i.can_be_sold === false).length,
    };
  },
  
  getItemOptions: (searchTerm = '') => {
    const { getFilteredItems } = get();
    let items = getFilteredItems();
    
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      items = items.filter(item => 
        (item.name || '').toLowerCase().includes(term) ||
        (item.sku || '').toLowerCase().includes(term)
      );
    }
    
    return items.map(item => ({
      value: item._id,
      label: item.name,
      sku: item.sku,
      price: item.price,
      description: item.description,
      productType: item.product_type,
      fullData: item
    }));
  },

loadAllItems: async (companyId, forceRefresh = false) => {
  const { isLoading, isLoaded, lastFetched, currentCompanyId, abortController } = get();
  
  const isSameCompany = currentCompanyId === companyId;
  const isCacheValid = isSameCompany && isLoaded && lastFetched && 
                      (Date.now() - lastFetched) < CACHE_TTL;
  
  if (abortController) {
    abortController.abort();
  }
  
  if (!forceRefresh && isCacheValid) {
    console.log('📦 Using cached items for company:', companyId);
    return { success: true, items: get().items };
  }
  
  if (isLoading && !forceRefresh) {
    return { success: false, error: 'Already loading' };
  }
  
  const newAbortController = new AbortController();
  set({ 
    isLoading: true, 
    error: null, 
    abortController: newAbortController,
    currentCompanyId: companyId,
    items: [] // ✅ Clear items immediately to show loading state
  });
  
  try {
    let allItems = [];
    let page = 1;
    let hasMore = true;
    
    console.log(`🔄 Loading items for company: ${companyId}`);
    
    while (hasMore && page <= MAX_PAGES) {
      const response = await itemAPI.getAll({ 
        page, 
        limit: DEFAULT_PAGE_SIZE,
        companyId
      }, { signal: newAbortController.signal });
      
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
    
    // ✅ Replace items completely and increment version
    set({ 
      items: allItems, 
      itemsVersion: get().itemsVersion + 1,
      isLoading: false, 
      isLoaded: true,
      totalCount: allItems.length,
      error: null,
      lastFetched: Date.now(),
      abortController: null
    });
    
    console.log(`📊 New itemsVersion: ${get().itemsVersion}`);
    
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

refreshItems: async (companyId) => {
  if (!companyId) {
    return { success: false, error: 'Company ID is required' };
  }
  
  console.log('🔄 Force refreshing items...');
  
  // ✅ Clear everything and force reload
  set({ 
    isLoaded: false, 
    items: [], 
    lastFetched: null,
    isSyncing: false,
    itemsVersion: get().itemsVersion + 1 // Increment version immediately
  });
  
  // ✅ Load fresh data
  const result = await get().loadAllItems(companyId, true);
  
  console.log('✅ Items refreshed, new count:', result.items?.length);
  
  return result;
},
  
  // Filter Actions
  setSearchFilter: (search) => set(state => ({ filters: { ...state.filters, search } })),
  setProductTypeFilter: (productType) => set(state => ({ filters: { ...state.filters, productType } })),
  setStatusFilter: (status) => set(state => ({ filters: { ...state.filters, status } })),
  setSellableFilter: (sellable) => set(state => ({ filters: { ...state.filters, sellable } })),
  setFilters: (newFilters) => set(state => ({ filters: { ...state.filters, ...newFilters } })),
  resetFilters: () => set({ filters: { search: '', productType: 'all', status: 'all', sellable: 'all' } }),
  
  // Sync
  syncItems: async (companyId) => {
    const { isSyncing } = get();
    if (isSyncing) {
      return { success: false, error: 'Sync already in progress' };
    }
    
    set({ isSyncing: true, error: null });
    
    try {
      const response = await itemAPI.syncItems();
      if (response.data.success) {
        console.log('✅ Sync started, refreshing items...');
        // ✅ Refresh items after sync starts
        await get().refreshItems(companyId);
        return { success: true };
      }
      throw new Error(response.data.message || 'Sync failed');
    } catch (error) {
      console.error('Sync error:', error);
      set({ error: error.message, isSyncing: false });
      return { success: false, error: error.message };
    }
  },
  
  // ✅ Helper to check if data is stale
  isDataStale: () => {
    const { lastFetched } = get();
    return !lastFetched || (Date.now() - lastFetched) > CACHE_TTL;
  },
  
  clearError: () => set({ error: null }),
  
  resetItems: () => {
    const { abortController } = get();
    if (abortController) abortController.abort();
    set({
      items: [],
      itemsVersion: 0,
      isLoading: false,
      isSyncing: false,
      error: null,
      totalCount: 0,
      isLoaded: false,
      lastFetched: null,
      abortController: null,
      currentCompanyId: null,
      filters: { search: '', productType: 'all', status: 'all', sellable: 'all' }
    });
  },
}));

export default useItemStore;