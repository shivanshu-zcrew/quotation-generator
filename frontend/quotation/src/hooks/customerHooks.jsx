import React, { useCallback, useState } from 'react';
import { useAppStore } from '../services/store';
import { customerAPI } from '../services/api';

/**
 * Enhanced hook for customers management
 */
export const useCustomers = () => {
    const store = useAppStore();
  
    // State selectors
    const customers = store.customers;
    const loading = store.loading;
    const operationInProgress = store.operationInProgress;
    const lastError = store.lastError;
    
    // New selectors for tax features
    const gccCountries = store.gccCountries;
    const taxTreatments = store.taxTreatments;
    const currencyOptions = store.currencyOptions;
  
    // Actions
    const addCustomer = store.addCustomer;
    const updateCustomer = store.updateCustomer;
    const deleteCustomer = store.deleteCustomer;
    
    // New actions
    const fetchGccCountries = store.fetchGccCountries;
    const fetchTaxTreatments = store.fetchTaxTreatments;
    const fetchCurrencyOptions = store.fetchCurrencyOptions;
  
    // Computed state
    const isLoading = loading === true;
    const error = lastError?.message || null;
  
    return {
      customers,
      loading: isLoading,
      error,
      operationInProgress,
      gccCountries,
      taxTreatments,
      currencyOptions,
      addCustomer,
      updateCustomer,
      deleteCustomer,
      fetchGccCountries,
      fetchTaxTreatments,
      fetchCurrencyOptions,
      clearError: store.clearError,
    };
  };

/**
 * Enhanced hook for paginated customers with Zoho control
 */
export const usePaginatedCustomers = (initialPage = 1) => {
  const [customersData, setCustomersData] = useState({
    customers: [],
    pagination: {
      page: 1,
      limit: 50,
      totalItems: 0,
      totalPages: 0,
      hasNextPage: false,
      hasPreviousPage: false,
    },
    source: 'database',
    loading: true,
    error: null,
  });

  const [filters, setFilters] = useState({
    page: initialPage,
    limit: 50,
    search: '',
    sortBy: 'createdAt',
    sortOrder: 'desc',
    // includeZoho: false,
    // New filters
    taxTreatment: '',
    placeOfSupply: '',
  });

  const fetchCustomers = useCallback(async () => {
    setCustomersData((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const params = {
        page: filters.page,
        limit: filters.limit,
        search: filters.search,
        sortBy: filters.sortBy,
        sortOrder: filters.sortOrder,
        // includeZoho: filters.includeZoho ? 'true' : 'false',
        // Include tax filters
        ...(filters.taxTreatment && { taxTreatment: filters.taxTreatment }),
        ...(filters.placeOfSupply && { placeOfSupply: filters.placeOfSupply }),
      };

      const response = await customerAPI.getAll(params);

      if (response.data.success) {
        setCustomersData({
          customers: response.data.data || [],
          pagination: response.data.pagination || {},
          source: response.data.source || 'database',
          loading: false,
          error: null,
        });
      } else {
        throw new Error(response.data.message || 'Failed to fetch customers');
      }
    } catch (error) {
      console.error('❌ Error fetching customers:', error);
      setCustomersData((prev) => ({
        ...prev,
        loading: false,
        error: error.message,
      }));
    }
  }, [filters]);

  React.useEffect(() => {
    fetchCustomers();
  }, [filters, fetchCustomers]);

//   const toggleZohoData = useCallback((includeZoho) => {
//     setFilters((prev) => ({ ...prev, includeZoho, page: 1 })
// );
//   },
//    []);

  // New filter setters
  const setTaxTreatmentFilter = useCallback((taxTreatment) => {
    setFilters((prev) => ({ ...prev, taxTreatment, page: 1 }));
  }, []);

  const setPlaceOfSupplyFilter = useCallback((placeOfSupply) => {
    setFilters((prev) => ({ ...prev, placeOfSupply, page: 1 }));
  }, []);

  const setPage = useCallback((newPage) => {
    setFilters((prev) => ({ ...prev, page: newPage }));
  }, []);

  const setLimit = useCallback((newLimit) => {
    setFilters((prev) => ({ ...prev, page: 1, limit: Math.min(newLimit, 500) }));
  }, []);

  const setSearch = useCallback((searchTerm) => {
    setFilters((prev) => ({ ...prev, search: searchTerm, page: 1 }));
  }, []);

  const setSorting = useCallback((sortBy, sortOrder = 'desc') => {
    setFilters((prev) => ({ ...prev, sortBy, sortOrder, page: 1 }));
  }, []);

  const resetFilters = useCallback(() => {
    setFilters({
      page: 1,
      limit: 50,
      search: '',
      sortBy: 'createdAt',
      sortOrder: 'desc',
    //   includeZoho: false,
      taxTreatment: '',
      placeOfSupply: '',
    });
  }, []);

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
    // toggleZohoData,
    // New
    setTaxTreatmentFilter,
    setPlaceOfSupplyFilter,
    setPage,
    resetFilters,
    refetch: fetchCustomers,
  };
};

