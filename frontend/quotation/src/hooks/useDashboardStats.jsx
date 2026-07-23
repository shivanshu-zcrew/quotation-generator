// hooks/useDashboardStats.js
import { useAppStore } from '../services/store';
import { useEffect, useCallback, useRef } from 'react';

export const useDashboardStats = () => {
  const dashboardStats = useAppStore((s) => s.dashboardStats);
  const statsLoading = useAppStore((s) => s.statsLoading);
  const refreshDashboardStats = useAppStore((s) => s.refreshDashboardStats);
  const selectedCompany = useAppStore((s) => s.selectedCompany);
  const user = useAppStore((s) => s.user);
  const initialized = useAppStore((s) => s.initialized);

  const fetchedForCompanyRef = useRef(null);

  const refresh = useCallback(async () => {
    if (!user) return;
    const companyId =
      (selectedCompany === 'all' || selectedCompany === 'ALL') ? null : selectedCompany;
    return await refreshDashboardStats(companyId);
  }, [refreshDashboardStats, selectedCompany, user]);

  useEffect(() => {
    if (!user || !initialized || !selectedCompany) {
      console.log('🟩 STATS EFFECT skip-early', { user: !!user, initialized, selectedCompany });
      return;
    }
    const currentCompanyId =
      selectedCompany === 'all' || selectedCompany === 'ALL' ? 'all' : selectedCompany;

    if (dashboardStats?._selectionId === currentCompanyId) {
      console.log('🟩 STATS EFFECT skip-match', { currentCompanyId, selectionId: dashboardStats?._selectionId });
      fetchedForCompanyRef.current = currentCompanyId;
      return;
    }
    if (fetchedForCompanyRef.current === currentCompanyId) {
      console.log('🟩 STATS EFFECT skip-ref', { currentCompanyId });
      return;
    }
    console.log('🟩 STATS EFFECT FETCH', { currentCompanyId, selectionId: dashboardStats?._selectionId });
    fetchedForCompanyRef.current = currentCompanyId;
    refresh();
  }, [user, initialized, selectedCompany, refresh]); // eslint-disable-line react-hooks/exhaustive-deps
  
  return {
    stats: dashboardStats,
    loading: statsLoading,
    refresh,
    totalQuotations: dashboardStats?.totalQuotations || 0,
    pending: dashboardStats?.pending || 0,
    inReview: dashboardStats?.inReview || 0,
    returned: dashboardStats?.returned || 0,
    approved: dashboardStats?.approved || 0,
    rejected: dashboardStats?.rejected || 0,
    awarded: dashboardStats?.awarded || 0,
    notAwarded: dashboardStats?.notAwarded || 0,
    cancelled: dashboardStats?.cancelled || 0,
    amended: dashboardStats?.amended || 0,
    totalValue: dashboardStats?.totalValue || 0,
    awardedValue: dashboardStats?.awardedValue || 0,
    totalCustomers: dashboardStats?.totalCustomers || 0,
    conversionRate: dashboardStats?.conversionRate || 0,
    actionRequired: dashboardStats?.actionRequired || 0,
    statusCounts: dashboardStats?.statusCounts || {},
    isAllCompanies: dashboardStats?.isAllCompanies || false,
  };
};