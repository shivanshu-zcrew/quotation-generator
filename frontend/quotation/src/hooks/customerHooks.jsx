import React, { useCallback, useState, useEffect } from 'react';
import { useAppStore } from '../services/store';
import { customerAPI } from '../services/api';

export const useCustomers = () => {
  const store = useAppStore();
  const customers = store.customers;
  const loading = store.loading;
  const operationInProgress = store.operationInProgress;
  const lastError = store.lastError;
  const gccCountries = store.gccCountries;
  const taxTreatments = store.taxTreatments;
  const currencyOptions = store.currencyOptions;
  const addCustomer = store.addCustomer;
  const updateCustomer = store.updateCustomer;
  const deleteCustomer = store.deleteCustomer;
  const fetchGccCountries = store.fetchGccCountries;
  const fetchTaxTreatments = store.fetchTaxTreatments;
  const fetchCurrencyOptions = store.fetchCurrencyOptions;

  return {
    customers, loading: loading === true, error: lastError?.message || null,
    operationInProgress, gccCountries, taxTreatments, currencyOptions,
    addCustomer, updateCustomer, deleteCustomer,
    fetchGccCountries, fetchTaxTreatments, fetchCurrencyOptions,
    clearError: store.clearError,
  };
};

export const usePaginatedCustomers = (initialPage = 1) => {
  const [customersData, setCustomersData] = useState({
    customers: [], pagination: { page: 1, limit: 50, totalItems: 0, totalPages: 0, hasNextPage: false, hasPreviousPage: false },
    source: 'database', loading: true, error: null,
  });
  const [filters, setFilters] = useState({
    page: initialPage, limit: 50, search: '', sortBy: 'createdAt', sortOrder: 'desc',
    taxTreatment: '', placeOfSupply: '',
  });

  const fetchCustomers = useCallback(async () => {
    setCustomersData(prev => ({ ...prev, loading: true, error: null }));
    try {
      const params = {
        page: filters.page, limit: filters.limit, search: filters.search,
        sortBy: filters.sortBy, sortOrder: filters.sortOrder,
        ...(filters.taxTreatment && { taxTreatment: filters.taxTreatment }),
        ...(filters.placeOfSupply && { placeOfSupply: filters.placeOfSupply }),
      };
      const response = await customerAPI.getAll(params);
      if (response.data.success) {
        setCustomersData({
          customers: response.data.data || [],
          pagination: response.data.pagination || {},
          source: response.data.source || 'database',
          loading: false, error: null,
        });
      } else {
        throw new Error(response.data.message || 'Failed to fetch customers');
      }
    } catch (error) {
      setCustomersData(prev => ({ ...prev, loading: false, error: error.message }));
    }
  }, [filters]);

  useEffect(() => { fetchCustomers(); }, [fetchCustomers]);

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
    customers: customersData.customers, loading: customersData.loading, error: customersData.error,
    source: customersData.source, pagination: customersData.pagination, filters,
    setSearch, setSorting, setLimit, setTaxTreatmentFilter, setPlaceOfSupplyFilter,
    setPage, resetFilters, refetch: fetchCustomers,
  };
};

export const useCustomerSearch = () => {
  const [searchResults, setSearchResults] = useState({ customers: [], total: 0, loading: false, error: null, hasMore: false });
  const [query, setQuery] = useState('');

  const search = useCallback(async (searchQuery, limit = 20, offset = 0) => {
    if (!searchQuery?.trim()) {
      setSearchResults({ customers: [], total: 0, loading: false, error: null, hasMore: false });
      return;
    }
    setSearchResults(prev => ({ ...prev, loading: true }));
    try {
      const response = await customerAPI.getAll({
        search: searchQuery.trim(), limit: Math.min(limit, 100),
        page: Math.floor(offset / limit) + 1,
      });
      if (response.data.success) {
        setSearchResults({
          customers: response.data.data || [], total: response.data.pagination?.totalItems || 0,
          loading: false, error: null, hasMore: response.data.pagination?.hasNextPage || false,
        });
      } else {
        throw new Error(response.data.message || 'Search failed');
      }
    } catch (error) {
      setSearchResults(prev => ({ ...prev, loading: false, error: error.message }));
    }
  }, []);

  const handleSearch = useCallback((searchQuery) => { setQuery(searchQuery); search(searchQuery, 20, 0); }, [search]);
  const clearSearch = useCallback(() => { setQuery(''); setSearchResults({ customers: [], total: 0, loading: false, error: null, hasMore: false }); }, []);

  return { ...searchResults, query, search: handleSearch, clearSearch };
};

