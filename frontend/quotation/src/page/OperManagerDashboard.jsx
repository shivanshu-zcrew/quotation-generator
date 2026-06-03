import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Eye, Download, Clock, CheckCircle, XCircle,
  FileText, Search, X, Check, LogOut,
  AlertCircle, RefreshCw, ChevronUp, ChevronDown, ChevronLeft, ChevronRight,
  Shield, Award, Ban, Users, TrendingUp, Menu,
  ShoppingCart
} from 'lucide-react';

import { useOpsStats } from '../hooks/customHooks';
import { useAppStore, useCompanyQuotations } from '../services/store';
import { downloadQuotationPDF } from '../utils/pdfGenerator';
import { CompanyCurrencySelector, CompanyCurrencyDisplay, useCompanyCurrency } from '../components/CompanyCurrencySelector';
import useToast, { ToastContainer } from '../hooks/useToast';

// Import shared components
import {
  StatusBadge,
  RejectionNote,
  StatCard,
  ActionBtn,
  SortHeader,
  PaginationBar,
  SkeletonRow,
  ConfirmModal,
} from '../components/SharedComponents';

// Import new components
import CompactStatsCard from '../components/HomePageComponent/CompactStatsCard';
import ViewToggle from '../components/HomePageComponent/ViewToggle';

// Import utils
import {
  DEBOUNCE_MS,
} from '../utils/constants';
import { fmtCurrency, fmtDate, isExpired, isExpiringSoon } from '../utils/formatters';
import AwardModal from '../components/AwardModal';

// Custom hook for responsive detection
const useMediaQuery = (query) => {
  const [matches, setMatches] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.matchMedia(query).matches;
    }
    return false;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const mediaQuery = window.matchMedia(query);
    const handler = (e) => setMatches(e.matches);
    
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, [query]);

  return matches;
};

// Shimmer Components
const ShimmerStatCard = () => (
  <div style={{
    background: 'white',
    borderRadius: '20px',
    padding: '1.25rem',
    border: '1px solid #f1f5f9',
  }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
      <div>
        <ShimmerLine width="80px" height="12px" />
        <ShimmerLine width="60px" height="28px" style={{ marginTop: '8px' }} />
        <ShimmerLine width="100px" height="10px" style={{ marginTop: '8px' }} />
      </div>
      <ShimmerCircle size={40} />
    </div>
  </div>
);

const ShimmerLine = ({ width, height, style = {} }) => (
  <div
    style={{
      width,
      height,
      borderRadius: '8px',
      background: 'linear-gradient(90deg, #f1f5f9 25%, #e2e8f0 50%, #f1f5f9 75%)',
      backgroundSize: '200% 100%',
      animation: 'shimmer 1.5s ease infinite',
      ...style,
    }}
  />
);

const ShimmerCircle = ({ size }) => (
  <div
    style={{
      width: size,
      height: size,
      borderRadius: '50%',
      background: 'linear-gradient(90deg, #f1f5f9 25%, #e2e8f0 50%, #f1f5f9 75%)',
      backgroundSize: '200% 100%',
      animation: 'shimmer 1.5s ease infinite',
    }}
  />
);

const ShimmerTableRow = () => (
  <tr>
    {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => (
      <td key={i} style={{ padding: '12px 16px' }}>
        <ShimmerLine width={i === 1 ? '80px' : i === 8 ? '70px' : '120px'} height="16px" />
      </td>
    ))}
  </tr>
);

