import { useAppStore, useInitializeStore } from '../services/store';
import React,{ useMemo, useRef, useEffect, useState, useCallback } from 'react';
import useToast from './useToast';
import { opsAPI } from '../services/api';

/**
 * Hook to access auth state
 * @returns {{ user, handleLogin, handleRegister, handleLogout, isLoading }}
 */
export const useAuth = () => {
  const user = useAppStore((state) => state.user);
  const handleLogin = useAppStore((state) => state.handleLogin);
  const handleRegister = useAppStore((state) => state.handleRegister);
  const handleLogout = useAppStore((state) => state.handleLogout);
  const loginLoading = useAppStore((state) => state.operationInProgress.login);
  const registerLoading = useAppStore((state) => state.operationInProgress.register);

  // Use useMemo to prevent object recreation on every render
  return useMemo(() => ({
    user,
    handleLogin,
    handleRegister,
    handleLogout,
    isLoading: loginLoading || registerLoading,
  }), [user, handleLogin, handleRegister, handleLogout, loginLoading, registerLoading]);
};

/**
 * Hook to access customers and their CRUD operations
 * @returns {{ customers, addCustomer, updateCustomer, deleteCustomer, isLoading }}
 */
export const useCustomers = () => {
  const customers = useAppStore((state) => state.customers);
  const addCustomer = useAppStore((state) => state.addCustomer);
  const updateCustomer = useAppStore((state) => state.updateCustomer);
  const deleteCustomer = useAppStore((state) => state.deleteCustomer);
  const addLoading = useAppStore((state) => state.operationInProgress.addCustomer);

  return useMemo(() => ({
    customers,
    addCustomer,
    updateCustomer,
    deleteCustomer,
    isLoading: addLoading,
  }), [customers, addCustomer, updateCustomer, deleteCustomer, addLoading]);
};

/**
 * Hook to access items and their CRUD operations
 * @returns {{ items, addItem, updateItem, deleteItem, isLoading }}
 */
export const useItems = () => {
  const items = useAppStore((state) => state.items);
  const addItem = useAppStore((state) => state.addItem);
  const updateItem = useAppStore((state) => state.updateItem);
  const deleteItem = useAppStore((state) => state.deleteItem);
  const addLoading = useAppStore((state) => state.operationInProgress.addItem);

  return useMemo(() => ({
    items,
    addItem,
    updateItem,
    deleteItem,
    isLoading: addLoading,
  }), [items, addItem, updateItem, deleteItem, addLoading]);
};

/**
 * Hook to access quotations and their CRUD operations
 * @returns {{ quotations, addQuotation, updateQuotation, deleteQuotation, approveQuotation, rejectQuotation, isLoading }}
 */
export const useQuotations = () => {
  const quotations = useAppStore((state) => state.quotations);
  const addQuotation = useAppStore((state) => state.addQuotation);
  const updateQuotation = useAppStore((state) => state.updateQuotation);
  const deleteQuotation = useAppStore((state) => state.deleteQuotation);
  const approveQuotation = useAppStore((state) => state.approveQuotation);
  const rejectQuotation = useAppStore((state) => state.rejectQuotation);
  const addLoading = useAppStore((state) => state.operationInProgress.addQuotation);

  return useMemo(() => ({
    quotations,
    addQuotation,
    updateQuotation,
    deleteQuotation,
    approveQuotation,
    rejectQuotation,
    isLoading: addLoading,
  }), [
    quotations, 
    addQuotation, 
    updateQuotation, 
    deleteQuotation, 
    approveQuotation, 
    rejectQuotation, 
    addLoading
  ]);
};

/**
 * Hook to access loading and error state
 * @returns {{ loading, loadError, lastError, clearError }}
 */
export const useAppState = () => {
  const loading = useAppStore((state) => state.loading);
  const loadError = useAppStore((state) => state.loadError);
  const lastError = useAppStore((state) => state.lastError);
  const clearError = useAppStore((state) => state.clearError);

  return useMemo(() => ({
    loading,
    loadError,
    lastError,
    clearError,
  }), [loading, loadError, lastError, clearError]);
};

/**
 * Hook to check if a specific operation is in progress
 * Usage: const isDeleting = useIsOperationInProgress('deleteCustomer_123');
 * @param {string} key Operation key
 * @returns {boolean}
 */
export const useIsOperationInProgress = (key) => {
  return useAppStore((state) => state.operationInProgress[key] === true);
};

/**
 * Hook to initialize store on mount (fetch data if user is logged in)
 * Call this once in your root App component
 */
