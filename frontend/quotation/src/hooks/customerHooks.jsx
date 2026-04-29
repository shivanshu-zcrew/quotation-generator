// hooks/customHooks.js (ENHANCED - Fixed with Real-time Data Sync)
import React, { useCallback, useState, useEffect, useRef } from 'react';
import { useAppStore } from '../services/store';
import { customerAPI } from '../services/api';
import useCustomerStore from '../services/customerStore';
import useItemStore from '../services/itemStore';
import { useCompanyCurrency } from '../components/CompanyCurrencySelector';

// ============================================================================
// ENHANCED: usePaginatedCustomers with Real-time Sync
// ============================================================================

export const usePaginatedCustomers = (initialPage = 1, companyId = null) => {
  const [customersData, setCustomersData] = useState({
    customers: [], 
    pagination: { page: 1, limit: 50, totalItems: 0, totalPages: 0, hasNextPage: false, hasPreviousPage: false },
    source: 'database', 
    loading: true, 
    error: null,
    lastFetchTime: null,
  });
  
  const [filters, setFilters] = useState({
    page: initialPage, 
    limit: 50, 
    search: '', 
    sortBy: 'createdAt', 
    sortOrder: 'desc',
    taxTreatment: '', 
    placeOfSupply: '',
  });
  
  // Track previous companyId to detect changes
  const prevCompanyIdRef = useRef(companyId);
  const fetchTimeoutRef = useRef(null);

  const fetchCustomers = useCallback(async (forceRefresh = false) => {
    setCustomersData(prev => ({ ...prev, loading: true, error: null }));
    try {
      const params = {
        page: filters.page,
        limit: filters.limit,
        search: filters.search,
        sortBy: filters.sortBy,
        sortOrder: filters.sortOrder,
        ...(filters.taxTreatment && { taxTreatment: filters.taxTreatment }),
        ...(filters.placeOfSupply && { placeOfSupply: filters.placeOfSupply }),
        ...(forceRefresh && { _t: Date.now() }), // Cache busting
      };
      
      if (companyId) {
        params.companyId = companyId;
      }
      
      console.log(`📡 Fetching customers page ${filters.page} for company:`, companyId);
      
      const response = await customerAPI.getAll(params);
      if (response.data.success) {
        setCustomersData({
          customers: response.data.data || [],
          pagination: response.data.pagination || {
            page: filters.page, 
            limit: filters.limit,
            totalItems: 0, 
            totalPages: 0,
            hasNextPage: false, 
            hasPreviousPage: false,
          },
          source: response.data.source || 'database',
          loading: false,
          error: null,
          lastFetchTime: new Date().toISOString(),
        });
      } else {
        throw new Error(response.data.message || 'Failed to fetch customers');
      }
    } catch (error) {
      console.error('Error fetching customers:', error);
      setCustomersData(prev => ({ ...prev, loading: false, error: error.message }));
    }
  }, [filters, companyId]);

  // Refetch when companyId changes - reset to page 1
  useEffect(() => {
    if (prevCompanyIdRef.current !== companyId) {
      console.log(`🔄 Company changed from ${prevCompanyIdRef.current} to ${companyId}, resetting to page 1`);
      prevCompanyIdRef.current = companyId;
      if (filters.page !== 1) {
        setFilters(prev => ({ ...prev, page: 1 }));
      } else {
        fetchCustomers(true); // Force refresh with new company
      }
    } else {
      fetchCustomers(false);
    }
  }, [fetchCustomers, companyId, filters.page]);

  // ✅ NEW: Optimistic update for add
  const addCustomerOptimistic = useCallback((newCustomer) => {
    setCustomersData(prev => ({
      ...prev,
      customers: [newCustomer, ...prev.customers],
      pagination: {
        ...prev.pagination,
        totalItems: prev.pagination.totalItems + 1,
        totalPages: Math.ceil((prev.pagination.totalItems + 1) / prev.pagination.limit),
      }
    }));
  }, []);

  // ✅ NEW: Optimistic update for update
  const updateCustomerOptimistic = useCallback((updatedCustomer) => {
    setCustomersData(prev => ({
      ...prev,
      customers: prev.customers.map(c => c._id === updatedCustomer._id ? updatedCustomer : c)
    }));
  }, []);

  // ✅ NEW: Optimistic update for delete
  const deleteCustomerOptimistic = useCallback((customerId) => {
    setCustomersData(prev => ({
      ...prev,
      customers: prev.customers.filter(c => c._id !== customerId),
      pagination: {
        ...prev.pagination,
        totalItems: Math.max(0, prev.pagination.totalItems - 1),
        totalPages: Math.ceil(Math.max(0, prev.pagination.totalItems - 1) / prev.pagination.limit),
      }
    }));
  }, []);

  // ✅ NEW: Smart refetch - only if data might be stale
  const smartRefetch = useCallback(async (forceRefresh = false) => {
    const now = new Date().getTime();
    const lastFetchTime = customersData.lastFetchTime ? new Date(customersData.lastFetchTime).getTime() : 0;
    const timeSinceLastFetch = now - lastFetchTime;
    
    // Refetch if:
    // 1. Force refresh is true
    // 2. Last fetch was more than 30 seconds ago
    // 3. No data yet
    if (forceRefresh || timeSinceLastFetch > 30000 || !customersData.customers.length) {
      await fetchCustomers(forceRefresh);
    } else {
      console.log('⏭️ Data still fresh, skipping refetch');
    }
  }, [fetchCustomers, customersData]);

  const setTaxTreatmentFilter = useCallback((taxTreatment) => setFilters(prev => ({ ...prev, taxTreatment, page: 1 })), []);
  const setPlaceOfSupplyFilter = useCallback((placeOfSupply) => setFilters(prev => ({ ...prev, placeOfSupply, page: 1 })), []);
  const setPage = useCallback((newPage) => setFilters(prev => ({ ...prev, page: newPage })), []);
  const setLimit = useCallback((newLimit) => setFilters(prev => ({ ...prev, page: 1, limit: Math.min(newLimit, 500) })), []);
  const setSearch = useCallback((searchTerm) => setFilters(prev => ({ ...prev, search: searchTerm, page: 1 })), []);
  const setSorting = useCallback((sortBy, sortOrder = 'desc') => setFilters(prev => ({ ...prev, sortBy, sortOrder, page: 1 })), []);
  const resetFilters = useCallback(() => setFilters({
    page: 1, limit: 50, search: '', sortBy: 'createdAt', sortOrder: 'desc',
    taxTreatment: '', placeOfSupply: '',
  }), []);

  return {
    customers: customersData.customers,
    loading: customersData.loading,
    error: customersData.error,
    source: customersData.source,
    pagination: customersData.pagination,
    filters,
    setSearch,
    setSorting,
    setLimit,
    setTaxTreatmentFilter,
    setPlaceOfSupplyFilter,
    setPage,
    resetFilters,
    refetch: fetchCustomers,
    smartRefetch, // NEW: Smart refetch
    addCustomerOptimistic, // NEW: Optimistic add
    updateCustomerOptimistic, // NEW: Optimistic update
    deleteCustomerOptimistic, // NEW: Optimistic delete
  };
};

