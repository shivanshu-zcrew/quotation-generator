// services/customerStore.js
import { create } from 'zustand';
import { customerAPI } from './api';

let searchRequestId = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const DEBOUNCE_DELAY = 300; // ms

const useCustomerStore = create((set, get) => ({
  // State
  customers: [],
  searchResults: [],
  isLoading: false,
  isSyncing: false,
  error: null,
  totalCount: 0,
  isLoaded: false,
  customersCache: new Map(),
  _searchTimeout: null,
  isSearching: false,
  searchQuery: '',
  lastFetched: null,

  // Load ALL customers (with pagination)
  loadAllCustomers: async (companyId, forceRefresh = false) => {
    const { isLoading, isLoaded, lastFetched } = get();
    
    const isCacheValid = isLoaded && lastFetched && 
                        (Date.now() - lastFetched) < CACHE_TTL;
    
    if (!forceRefresh && isCacheValid) {
      return { success: true, customers: get().customers };
    }
    
    if (isLoading) return { success: false, error: 'Already loading' };

    set({ isLoading: true, error: null });

    try {
      let allCustomers = [];
      let page = 1;
      const pageSize = 50;
      let hasMore = true;

      while (hasMore && page <= 20) {
        const response = await customerAPI.getAll({
          page,
          limit: pageSize,
          companyId,
        });

        const data = response.data;
        const customersPage = data.data || data.customers || [];
        const pagination = data.pagination || {};

        if (customersPage.length === 0) {
          hasMore = false;
        } else {
          allCustomers = [...allCustomers, ...customersPage];
          hasMore = pagination.hasNextPage === true && pagination.totalPages > page;
          page++;
        }
      }

      const newCache = new Map();
      allCustomers.forEach(c => newCache.set(c._id, c));

      set({
        customers: allCustomers,
        searchResults: [],
        customersCache: newCache,
        totalCount: allCustomers.length,
        isLoading: false,
        isLoaded: true,
        isSearching: false,
        error: null,
        lastFetched: Date.now(),
      });

      return { success: true, customers: allCustomers };
    } catch (error) {
      console.error('Error loading customers:', error);
      set({ isLoading: false, error: error.message });
      return { success: false, error: error.message };
    }
  },

  // Search customers
  searchCustomers: async (searchTerm, companyId) => {
    const trimmed = searchTerm?.trim();
    
    if (get()._searchTimeout) {
      clearTimeout(get()._searchTimeout);
      get()._searchTimeout = null;
    }

    if (!trimmed) {
      set({
        isSearching: false,
        searchResults: [],
        searchQuery: '',
        isLoading: false,
        error: null,
      });
      return { success: true, customers: get().customers };
    }

    if (trimmed.length < 2) {
      set({
        isSearching: false,
        searchResults: [],
        searchQuery: trimmed,
        isLoading: false,
        error: 'Type at least 2 characters',
      });
      return { success: false, error: 'Search term too short' };
    }

    set({
      isSearching: true,
      searchQuery: trimmed,
      isLoading: true,
      error: null,
    });

    const timeout = setTimeout(async () => {
      const requestId = ++searchRequestId;
      const currentQuery = get().searchQuery;
      
      if (currentQuery !== trimmed) {
        set({ isLoading: false, isSearching: false });
        return;
      }

      try {
        const { customers } = get();
        const localResults = customers.filter(c =>
          c.name?.toLowerCase().includes(trimmed.toLowerCase()) ||
          c.email?.toLowerCase().includes(trimmed.toLowerCase()) ||
          c.phone?.includes(trimmed)
        );

        if (localResults.length > 0) {
          set({
            searchResults: localResults,
            isLoading: false,
            isSearching: false,
          });
          return;
        }

        const response = await customerAPI.getAll({
          search: trimmed,
          limit: 100,
          companyId,
        });

        if (requestId !== searchRequestId || get().searchQuery !== trimmed) {
          set({ isLoading: false, isSearching: false });
          return;
        }

        const data = response.data;
        const results = data.data || data.customers || [];

        set({
          searchResults: results,
          isLoading: false,
          isSearching: false,
        });

      } catch (error) {
        if (requestId !== searchRequestId || get().searchQuery !== trimmed) {
          return;
        }
        
        set({
          isLoading: false,
          isSearching: false,
          error: error.message,
          searchResults: [],
        });
      }
    }, DEBOUNCE_DELAY);

    get()._searchTimeout = timeout;
  },
  
  // Clear search
  clearSearch: () => {
    if (get()._searchTimeout) {
      clearTimeout(get()._searchTimeout);
      get()._searchTimeout = null;
    }
  
    set({
      isSearching: false,
      searchResults: [],
      searchQuery: '',
      isLoading: false,
      error: null,
    });
  
    return { success: true };
  },

  // Get customer by ID
  getCustomerById: async (id, forceFetch = false) => {
    const { customersCache, customers, searchResults } = get();

    if (!forceFetch && customersCache.has(id)) {
      return customersCache.get(id);
    }

    const found = [...customers, ...searchResults].find(c => c._id === id);
    if (found && !forceFetch) {
      const newCache = new Map(customersCache);
      newCache.set(id, found);
      set({ customersCache: newCache });
      return found;
    }

    try {
      const response = await customerAPI.getById(id);
      const customer = response.data;
      if (customer) {
        const newCache = new Map(customersCache);
        newCache.set(id, customer);
        set({ customersCache: newCache });
        
        const exists = get().customers.some(c => c._id === id);
        if (!exists) {
          set(state => ({ 
            customers: [...state.customers, customer],
            totalCount: state.totalCount + 1
          }));
        }
        
        return customer;
      }
    } catch (error) {
      console.error('Error fetching customer by ID:', error);
    }

    return null;
  },

  // Add new customer (for compatibility)
  addCustomer: async (customerData) => {
    set({ isLoading: true, error: null });
    try {
      const response = await customerAPI.create(customerData);
      if (response.data.success) {
        const newCustomer = response.data.data;
        set(state => ({
          customers: [newCustomer, ...state.customers],
          totalCount: state.totalCount + 1,
          isLoading: false,
        }));
        // Also add to cache
        const newCache = new Map(get().customersCache);
        newCache.set(newCustomer._id, newCustomer);
        set({ customersCache: newCache });
        return { success: true, customer: newCustomer };
      }
      throw new Error(response.data.message || 'Failed to add customer');
    } catch (error) {
      set({ isLoading: false, error: error.message });
      return { success: false, error: error.message };
    }
  },

  // Update customer
  updateCustomer: async (id, customerData) => {
    set({ isLoading: true, error: null });
    try {
      const response = await customerAPI.update(id, customerData);
      if (response.data.success) {
        const updatedCustomer = response.data.data;
        set(state => ({
          customers: state.customers.map(c => c._id === id ? updatedCustomer : c),
          searchResults: state.searchResults.map(c => c._id === id ? updatedCustomer : c),
          isLoading: false,
        }));
        // Update cache
        const newCache = new Map(get().customersCache);
        newCache.set(id, updatedCustomer);
        set({ customersCache: newCache });
        return { success: true, customer: updatedCustomer };
      }
      throw new Error(response.data.message || 'Failed to update customer');
    } catch (error) {
      set({ isLoading: false, error: error.message });
      return { success: false, error: error.message };
    }
  },

  // Delete customer
  deleteCustomer: async (id) => {
    set({ isLoading: true, error: null });
    try {
      const response = await customerAPI.delete(id);
      if (response.data.success) {
        set(state => ({
          customers: state.customers.filter(c => c._id !== id),
          searchResults: state.searchResults.filter(c => c._id !== id),
          totalCount: state.totalCount - 1,
          isLoading: false,
        }));
        // Remove from cache
        const newCache = new Map(get().customersCache);
        newCache.delete(id);
        set({ customersCache: newCache });
        return { success: true };
      }
      throw new Error(response.data.message || 'Failed to delete customer');
    } catch (error) {
      set({ isLoading: false, error: error.message });
      return { success: false, error: error.message };
    }
  },

  // Sync customers from Zoho
  syncCustomers: async (companyId) => {
    const { isSyncing } = get();
    if (isSyncing) {
      return { success: false, error: 'Sync already in progress' };
    }
    
    set({ isSyncing: true, error: null });

    try {
      const response = await customerAPI.syncFromZoho();
      if (response.data.success) {
        await get().refreshCustomers(companyId);
        return { success: true, stats: response.data.stats };
      }
      throw new Error(response.data.message || 'Sync failed');
    } catch (error) {
      console.error('Sync error:', error);
      set({ error: error.message });
      return { success: false, error: error.message };
    } finally {
      set({ isSyncing: false });
    }
  },

  // Refresh customers (clear cache and reload)
  refreshCustomers: async (companyId) => {
    if (get()._searchTimeout) {
      clearTimeout(get()._searchTimeout);
      get()._searchTimeout = null;
    }
    
    set({
      customers: [],
      isLoaded: false,
      customersCache: new Map(),
      searchResults: [],
      isSearching: false,
      searchQuery: '',
      lastFetched: null,
      error: null,
    });
    
    return get().loadAllCustomers(companyId, true);
  },

  resetCustomers: () => {
    console.log('🔄 Resetting customer store');
    
    // Clear any pending search timeout
    if (get()._searchTimeout) {
      clearTimeout(get()._searchTimeout);
      get()._searchTimeout = null;
    }
    
    // Reset all customer-related state
    set({
      customers: [],
      searchResults: [],
      isLoading: false,
      isSearching: false,
      searchQuery: '',
      isLoaded: false,
      customersCache: new Map(),
      error: null,
      lastFetched: null,
      totalCount: 0,
    });
  },

  // Get display customers with optional filtering
  getDisplayCustomers: (filter = null) => {
    const { customers, isSearching, searchResults } = get();
    let displayCustomers = isSearching ? searchResults : customers;
    
    if (filter && typeof filter === 'function') {
      displayCustomers = displayCustomers.filter(filter);
    }
    
    return displayCustomers;
  },
  
  // Invalidate cache
  invalidateCache: () => {
    set({ 
      lastFetched: null,
      customersCache: new Map()
    });
  },

  // Clear error
  clearError: () => {
    set({ error: null });
  }
}));

export default useCustomerStore;