export const useInitializeApp = () => {
  const user = useAppStore((state) => state.user);
  const fetchAllData = useAppStore((state) => state.fetchAllData);
  const initialized = useRef(false);

  useEffect(() => {
    // Only fetch once on mount
    if (user && !initialized.current) {
      initialized.current = true;
      fetchAllData();
    }
    
    // Reset initialized when user logs out
    if (!user) {
      initialized.current = false;
    }
  }, [user, fetchAllData]);
};

/**
 * Hook to access the full store (use sparingly to avoid unnecessary re-renders)
 */
export const useAppStoreAll = () => useAppStore();

/**
 * Hook to retry failed data load
 * @returns {{ retry, isRetrying }}
 */
export const useRetryDataLoad = () => {
  const fetchAllData = useAppStore((state) => state.fetchAllData);
  const loading = useAppStore((state) => state.loading);

  return useMemo(() => ({
    retry: fetchAllData,
    isRetrying: loading,
  }), [fetchAllData, loading]);
};

/**
 * Hook to get user role utilities
 * @returns {{ isAdmin, isCustomer, user }}
 */
export const useUserRole = () => {
  const user = useAppStore((state) => state.user);
  
  return useMemo(() => ({
    user,
    isAdmin: user?.role === 'admin',
    isCustomer: user?.role === 'customer',
    isUser: user?.role === 'user',
  }), [user]);
};

// Optional: Create selector hooks for specific data to prevent unnecessary re-renders
export const useCustomersList = () => {
  return useAppStore((state) => state.customers);
};

export const useItemsList = () => {
  return useAppStore((state) => state.items);
};

export const useQuotationsList = () => {
  return useAppStore((state) => state.quotations);
};

export const useUser = () => {
  return useAppStore((state) => state.user);
};

export const useLoading = () => {
  return useAppStore((state) => state.loading);
};

export const useError = () => {
  return useAppStore((state) => state.loadError);
};
// ─────────────────────────────────────────────────────────────
// Custom Hook: useAdminStats
// ─────────────────────────────────────────────────────────────
export const useAdminStats = () => {
  const adminStats = useAppStore((s) => s.adminStats);
  const statsLoading = useAppStore((s) => s.statsLoading);
  const fetchAdminStats = useAppStore((s) => s.fetchAdminStats);
  const selectedCompany = useAppStore((s) => s.selectedCompany);

  const refresh = React.useCallback(() => {
    return fetchAdminStats(selectedCompany);
  }, [fetchAdminStats, selectedCompany]);

  return {
    stats: adminStats,
    loading: statsLoading,
    refresh,
    
    // Row 1 stats
    totalQuotations: adminStats?.stats?.totalQuotations || 0,
    actionRequired: adminStats?.stats?.actionRequired || 0,
    approved: adminStats?.stats?.approved || 0,
    awarded: adminStats?.stats?.awarded || 0,
    
    // Row 2 stats
    notAwarded: adminStats?.stats?.notAwarded || 0,
    totalRevenue: adminStats?.stats?.totalRevenue || 0,
    awardedValue: adminStats?.stats?.awardedValue || 0,
    conversionRate: adminStats?.stats?.conversionRate?.rate || 0,
    
    // Additional stats
    rejected: adminStats?.stats?.rejected || 0,
    
    // Raw data for detailed displays
    conversionDetails: adminStats?.stats?.conversionRate || { 
      approvedCount: 0, 
      awardedCount: 0, 
      notAwardedCount: 0, 
      totalDecided: 0, 
      rate: 0 
    },
    statusCounts: adminStats?.stats?.statusCounts || {},
    
    // Legacy support (if needed)
    totalApprovedValue: adminStats?.stats?.totalRevenue || 0,
    totalAwardedValue: adminStats?.stats?.awardedValue || 0,
  };
};

// ─────────────────────────────────────────────────────────────
// Custom Hook: useOpsStats
// ─────────────────────────────────────────────────────────────
export const useOpsStats = () => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const selectedCompany = useAppStore((s) => s.selectedCompany);
  const addToast = useToast().addToast;

  const fetchStats = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (selectedCompany) {
        params.companyId = selectedCompany;
      }
      const response = await opsAPI.getOpsStats(params);
      setStats(response.data.stats);
    } catch (error) {
      console.error('Error fetching ops stats:', error);
      addToast('Failed to load stats', 'error');
    } finally {
      setLoading(false);
    }
  }, [selectedCompany, addToast]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  return {
    stats,
    loading,
    refresh: fetchStats,
    
    // Row 1 stats
    totalQuotations: stats?.totalQuotations || 0,
    pendingReview: stats?.pendingReview || 0,
    awaitingAdmin: stats?.awaitingAdmin || 0,
    returnedByMe: stats?.returnedByMe || 0,
    
    // Additional stats
    totalValue: stats?.totalValue || 0,
  };
};