/**
 * Enhanced hook for customer search
 */
export const useCustomerSearch = () => {
  const [searchResults, setSearchResults] = useState({
    customers: [],
    total: 0,
    loading: false,
    error: null,
    hasMore: false,
  });

  const [searchParams, setSearchParams] = useState({
    query: '',
    limit: 20,
    offset: 0,
  });

  const search = useCallback(async (query, limit = 20, offset = 0) => {
    if (!query || query.trim().length === 0) {
      setSearchResults({
        customers: [],
        total: 0,
        loading: false,
        error: null,
        hasMore: false,
      });
      return;
    }

    setSearchResults((prev) => ({ ...prev, loading: true }));

    try {
      const response = await customerAPI.getAll({
        search: query.trim(),
        limit: Math.min(limit, 100),
        page: Math.floor(offset / limit) + 1,
      });

      if (response.data.success) {
        setSearchResults({
          customers: response.data.data || [],
          total: response.data.pagination?.totalItems || 0,
          loading: false,
          error: null,
          hasMore: response.data.pagination?.hasNextPage || false,
        });
      } else {
        throw new Error(response.data.message || 'Search failed');
      }
    } catch (error) {
      console.error('❌ Search error:', error);
      setSearchResults((prev) => ({
        ...prev,
        loading: false,
        error: error.message,
      }));
    }
  }, []);

  const handleSearch = useCallback(
    (query) => {
      setSearchParams({ query, limit: 20, offset: 0 });
      search(query, 20, 0);
    },
    [search]
  );

  const clearSearch = useCallback(() => {
    setSearchParams({ query: '', limit: 20, offset: 0 });
    setSearchResults({
      customers: [],
      total: 0,
      loading: false,
      error: null,
      hasMore: false,
    });
  }, []);

  return {
    customers: searchResults.customers,
    total: searchResults.total,
    loading: searchResults.loading,
    error: searchResults.error,
    hasMore: searchResults.hasMore,
    search: handleSearch,
    clearSearch,
    query: searchParams.query,
  };
};

/**
 * Enhanced hook for customer statistics with tax breakdown
 */
export const useCustomerStats = () => {
  const [stats, setStats] = useState({
    data: null,
    loading: false,
    error: null,
  });

  const fetchStats = useCallback(async () => {
    setStats((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const response = await customerAPI.getStats();

      if (response.data.success) {
        setStats({
          data: response.data.stats || {
            totalCustomers: 0,
            activeCustomers: 0,
            vatRegistered: 0,
            nonVatRegistered: 0,
            byPlaceOfSupply: {},
          },
          loading: false,
          error: null,
        });
      } else {
        throw new Error(response.data.message || 'Failed to fetch stats');
      }
    } catch (error) {
      console.error('❌ Stats error:', error);
      setStats({
        data: null,
        loading: false,
        error: error.message,
      });
    }
  }, []);

  React.useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  return {
    ...stats,
    refetch: fetchStats,
  };
};

/**
 * Hook for Zoho sync
 */
export const useZohoSync = () => {
  const [syncState, setSyncState] = useState({
    syncing: false,
    error: null,
    lastSyncId: null,
    lastSyncTime: null,
  });

  const syncCustomer = useCallback(async (customerId) => {
    if (!customerId) {
      setSyncState((prev) => ({
        ...prev,
        error: 'Customer ID is required',
      }));
      return { success: false, error: 'Customer ID is required' };
    }

    setSyncState((prev) => ({ ...prev, syncing: true, error: null }));

    try {
      const response = await customerAPI.syncWithZoho(customerId);

      if (response.data?.success) {
        setSyncState({
          syncing: false,
          error: null,
          lastSyncId: customerId,
          lastSyncTime: new Date().toISOString(),
        });
        return { success: true, data: response.data };
      } else {
        throw new Error(response.data?.message || 'Sync failed');
      }
    } catch (error) {
      console.error('❌ Sync error:', error);
      setSyncState((prev) => ({
        ...prev,
        syncing: false,
        error: error.message,
      }));
      return { success: false, error: error.message };
    }
  }, []);

  const clearSyncState = useCallback(() => {
    setSyncState({
      syncing: false,
      error: null,
      lastSyncId: null,
      lastSyncTime: null,
    });
  }, []);

  return {
    ...syncState,
    syncCustomer,
    clearSyncState,
  };
};