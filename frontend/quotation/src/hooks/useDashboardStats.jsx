// hooks/useDashboardStats.js
import { useAppStore } from '../services/store';
import { useEffect, useCallback, useRef } from 'react';

export const useDashboardStats = () => {
  const dashboardStats = useAppStore((s) => s.dashboardStats);
  const statsLoading = useAppStore((s) => s.statsLoading);
  const fetchDashboardStats = useAppStore((s) => s.fetchDashboardStats);
  const refreshDashboardStats = useAppStore((s) => s.refreshDashboardStats);
  const selectedCompany = useAppStore((s) => s.selectedCompany);
  const user = useAppStore((s) => s.user);
  const initialized = useAppStore((s) => s.initialized);
  
  const refresh = useCallback(async () => {
    if (!user) return;
    const companyId = (selectedCompany === 'all' || selectedCompany === 'ALL') ? null : selectedCompany;
    return await refreshDashboardStats(companyId);
  }, [refreshDashboardStats, selectedCompany, user]);
  
  // Auto-fetch on company change
  useEffect(() => {
    if (user && initialized && selectedCompany) {
      refresh();
    }
  }, [user, initialized, selectedCompany]);
  
  return {
    stats: dashboardStats,
    loading: statsLoading,
    refresh,
    // Convenience getters for user/sales dashboard
    totalQuotations: dashboardStats?.totalQuotations || 0,
    pending: dashboardStats?.pending || 0,
    inReview: dashboardStats?.inReview || 0,
    returned: dashboardStats?.returned || 0,
    approved: dashboardStats?.approved || 0,
    rejected: dashboardStats?.rejected || 0,
    awarded: dashboardStats?.awarded || 0,
    notAwarded: dashboardStats?.notAwarded || 0,
    totalValue: dashboardStats?.totalValue || 0,
    awardedValue: dashboardStats?.awardedValue || 0,
    totalCustomers: dashboardStats?.totalCustomers || 0,
    conversionRate: dashboardStats?.conversionRate || 0,
    actionRequired: dashboardStats?.actionRequired || 0,
    statusCounts: dashboardStats?.statusCounts || {},
    isAllCompanies: dashboardStats?.isAllCompanies || false,
  };
};