export const useCustomerStats = () => {
  const [stats, setStats] = useState({ data: null, loading: false, error: null });
  const fetchStats = useCallback(async () => {
    setStats(prev => ({ ...prev, loading: true, error: null }));
    try {
      const response = await customerAPI.getStats();
      if (response.data.success) {
        setStats({
          data: response.data.stats || { totalCustomers: 0, activeCustomers: 0, vatRegistered: 0, nonVatRegistered: 0, byPlaceOfSupply: {} },
          loading: false, error: null,
        });
      } else {
        throw new Error(response.data.message || 'Failed to fetch stats');
      }
    } catch (error) {
      setStats({ data: null, loading: false, error: error.message });
    }
  }, []);
  useEffect(() => { fetchStats(); }, [fetchStats]);
  return { ...stats, refetch: fetchStats };
};

// In hooks/customHooks.js - Update useZohoSync hook

export const useZohoSync = () => {
  const [syncState, setSyncState] = useState({ 
    syncing: false, 
    error: null, 
    lastSyncId: null, 
    lastSyncTime: null,
    stats: null,
    syncType: null
  });
  
  const store = useAppStore();
  
  const syncCustomers = useCallback(async (fullSync = false) => {
    setSyncState(prev => ({ ...prev, syncing: true, error: null, syncType: fullSync ? 'full' : 'incremental' }));
    try {
      const result = await store.syncCustomersFromZoho(fullSync);
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
  }, [store]);
  
  const getSyncStatus = useCallback(async () => {
    return await store.getCustomerSyncStatus();
  }, [store]);
  
  const getPendingSync = useCallback(async () => {
    return await store.getPendingSyncCustomers();
  }, [store]);
  
  const forceSync = useCallback(async (customerId) => {
    if (!customerId) return { success: false, error: 'Customer ID is required' };
    setSyncState(prev => ({ ...prev, syncing: true, error: null, lastSyncId: customerId }));
    try {
      const result = await store.forceSyncCustomer(customerId);
      if (result.success) {
        setSyncState({ 
          syncing: false, 
          error: null, 
          lastSyncId: customerId, 
          lastSyncTime: new Date().toISOString(),
          stats: null,
          syncType: 'force'
        });
        return { success: true, customer: result.customer };
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      setSyncState(prev => ({ ...prev, syncing: false, error: error.message }));
      return { success: false, error: error.message };
    }
  }, [store]);
  
  const syncSingle = useCallback(async (customerId) => {
    if (!customerId) return { success: false, error: 'Customer ID is required' };
    setSyncState(prev => ({ ...prev, syncing: true, error: null, lastSyncId: customerId }));
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
        // Refresh customer data
        await store.fetchCustomerStats();
        return { success: true, data: response.data };
      } else {
        throw new Error(response.data?.message || 'Sync failed');
      }
    } catch (error) {
      setSyncState(prev => ({ ...prev, syncing: false, error: error.message }));
      return { success: false, error: error.message };
    }
  }, [store]);
  
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
    syncCustomers, 
    syncSingle,
    forceSync,
    getSyncStatus,
    getPendingSync,
    clearSyncState 
  };
};

// In hooks/customHooks.js - Add this new hook

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
 