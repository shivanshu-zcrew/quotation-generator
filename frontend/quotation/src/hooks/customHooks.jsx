import React, { useMemo, useRef, useEffect, useState, useCallback } from 'react';
import { useAppStore } from '../services/store';
import useItemStore from '../services/itemStore';
import useToast from './useToast';
import { opsAPI, customerAPI, itemAPI } from '../services/api';
import { formatCurrency, formatLargeNumber } from '../utils/formatNumbers';

export const useAuth = () => {
  const user = useAppStore((state) => state.user);
  const handleLogin = useAppStore((state) => state.handleLogin);
  const handleRegister = useAppStore((state) => state.handleRegister);
  const handleLogout = useAppStore((state) => state.handleLogout);
  const loginLoading = useAppStore((state) => state.operationInProgress?.login);
  const registerLoading = useAppStore((state) => state.operationInProgress?.register);
  
  return useMemo(() => ({
    user, 
    handleLogin, 
    handleRegister, 
    handleLogout,
    isLoading: loginLoading === true || registerLoading === true,
  }), [user, handleLogin, handleRegister, handleLogout, loginLoading, registerLoading]);
};

export const useCustomers = () => {
  const customers = useAppStore((state) => state.customers);
  const addCustomer = useAppStore((state) => state.addCustomer);
  const updateCustomer = useAppStore((state) => state.updateCustomer);
  const deleteCustomer = useAppStore((state) => state.deleteCustomer);
  const addLoading = useAppStore((state) => state.operationInProgress?.addCustomer);
  const updateLoading = useAppStore((state) => state.operationInProgress?.updateCustomer);
  const deleteLoading = useAppStore((state) => state.operationInProgress?.deleteCustomer);
  
  return useMemo(() => ({
    customers, 
    addCustomer, 
    updateCustomer, 
    deleteCustomer,
    isLoading: addLoading === true || updateLoading === true || deleteLoading === true,
  }), [customers, addCustomer, updateCustomer, deleteCustomer, addLoading, updateLoading, deleteLoading]);
};

export const useItems = () => {
  const items = useItemStore((state) => state.items);
  const isLoading = useItemStore((state) => state.isLoading);

  return useMemo(() => ({
    items,
    isLoading,
  }), [items, isLoading]);
};

export const useQuotations = () => {
  const quotations = useAppStore((state) => state.quotations);
  const addQuotation = useAppStore((state) => state.addQuotation);
  const updateQuotation = useAppStore((state) => state.updateQuotation);
  const deleteQuotation = useAppStore((state) => state.deleteQuotation);
  const approveQuotation = useAppStore((state) => state.approveQuotation);
  const rejectQuotation = useAppStore((state) => state.rejectQuotation);
  const awardQuotation = useAppStore((state) => state.awardQuotation);
  const addLoading = useAppStore((state) => state.operationInProgress?.addQuotation);
  
  return useMemo(() => ({
    quotations, 
    addQuotation, 
    updateQuotation, 
    deleteQuotation,
    approveQuotation, 
    rejectQuotation,
    awardQuotation,
    isLoading: addLoading === true,
  }), [quotations, addQuotation, updateQuotation, deleteQuotation, approveQuotation, rejectQuotation, awardQuotation, addLoading]);
};

export const useAppState = () => {
  const loading = useAppStore((state) => state.loading);
  const loadError = useAppStore((state) => state.loadError);
  const lastError = useAppStore((state) => state.lastError);
  const clearError = useAppStore((state) => state.clearError);
  const initialized = useAppStore((state) => state.initialized);
  
  return useMemo(() => ({ 
    loading, 
    loadError, 
    lastError, 
    clearError,
    initialized 
  }), [loading, loadError, lastError, clearError, initialized]);
};

export const useIsOperationInProgress = (key) => {
  const progress = useAppStore((state) => state.operationInProgress?.[key]);
  return progress === true;
};