// ============================================================================
// ENHANCED: useCustomerStats with Real-time Sync
// ============================================================================

export const useCustomerStats = (companyId = null) => {
  const [stats, setStats] = useState({ 
    data: null, 
    loading: false, 
    error: null,
    lastFetchTime: null,
  });
  const prevCompanyIdRef = useRef(companyId);
  
  const fetchStats = useCallback(async (forceRefresh = false) => {
    if (!companyId) {
      console.log('⚠️ No companyId provided, skipping stats fetch');
      return;
    }
    
    setStats(prev => ({ ...prev, loading: true, error: null }));
    try {
      const params = {};
      if (companyId) {
        params.companyId = companyId;
      }
      if (forceRefresh) {
        params._t = Date.now(); // Cache busting
      }
      
      console.log(`📊 Fetching customer stats for company:`, companyId);
      
      const response = await customerAPI.getStats(params);
      if (response.data.success) {
        setStats({
          data: response.data.stats || { 
            totalCustomers: 0, 
            activeCustomers: 0, 
            vatRegistered: 0, 
            nonVatRegistered: 0, 
            byPlaceOfSupply: {} 
          },
          loading: false, 
          error: null,
          lastFetchTime: new Date().toISOString(),
        });
      } else {
        throw new Error(response.data.message || 'Failed to fetch stats');
      }
    } catch (error) {
      console.error('Error fetching stats:', error);
      setStats(prev => ({ ...prev, loading: false, error: error.message }));
    }
  }, [companyId]);

  // ✅ NEW: Update stats optimistically
  const updateStatsOptimistic = useCallback((change) => {
    setStats(prev => ({
      ...prev,
      data: prev.data ? { ...prev.data, ...change } : null
    }));
  }, []);

  // ✅ NEW: Smart refetch
  const smartRefetch = useCallback(async (forceRefresh = false) => {
    const now = new Date().getTime();
    const lastFetchTime = stats.lastFetchTime ? new Date(stats.lastFetchTime).getTime() : 0;
    const timeSinceLastFetch = now - lastFetchTime;
    
    if (forceRefresh || timeSinceLastFetch > 30000 || !stats.data) {
      await fetchStats(forceRefresh);
    }
  }, [fetchStats, stats]);
  
  // Refetch when companyId changes
  useEffect(() => { 
    if (companyId) {
      if (prevCompanyIdRef.current !== companyId) {
        console.log(`🔄 Stats: Company changed from ${prevCompanyIdRef.current} to ${companyId}`);
        prevCompanyIdRef.current = companyId;
      }
      fetchStats(true); // Force fresh fetch for new company
    } else {
      console.log('⚠️ No companyId for stats, setting empty data');
      setStats({ 
        data: { totalCustomers: 0, activeCustomers: 0, vatRegistered: 0, nonVatRegistered: 0, byPlaceOfSupply: {} }, 
        loading: false, 
        error: null,
        lastFetchTime: null,
      });
    }
  }, [fetchStats, companyId]);
  
  return { 
    data: stats.data, 
    loading: stats.loading, 
    error: stats.error,
    refetch: fetchStats,
    smartRefetch, // NEW: Smart refetch
    updateStatsOptimistic, // NEW: Optimistic update
  };
};

