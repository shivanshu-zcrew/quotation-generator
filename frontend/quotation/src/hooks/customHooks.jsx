import React, { useMemo, useRef, useEffect, useState, useCallback } from 'react';
import { useAppStore } from '../services/store';
import useToast from './useToast';
import { opsAPI, customerAPI, itemAPI } from '../services/api';

export const useAuth = () => {
  const user = useAppStore((state) => state.user);
  const handleLogin = useAppStore((state) => state.handleLogin);
  const handleRegister = useAppStore((state) => state.handleRegister);
  const handleLogout = useAppStore((state) => state.handleLogout);
  const loginLoading = useAppStore((state) => state.operationInProgress.login);
  const registerLoading = useAppStore((state) => state.operationInProgress.register);
  return useMemo(() => ({
    user, handleLogin, handleRegister, handleLogout,
    isLoading: loginLoading || registerLoading,
  }), [user, handleLogin, handleRegister, handleLogout, loginLoading, registerLoading]);
};

export const useCustomers = () => {
  const customers = useAppStore((state) => state.customers);
  const addCustomer = useAppStore((state) => state.addCustomer);
  const updateCustomer = useAppStore((state) => state.updateCustomer);
  const deleteCustomer = useAppStore((state) => state.deleteCustomer);
  const addLoading = useAppStore((state) => state.operationInProgress.addCustomer);
  const updateLoading = useAppStore((state) => state.operationInProgress.updateCustomer);
  const deleteLoading = useAppStore((state) => state.operationInProgress.deleteCustomer);
  return {
    customers, addCustomer, updateCustomer, deleteCustomer,
    isLoading: addLoading || updateLoading || deleteLoading,
  };
};

export const useItems = () => {
  const items = useAppStore((state) => state.items);
  const addItem = useAppStore((state) => state.addItem);
  const updateItem = useAppStore((state) => state.updateItem);
  const deleteItem = useAppStore((state) => state.deleteItem);
  const addLoading = useAppStore((state) => state.operationInProgress.addItem);
  return useMemo(() => ({
    items, addItem, updateItem, deleteItem, isLoading: addLoading,
  }), [items, addItem, updateItem, deleteItem, addLoading]);
};

export const useQuotations = () => {
  const quotations = useAppStore((state) => state.quotations);
  const addQuotation = useAppStore((state) => state.addQuotation);
  const updateQuotation = useAppStore((state) => state.updateQuotation);
  const deleteQuotation = useAppStore((state) => state.deleteQuotation);
  const approveQuotation = useAppStore((state) => state.approveQuotation);
  const rejectQuotation = useAppStore((state) => state.rejectQuotation);
  const addLoading = useAppStore((state) => state.operationInProgress.addQuotation);
  return useMemo(() => ({
    quotations, addQuotation, updateQuotation, deleteQuotation,
    approveQuotation, rejectQuotation, isLoading: addLoading,
  }), [quotations, addQuotation, updateQuotation, deleteQuotation, approveQuotation, rejectQuotation, addLoading]);
};

export const useAppState = () => {
  const loading = useAppStore((state) => state.loading);
  const loadError = useAppStore((state) => state.loadError);
  const lastError = useAppStore((state) => state.lastError);
  const clearError = useAppStore((state) => state.clearError);
  return useMemo(() => ({ loading, loadError, lastError, clearError }), [loading, loadError, lastError, clearError]);
};

export const useIsOperationInProgress = (key) => useAppStore((state) => state.operationInProgress[key] === true);

export const useInitializeApp = () => {
  const user = useAppStore((state) => state.user);
  const fetchAllData = useAppStore((state) => state.fetchAllData);
  const initialized = useRef(false);
  useEffect(() => {
    if (user && !initialized.current) {
      initialized.current = true;
      fetchAllData();
    }
    if (!user) initialized.current = false;
  }, [user, fetchAllData]);
};

export const useAppStoreAll = () => useAppStore();

export const useRetryDataLoad = () => {
  const fetchAllData = useAppStore((state) => state.fetchAllData);
  const loading = useAppStore((state) => state.loading);
  return useMemo(() => ({ retry: fetchAllData, isRetrying: loading }), [fetchAllData, loading]);
};

export const useUserRole = () => {
  const user = useAppStore((state) => state.user);
  return useMemo(() => ({
    user, isAdmin: user?.role === 'admin', isCustomer: user?.role === 'customer', isUser: user?.role === 'user',
  }), [user]);
};