const ShimmerCard = () => (
  <div style={{
    background: 'white',
    borderRadius: '12px',
    padding: '1rem',
    marginBottom: '0.75rem',
    border: '1px solid #f1f5f9',
  }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
      <ShimmerLine width="100px" height="20px" />
      <ShimmerLine width="80px" height="20px" />
    </div>
    <ShimmerLine width="150px" height="18px" style={{ marginBottom: '0.5rem' }} />
    <ShimmerLine width="200px" height="14px" style={{ marginBottom: '0.5rem' }} />
    <div style={{ display: 'flex', gap: '1rem', marginBottom: '0.75rem' }}>
      <ShimmerLine width="80px" height="12px" />
      <ShimmerLine width="80px" height="12px" />
      <ShimmerLine width="60px" height="12px" />
    </div>
    <div style={{ display: 'flex', gap: '0.5rem', borderTop: '1px solid #f1f5f9', paddingTop: '0.75rem' }}>
      <ShimmerLine width="60px" height="32px" />
      <ShimmerLine width="60px" height="32px" />
      <ShimmerLine width="70px" height="32px" />
    </div>
  </div>
);

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────
const TAB_KEYS = {
  all:          { label: 'All Quotations',        Icon: FileText, statusFilter: null }, 
  pending:      { label: 'Pending Review',        Icon: Clock,    statusFilter: 'pending' },
  ops_approved: { label: 'Awaiting Admin',        Icon: Shield,   statusFilter: 'ops_approved' },
  ops_rejected: { label: 'Returned by Me',        Icon: Ban,      statusFilter: 'ops_rejected' },
  rejected:     { label: 'Rejected by Admin',     Icon: XCircle,  statusFilter: 'rejected' },
  approved:     { label: 'Approved',              Icon: CheckCircle, statusFilter: 'approved' },
  awarded:      { label: 'Awarded',               Icon: Award,    statusFilter: 'awarded' },
};

// ─────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────
const ExpiryBadge = React.memo(({ type }) => {
  const config = {
    expired: { bg: '#fef2f2', color: '#dc2626', border: '#fecaca', label: 'Expired' },
    expiring: { bg: '#fffbeb', color: '#d97706', border: '#fde68a', label: 'Expiring Soon' }
  };
  const cfg = config[type];
  return (
    <span style={{ 
      fontSize: '0.62rem', fontWeight: 700, color: cfg.color, 
      background: cfg.bg, padding: '1px 6px', borderRadius: 999, 
      border: `1px solid ${cfg.border}` 
    }}>
      {cfg.label}
    </span>
  );
});

const ItemsBadge = React.memo(({ count }) => (
  <span style={{ 
    background: '#f1f5f9', color: '#475569', 
    borderRadius: 6, padding: '0.2rem 0.6rem', 
    fontSize: '0.8rem', fontWeight: 600 
  }}>
    {count}
  </span>
));

// Mobile Quotation Card for Ops
const OpsQuotationCard = React.memo(({ quotation, selectedCurrency, onView, onApprove, onReject, onDownload, onAward, isDownloading, isApproving, isRejecting, isAwarding }) => {
  const expired = isExpired(quotation.expiryDate);
  const expiring = !expired && isExpiringSoon(quotation.expiryDate);
  const canAct = quotation.status === 'pending';
  const canAward = quotation.status === 'approved' && ( quotation.createdBy?.role === 'ops_manager' || quotation.createdBySnapshot?.role === 'ops_manager');

  return (
    <div style={{
      background: 'white',
      borderRadius: '12px',
      padding: '1rem',
      marginBottom: '0.75rem',
      boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
      border: '1px solid #f1f5f9'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 700, color: '#0f172a', fontFamily: 'monospace', fontSize: '0.85rem' }}>
              {quotation.quotationNumber || '—'}
            </span>
            <StatusBadge status={quotation.status} />
            {expired && <ExpiryBadge type="expired" />}
            {expiring && <ExpiryBadge type="expiring" />}
          </div>
        </div>
        <div style={{ fontSize: '1rem', fontWeight: 700, color: '#0f172a' }}>
          {fmtCurrency(quotation.total, selectedCurrency)}
        </div>
      </div>

      <div style={{ marginBottom: '0.5rem' }}>
        <div style={{ fontWeight: 600, color: '#0f172a', fontSize: '0.875rem' }}>
          {quotation.customerSnapshot?.name || quotation.customer || quotation.customerId?.name || 'N/A'}
        </div>
        {quotation.contact && (
          <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: 2 }}>{quotation.contact}</div>
        )}
        <RejectionNote quotation={quotation} />
      </div>

      {quotation.projectName && (
        <div style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: '0.5rem' }}>
          📋 {quotation.projectName}
        </div>
      )}

      <div style={{ display: 'flex', gap: '1rem', marginBottom: '0.75rem', fontSize: '0.7rem', color: '#64748b', flexWrap: 'wrap' }}>
        <div>📅 Submitted: {fmtDate(quotation.date)}</div>
        <div>⏰ Expiry: {fmtDate(quotation.expiryDate)}</div>
        <div>📦 Items: {quotation.items?.length ?? 0}</div>
      </div>

      <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginBottom: '0.75rem' }}>
        Created by: {quotation.createdBy?.name || '—'}
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', borderTop: '1px solid #f1f5f9', paddingTop: '0.75rem' }}>
        <ActionBtn bg="#e0f2fe" color="#0369a1" onClick={() => onView(quotation._id)} icon={Eye} label="View" size="small" />
        {canAct && (
          <>
            <ActionBtn 
              bg="#dcfce7" 
              color="#166534" 
              onClick={() => onApprove(quotation._id)} 
              icon={Check} 
              label="Approve" 
              size="small"
              disabled={isApproving}
            />
            <ActionBtn 
              bg="#fee2e2" 
              color="#991b1b" 
              onClick={() => onReject(quotation)} 
              icon={X} 
              label="Reject" 
              size="small"
              disabled={isRejecting}
            />
          </>
        )}
        {canAward && (
          <ActionBtn 
            bg="#e9d5ff" 
            color="#6b21a8" 
            onClick={() => onAward(quotation)} 
            icon={Award} 
            label="Award" 
            size="small"
            disabled={isAwarding}
          />
        )}
      </div>
    </div>
  );
});
OpsQuotationCard.displayName = 'OpsQuotationCard';