export const useInitializeApp = () => {
  const user = useAppStore((state) => state.user);
  const initialized = useAppStore((state) => state.initialized);
  const fetchAllData = useAppStore((state) => state.fetchAllData);
  const hasInitializedRef = useRef(false);
  
  useEffect(() => {
    if (user && !hasInitializedRef.current && !initialized) {
      hasInitializedRef.current = true;
      fetchAllData();
    }
    if (!user) {
      hasInitializedRef.current = false;
    }
  }, [user, fetchAllData, initialized]);
};

export const useAppStoreAll = () => useAppStore();

export const useRetryDataLoad = () => {
  const fetchAllData = useAppStore((state) => state.fetchAllData);
  const loading = useAppStore((state) => state.loading);
  const initialized = useAppStore((state) => state.initialized);
  
  const retry = useCallback(() => {
    fetchAllData();
  }, [fetchAllData]);
  
  return useMemo(() => ({ 
    retry, 
    isRetrying: loading,
    initialized 
  }), [retry, loading, initialized]);
};

export const useUserRole = () => {
  const user = useAppStore((state) => state.user);
  const selectedCompany = useAppStore((state) => state.selectedCompany);
  
  return useMemo(() => ({
    user, 
    isAdmin: user?.role === 'admin', 
    isCustomer: user?.role === 'customer', 
    isUser: user?.role === 'user',
    isOpsManager: user?.role === 'ops_manager',
    selectedCompany
  }), [user, selectedCompany]);
};

export const useCustomersList = () => {
  const customers = useAppStore((state) => state.customers);
  const selectedCompany = useAppStore((state) => state.selectedCompany);
  
  const filteredCustomers = useMemo(() => {
    if (!selectedCompany || selectedCompany === 'all' || selectedCompany === 'ALL') {
      return customers;
    }
    return customers.filter(c => c.companyId === selectedCompany || c.companyId?._id === selectedCompany);
  }, [customers, selectedCompany]);
  
  return filteredCustomers;
};

export const useItemsList = () => {
  const items = useAppStore((state) => state.items);
  const selectedCompany = useAppStore((state) => state.selectedCompany);
  
  const filteredItems = useMemo(() => {
    if (!selectedCompany || selectedCompany === 'all' || selectedCompany === 'ALL') {
      return items;
    }
    return items.filter(i => i.companyId === selectedCompany || i.companyId?._id === selectedCompany);
  }, [items, selectedCompany]);
  
  return filteredItems;
};

export const useQuotationsList = () => useAppStore((state) => state.quotations);
export const useUser = () => useAppStore((state) => state.user);
export const useLoading = () => useAppStore((state) => state.loading);
export const useError = () => useAppStore((state) => state.loadError);