// Updated to use company filtering
export const useCustomersList = () => {
  const customers = useAppStore((state) => state.customers);
  const selectedCompany = useAppStore((state) => state.selectedCompany);
  // Filter customers by selected company
  const filteredCustomers = useMemo(() => {
    if (!selectedCompany) return customers;
    return customers.filter(c => c.companyId === selectedCompany || c.companyId?._id === selectedCompany);
  }, [customers, selectedCompany]);
  return filteredCustomers;
};

// Updated to use company filtering
export const useItemsList = () => {
  const items = useAppStore((state) => state.items);
  const selectedCompany = useAppStore((state) => state.selectedCompany);
  // Filter items by selected company
  const filteredItems = useMemo(() => {
    if (!selectedCompany) return items;
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
  const refresh = useCallback(() => fetchAdminStats(selectedCompany), [fetchAdminStats, selectedCompany]);
  return {
    stats: adminStats, loading: statsLoading, refresh,
    totalQuotations: adminStats?.stats?.totalQuotations || 0,
    actionRequired: adminStats?.stats?.actionRequired || 0,
    approved: adminStats?.stats?.approved || 0,
    awarded: adminStats?.stats?.awarded || 0,
    notAwarded: adminStats?.stats?.notAwarded || 0,
    totalRevenue: adminStats?.stats?.totalRevenue || 0,
    awardedValue: adminStats?.stats?.awardedValue || 0,
    conversionRate: adminStats?.stats?.conversionRate?.rate || 0,
    rejected: adminStats?.stats?.rejected || 0,
    conversionDetails: adminStats?.stats?.conversionRate || { approvedCount: 0, awardedCount: 0, notAwardedCount: 0, totalDecided: 0, rate: 0 },
    statusCounts: adminStats?.stats?.statusCounts || {},
    totalApprovedValue: adminStats?.stats?.totalRevenue || 0,
    totalAwardedValue: adminStats?.stats?.awardedValue || 0,
  };
};

export const useOpsStats = () => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const selectedCompany = useAppStore((s) => s.selectedCompany);
  const addToast = useToast().addToast;
  const fetchStats = useCallback(async () => {
    setLoading(true);
    try {
      const params = selectedCompany ? { companyId: selectedCompany } : {};
      const response = await opsAPI.getOpsStats(params);
      setStats(response.data.stats);
    } catch (error) {
      addToast('Failed to load stats', 'error');
    } finally {
      setLoading(false);
    }
  }, [selectedCompany, addToast]);
  useEffect(() => { fetchStats(); }, [fetchStats]);
  return {
    stats, loading, refresh: fetchStats,
    totalQuotations: stats?.totalQuotations || 0,
    pendingReview: stats?.pendingReview || 0,
    awaitingAdmin: stats?.awaitingAdmin || 0,
    returnedByMe: stats?.returnedByMe || 0,
    totalValue: stats?.totalValue || 0,
  };
};

export const useItemSync = () => {
  const syncItems = useAppStore((state) => state.syncItems);
  const refreshItems = useAppStore((state) => state.refreshItems);
  const isSyncing = useAppStore((state) => state.operationInProgress?.syncItems === true);
  return { syncItems, refreshItems, isSyncing };
};

export const useItemsWithSync = () => {
  const items = useAppStore((state) => state.items);
  const loading = useAppStore((state) => state.loading);
  const error = useAppStore((state) => state.lastError);
  const syncItems = useAppStore((state) => state.syncItems);
  const refreshItems = useAppStore((state) => state.refreshItems);
  const isSyncing = useAppStore((state) => state.operationInProgress?.syncItems === true);
  return { items, loading, error, syncItems, refreshItems, isSyncing };
};

// New hooks for customer sync with company context
export const useCustomerSync = () => {
  const syncCustomersFromZoho = useAppStore((state) => state.syncCustomersFromZoho);
  const getCustomerSyncStatus = useAppStore((state) => state.getCustomerSyncStatus);
  const getPendingSyncCustomers = useAppStore((state) => state.getPendingSyncCustomers);
  const forceSyncCustomer = useAppStore((state) => state.forceSyncCustomer);
  const isSyncing = useAppStore((state) => state.operationInProgress?.syncCustomers === true);
  const customerSyncStatus = useAppStore((state) => state.customerSyncStatus);
  const pendingSyncCustomers = useAppStore((state) => state.pendingSyncCustomers);
  
  return {
    syncCustomersFromZoho,
    getCustomerSyncStatus,
    getPendingSyncCustomers,
    forceSyncCustomer,
    isSyncing,
    customerSyncStatus,
    pendingSyncCustomers
  };
};

 