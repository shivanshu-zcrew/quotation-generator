// hooks/useOpsStats.js
import { useAppStore } from '../services/store';
import { useEffect, useCallback, useRef } from 'react';

export const useOpsStats = () => {
  const opsStats = useAppStore((s) => s.opsStats);
  const statsLoading = useAppStore((s) => s.statsLoading);
  const fetchOpsStats = useAppStore((s) => s.fetchOpsStats);
  const refreshOpsStats = useAppStore((s) => s.refreshOpsStats);
  const selectedCompany = useAppStore((s) => s.selectedCompany);
  const user = useAppStore((s) => s.user);
  const initialized = useAppStore((s) => s.initialized);
  
  const fetchedForCompanyRef = useRef(null);
  
  const refresh = useCallback(async () => {
    if (!user) return;
    const companyId = (selectedCompany === 'all' || selectedCompany === 'ALL') ? null : selectedCompany;
    return await refreshOpsStats(companyId);
  }, [refreshOpsStats, selectedCompany, user]);
  
  // Auto-fetch on company change - prevents duplicates
  useEffect(() => {
    if (!user || !initialized) return;
    
    const currentCompanyId = (selectedCompany === 'all' || selectedCompany === 'ALL') ? 'all' : selectedCompany;
    
    // Skip if already fetched for this company
    if (fetchedForCompanyRef.current === currentCompanyId && opsStats) {
      console.log('📊 useOpsStats - SKIP: Already fetched for this company', {
        company: currentCompanyId,
        fetchedCompany: fetchedForCompanyRef.current
      });
      return;
    }
    
    console.log('📊 useOpsStats - FETCHING stats for company:', currentCompanyId);
    fetchedForCompanyRef.current = currentCompanyId;
    refresh();
  }, [user, initialized, selectedCompany, refresh, opsStats]);
  
  // Return stats with convenient names for Ops dashboard
  return {
    stats: opsStats,
    loading: statsLoading,
    refresh,
    
    // Dashboard specific fields (matching backend response from getOpsDashboardStats)
    totalQuotations: opsStats?.totalQuotations || 0,
    pendingReview: opsStats?.pendingReview || 0,
    awaitingAdmin: opsStats?.awaitingAdmin || 0,
    returnedByMe: opsStats?.returnedByMe || 0,
    rejectedByAdmin: opsStats?.rejectedByAdmin || 0,
    approved: opsStats?.approved || 0,
    awarded: opsStats?.awarded || 0,
    notAwarded: opsStats?.notAwarded || 0,
    totalValue: opsStats?.totalValue || 0,
    awardedValue: opsStats?.awardedValue || 0,
    conversionRate: opsStats?.conversionRate || 0,
    isAllCompanies: opsStats?.isAllCompanies || false,
    
    // Tab counts
    tabCounts: opsStats?.tabCounts || {
      all: 0,
      pending: 0,
      ops_approved: 0,
      ops_rejected: 0,
      rejected: 0,
      approved: 0,
      awarded: 0,
      not_awarded: 0,
    },
  };
};