export const useAdminStats = () => {
  const adminStats = useAppStore((s) => s.adminStats);
  const statsLoading = useAppStore((s) => s.statsLoading);
  const fetchAdminStats = useAppStore((s) => s.fetchAdminStats);
  const selectedCompany = useAppStore((s) => s.selectedCompany);
  const user = useAppStore((s) => s.user);
  const initialized = useAppStore((s) => s.initialized);
  
  // Track if we've fetched for this company
  const fetchedForCompanyRef = useRef(null);
  const initialFetchDone = useRef(false);
  
  const refresh = useCallback(async () => {
    if (!user || user.role !== 'admin') return;
    const companyIdParam = (!selectedCompany || selectedCompany === 'all' || selectedCompany === 'ALL')
      ? null
      : selectedCompany;
    fetchedForCompanyRef.current = selectedCompany;
    await fetchAdminStats(companyIdParam);
  }, [fetchAdminStats, selectedCompany, user]);

  // Only fetch if store hasn't already loaded stats for this company selection
  useEffect(() => {
    if (!initialized || user?.role !== 'admin') return;
    if (fetchedForCompanyRef.current === selectedCompany) return;
    const normalizeId = (id) => (id === null || id === undefined || id === '' ? 'all' : id);
    const normalizedSelected = normalizeId(selectedCompany);
    const normalizedStored = normalizeId(adminStats?._selectionId);
    if (adminStats && normalizedStored === normalizedSelected) return;

    refresh();
    initialFetchDone.current = true;
  }, [initialized, user?.role, selectedCompany, adminStats, refresh]);
  
  const isLoading = statsLoading || (!adminStats && !initialized);

  return useMemo(() => {
    const totalCustomers = adminStats?.stats?.totalCustomers ?? adminStats?.totalCustomers ?? 0;
    const totalQuotations = adminStats?.stats?.totalQuotations ?? adminStats?.totalQuotations ?? 0;
    const totalRevenue = adminStats?.stats?.totalRevenue ?? adminStats?.totalRevenue ?? 0;
    const awardedValue = adminStats?.stats?.awardedValue ?? adminStats?.awardedValue ?? 0;
    return {
      stats: adminStats,
      loading: isLoading,
      refresh,
      totalQuotations,
      actionRequired: adminStats?.stats?.actionRequired ?? adminStats?.actionRequired ?? 0,
      approved: adminStats?.stats?.approved ?? adminStats?.approved ?? 0,
      awarded: adminStats?.stats?.awarded ?? adminStats?.awarded ?? 0,
      notAwarded: adminStats?.stats?.notAwarded ?? adminStats?.notAwarded ?? 0,
      totalRevenue,
      awardedValue,
      conversionRate: adminStats?.stats?.conversionRate ?? adminStats?.conversionRate ?? 0,
      rejected: adminStats?.stats?.rejected ?? adminStats?.rejected ?? 0,
      conversionDetails: adminStats?.stats?.conversionRate ?? adminStats?.conversionRate ?? 0,
      statusCounts: adminStats?.stats?.statusCounts ?? adminStats?.statusCounts ?? {},
      totalApprovedValue: totalRevenue,
      totalAwardedValue: awardedValue,
      totalCustomers,
    };
  }, [adminStats, isLoading, refresh]);
};

// ✅ Fixed useOpsStats - now uses store instead of local state
export const useOpsStats = () => {
  const opsStats = useAppStore((s) => s.opsStats);
  const statsLoading = useAppStore((s) => s.statsLoading);
  const fetchOpsStats = useAppStore((s) => s.fetchOpsStats);
  const selectedCompany = useAppStore((s) => s.selectedCompany);
  const user = useAppStore((s) => s.user);
  const initialized = useAppStore((s) => s.initialized);
  
  // Track if we've fetched for this company
  const fetchedForCompanyRef = useRef(null);
  
  const fetchStats = useCallback(async () => {
    if (!user || user.role !== 'ops_manager') return;
    if (!selectedCompany || selectedCompany === 'all' || selectedCompany === 'ALL') return;
    
    fetchedForCompanyRef.current = selectedCompany;
    await fetchOpsStats(selectedCompany);
  }, [fetchOpsStats, selectedCompany, user]);
  
  // Only fetch if store hasn't already loaded stats for this company
  useEffect(() => {
    if (!initialized || user?.role !== 'ops_manager') return;
    if (!selectedCompany || selectedCompany === 'all' || selectedCompany === 'ALL') return;
    if (fetchedForCompanyRef.current === selectedCompany) return;
    if (opsStats && opsStats._companyId === selectedCompany) return;
    
    fetchStats();
  }, [initialized, user?.role, selectedCompany, opsStats, fetchStats]);
  
  return useMemo(() => {
    const tabCounts = opsStats?.tabCounts || {
      all: opsStats?.totalQuotations || 0,
      pending: opsStats?.pendingReview || 0,
      ops_approved: opsStats?.awaitingAdmin || 0,
      ops_rejected: opsStats?.returnedByMe || 0,
      rejected: opsStats?.rejectedByAdmin || 0,
      approved: opsStats?.approved || 0,
      awarded: opsStats?.awarded || 0,
      not_awarded: 0,
      cancelled: 0,
    };
    return {
      stats: opsStats,
      loading: statsLoading,
      refresh: fetchStats,
      totalQuotations: opsStats?.totalQuotations || 0,
      pendingReview: opsStats?.pendingReview || 0,
      awaitingAdmin: opsStats?.awaitingAdmin || 0,
      returnedByMe: opsStats?.returnedByMe || 0,
      rejectedByAdmin: opsStats?.rejectedByAdmin || 0,
      approved: opsStats?.approved || 0,
      awarded: opsStats?.awarded || 0,
      totalValue: opsStats?.totalValue || 0,
      totalCustomers: opsStats?.totalCustomers || 0,
      tabCounts,
    };
  }, [opsStats, statsLoading, fetchStats]);
};