// ─────────────────────────────────────────────────────────────
// Main Dashboard
// ─────────────────────────────────────────────────────────────
export default function OpsDashboard({ onViewQuotation }) {
  const navigate = useNavigate();
  
  // Responsive hooks
  const isMobile = useMediaQuery('(max-width: 768px)');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [viewMode, setViewMode] = useState('table');
  
  // Award Modal State
  const [awardModal, setAwardModal] = useState({
    open: false,
    quotation: null,
    loading: false
  });
  const [forceHideLoading, setForceHideLoading] = useState(false);
  const loadingTimeoutRef = useRef(null);
  
  // ── Store subscriptions ───────────────────────────────────
  // ✅ USE THE HOOK'S BUILT-IN PAGINATION
  const { 
    quotations: companyQuotations, 
    pagination,
    refresh: refreshCompanyQuotations, 
    loading: quotationsLoading,
    goToPage,
    changeLimit,
    currentPage,
    currentLimit
  } = useCompanyQuotations();
  
  const user = useAppStore((s) => s.user);
  const awardQuotation = useAppStore((s) => s.awardQuotation);
  const opsApproveQuotation = useAppStore((s) => s.opsApproveQuotation);
  const opsRejectQuotation = useAppStore((s) => s.opsRejectQuotation);
  const handleLogout = useAppStore((s) => s.handleLogout);
  const loadError = useAppStore((s) => s.loadError);
  const clearError = useAppStore((s) => s.clearError);
  const selectedCompany = useAppStore((s) => s.selectedCompany);
  
  // ── Stats hook ────────────────────────────────────────────
  const { 
    loading: statsLoading, 
    refresh: refreshStats,
    totalQuotations,
    pendingReview,
    awaitingAdmin,
    returnedByMe,
    totalValue,
    tabCounts, 
    rejectedByAdmin,
    approved,
    awarded
  } = useOpsStats();

  // ── Company & Currency ────────────────────────────────────
  const {
    selectedCurrency,
    refreshCompanyData
  } = useCompanyCurrency();

  // ── Custom hooks ──────────────────────────────────────────
  const { toasts, addToast, dismissToast } = useToast();
  const searchRef = useRef(null);
  const searchTimer = useRef(null);
  const isMountedRef = useRef(true);
  const initialLoadDone = useRef(false);
  const refreshInProgress = useRef(false);

  // ── Table state ───────────────────────────────────────────
  const [activeTab, setActiveTab] = useState('all');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState({ field: 'createdAt', dir: 'desc' });
  const [loadingIds, setLoadingIds] = useState({});
  const [downloadLoadingId, setDownloadLoadingId] = useState(null);
  const [rejectTarget, setRejectTarget] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
 
  // Update limit on screen resize
  useEffect(() => {
    if (isMobile && currentLimit !== 10) {
      changeLimit(10);
    } else if (!isMobile && currentLimit !== 20) {
      changeLimit(20);
    }
  }, [isMobile, currentLimit, changeLimit]);

  // Reset view mode on mobile
  useEffect(() => {
    if (isMobile) {
      setViewMode('card');
    }
  }, [isMobile]);

  // Mark component as mounted
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

useEffect(() => {
  if (!selectedCompany || initialLoadDone.current) return;
  
  const loadInitialData = async () => {
    if (refreshInProgress.current) return;
    refreshInProgress.current = true;
    
    loadingTimeoutRef.current = setTimeout(() => {
      console.log('Loading timeout - forcing data display');
      setForceHideLoading(true);
      initialLoadDone.current = true;
      refreshInProgress.current = false;
    }, 8000);
    
    try {
      // ✅ Call refresh with initial params
      await refreshCompanyQuotations({
        page: 1,
        limit: isMobile ? 10 : 20,
        status: activeTab === 'all' ? undefined : activeTab,
        search: '',
        sortBy: 'createdAt',
        sortDir: 'desc'
      });
      await refreshStats();
      
      if (isMountedRef.current) {
        initialLoadDone.current = true;
        setForceHideLoading(false);
      }
    } catch (error) {
      console.error('Initial load error:', error);
      if (isMountedRef.current) {
        initialLoadDone.current = true;
        setForceHideLoading(true);
      }
    } finally {
      clearTimeout(loadingTimeoutRef.current);
      refreshInProgress.current = false;
    }
  };
  
  loadInitialData();
}, [selectedCompany, refreshCompanyQuotations, refreshStats, isMobile, activeTab]);

  // ── Derived state ─────────────────────────────────────────
  const safeQuotationsLoading = quotationsLoading === undefined ? true : quotationsLoading;
  const hasData = companyQuotations?.length > 0;
  const isLoading = !initialLoadDone.current && (safeQuotationsLoading || statsLoading) && !hasData && !forceHideLoading;
  const isRefreshing = initialLoadDone.current && safeQuotationsLoading && companyQuotations?.length > 0;

  // ✅ Use server-side pagination from the hook
  const safeQ = useMemo(() => {
    return Array.isArray(companyQuotations) ? companyQuotations : [];
  }, [companyQuotations]);

  const totalFiltered = pagination?.total || 0;
  const totalPages = pagination?.totalPages || 1;
  const safePage = currentPage;
  const currentLimitValue = currentLimit;

  // ── Tab counts from API counts or calculate from data
  const tabCountsFromStats = useMemo(() => {
    // Use tabCounts from API if available
    if (tabCounts && Object.values(tabCounts).some(v => v > 0)) {
      return tabCounts;
    }
    
    // Fallback to local calculation
    return {
      all: pagination?.total || safeQ.length,
      pending: safeQ.filter(q => q && q.status === 'pending').length,
      ops_approved: safeQ.filter(q => q && q.status === 'ops_approved').length,
      ops_rejected: safeQ.filter(q => q && q.status === 'ops_rejected').length,
      rejected: safeQ.filter(q => q && q.status === 'rejected').length,
      approved: safeQ.filter(q => q && q.status === 'approved').length,
      awarded: safeQ.filter(q => q && q.status === 'awarded').length,
    };
  }, [safeQ, pagination, tabCounts]);
  // ── Loading helpers ───────────────────────────────────────
  const setOp = useCallback((id, action, val) => {
    setLoadingIds((p) => ({ ...p, [`${id}_${action}`]: val }));
  }, []);

  const isOp = useCallback((id, action) => !!loadingIds[`${id}_${action}`], [loadingIds]);

  // ── Handlers ──────────────────────────────────────────────
// Replace handleSearchChange (around line 400)
const handleSearchChange = useCallback((e) => {
  const val = e.target.value;
  setSearchInput(val);
  clearTimeout(searchTimer.current);
  searchTimer.current = setTimeout(() => {
    setSearch(val);
    // ✅ Pass search to refresh with page 1
    refreshCompanyQuotations({ 
      page: 1, 
      search: val,
      status: activeTab === 'all' ? undefined : activeTab,
      sortBy: sort.field,
      sortDir: sort.dir
    });
  }, DEBOUNCE_MS);
}, [refreshCompanyQuotations, activeTab, sort]);

// Replace clearSearch
const clearSearch = useCallback(() => {
  setSearchInput('');
  setSearch('');
  refreshCompanyQuotations({ 
    page: 1, 
    search: '',
    status: activeTab === 'all' ? undefined : activeTab,
    sortBy: sort.field,
    sortDir: sort.dir
  });
}, [refreshCompanyQuotations, activeTab, sort]);

// Replace handleTabChange
const handleTabChange = useCallback((key) => {
  setActiveTab(key);
  setSearchInput('');
  setSearch('');
  setSort({ field: 'createdAt', dir: 'desc' });
  setMobileMenuOpen(false);
  
  // ✅ Pass status to refresh with page 1
  refreshCompanyQuotations({ 
    page: 1, 
    status: key === 'all' ? undefined : key,
    search: '',
    sortBy: 'createdAt',
    sortDir: 'desc'
  });
}, [refreshCompanyQuotations]);
 
const handleSort = useCallback((field) => {
   let sortField = field;
  if (field === 'customer') {
    sortField = 'customer';
  } else if (field === 'createdBy') {
    sortField = 'createdBy';
  }
  
  const newDir = sort.field === field && sort.dir === 'asc' ? 'desc' : 'asc';
  setSort({ field, dir: newDir });
  
  refreshCompanyQuotations({ 
    page: 1, 
    sortBy: sortField, 
    sortDir: newDir,
    status: activeTab === 'all' ? undefined : activeTab,
    search: search
  });
}, [refreshCompanyQuotations, activeTab, search, sort]);


const handleRefresh = useCallback(async () => {
  if (refreshInProgress.current) {
    addToast('Refresh already in progress', 'info');
    return;
  }
  
  refreshInProgress.current = true;
  try {
    // ✅ Pass current page, limit, and filters to refresh
    await refreshCompanyQuotations({ 
      page: currentPage, 
      limit: currentLimit,
      status: activeTab === 'all' ? undefined : activeTab,
      search: search,
      sortBy: sort.field,
      sortDir: sort.dir
    });
    await refreshStats();
    addToast('Data refreshed', 'success');
  } catch (err) {
    addToast(err.message || 'Refresh failed', 'error');
  } finally {
    refreshInProgress.current = false;
  }
}, [refreshCompanyQuotations, refreshStats, addToast, currentPage, currentLimit, activeTab, search, sort]);

const handleApprove = useCallback(async (id) => {
  setOp(id, 'approve', true);
  try {
    const result = await opsApproveQuotation(id);
    if (result?.success) {
      addToast('Quotation approved and forwarded to admin', 'success');
      await Promise.all([
        refreshCompanyQuotations({
          page: currentPage,
          limit: currentLimit,
          status: activeTab === 'all' ? undefined : activeTab,
          search,
          sortBy: sort.field,
          sortDir: sort.dir,
        }),
        refreshStats()
      ]);
    } else {
      addToast(result?.error || 'Failed to approve quotation', 'error');
    }
  } catch (error) {
    addToast(error.message || 'Failed to approve quotation', 'error');
  } finally {
    setOp(id, 'approve', false);
  }
}, [opsApproveQuotation, addToast, refreshCompanyQuotations, refreshStats, setOp, currentPage, currentLimit]);

  const handleReject = {
    open: useCallback((quotation) => {
      setRejectTarget(quotation);
      setRejectReason('');
    }, []),
    close: useCallback(() => setRejectTarget(null), []),
    confirm: useCallback(async () => {
      if (!rejectTarget || !rejectReason.trim()) return;
      
      setOp(rejectTarget._id, 'reject', true);
      try {
        const result = await opsRejectQuotation(rejectTarget._id, rejectReason);
        if (result?.success) {
          addToast('Quotation rejected', 'success');
          handleReject.close();
          await Promise.all([
            refreshCompanyQuotations({
              page: currentPage,
              limit: currentLimit,
              status: activeTab === 'all' ? undefined : activeTab,
              search,
              sortBy: sort.field,
              sortDir: sort.dir,
            }),
            refreshStats()
          ]);
        } else {
          addToast(result?.error || 'Failed to reject quotation', 'error');
        }
      } catch (error) {
        addToast(error.message || 'Failed to reject quotation', 'error');
      } finally {
        setOp(rejectTarget._id, 'reject', false);
      }
    }, [rejectTarget, rejectReason, opsRejectQuotation, addToast, refreshCompanyQuotations, refreshStats, setOp, currentPage, currentLimit])
  };

  const handleDownload = useCallback(async (quotation) => {
    setDownloadLoadingId(quotation._id);
    try {
      await downloadQuotationPDF(quotation);
      addToast('PDF downloaded successfully!', 'success');
    } catch (error) {
      addToast(`PDF failed: ${error.message}`, 'error');
    } finally {
      setDownloadLoadingId(null);
    }
  }, [addToast]);

  const handleView = useCallback((id) => {
    if (onViewQuotation) {
      onViewQuotation(id);
    } else {
      navigate(`/quotation/${id}`);
    }
  }, [onViewQuotation, navigate]);

  const handleAwardOpen = useCallback((quotation) => {
    setAwardModal({
      open: true,
      quotation,
      loading: false
    });
  }, []);
  
  const handleAwardClose = useCallback(() => {
    setAwardModal({
      open: false,
      quotation: null,
      loading: false
    });
  }, []);
  
  const handleAwardConfirm = useCallback(async (awarded, awardNote) => {
    if (!awardModal.quotation) return;
    
    setAwardModal(prev => ({ ...prev, loading: true }));
    
    try {
      const result = await awardQuotation(awardModal.quotation._id, awarded, awardNote);
      
      if (result?.success) {
        addToast(
          awarded 
            ? `🏆 "${awardModal.quotation.quotationNumber}" marked as Awarded!` 
            : `"${awardModal.quotation.quotationNumber}" marked as Not Awarded.`,
          "success"
        );
        await Promise.all([
          refreshCompanyQuotations({
            page: currentPage,
            limit: currentLimit,
            status: activeTab === 'all' ? undefined : activeTab,
            search,
            sortBy: sort.field,
            sortDir: sort.dir,
          }),
          refreshStats()
        ]);
        handleAwardClose();
      } else {
        addToast(result?.error || "Failed to update award status", "error");
        setAwardModal(prev => ({ ...prev, loading: false }));
      }
    } catch (error) {
      console.error('Award error:', error);
      addToast(error.message || "Failed to update award status", "error");
      setAwardModal(prev => ({ ...prev, loading: false }));
    }
  }, [awardModal.quotation, awardQuotation, addToast, refreshCompanyQuotations, refreshStats, handleAwardClose, currentPage, currentLimit]);

  // ── Keyboard shortcut ─────────────────────────────────────
  useEffect(() => {
    const handler = (e) => {
      if (e.key === '/' && !['INPUT','TEXTAREA'].includes(document.activeElement?.tagName)) {
        e.preventDefault(); 
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => () => clearTimeout(searchTimer.current), []);

  // ── Tab configuration ─────────────────────────────────────
  const TABS = useMemo(() => [
    { key: 'all',           label: 'All Quotations',     Icon: FileText,     count: tabCountsFromStats.all },
    { key: 'pending',       label: 'Pending Review',     Icon: Clock,        count: tabCountsFromStats.pending },
    { key: 'ops_approved',  label: 'Awaiting Admin',     Icon: Shield,       count: tabCountsFromStats.ops_approved },
    { key: 'ops_rejected',  label: 'Returned by Me',     Icon: Ban,          count: tabCountsFromStats.ops_rejected },
    { key: 'rejected',      label: 'Rejected by Admin',  Icon: XCircle,      count: tabCountsFromStats.rejected },
    { key: 'approved',      label: 'Approved',           Icon: CheckCircle,  count: tabCountsFromStats.approved },
    { key: 'awarded',       label: 'Awarded',            Icon: Award,        count: tabCountsFromStats.awarded },
  ], [tabCountsFromStats]);

  // ── Render helpers with Shimmer ──────────────────────────
  const renderStatCards = () => {
    if (isLoading) {
      return (
        <div style={styles.statsGrid}>
          {[1, 2, 3, 4].map(i => <ShimmerStatCard key={i} />)}
        </div>
      );
    }

    if (isMobile) {
      const statusCounts = {
        pending: pendingReview,
        in_review: awaitingAdmin,
        approved: 0,
        awarded: 0,
        returned: returnedByMe
      };
      return (
        <CompactStatsCard 
          totalRevenue={totalValue}
          quotationsCount={totalQuotations}
          customersCount={0}
          selectedCurrency={selectedCurrency}
          statusCounts={statusCounts}
          loading={false}
        />
      );
    }
    
    return (
      <div style={styles.statsGrid}>
        <StatCard 
          label="Total Quotations" 
          value={totalQuotations} 
          accent="#6366f1" 
          iconBg="#eff1ff" 
          iconColor="#6366f1" 
          Icon={FileText} 
          loading={false} 
          sub="All quotations in system"
        />
        <StatCard 
          label="Pending Review" 
          value={pendingReview} 
          accent="#f59e0b" 
          iconBg="#fef3c7" 
          iconColor="#f59e0b" 
          Icon={Clock} 
          loading={false} 
          sub="Awaiting your review"
        />
        <StatCard 
          label="Awaiting Admin" 
          value={awaitingAdmin} 
          accent="#3b82f6" 
          iconBg="#dbeafe" 
          iconColor="#3b82f6" 
          Icon={Shield} 
          loading={false} 
          sub="Forwarded to admin"
        />
        <StatCard 
          label="Returned by You" 
          value={returnedByMe} 
          accent="#ef4444" 
          iconBg="#fee2e2" 
          iconColor="#ef4444" 
          Icon={Ban} 
          loading={false} 
          sub="Rejected quotations"
        />
      </div>
    );
  };

  const renderContent = () => {
    if (isLoading) {
      return (
        <>
          {isMobile ? (
            <div style={{ padding: '1rem' }}>
              {[1, 2, 3, 4, 5].map(i => <ShimmerCard key={i} />)}
            </div>
          ) : (
            <div style={styles.tableWrapper}>
              <table style={styles.table}>
                <thead>
                  <tr style={{ backgroundColor: '#fafafa' }}>
                    {['Quote #','Customer','Date','Expiry','Status','Created By','Items','Total','Actions'].map(h => (
                      <th key={h} style={styles.skeletonHeader}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[1, 2, 3, 4, 5, 6].map(i => <ShimmerTableRow key={i} />)}
                </tbody>
              </table>
            </div>
          )}
        </>
      );
    }

    if (!isLoading && safeQ.length === 0) {
      return (
        <div style={styles.emptyState}>
          <FileText size={isMobile ? 36 : 48} color="#cbd5e1" style={{ marginBottom: '1rem' }}/>
          <p style={styles.emptyStateTitle}>
            {search ? `No results for "${search}"` : 'No quotations found'}
          </p>
          {search && (
            <button onClick={clearSearch} style={styles.emptyStateClear}>
              Clear search
            </button>
          )}
        </div>
      );
    }

    return (
      <>
        {(isMobile || viewMode === 'card') ? (
          <div style={{ 
            padding: isMobile ? '1rem' : '1.5rem',
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, 1fr)',
            gap: isMobile ? '0.75rem' : '1rem'
          }}>
            {safeQ.length === 0 ? (
              <div style={{ gridColumn: '1 / -1', padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>
                No results for "<strong>{search}</strong>"
                <button onClick={clearSearch} style={{ marginLeft: '0.5rem', background: 'none', border: 'none', color: '#6366f1', cursor: 'pointer', fontWeight: 600 }}>Clear</button>
              </div>
            ) : (
              safeQ.map((q) => (
                <OpsQuotationCard
                  key={q._id}
                  quotation={q}
                  selectedCurrency={selectedCurrency}
                  onView={handleView}
                  onApprove={handleApprove}
                  onReject={handleReject.open}
                  onDownload={handleDownload}
                  onAward={handleAwardOpen}
                  isDownloading={downloadLoadingId === q._id}
                  isApproving={isOp(q._id, 'approve')}
                  isRejecting={isOp(q._id, 'reject')}
                  isAwarding={isOp(q._id, 'award')} 
                />
              ))
            )}
          </div>
        ) : (
          <div style={styles.tableWrapper}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <SortHeader label="Quote #" field="quotationNumber" sort={sort} onSort={handleSort}/>
                  <SortHeader label="Customer" field="customer" sort={sort} onSort={handleSort}/>
                  <SortHeader label="Date" field="date" sort={sort} onSort={handleSort}/>
                  <SortHeader label="Expiry" field="expiryDate" sort={sort} onSort={handleSort}/>
                  <SortHeader label="Status" field="status" sort={sort} onSort={handleSort}/>
                  <SortHeader label="Created By" field="createdBy" sort={sort} onSort={handleSort}/>
                  <th style={styles.itemsHeaderCell}>Items</th>
                  <SortHeader label={`Total (${selectedCurrency})`} field="total" sort={sort} onSort={handleSort} align="right"/>
                  <th style={styles.actionsHeaderCell}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {safeQ.length === 0 ? (
                  <tr>
                    <td colSpan={9} style={styles.noResults}>
                      No results for "<strong>{search}</strong>"
                      <button onClick={clearSearch} style={styles.clearSearchLink}>Clear</button>
                    </td>
                  </tr>
                ) : (
                  safeQ.map((q) => {
                    const isDownloading = downloadLoadingId === q._id;
                    const canAct = q.status === 'pending';  
                    const canAward = q.status === 'approved' && ( q.createdBy?.role === 'ops_manager' || q.createdBySnapshot?.role === 'ops_manager');
                    const isAdminRejected = q.status === 'rejected';
                    const expired = isExpired(q.expiryDate);
                    const expiring = !expired && isExpiringSoon(q.expiryDate);
                  
                    return (
                      <tr key={q._id} className="ops-row" style={{
                        backgroundColor: isAdminRejected ? '#fef2f2' : 'transparent',
                      }}>
                        <td style={styles.cell}>
                          <div style={styles.quoteCell}>
                            <span style={styles.quoteNumber}>{q.quotationNumber || '—'}</span>
                            {expired && <ExpiryBadge type="expired" />}
                            {expiring && <ExpiryBadge type="expiring" />}
                          </div>
                        </td>
                        <td style={styles.cell}>
                          <div style={styles.customerCell}>
                            <div style={styles.customerName}>
                              {q.customerSnapshot?.name || q.customer || q.customerId?.name || 'N/A'}
                            </div>
                            {q.contact && <div style={styles.contactText}>{q.contact}</div>}
                          </div>
                        </td>
                        <td style={styles.dateCell}>{fmtDate(q.date)}</td>
                        <td style={styles.dateCell}>
                          <span style={{ 
                            color: expired ? '#dc2626' : expiring ? '#d97706' : '#64748b',
                            fontWeight: expired || expiring ? 600 : 400
                          }}>
                            {fmtDate(q.expiryDate)}
                          </span>
                        </td>
                        <td style={styles.cell}>
                          <StatusBadge status={q.status}/>
                          <RejectionNote quotation={q}/>
                        </td>
                        <td style={styles.cell}>{q.createdBy?.name || '—'}</td>
                        <td style={{ ...styles.cell, textAlign: 'center' }}>
                          <ItemsBadge count={q.items?.length ?? 0} />
                        </td>
                        <td style={styles.totalCell}>
                          {fmtCurrency(q.total, selectedCurrency)}
                        </td>
                        <td style={styles.actionsCell}>
                          <div style={styles.actionsContainer}>
                            <ActionBtn bg="#e0f2fe" color="#0369a1" onClick={() => handleView(q._id)} 
                              icon={Eye} label="View" title="View quotation" size="small"/>
                            
                            {canAct && (
                              <>
                                <ActionBtn 
                                  bg="#dcfce7" 
                                  color="#166534" 
                                  onClick={() => handleApprove(q._id)} 
                                  icon={Check} 
                                  label="Approve" 
                                  title="Approve quotation"
                                  disabled={isOp(q._id, 'approve')}
                                  size="small"
                                />
                                <ActionBtn 
                                  bg="#fee2e2" 
                                  color="#991b1b" 
                                  onClick={() => handleReject.open(q)} 
                                  icon={X} 
                                  label="Reject" 
                                  title="Reject quotation"
                                  disabled={isOp(q._id, 'reject')}
                                  size="small"
                                />
                              </>
                            )}
                            {canAward && (
                              <ActionBtn 
                                bg="#e9d5ff" 
                                color="#6b21a8" 
                                onClick={() => handleAwardOpen(q)} 
                                icon={Award} 
                                label="Award" 
                                title="Mark as Awarded / Not Awarded"
                                size="small"
                                disabled={isOp(q._id, 'award')}
                              />
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
        
        {/* Server-side Pagination */}
        {!isMobile && totalFiltered > 0 && (
          <PaginationBar
            total={totalFiltered}
            page={safePage}
            limit={currentLimitValue}
            onPage={goToPage}
            onLimit={(l) => changeLimit(l)}
          />
        )}
        
        {/* Mobile Pagination */}
        {isMobile && totalFiltered > 0 && (
          <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', padding: '0.5rem' }}>
            <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
              {((safePage - 1) * currentLimitValue) + 1}–{Math.min(safePage * currentLimitValue, totalFiltered)} of {totalFiltered}
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <button 
                onClick={() => goToPage(safePage - 1)} 
                disabled={safePage === 1}
                style={{ padding: '0.4rem 0.8rem', borderRadius: 6, border: '1px solid #e2e8f0', background: 'white', cursor: safePage === 1 ? 'not-allowed' : 'pointer', opacity: safePage === 1 ? 0.5 : 1, fontSize: '0.75rem' }}
              >
                Previous
              </button>
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#0f172a' }}>
                {safePage} / {totalPages}
              </span>
              <button 
                onClick={() => goToPage(safePage + 1)} 
                disabled={safePage === totalPages}
                style={{ padding: '0.4rem 0.8rem', borderRadius: 6, border: '1px solid #e2e8f0', background: 'white', cursor: safePage === totalPages ? 'not-allowed' : 'pointer', opacity: safePage === totalPages ? 0.5 : 1, fontSize: '0.75rem' }}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </>
    );
  };

  // ─────────────────────────────────────────────────────────
  // Main Render (keep your existing JSX with styles)
  // ─────────────────────────────────────────────────────────
  return (
    <div style={styles.container}>
      <style>{`
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        ${styles.animations}
      `}</style>

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      {/* Topbar - Responsive */}
      <div style={{ ...styles.topbar, padding: isMobile ? '0.75rem 1rem' : '0 2rem', flexDirection: isMobile ? 'column' : 'row', height: isMobile ? 'auto' : 60, gap: isMobile ? '0.75rem' : 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: isMobile ? '100%' : 'auto' }}>
          <div>
            <div style={{ ...styles.dashboardTitle, fontSize: isMobile ? '1rem' : '1.0625rem' }}>
              ⚙ Ops Dashboard
            </div>
            {!isMobile && <CompanyCurrencyDisplay />}
          </div>
          {isMobile && (
            <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: 8, padding: '0.4rem 0.7rem', color: 'white', cursor: 'pointer' }}>
              <Menu size={20} />
            </button>
          )}
        </div>
        
        {isMobile && <CompanyCurrencyDisplay isMobile={true} />}
        
        <div style={{ 
          display: 'flex', 
          gap: '0.5rem', 
          alignItems: 'center',
          flexWrap: 'wrap',
          ...(isMobile && !mobileMenuOpen ? { display: 'none' } : { display: 'flex' }),
          width: isMobile ? '100%' : 'auto',
          justifyContent: isMobile ? 'center' : 'flex-end'
        }}>
          <CompanyCurrencySelector variant="compact" isMobile={isMobile} />
          <button 
            onClick={() => navigate('/customers')}
            style={{
              backgroundColor: '#e0e7ff',
              color: '#4f46e5',
              border: 'none',
              borderRadius: 8,
              padding: isMobile ? '0.35rem 0.7rem' : '0.45rem 0.875rem',
              fontSize: isMobile ? '0.7rem' : '0.8rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem'
            }}
          >
            <Users size={isMobile ? 12 : 14} /> { "Customers"}
          </button>
          {/* <button 
            onClick={() => navigate('/items')}
            style={{
              backgroundColor: '#e0e7ff',
              color: '#4f46e5',
              border: 'none',
              borderRadius: 8,
              padding: isMobile ? '0.35rem 0.7rem' : '0.45rem 0.875rem',
              fontSize: isMobile ? '0.7rem' : '0.8rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem'
            }}
          >
            <ShoppingCart size={isMobile ? 12 : 14} /> {!isMobile && "Items"}
          </button> */}

          <button 
            onClick={() => navigate('/quotation/new')}
            style={{
              backgroundColor: '#10b981',
              color: 'white',
              border: 'none',
              borderRadius: 8,
              padding: isMobile ? '0.35rem 0.7rem' : '0.45rem 0.875rem',
              fontSize: isMobile ? '0.7rem' : '0.8rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem'
            }}
          >
            <FileText size={isMobile ? 12 : 14} /> {!isMobile && "New Quotation"}
          </button>
          <button onClick={handleLogout} style={{ ...styles.logoutBtn, padding: isMobile ? '0.35rem 0.7rem' : '0.45rem 0.85rem', fontSize: isMobile ? '0.7rem' : '0.8rem' }}>
            <LogOut size={isMobile ? 12 : 15}/> {!isMobile && "Logout"}
          </button>
        </div>
      </div>

      <div style={{ ...styles.mainContent, padding: isMobile ? '0.75rem' : '2rem' }}>
        {/* Error banner */}
        {loadError && (
          <div style={styles.errorBanner}>
            <div style={styles.errorMessage}>
              <AlertCircle size={16}/> {loadError}
            </div>
            <div style={styles.errorActions}>
              <button onClick={() => clearError()} style={styles.errorDismiss}>
                <X size={14}/>
              </button>
              <button onClick={handleRefresh} style={styles.errorRetry}>
                <RefreshCw size={13}/> Retry
              </button>
            </div>
          </div>
        )}

        {/* Stats Cards */}
        {renderStatCards()}

        {/* Table Card */}
        <div style={styles.tableCard}>
          {/* Header */}
          <div style={styles.tableHeader}>
            <div style={styles.tabContainer}>
              {TABS.map(({ key, label, Icon: I, count }) => {
                const active = activeTab === key;
                const alertColor = key === 'pending' ? '#f59e0b' : key === 'ops_approved' ? '#3b82f6' : '#ef4444';
                const hasAlert = count > 0;
                
                return (
                  <button key={key} className="ops-tab" onClick={() => handleTabChange(key)} style={{
                    ...styles.tabButton,
                    backgroundColor: active ? '#fff' : 'transparent',
                    color: active ? '#0f172a' : '#64748b',
                    boxShadow: active ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                    padding: isMobile ? '0.3rem 0.6rem' : '0.4rem 0.875rem',
                    fontSize: isMobile ? '0.7rem' : '0.8rem'
                  }}>
                    <I size={isMobile ? 11 : 13}/>
                    {!isMobile && label}
                    <span style={{
                      backgroundColor: active ? (hasAlert ? alertColor : '#0f172a') : (hasAlert ? alertColor : '#e2e8f0'),
                      color: (active || hasAlert) ? '#fff' : '#64748b',
                      ...styles.tabCount,
                      padding: isMobile ? '1px 5px' : '1px 7px',
                      fontSize: isMobile ? '0.6rem' : '0.68rem'
                    }}>
                      {isLoading ? '…' : count}
                    </span>
                  </button>
                );
              })}
            </div>

            <div style={styles.headerActions}>
              <button onClick={handleRefresh} disabled={isLoading || refreshInProgress.current} style={styles.refreshBtn}>
                <RefreshCw size={isMobile ? 14 : 14} color="#64748b" style={(isLoading || refreshInProgress.current) ? styles.spin : {}}/>
              </button>
              <div style={styles.searchBox}>
                <Search size={isMobile ? 14 : 14} color="#94a3b8"/>
                <input
                  ref={searchRef}
                  style={{ ...styles.searchInput, width: isMobile ? '100%' : 210 }}
                  placeholder="Search… (press /)"
                  value={searchInput}
                  onChange={handleSearchChange}
                />
                {searchInput && (
                  <button onClick={clearSearch} style={styles.clearSearchBtn}>
                    <X size={13}/>
                  </button>
                )}
              </div>
              {!isMobile && <ViewToggle view={viewMode} onViewChange={setViewMode} isMobile={isMobile} />}
            </div>
          </div>

          {/* Content with Shimmer */}
          {renderContent()}
        </div>
      </div>

      {/* Reject Modal */}
      {rejectTarget && (
        <ConfirmModal
          open={true}
          title="Reject Quotation"
          message={`Are you sure you want to reject ${rejectTarget.quotationNumber}? This will return it to the creator.`}
          confirmLabel="Reject"
          danger
          onConfirm={handleReject.confirm}
          onCancel={handleReject.close}
          loading={isOp(rejectTarget._id, 'reject')}
        >
          <textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Enter rejection reason (required)…"
            rows={4}
            style={styles.rejectTextarea}
            autoFocus
          />
          <p style={styles.rejectHint}>Reason is required to reject a quotation.</p>
        </ConfirmModal>
      )}
      
      {/* Award Modal */}
      <AwardModal
        open={awardModal.open}
        quotation={awardModal.quotation}
        onCancel={handleAwardClose}
        onConfirm={handleAwardConfirm}
        loading={awardModal.loading}
      />
    </div>
  );
}
 
 
// ─────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────
const styles = {
  animations: `
    @keyframes slideIn { from { transform:translateX(20px);opacity:0; } to { transform:translateX(0);opacity:1; } }
    @keyframes popIn   { from { transform:scale(0.95);opacity:0; } to { transform:scale(1);opacity:1; } }
    @keyframes spin    { to { transform:rotate(360deg); } }
    @keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
    .ops-row:hover td  { background:#f8fafc !important; }
    .ops-nav-btn:hover     { opacity:0.8 !important; }
    .ops-tab:hover         { background:rgba(255,255,255,0.6) !important; }
    .ops-action-btn:hover:not(:disabled) { opacity:0.8 !important; transform:translateY(-1px); }
  `,

  container: {
    minHeight: '100vh',
    backgroundColor: '#f1f5f9',
    fontFamily: "'Segoe UI', system-ui, sans-serif"
  },

  topbar: {
    backgroundColor: '#0f172a',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    position: 'sticky',
    top: 0,
    zIndex: 50,
    boxShadow: '0 2px 8px rgba(0,0,0,0.25)'
  },

  dashboardTitle: {
    fontWeight: 800,
    color: 'white',
    letterSpacing: '-0.01em'
  },

  topbarActions: {
    display: 'flex',
    gap: '0.625rem',
    alignItems: 'center'
  },

  logoutBtn: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    color: '#94a3b8',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 8,
    fontWeight: 600,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '0.4rem'
  },

  mainContent: {
    maxWidth: 1400,
    margin: '0 auto'
  },

  errorBanner: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fef2f2',
    border: '1px solid #fecaca',
    borderRadius: 10,
    padding: '0.875rem 1rem',
    marginBottom: '1.25rem',
    fontSize: '0.875rem',
    color: '#991b1b',
    flexWrap: 'wrap',
    gap: '0.5rem'
  },

  errorMessage: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem'
  },

  errorActions: {
    display: 'flex',
    gap: '0.5rem',
    alignItems: 'center'
  },

  errorDismiss: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: '#991b1b',
    padding: 0
  },

  errorRetry: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: '#991b1b',
    display: 'flex',
    alignItems: 'center',
    gap: '0.3rem',
    fontWeight: 600,
    fontSize: '0.8rem'
  },

  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4,1fr)',
    gap: '1rem',
    marginBottom: '1.5rem'
  },

  tableCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    boxShadow: '0 1px 4px rgba(0,0,0,0.07)',
    overflow: 'visible',
    position: 'relative'
  },

  tableHeader: {
    padding: '1.125rem 1.5rem',
    borderBottom: '1px solid #f1f5f9',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: '0.75rem'
  },

  tabContainer: {
    display: 'flex',
    gap: '0.2rem',
    padding: '0.35rem',
    backgroundColor: '#f1f5f9',
    borderRadius: 10,
    overflowX: 'auto',
    width: '100%'
  },

  tabButton: {
    borderRadius: 8,
    border: 'none',
    cursor: 'pointer',
    fontWeight: 600,
    display: 'flex',
    alignItems: 'center',
    gap: '0.35rem',
    transition: 'all 0.15s',
    whiteSpace: 'nowrap'
  },

  tabCount: {
    borderRadius: 999,
    fontWeight: 700
  },

  headerActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    flexWrap: 'wrap'
  },

  refreshBtn: {
    width: 34,
    height: 34,
    border: '1px solid #e2e8f0',
    borderRadius: 8,
    background: '#f8fafc',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },

  searchBox: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    backgroundColor: '#f8fafc',
    border: '1px solid #e2e8f0',
    borderRadius: 8,
    padding: '0.4rem 0.75rem',
    flex: 1
  },

  searchInput: {
    border: 'none',
    background: 'transparent',
    outline: 'none',
    fontSize: '0.875rem',
    color: '#0f172a'
  },

  clearSearchBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: '#94a3b8',
    padding: 0
  },

  refreshOverlay: {
    position: 'absolute',
    inset: 0,
    backgroundColor: 'rgba(255,255,255,0.72)',
    zIndex: 10,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backdropFilter: 'blur(1px)'
  },

  refreshCard: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.75rem',
    background: 'white',
    padding: '1.25rem 2rem',
    borderRadius: 12,
    boxShadow: '0 4px 24px rgba(15,23,42,0.12)',
    border: '1px solid #e2e8f0'
  },

  refreshText: {
    fontSize: '0.82rem',
    color: '#6366f1',
    fontWeight: 700
  },

  spin: {
    animation: 'spin 0.8s linear infinite'
  },

  tableWrapper: {
    overflowX: 'auto'
  },

  table: {
    width: '100%',
    borderCollapse: 'collapse'
  },

  itemsHeaderCell: {
    padding: '0.75rem 1rem',
    fontSize: '0.72rem',
    fontWeight: 700,
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    textAlign: 'center',
    borderBottom: '1px solid #f1f5f9',
    backgroundColor: '#fafafa',
    whiteSpace: 'nowrap'
  },

  actionsHeaderCell: {
    padding: '0.75rem 1rem',
    fontSize: '0.72rem',
    fontWeight: 700,
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    textAlign: 'center',
    borderBottom: '1px solid #f1f5f9',
    backgroundColor: '#fafafa',
    whiteSpace: 'nowrap'
  },

  cell: {
    padding: '0.85rem 1rem',
    borderBottom: '1px solid #f8fafc',
    verticalAlign: 'middle'
  },

  dateCell: {
    padding: '0.85rem 1rem',
    fontSize: '0.8rem',
    color: '#64748b',
    borderBottom: '1px solid #f8fafc',
    verticalAlign: 'middle',
    whiteSpace: 'nowrap'
  },

  totalCell: {
    padding: '0.85rem 1rem',
    fontSize: '0.875rem',
    fontWeight: 700,
    color: '#0f172a',
    borderBottom: '1px solid #f8fafc',
    verticalAlign: 'middle',
    textAlign: 'right',
    whiteSpace: 'nowrap'
  },

  actionsCell: {
    padding: '0.75rem 1rem',
    borderBottom: '1px solid #f8fafc',
    verticalAlign: 'middle'
  },

  actionsContainer: {
    display: 'flex',
    gap: '0.3rem',
    justifyContent: 'center',
    flexWrap: 'wrap'
  },

  quoteCell: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.4rem',
    flexWrap: 'wrap'
  },

  quoteNumber: {
    fontWeight: 700,
    color: '#0f172a',
    fontFamily: 'monospace',
    fontSize: '0.8rem'
  },

  customerCell: {
    fontWeight: 600,
    color: '#0f172a',
    fontSize: '0.875rem'
  },

  customerName: {
    fontWeight: 600,
    color: '#0f172a',
    fontSize: '0.875rem'
  },

  contactText: {
    fontSize: '0.75rem',
    color: '#94a3b8',
    marginTop: 2
  },

  emptyState: {
    textAlign: 'center',
    padding: '4rem 2rem',
    color: '#94a3b8'
  },

  emptyStateTitle: {
    fontWeight: 600,
    fontSize: '1rem',
    color: '#475569',
    marginBottom: '0.5rem'
  },

  emptyStateClear: {
    marginTop: '0.5rem',
    background: 'none',
    border: 'none',
    color: '#6366f1',
    cursor: 'pointer',
    fontWeight: 600,
    fontSize: '0.875rem'
  },

  noResults: {
    padding: '3rem',
    textAlign: 'center',
    color: '#94a3b8',
    fontSize: '0.875rem'
  },

  clearSearchLink: {
    marginLeft: '0.5rem',
    background: 'none',
    border: 'none',
    color: '#6366f1',
    cursor: 'pointer',
    fontWeight: 600,
    fontSize: '0.875rem'
  },

  skeletonHeader: {
    padding: '0.75rem 1rem',
    fontSize: '0.72rem',
    fontWeight: 700,
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    borderBottom: '1px solid #f1f5f9',
    whiteSpace: 'nowrap'
  },

  rejectTextarea: {
    width: '100%',
    padding: '0.75rem',
    border: '1.5px solid #e2e8f0',
    borderRadius: 8,
    fontSize: '0.875rem',
    fontFamily: 'inherit',
    marginBottom: '0.5rem',
    resize: 'vertical'
  },

  rejectHint: {
    fontSize: '0.75rem',
    color: '#ef4444',
    margin: 0
  }
};