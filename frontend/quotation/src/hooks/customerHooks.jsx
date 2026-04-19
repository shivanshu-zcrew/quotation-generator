// hooks/customHooks.js (Fixed with companyId support)
import React, { useCallback, useState, useEffect, useRef } from 'react';
import { useAppStore } from '../services/store';
import { customerAPI } from '../services/api';
import useCustomerStore from '../services/customerStore';
import useItemStore from '../services/itemStore';
import { useCompanyCurrency } from '../components/CompanyCurrencySelector';

// ============================================================================
// Customer Hooks - Now using useCustomerStore
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

// FIXED: usePaginatedCustomers with companyId support
export const usePaginatedCustomers = (initialPage = 1, companyId = null) => {
  const [customersData, setCustomersData] = useState({
    customers: [], pagination: { page: 1, limit: 50, totalItems: 0, totalPages: 0, hasNextPage: false, hasPreviousPage: false },
    source: 'database', loading: true, error: null,
  });
  const [filters, setFilters] = useState({
    page: initialPage, limit: 50, search: '', sortBy: 'createdAt', sortOrder: 'desc',
    taxTreatment: '', placeOfSupply: '',
  });
  
  // Track previous companyId to detect changes
  const prevCompanyIdRef = useRef(companyId);

  const fetchCustomers = useCallback(async () => {
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
      };
      
      // ✅ CRITICAL: Add companyId to filter customers by company
      if (companyId) {
        params.companyId = companyId;
      }
      
      console.log(`📡 Fetching customers page ${filters.page} for company:`, companyId);
      
      const response = await customerAPI.getAll(params);
      if (response.data.success) {
        setCustomersData({
          customers: response.data.data || [],
          pagination: response.data.pagination || {
            page: filters.page, limit: filters.limit,
            totalItems: 0, totalPages: 0,
            hasNextPage: false, hasPreviousPage: false,
          },
          source: response.data.source || 'database',
          loading: false,
          error: null,
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
      // Reset to page 1 when company changes
      if (filters.page !== 1) {
        setFilters(prev => ({ ...prev, page: 1 }));
      } else {
        fetchCustomers();
      }
    } else {
      fetchCustomers();
    }
  }, [fetchCustomers, companyId, filters.page]);

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
      // Pass companyId to searchCustomers
      const result = await searchCustomers(searchQuery, companyId);
      
      // ✅ Check if result exists and has success property
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

// FIXED: useCustomerStats with companyId support
export const useCustomerStats = (companyId = null) => {
  const [stats, setStats] = useState({ data: null, loading: false, error: null });
  const prevCompanyIdRef = useRef(companyId);
  
  const fetchStats = useCallback(async () => {
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
        });
      } else {
        throw new Error(response.data.message || 'Failed to fetch stats');
      }
    } catch (error) {
      console.error('Error fetching stats:', error);
      setStats({ data: null, loading: false, error: error.message });
    }
  }, [companyId]);
  
  // Refetch when companyId changes
  useEffect(() => { 
    if (companyId) {
      if (prevCompanyIdRef.current !== companyId) {
        console.log(`🔄 Stats: Company changed from ${prevCompanyIdRef.current} to ${companyId}`);
        prevCompanyIdRef.current = companyId;
      }
      fetchStats(); 
    } else {
      console.log('⚠️ No companyId for stats, setting empty data');
      setStats({ data: { totalCustomers: 0, activeCustomers: 0, vatRegistered: 0, nonVatRegistered: 0, byPlaceOfSupply: {} }, loading: false, error: null });
    }
  }, [fetchStats, companyId]);
  
  return { 
    data: stats.data, 
    loading: stats.loading, 
    error: stats.error,
    refetch: fetchStats  
  };
};

// ============================================================================
// Zoho Sync Hooks - Now using useCustomerStore
// ============================================================================

export const useZohoSync = () => {
  const [syncState, setSyncState] = useState({ 
    syncing: false, 
    error: null, 
    lastSyncId: null, 
    lastSyncTime: null,
    stats: null,
    syncType: null
  });
  
  const { syncCustomers, isSyncing } = useCustomerStore();
  const store = useAppStore();
  
  const syncCustomersFromStore = useCallback(async (fullSync = false, companyId = null) => {
    setSyncState(prev => ({ ...prev, syncing: true, error: null, syncType: fullSync ? 'full' : 'incremental' }));
    try {
      const result = await syncCustomers(companyId);
      if (result.success) {
        setSyncState({ 
          syncing: false, 
          error: null, 
          lastSyncId: 'batch', 
          lastSyncTime: new Date().toISOString(),
          stats: result.stats,
          syncType: fullSync ? 'full' : 'incremental'
        });
        return { success: true, stats: result.stats };
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      setSyncState(prev => ({ ...prev, syncing: false, error: error.message }));
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
          syncType: 'force'
        });
        return { success: true, customer: response.data.customer };
      } else {
        throw new Error(response.data?.message || 'Force sync failed');
      }
    } catch (error) {
      setSyncState(prev => ({ ...prev, syncing: false, error: error.message }));
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
          syncType: 'single'
        });
        return { success: true, data: response.data };
      } else {
        throw new Error(response.data?.message || 'Sync failed');
      }
    } catch (error) {
      setSyncState(prev => ({ ...prev, syncing: false, error: error.message }));
      return { success: false, error: error.message };
    }
  }, []);
  
  const clearSyncState = useCallback(() => setSyncState({ 
    syncing: false, 
    error: null, 
    lastSyncId: null, 
    lastSyncTime: null,
    stats: null,
    syncType: null
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

// ============================================================================
// Items Hooks
// ============================================================================

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

// ============================================================================
// Quotations Hooks
// ============================================================================

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