export const useItemSync = () => {
  const syncItems = useAppStore((state) => state.syncItems);
  const refreshItems = useAppStore((state) => state.refreshItems);
  const isSyncing = useAppStore((state) => state.operationInProgress?.syncItems === true);
  
  return useMemo(() => ({ 
    syncItems, 
    refreshItems, 
    isSyncing 
  }), [syncItems, refreshItems, isSyncing]);
};

export const useItemsWithSync = () => {
  const items = useAppStore((state) => state.items);
  const loading = useAppStore((state) => state.loading);
  const error = useAppStore((state) => state.lastError);
  const syncItems = useAppStore((state) => state.syncItems);
  const refreshItems = useAppStore((state) => state.refreshItems);
  const isSyncing = useAppStore((state) => state.operationInProgress?.syncItems === true);
  
  return useMemo(() => ({ 
    items, 
    loading, 
    error, 
    syncItems, 
    refreshItems, 
    isSyncing 
  }), [items, loading, error, syncItems, refreshItems, isSyncing]);
};

export const useCustomerSync = () => {
  const syncCustomersFromZoho = useAppStore((state) => state.syncCustomersFromZoho);
  const getCustomerSyncStatus = useAppStore((state) => state.getCustomerSyncStatus);
  const getPendingSyncCustomers = useAppStore((state) => state.getPendingSyncCustomers);
  const forceSyncCustomer = useAppStore((state) => state.forceSyncCustomer);
  const isSyncing = useAppStore((state) => state.operationInProgress?.syncCustomers === true);
  const customerSyncStatus = useAppStore((state) => state.customerSyncStatus);
  const pendingSyncCustomers = useAppStore((state) => state.pendingSyncCustomers);
  
  return useMemo(() => ({
    syncCustomersFromZoho,
    getCustomerSyncStatus,
    getPendingSyncCustomers,
    forceSyncCustomer,
    isSyncing,
    customerSyncStatus,
    pendingSyncCustomers
  }), [
    syncCustomersFromZoho,
    getCustomerSyncStatus,
    getPendingSyncCustomers,
    forceSyncCustomer,
    isSyncing,
    customerSyncStatus,
    pendingSyncCustomers
  ]);
};

// ✅ New hook for company context
export const useCompanyContext = () => {
  const selectedCompany = useAppStore(s => s.selectedCompany);
  const companies = useAppStore(s => s.companies);
  const setSelectedCompany = useAppStore(s => s.setSelectedCompany);
  const selectedCurrency = useAppStore(s => s.selectedCurrency);
  const setSelectedCurrency = useAppStore(s => s.setSelectedCurrency);
  const isSwitchingCompany = useAppStore(s => s._switchingCompany);

  const currentCompany = useMemo(() => {
    if (!selectedCompany || selectedCompany === 'all' || selectedCompany === 'ALL') return null;
    return companies.find(c => c._id === selectedCompany || c.code === selectedCompany);
  }, [companies, selectedCompany]);

  return useMemo(() => ({
    selectedCompany,
    currentCompany,
    companies,
    setSelectedCompany,
    selectedCurrency,
    setSelectedCurrency,
    hasCompany: !!selectedCompany && selectedCompany !== 'all' && selectedCompany !== 'ALL',
    companyName: currentCompany?.name || '',
    companyCode: currentCompany?.code || '',
    companyCurrency: currentCompany?.baseCurrency || selectedCurrency || 'AED',
    isSwitchingCompany,
  }), [
    selectedCompany,
    currentCompany,
    companies,
    setSelectedCompany,
    selectedCurrency,
    setSelectedCurrency,
    isSwitchingCompany,
  ]);
};