// ============================================================================
// ENHANCED: useZohoSync with Progress Tracking
// ============================================================================

export const useZohoSync = () => {
  const [syncState, setSyncState] = useState({ 
    syncing: false, 
    error: null, 
    lastSyncId: null, 
    lastSyncTime: null,
    stats: null,
    syncType: null,
    progress: 0, // NEW: Progress tracking
  });
  
  const { syncCustomers, isSyncing } = useCustomerStore();
  const store = useAppStore();
  
  const syncCustomersFromStore = useCallback(async (fullSync = false, companyId = null) => {
    setSyncState(prev => ({ ...prev, syncing: true, error: null, syncType: fullSync ? 'full' : 'incremental', progress: 0 }));
    try {
      const result = await syncCustomers(companyId);
      
      if (result.success) {
        setSyncState({ 
          syncing: false, 
          error: null, 
          lastSyncId: 'batch', 
          lastSyncTime: new Date().toISOString(),
          stats: result.stats,
          syncType: fullSync ? 'full' : 'incremental',
          progress: 100,
        });
        return { success: true, stats: result.stats };
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      setSyncState(prev => ({ ...prev, syncing: false, error: error.message, progress: 0 }));
      return { success: false, error: error.message };
    }
  }, [syncCustomers]);
  
  const getSyncStatus = useCallback(async () => {
    try {
      const response = await customerAPI.getSyncStatus();
      return response.data;
    } catch (error) {
      return { success: false, error: error.message };
    }
  }, []);
  
  const getPendingSync = useCallback(async () => {
    try {
      const response = await customerAPI.getPendingSync();
      return response.data;
    } catch (error) {
      return { success: false, error: error.message };
    }
  }, []);
  
  const forceSync = useCallback(async (customerId) => {
    if (!customerId) return { success: false, error: 'Customer ID is required' };
    setSyncState(prev => ({ ...prev, syncing: true, error: null, lastSyncId: customerId, syncType: 'force' }));
    try {
      const response = await customerAPI.forceSyncCustomer(customerId);
      if (response.data?.success) {
        setSyncState({ 
          syncing: false, 
          error: null, 
          lastSyncId: customerId, 
          lastSyncTime: new Date().toISOString(),
          stats: null,
          syncType: 'force',
          progress: 100,
        });
        return { success: true, customer: response.data.customer };
      } else {
        throw new Error(response.data?.message || 'Force sync failed');
      }
    } catch (error) {
      setSyncState(prev => ({ ...prev, syncing: false, error: error.message, progress: 0 }));
      return { success: false, error: error.message };
    }
  }, []);
  
  const syncSingle = useCallback(async (customerId) => {
    if (!customerId) return { success: false, error: 'Customer ID is required' };
    setSyncState(prev => ({ ...prev, syncing: true, error: null, lastSyncId: customerId, syncType: 'single' }));
    try {
      const response = await customerAPI.syncWithZoho(customerId);
      if (response.data?.success) {
        setSyncState({ 
          syncing: false, 
          error: null, 
          lastSyncId: customerId, 
          lastSyncTime: new Date().toISOString(),
          stats: null,
          syncType: 'single',
          progress: 100,
        });
        return { success: true, data: response.data };
      } else {
        throw new Error(response.data?.message || 'Sync failed');
      }
    } catch (error) {
      setSyncState(prev => ({ ...prev, syncing: false, error: error.message, progress: 0 }));
      return { success: false, error: error.message };
    }
  }, []);
  
  const clearSyncState = useCallback(() => setSyncState({ 
    syncing: false, 
    error: null, 
    lastSyncId: null, 
    lastSyncTime: null,
    stats: null,
    syncType: null,
    progress: 0,
  }), []);
  
  return { 
    ...syncState, 
    syncCustomers: syncCustomersFromStore, 
    syncSingle,
    forceSync,
    getSyncStatus,
    getPendingSync,
    clearSyncState 
  };
};

// ============================================================================
// Keep existing hooks (useCustomers, useCustomerSearch, etc.)
// ============================================================================

export const useCustomers = () => {
  const {
    customers,
    isLoading,
    error,
    totalCount,
    isLoaded,
    loadAllCustomers,
    refreshCustomers,
    getCustomerById,
    syncCustomers,
    isSyncing,
    addCustomer,
    updateCustomer,
    deleteCustomer,
    clearError
  } = useCustomerStore();

  const store = useAppStore();
  const { selectedCompany } = useCompanyCurrency();
  
  return {
    customers,
    loading: isLoading,
    error: error,
    totalCount,
    isLoaded,
    isSyncing,
    operationInProgress: isSyncing,
    lastError: error ? { message: error } : null,
    gccCountries: store.gccCountries,
    taxTreatments: store.taxTreatments,
    currencyOptions: store.currencyOptions,
    fetchGccCountries: store.fetchGccCountries,
    fetchTaxTreatments: store.fetchTaxTreatments,
    fetchCurrencyOptions: store.fetchCurrencyOptions,
    addCustomer,
    updateCustomer,
    deleteCustomer,
    loadAllCustomers: () => loadAllCustomers(selectedCompany),
    refreshCustomers: () => refreshCustomers(selectedCompany),
    getCustomerById,
    syncCustomers: () => syncCustomers(selectedCompany),
    clearError,
  };
};

export const useCustomerSearch = () => {
  const [localResults, setLocalResults] = useState({ 
    customers: [], total: 0, loading: false, error: null, hasMore: false 
  });
  const [query, setQuery] = useState('');
  const [currentCompanyId, setCurrentCompanyId] = useState(null);
  
  const { 
    searchCustomers, 
    isSearching, 
    clearSearch,
  } = useCustomerStore();

  const search = useCallback(async (searchQuery, limit = 20, companyId = null) => {
    if (!searchQuery?.trim()) {
      setLocalResults({ customers: [], total: 0, loading: false, error: null, hasMore: false });
      clearSearch();
      return;
    }
    
    setLocalResults(prev => ({ ...prev, loading: true }));
    
    console.log(`🔍 Searching customers: "${searchQuery}" for company:`, companyId);
    
    try {
      const result = await searchCustomers(searchQuery, companyId);
      
      if (result && result.success) {
        const results = result.customers || [];
        setLocalResults({
          customers: results.slice(0, limit),
          total: results.length,
          loading: false,
          error: null,
          hasMore: results.length > limit
        });
        setCurrentCompanyId(companyId);
      } else {
        setLocalResults(prev => ({ 
          ...prev, 
          loading: false, 
          error: result?.error || 'Search failed' 
        }));
      }
    } catch (error) {
      console.error('Search error:', error);
      setLocalResults(prev => ({ 
        ...prev, 
        loading: false, 
        error: error.message || 'Search failed' 
      }));
    }
  }, [searchCustomers, clearSearch]);

  const handleSearch = useCallback((searchQuery, companyId = null) => { 
    setQuery(searchQuery); 
    search(searchQuery, 20, companyId); 
  }, [search]);

  const clearSearchLocal = useCallback(() => { 
    setQuery(''); 
    clearSearch();
    setLocalResults({ customers: [], total: 0, loading: false, error: null, hasMore: false });
    setCurrentCompanyId(null);
  }, [clearSearch]);

  return { 
    customers: localResults.customers, 
    total: localResults.total,
    loading: localResults.loading || isSearching, 
    error: localResults.error, 
    hasMore: localResults.hasMore, 
    query, 
    search: handleSearch, 
    clearSearch: clearSearchLocal,
    currentCompanyId,
  };
};

export const useSyncStatus = () => {
  const [status, setStatus] = useState({ 
    data: null, 
    loading: false, 
    error: null,
    lastChecked: null
  });
  
  const checkStatus = useCallback(async () => {
    setStatus(prev => ({ ...prev, loading: true }));
    try {
      const response = await customerAPI.getSyncStatus();
      if (response.data.success) {
        setStatus({
          data: response.data.data,
          loading: false,
          error: null,
          lastChecked: new Date().toISOString()
        });
        return { success: true, data: response.data.data };
      }
      throw new Error(response.data.message || 'Failed to get sync status');
    } catch (error) {
      setStatus(prev => ({ ...prev, loading: false, error: error.message }));
      return { success: false, error: error.message };
    }
  }, []);
  
  return { ...status, checkStatus };
};

export const useItemsList = () => {
  const { items, isLoading, isLoaded, loadAllItems } = useItemStore();
  const { selectedCompany } = useCompanyCurrency();
  
  useEffect(() => {
    if (selectedCompany && !isLoaded && !isLoading) {
      loadAllItems(selectedCompany);
    }
  }, [selectedCompany, isLoaded, isLoading, loadAllItems]);
  
  return items || [];
};

export const useQuotations = () => {
  const store = useAppStore();
  
  return {
    quotations: store.quotations || [],
    addQuotation: store.addQuotation,
    updateQuotation: store.updateQuotation,
    deleteQuotation: store.deleteQuotation,
    getQuotation: store.getQuotation,
    isLoading: store.loading,
    error: store.error
  };
};