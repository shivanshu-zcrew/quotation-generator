// screens/AdminDashboard.jsx (OPTIMIZED + RESPONSIVE)
import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Eye, Download, Trash2, Clock, CheckCircle, XCircle,
  FileText, Search, X, Check, LogOut,
  AlertCircle, RefreshCw, ChevronUp, ChevronDown, ChevronLeft, ChevronRight,
  Shield, Award, Ban, Users, TrendingUp, Calendar, Menu
} from 'lucide-react';

import { useAppStore, useCompanyQuotations } from '../services/store';
import { useCustomersList, useAdminStats } from '../hooks/customHooks';
import { CompanyCurrencySelector, CompanyCurrencyDisplay, useCompanyCurrency } from '../components/CompanyCurrencySelector';
import { downloadQuotationPDF } from '../utils/pdfGenerator';
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
  ConfirmModal
} from '../components/SharedComponents';

// Import new components
import CompactStatsCard from '../components/HomePageComponent/CompactStatsCard';
import DesktopStatsGrid from '../components/HomePageComponent/DesktopStatsGrid';
import QuotationCard from '../components/HomePageComponent/QuotationCard';
import ViewToggle from '../components/HomePageComponent/ViewToggle';

// Import utils
import {
  PAGE_SIZE_OPTIONS,
  DEBOUNCE_MS,
  STATUS_CONFIG,
  DELETABLE,
  CURRENCY_SYMBOLS,
  VALIDATION_MESSAGES
} from '../utils/constants';
import { fmtCurrency, fmtDate, isExpired, isExpiringSoon } from '../utils/formatters';
import UserQuotationStats from '../components/UserQuotationStats';
import { SimpleLoadingOverlay } from '../components/LoadingOverlay';

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

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────
const TAB_KEYS = {
  all:          { label: 'All',              Icon: FileText,    statusFilter: null               },
  ops_approved: { label: 'Action Required',  Icon: Clock,       statusFilter: 'ops_approved'     },
  approved:     { label: 'Approved',         Icon: CheckCircle, statusFilter: 'approved'          },
  awarded:      { label: 'Awarded',          Icon: Award,       statusFilter: 'awarded'           },
  rejected:     { label: 'Rejected',         Icon: XCircle,     statusFilter: 'rejected'          },
};

// ─────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────
const QueryDateBadge = React.memo(({ date, passed }) => (
  <span style={{ 
    background: passed ? '#fee2e2' : '#fef3c7',
    color: passed ? '#991b1b' : '#92400e',
    padding: '0.25rem 0.75rem',
    borderRadius: '999px',
    fontSize: '0.75rem',
    fontWeight: 600,
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.25rem'
  }}>
    <Calendar size={12} />
    {fmtDate(date)}
    {passed && ' ⚠️'}
  </span>
));

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

// Mobile Quotation Card for Admin
const AdminQuotationCard = React.memo(({ quotation,onAward,isAwardin, selectedCurrency, onView, onApprove, onReject, onDownload, onDelete, isExporting, isApproving, isRejecting }) => {
  const expired = isExpired(quotation.expiryDate);
  const expiring = !expired && isExpiringSoon(quotation.expiryDate);
  const canAct = quotation.status === 'ops_approved';
  const canAward = quotation.status === 'approved';
  const canDelete = DELETABLE.has(quotation.status);
  const queryDatePassed = quotation.queryDate && new Date(quotation.queryDate) < new Date();

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

      {quotation.tl && (
        <div style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: '0.5rem' }}>
          📋 {quotation.tl}
        </div>
      )}

      <div style={{ display: 'flex', gap: '1rem', marginBottom: '0.75rem', fontSize: '0.7rem', color: '#64748b', flexWrap: 'wrap' }}>
        {quotation.queryDate && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            <Calendar size={12} />
            <span style={{ color: queryDatePassed ? '#991b1b' : '#92400e', fontWeight: 500 }}>
              Follow-up: {fmtDate(quotation.queryDate)} {queryDatePassed && '⚠️'}
            </span>
          </div>
        )}
        <div>📅 Submitted: {fmtDate(quotation.date)}</div>
        <div>⏰ Expiry: {fmtDate(quotation.expiryDate)}</div>
      </div>

      <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginBottom: '0.75rem' }}>
        Created by: {quotation.createdBy?.name || '—'}
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', borderTop: '1px solid #f1f5f9', paddingTop: '0.75rem' }}>
        {canAct && (
          <>
            <ActionBtn bg="#dcfce7" color="#166534" onClick={() => onApprove(quotation._id)} 
              icon={Check} label="Approve" size="small" disabled={isApproving}/>
            <ActionBtn bg="#fce7f3" color="#9d174d" onClick={() => onReject(quotation._id)} 
              icon={X} label="Reject" size="small" disabled={isRejecting}/>
          </>
        )}
        
        <ActionBtn bg="#e0f2fe" color="#0369a1" onClick={() => onView(quotation._id)} 
          icon={Eye} label="View" size="small"/>
        
        <ActionBtn bg={isExporting ? '#f1f5f9' : '#f0fdf4'} color={isExporting ? '#94a3b8' : '#166534'}
          onClick={() => !isExporting && onDownload(quotation)} disabled={isExporting}
          icon={isExporting ? RefreshCw : Download} label={isExporting ? '…' : 'PDF'} size="small"/>
        
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
        
        {canDelete && (
          <ActionBtn bg="#fff1f2" color="#e11d48" onClick={() => onDelete(quotation._id)} 
            icon={Trash2} label="Del" size="small"/>
        )}
      </div>
    </div>
  );
});
AdminQuotationCard.displayName = 'AdminQuotationCard';
 

const useTableData = (quotations, activeTab, search, sort) => {
  return useMemo(() => {
    const { statusFilter } = TAB_KEYS[activeTab];
    const tabFiltered = !statusFilter ? quotations :
      Array.isArray(statusFilter) 
        ? quotations.filter(q => statusFilter.includes(q.status))
        : quotations.filter(q => q.status === statusFilter);

    const searchFiltered = !search.trim() ? tabFiltered :
      tabFiltered.filter(q => {
        const t = search.toLowerCase();
        return (q.quotationNumber || '').toLowerCase().includes(t) ||
               (q.customerSnapshot?.name || q.customer || q.customerId?.name || '').toLowerCase().includes(t);
      });

    const sorted = [...searchFiltered].sort((a, b) => {
      const { field, dir } = sort;
      let av = a[field], bv = b[field];
      
      if (field === 'total') {
        av = Number(av) || 0;
        bv = Number(bv) || 0;
      } else if (field === 'customer') {
        av = (a.customerSnapshot?.name || a.customer || a.customerId?.name || '').toLowerCase();
        bv = (b.customerSnapshot?.name || b.customer || b.customerId?.name || '').toLowerCase();
      } else {
        av = av ?? '';
        bv = bv ?? '';
      }
      return dir === 'asc' ? (av < bv ? -1 : av > bv ? 1 : 0) : (av > bv ? -1 : av < bv ? 1 : 0);
    });

    return {
      filtered: sorted,
      total: sorted.length
    };
  }, [quotations, activeTab, search, sort]);
};

// ─────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────
export default function AdminDashboard({ onNavigate, onViewQuotation }) {
  const navigate = useNavigate();
  
  // Responsive hooks
  const isMobile = useMediaQuery('(max-width: 768px)');
  const isTablet = useMediaQuery('(min-width: 769px) and (max-width: 1024px)');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [viewMode, setViewMode] = useState('table');
  const [refreshProgress, setRefreshProgress] = useState(0);
const [refreshMessage, setRefreshMessage] = useState('');
const [pdfProgress, setPdfProgress] = useState(0);
const [pdfMessage, setPdfMessage] = useState('');
  
  // ── Store subscriptions ───────────────────────────────────
  const { quotations: companyQuotations, refresh: refreshCompanyQuotations } = useCompanyQuotations();
  const customers = useCustomersList();
  const approveQuotation = useAppStore((s) => s.approveQuotation);
  const rejectQuotation = useAppStore((s) => s.rejectQuotation);
  const deleteQuotation = useAppStore((s) => s.deleteQuotation);
  const handleLogout = useAppStore((s) => s.handleLogout);
  const loading = useAppStore((s) => s.loading);
  const storeQuotations = useAppStore((s) => s.quotations);
  const loadError = useAppStore((s) => s.loadError);
  const clearError = useAppStore((s) => s.clearError);
  const fetchAllData = useAppStore((s) => s.fetchAllData);
  const selectedCompany = useAppStore((s) => s.selectedCompany);

  const awardQuotation = useAppStore((s) => s.awardQuotation);
  
  // ── Stats hook ────────────────────────────────────────────
  const { 
    stats,
    loading: statsLoading,
    refresh: refreshStats,
    totalQuotations,
    actionRequired,
    approved,
    awarded,
    notAwarded, 
    awardedValue,
    conversionRate,
    rejected,
    conversionDetails, 
    totalAwardedValue
  } = useAdminStats();
 
  // ── Company & Currency ────────────────────────────────────
  const {
    company: currentCompany,
    selectedCurrency,
    refreshCompanyData
  } = useCompanyCurrency();

  // ── Custom hooks ──────────────────────────────────────────
  const { toasts, addToast, dismissToast } = useToast();
  const searchRef = useRef(null);
  const searchTimer = useRef(null);

  // ── Table state ───────────────────────────────────────────
  const [activeTab, setActiveTab] = useState('all');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(isMobile ? 10 : 20);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState({ field: 'createdAt', dir: 'desc' });

  // ── Action state ──────────────────────────────────────────
  const [exportingId, setExportingId] = useState(null);
  const [rejectModal, setRejectModal] = useState({ open: false, id: null, reason: '' });
  const [deleteModal, setDeleteModal] = useState({ open: false, id: null });
  const [actionLoadingIds, setActionLoadingIds] = useState({});
  const [showUserStats, setShowUserStats] = useState(false);
  const [awardModal, setAwardModal] = useState({
    open: false,
    quotation: null,
    busy: false,
    awardNote: '',
    awarded: null
  });

  // Update limit on screen resize
  useEffect(() => {
    setLimit(isMobile ? 10 : 20);
  }, [isMobile]);

  // Reset view mode on mobile
  useEffect(() => {
    if (isMobile) {
      setViewMode('card');
    }
  }, [isMobile]);

  // ── Derived state ─────────────────────────────────────────
  const hasFetched = !loading || storeQuotations.length > 0;
  const isInitialLoading = loading && !hasFetched;
  const isRefreshing = loading && hasFetched;
  const safeQ = useMemo(() => Array.isArray(companyQuotations) ? companyQuotations : [], [companyQuotations]);

  // ── Effects ───────────────────────────────────────────────
  useEffect(() => {
    refreshStats();
  }, [selectedCompany, refreshStats]);

  // ── Table data management ─────────────────────────────────
  const { filtered: filteredQuotations, total: totalFiltered } = useTableData(safeQ, activeTab, search, sort);
  
  const paginated = useMemo(() => {
    const start = (page - 1) * limit;
    return filteredQuotations.slice(start, start + limit);
  }, [filteredQuotations, page, limit]);

  const totalPages = Math.max(1, Math.ceil(totalFiltered / limit));
  const safePage = Math.min(page, totalPages);

  // ── Tab counts ────────────────────────────────────────────
  const tabCounts = useMemo(() => {
    const counts = {
      all: safeQ.length,
      ops_approved: 0,
      approved: 0,
      awarded: 0,
      rejected: 0,
    };
    
    safeQ.forEach(q => {
      if (q.status === 'ops_approved') counts.ops_approved++;
      else if (q.status === 'approved') counts.approved++;
      else if (q.status === 'awarded') counts.awarded++;
      else if (q.status === 'rejected') counts.rejected++;
    });
    
    return counts;
  }, [safeQ]);

  // ── Loading helpers ───────────────────────────────────────
  const setActionLoading = useCallback((id, action, val) => {
    setActionLoadingIds(prev => ({ ...prev, [`${id}_${action}`]: val }));
  }, []);

  const isActionLoading = useCallback((id, action) => !!actionLoadingIds[`${id}_${action}`], [actionLoadingIds]);

  // ── Handlers ──────────────────────────────────────────────
  const handleSearchChange = useCallback((e) => {
    const val = e.target.value;
    setSearchInput(val);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => { setSearch(val); setPage(1); }, DEBOUNCE_MS);
  }, []);

  const clearSearch = useCallback(() => { 
    setSearchInput(''); 
    setSearch(''); 
    setPage(1); 
  }, []);

  const handleTabChange = useCallback((key) => {
    setActiveTab(key); 
    setPage(1); 
    setSearchInput(''); 
    setSearch('');
    setSort({ field: 'createdAt', dir: 'desc' });
    setMobileMenuOpen(false);
  }, []);

  const handleSort = useCallback((field) => {
    setSort(prev => ({ 
      field, 
      dir: prev.field === field && prev.dir === 'asc' ? 'desc' : 'asc' 
    }));
    setPage(1);
  }, []);

  const handleRefresh = useCallback(async () => {
    setRefreshProgress(10);
    setRefreshMessage('Refreshing data...');
    
    const progressInterval = setInterval(() => {
      setRefreshProgress(prev => {
        if (prev >= 90) {
          clearInterval(progressInterval);
          return 90;
        }
        return prev + 10;
      });
    }, 500);
    
    try {
      await fetchAllData();
      refreshCompanyData?.();
      refreshCompanyQuotations();
      setRefreshProgress(100);
      setRefreshMessage('Complete!');
      addToast('Data refreshed', 'success');
      
      setTimeout(() => {
        setRefreshProgress(0);
        setRefreshMessage('');
      }, 800);
    } catch (err) {
      setRefreshProgress(0);
      setRefreshMessage('');
      addToast(err.message || 'Refresh failed', 'error');
    } finally {
      clearInterval(progressInterval);
    }
  }, [fetchAllData, refreshCompanyData, refreshCompanyQuotations, addToast]);

  const handleDownload = useCallback(async (q) => {
    setExportingId(q._id);
    setPdfProgress(10);
    setPdfMessage('Preparing PDF...');
    
    const progressInterval = setInterval(() => {
      setPdfProgress(prev => {
        if (prev >= 90) {
          clearInterval(progressInterval);
          return 90;
        }
        return prev + 10;
      });
    }, 800);
    
    try {
      setPdfProgress(40);
      setPdfMessage('Processing images...');
      
      await downloadQuotationPDF(q);
      
      setPdfProgress(100);
      setPdfMessage('Complete!');
      addToast('PDF downloaded successfully!', 'success');
      
      setTimeout(() => {
        setPdfProgress(0);
        setPdfMessage('');
      }, 800);
    } catch (err) {
      setPdfProgress(0);
      setPdfMessage('');
      addToast(`PDF failed: ${err.message}`, 'error');
    } finally {
      clearInterval(progressInterval);
      setExportingId(null);
    }
  }, [addToast]);

  const handleApprove = useCallback(async (id) => {
    setActionLoading(id, 'approve', true);
    const result = await approveQuotation(id);
    if (result?.success) {
      addToast('Quotation approved successfully', 'success');
      refreshCompanyQuotations();
    } else {
      addToast(result?.error || 'Failed to approve quotation', 'error');
    }
    setActionLoading(id, 'approve', false);
  }, [approveQuotation, addToast, refreshCompanyQuotations, setActionLoading]);

  const handleReject = {
    open: useCallback((id) => setRejectModal({ open: true, id, reason: '' }), []),
    close: useCallback(() => setRejectModal({ open: false, id: null, reason: '' }), []),
    confirm: useCallback(async () => {
      if (!rejectModal.reason.trim()) { 
        addToast('Please provide a rejection reason', 'error'); 
        return; 
      }
      
      setActionLoading(rejectModal.id, 'reject', true);
      const result = await rejectQuotation(rejectModal.id, rejectModal.reason);
      if (result?.success) {
        addToast('Quotation rejected', 'success');
        handleReject.close();
        refreshCompanyQuotations();
      } else {
        addToast(result?.error || 'Failed to reject quotation', 'error');
      }
      setActionLoading(rejectModal.id, 'reject', false);
    }, [rejectModal, rejectQuotation, addToast, refreshCompanyQuotations, setActionLoading])
  };

  const handleDelete = {
    open: useCallback((id) => setDeleteModal({ open: true, id }), []),
    close: useCallback(() => setDeleteModal({ open: false, id: null }), []),
    confirm: useCallback(async () => {
      setActionLoading(deleteModal.id, 'delete', true);
      const result = await deleteQuotation(deleteModal.id);
      if (result?.success) {
        addToast('Quotation deleted', 'success');
        handleDelete.close();
        refreshCompanyQuotations();
      } else {
        addToast(result?.error || 'Failed to delete quotation', 'error');
      }
      setActionLoading(deleteModal.id, 'delete', false);
    }, [deleteModal, deleteQuotation, addToast, refreshCompanyQuotations, setActionLoading])
  };

  const handleView = useCallback((id) => {
    if (onViewQuotation) {
      onViewQuotation(id);
    } else {
      navigate(`/quotation/${id}`);
    }
  }, [onViewQuotation, navigate]);

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
  const TABS = useMemo(() =>
    Object.entries(TAB_KEYS).map(([key, { label, Icon }]) => ({ 
      key, label, Icon, count: tabCounts[key] ?? 0 
    })),
  [tabCounts]);

  const NavBtn = React.memo(({ onClick, label, primary }) => (
    <button onClick={onClick} className="adm-nav-btn" style={{
      backgroundColor: primary ? 'white' : 'rgba(255,255,255,0.08)',
      color: primary ? '#0f172a' : '#94a3b8',
      border: primary ? 'none' : '1px solid rgba(255,255,255,0.12)',
      borderRadius: 8,
      padding: isMobile ? '0.35rem 0.7rem' : '0.45rem 0.875rem',
      fontSize: isMobile ? '0.7rem' : '0.8rem',
      fontWeight: 600,
      cursor: 'pointer',
      transition: 'all 0.15s',
      whiteSpace: 'nowrap'
    }}>
      {label}
    </button>
  ));

  // ── Render helpers ────────────────────────────────────────
  const renderStatCards = () => {
    if (isMobile) {
      const statusCounts = {
        pending: actionRequired,
        in_review: 0,
        approved: approved,
        awarded: awarded,
        returned: rejected
      };
      return (
        <CompactStatsCard 
          totalRevenue={totalAwardedValue}
          quotationsCount={totalQuotations}
          customersCount={customers.length}
          selectedCurrency={selectedCurrency}
          statusCounts={statusCounts}
          loading={statsLoading}
        />
      );
    }
    
    return (
      <>
        <div style={styles.statsRow1}>
          <StatCard label="Total Quotations" value={totalQuotations} accent="#6366f1" 
            iconBg="#eff1ff" iconColor="#6366f1" Icon={FileText} loading={statsLoading} sub="All time" />
          <StatCard label="Action Required" value={actionRequired} accent="#3b82f6" 
            iconBg="#dbeafe" iconColor="#3b82f6" Icon={Shield} loading={statsLoading} sub="Awaiting your approval" />
          <StatCard label="Approved" value={approved} accent="#10b981" 
            iconBg="#d1fae5" iconColor="#10b981" Icon={TrendingUp} loading={statsLoading} sub="quotations approved" />
          <StatCard label="Awarded Value" value={fmtCurrency(totalAwardedValue, selectedCurrency)} accent="#059669" 
            iconBg="#d1fae5" iconColor="#059669" Icon={Award} loading={statsLoading} sub={`${awarded} deals won`} />
        </div>

        <div style={styles.statsRow2}>
          <StatCard label="Conversion Rate" value={`${conversionDetails}%`} accent="#f59e0b" 
            iconBg="#fef3c7" iconColor="#f59e0b" Icon={TrendingUp} loading={statsLoading} 
            // sub={`${awarded} of ${awarded + notAwarded} awarded`} 
            />
          <StatCard label="Rejected by Admin" value={rejected} accent="#ec4899" 
            iconBg="#fce7f3" iconColor="#ec4899" Icon={Ban} loading={statsLoading} sub="Rejected quotations" />
          <StatCard label="Total Customers" value={customers.length} accent="#8b5cf6" 
            iconBg="#ede9fe" iconColor="#8b5cf6" Icon={Users} loading={false} sub="Active customers" />
        </div>
      </>
    );
  };

  const renderTableHeader = () => (
    <div style={styles.tableHeader}>
      <div style={{ ...styles.tabContainer, overflowX: isMobile ? 'auto' : 'visible', width: isMobile ? '100%' : 'auto' }}>
        {TABS.map(({ key, label, Icon: I, count }) => {
          const active = activeTab === key;
          const isActionTab = key === 'ops_approved';
          const hasAlert = count > 0;
          const alertColor = isActionTab ? '#3b82f6' : '#0f172a';
          
          return (
            <button key={key} className="adm-tab" onClick={() => handleTabChange(key)} style={{
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
                backgroundColor: active ? alertColor : (hasAlert ? alertColor : '#e2e8f0'),
                color: (active || hasAlert) ? '#fff' : '#64748b',
                ...styles.tabCount,
                padding: isMobile ? '1px 5px' : '1px 7px',
                fontSize: isMobile ? '0.6rem' : '0.68rem'
              }}>
                {isInitialLoading ? '…' : count}
              </span>
            </button>
          );
        })}
      </div>

      <div style={styles.headerActions}>
        <button onClick={handleRefresh} disabled={loading} style={styles.refreshBtn}>
          <RefreshCw size={isMobile ? 14 : 14} color="#64748b" style={loading ? styles.spin : {}}/>
        </button>
        <div style={{ ...styles.searchBox, flex: isMobile ? 1 : 'auto' }}>
          <Search size={isMobile ? 14 : 14} color="#94a3b8"/>
          <input
            ref={searchRef}
            style={{ ...styles.searchInput, width: isMobile ? '100%' : 210 }}
            placeholder="Search… (press /)"
            value={searchInput}
            onChange={handleSearchChange}
            disabled={isInitialLoading}
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
  );

  const renderTableRow = (q) => {
    const isExp = exportingId === q._id;
    const canAct = q.status === 'ops_approved' || q.status == 'pending_admin';
    const canAward = q.status === 'approved' && ( q.createdBy?.role === 'admin' || q.createdBySnapshot?.role === 'admin');
    const canDelete = DELETABLE.has(q.status);
    const expired = isExpired(q.expiryDate);
    const expiring = !expired && isExpiringSoon(q.expiryDate);
    const queryDatePassed = q.queryDate && new Date(q.queryDate) < new Date();
    // const createdByAdmin = q.createdBy?.role === 'admin' || q.createdBySnapshot?.role === 'admin';
    return (
      <tr key={q._id} className="adm-row">
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
        <td style={styles.cell}>
          <div style={styles.projectCell}>
            <div style={styles.projectName}>{q.projectName || '—'}</div>
            {/* {q.trn && <div style={styles.trnText}>TRN: {q.trn}</div>} */}
          </div>
        </td>
        <td style={{ ...styles.cell, textAlign: 'center' }}>
          {q.queryDate ? <QueryDateBadge date={q.queryDate} passed={queryDatePassed} /> : '—'}
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
        <td style={styles.cell}>
           {q.createdBy.name}
        </td>
        <td style={styles.totalCell}>
          {fmtCurrency(q.total, selectedCurrency)}
        </td>
        <td style={styles.actionsCell}>
          <div style={styles.actionsContainer}>
            {canAct && (
              <>
                <ActionBtn bg="#dcfce7" color="#166534" onClick={() => handleApprove(q._id)} 
                  icon={Check} label="Approve" title="Approve (final)" size="small"
                  disabled={isActionLoading(q._id, 'approve')}/>
                <ActionBtn bg="#fce7f3" color="#9d174d" onClick={() => handleReject.open(q._id)} 
                  icon={X} label="Reject" title="Reject" size="small"
                  disabled={isActionLoading(q._id, 'reject')}/>
              </>
            )}
            
            <ActionBtn bg="#e0f2fe" color="#0369a1" onClick={() => handleView(q._id)} 
              icon={Eye} label="View" title="View quotation" size="small"/>
            
            <ActionBtn bg={isExp ? '#f1f5f9' : '#f0fdf4'} color={isExp ? '#94a3b8' : '#166534'}
              onClick={() => !isExp && handleDownload(q)} disabled={isExp}
              icon={isExp ? RefreshCw : Download} label={isExp ? '…' : 'PDF'} title="Download PDF" size="small"/>
            {canAward && (
            <ActionBtn 
              bg="#e9d5ff" 
              color="#6b21a8" 
              onClick={() => handleAward.open(q)} 
              icon={Award} 
              label="Award" 
              title="Mark as Awarded / Not Awarded"
              size="small"
              disabled={isActionLoading(q._id, 'award')}
            />
          )}
            {canDelete && (
              <ActionBtn bg="#fff1f2" color="#e11d48" onClick={() => handleDelete.open(q._id)} 
                icon={Trash2} label="Del" title="Delete quotation" size="small"
                disabled={isActionLoading(q._id, 'delete')}/>
            )}
          </div>
        </td>
      </tr>
    );
  };

  const handleAward = {
    open: useCallback((quotation) => {
      console.log('🎯 Award button clicked!', quotation);
      console.log('Quotation number:', quotation.quotationNumber);
      console.log('Quotation ID:', quotation._id);
      setAwardModal({
        open: true,
        quotation,
        busy: false,
        awardNote: '',
        awarded: null
      });
    }, []),
    
    close: useCallback(() => {
      setAwardModal({
        open: false,
        quotation: null,
        busy: false,
        awardNote: '',
        awarded: null
      });
    }, []),
    
    confirm: useCallback(async (awarded, awardNote) => {
      if (!awardModal.quotation) return;
      
      setAwardModal(prev => ({ ...prev, busy: true }));
      
      try {
        const result = await awardQuotation(awardModal.quotation._id, awarded, awardNote);
        
        if (result?.success) {
          addToast(
            awarded 
              ? `🏆 "${awardModal.quotation.quotationNumber}" marked as Awarded!` 
              : `"${awardModal.quotation.quotationNumber}" marked as Not Awarded.`,
            "success"
          );
          
          // Refresh the quotations list
          refreshCompanyQuotations();
          refreshStats();
          handleAward.close();
        } else {
          addToast(result?.error || "Failed to update award status", "error");
          setAwardModal(prev => ({ ...prev, busy: false }));
        }
      } catch (error) {
        addToast(error.message || "Failed to update award status", "error");
        setAwardModal(prev => ({ ...prev, busy: false }));
      } finally {
        setAwardModal(prev => ({ ...prev, busy: false }));
      }
    }, [awardModal.quotation, awardQuotation, addToast, refreshCompanyQuotations, refreshStats])
  };

  const handleGoToCustomers = useCallback(() => {
    if (onNavigate) {
      onNavigate('customers');
    } else {
      console.error('onNavigate prop is missing!');
    }
  }, [onNavigate]);
  const handleGoToItems = useCallback(() => {
    if (onNavigate) {
      onNavigate('items');
    } else {
      console.error('onNavigate prop is missing!');
    }
  }, [onNavigate]);

  const handleCreateQuotation = useCallback(() => {
    if (onNavigate) {
      onNavigate('addQuotation');
    } else {
      console.error('onNavigate prop is missing!');
    }
  }, [onNavigate]);

  const handleUserStats = useCallback(() => {
    if (onNavigate) {
      onNavigate('userStats');
    } else {
      console.error('onNavigate prop is missing!');
    }
  }, [onNavigate]);

  const handleUsers = useCallback(() => {
    if (onNavigate) {
      onNavigate('users');
    } else {
      console.error('onNavigate prop is missing!');
    }
  }, [onNavigate]);

  // ─────────────────────────────────────────────────────────
  // Main Render
  // ─────────────────────────────────────────────────────────
  return (
    <div style={styles.container}>
      <style>{styles.animations}</style>

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      {/* Topbar - Responsive */}
      <div style={{ ...styles.topbar, padding: isMobile ? '0.75rem 1rem' : '0 2rem', flexDirection: isMobile ? 'column' : 'row', height: isMobile ? 'auto' : 60, gap: isMobile ? '0.75rem' : 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: isMobile ? '100%' : 'auto' }}>
          <div>
            <div style={{ ...styles.dashboardTitle, fontSize: isMobile ? '1rem' : '1.0625rem' }}>
              ⚙ Admin Dashboard
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
    onClick={handleGoToCustomers}
    className="adm-nav-btn" 
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
    <Users size={isMobile ? 12 : 14} /> {!isMobile && "Customers"}
  </button>
  <button 
    onClick={handleGoToItems}
    className="adm-nav-btn" 
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
    <Users size={isMobile ? 12 : 14} /> {!isMobile && "Items"}
  </button>

  <button 
    onClick={handleCreateQuotation}
    className="adm-nav-btn" 
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
          <button 
 onClick={handleUserStats}
  style={{
    backgroundColor: '#e0e7ff',
    color: '#4f46e5',
    border: 'none',
    borderRadius: '8px',
    padding: isMobile ? '0.35rem 0.7rem' : '0.45rem 0.875rem',
    fontSize: isMobile ? '0.7rem' : '0.8rem',
    fontWeight: 600,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '0.4rem'
  }}
>
  <Users size={isMobile ? 12 : 14} /> User Stats
</button>
          <NavBtn onClick={handleUsers}  label="Users" />
          <button onClick={handleLogout} className="adm-nav-btn" style={{ ...styles.logoutBtn, padding: isMobile ? '0.35rem 0.7rem' : '0.45rem 0.85rem', fontSize: isMobile ? '0.7rem' : '0.8rem' }}>
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
          {renderTableHeader()}

          {/* Refresh overlay */}
          {isRefreshing && paginated.length > 0 && (
            <div style={styles.refreshOverlay}>
              <div style={styles.refreshCard}>
                <RefreshCw size={isMobile ? 20 : 24} color="#6366f1" style={styles.spin}/>
                <span style={styles.refreshText}>Refreshing…</span>
              </div>
            </div>
          )}

          {/* Content */}
          {isInitialLoading ? (
            <LoadingSkeleton isMobile={isMobile} />
          ) : (
            <>
              {safeQ.length === 0 ? (
                <EmptyState search={search} clearSearch={clearSearch} isMobile={isMobile} />
              ) : (
                <>
                  {(isMobile || viewMode === 'card') ? (
                    // Card View - 2 columns on desktop, 1 on mobile
                    <div style={{ 
                      padding: isMobile ? '1rem' : '1.5rem',
                      display: 'grid',
                      gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, 1fr)',
                      gap: isMobile ? '0.75rem' : '1rem'
                    }}>
                      {paginated.length === 0 ? (
                        <div style={{ gridColumn: '1 / -1', padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>
                          No results for "<strong>{search}</strong>"
                          <button onClick={clearSearch} style={{ marginLeft: '0.5rem', background: 'none', border: 'none', color: '#6366f1', cursor: 'pointer', fontWeight: 600 }}>Clear</button>
                        </div>
                      ) : (
                        paginated.map((q) => (
                          <AdminQuotationCard
                            key={q._id}
                            quotation={q}
                            selectedCurrency={selectedCurrency}
                            onView={handleView}
                            onApprove={handleApprove}
                            onReject={handleReject.open}
                            onDownload={handleDownload}
                            onDelete={handleDelete.open}
                            isExporting={exportingId === q._id}
                            isApproving={isActionLoading(q._id, 'approve')}
                            isRejecting={isActionLoading(q._id, 'reject')}
                            isAwarding={isActionLoading(q._id, 'award')} 
                          />
                        ))
                      )}
                    </div>
                  ) : (
                    // Desktop Table View
                    <div style={styles.tableWrapper}>
                      <table style={styles.table}>
                        <thead>
                          <tr>
                            <SortHeader label="Quote #" field="quotationNumber" sort={sort} onSort={handleSort}/>
                            <SortHeader label="Customer" field="customer" sort={sort} onSort={handleSort}/>
                            <th style={styles.tableHeaderCell}>Project Name</th>
                            <SortHeader label="Query Date" field="queryDate" sort={sort} onSort={handleSort} align="center"/>
                            <SortHeader label="Submitted" field="date" sort={sort} onSort={handleSort}/>
                            <SortHeader label="Expiry" field="expiryDate" sort={sort} onSort={handleSort}/>
                            <SortHeader label="Status" field="status" sort={sort} onSort={handleSort}/>
                            <SortHeader label="Created by" field="createdby" sort={sort} onSort={handleSort}/>
                            <SortHeader label={`Total (${selectedCurrency})`} field="total" sort={sort} onSort={handleSort} align="right"/>
                            <th style={styles.actionsHeaderCell}>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {paginated.length === 0 ? (
                            <tr>
                              <td colSpan={10} style={styles.noResults}>
                                No results for "<strong>{search}</strong>"
                                <button onClick={clearSearch} style={styles.clearSearchLink}>Clear</button>
                              </td>
                            </tr>
                          ) : paginated.map(renderTableRow)}
                        </tbody>
                      </table>
                    </div>
                  )}
                  
                  {/* Pagination */}
                  {!isMobile && (
                    <PaginationBar
                      total={totalFiltered}
                      page={safePage}
                      limit={limit}
                      onPage={setPage}
                      onLimit={(l) => { setLimit(l); setPage(1); }}
                    />
                  )}
                  
                  {/* Mobile Pagination */}
                  {isMobile && totalFiltered > 0 && (
                    <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', padding: '0.5rem' }}>
                      <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                        {((safePage - 1) * limit) + 1}–{Math.min(safePage * limit, totalFiltered)} of {totalFiltered}
                      </div>
                      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        <button 
                          onClick={() => setPage(p => Math.max(1, p - 1))} 
                          disabled={safePage === 1}
                          style={{ padding: '0.4rem 0.8rem', borderRadius: 6, border: '1px solid #e2e8f0', background: 'white', cursor: safePage === 1 ? 'not-allowed' : 'pointer', opacity: safePage === 1 ? 0.5 : 1, fontSize: '0.75rem' }}
                        >
                          Previous
                        </button>
                        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#0f172a' }}>
                          {safePage} / {totalPages}
                        </span>
                        <button 
                          onClick={() => setPage(p => Math.min(totalPages, p + 1))} 
                          disabled={safePage === totalPages}
                          style={{ padding: '0.4rem 0.8rem', borderRadius: 6, border: '1px solid #e2e8f0', background: 'white', cursor: safePage === totalPages ? 'not-allowed' : 'pointer', opacity: safePage === totalPages ? 0.5 : 1, fontSize: '0.75rem' }}
                        >
                          Next
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </div>

      {/* Modals */}
      <RejectModal 
        open={rejectModal.open}
        reason={rejectModal.reason}
        onReasonChange={(val) => setRejectModal(prev => ({ ...prev, reason: val }))}
        onConfirm={handleReject.confirm}
        onCancel={handleReject.close}
      />

      <ConfirmModal
        open={deleteModal.open}
        title="Delete Quotation"
        message="This action cannot be undone. The quotation and all associated images will be permanently removed."
        confirmLabel="Delete" danger
        onConfirm={handleDelete.confirm}
        onCancel={handleDelete.close}
        loading={isActionLoading(deleteModal.id, 'delete')}
      />

{refreshProgress > 0 && (
  <SimpleLoadingOverlay 
    type="processing"
    message={refreshMessage}
  />
)}

{pdfProgress > 0 && (
  <SimpleLoadingOverlay 
    type="pdf"
    message={pdfMessage}
  />
)}
 
 {awardModal.open && awardModal.quotation && (
  <div style={styles.modalOverlay}>
    <div style={styles.modal}>
      <div style={styles.modalHeader}>
        <h3 style={styles.modalTitle}>
          {awardModal.awarded === null ? 'Award Decision' : 
           awardModal.awarded ? 'Confirm Award' : 'Confirm Not Awarded'}
        </h3>
        <button onClick={handleAward.close} style={styles.modalCloseBtn}>✕</button>
      </div>
      
      <div style={styles.modalBody}>
        <p style={styles.modalSubtitle}>
          Quotation: <strong>{awardModal.quotation.quotationNumber}</strong>
        </p>
        
        {awardModal.awarded === null ? (
          // Step 1: Choose decision
          <div style={styles.awardDecisionContainer}>
            <button
              onClick={() => setAwardModal(prev => ({ ...prev, awarded: true }))}
              style={styles.awardYesBtn}
            >
              <Award size={20} /> 🏆 Won / Awarded
            </button>
            <button
              onClick={() => setAwardModal(prev => ({ ...prev, awarded: false }))}
              style={styles.awardNoBtn}
            >
              <X size={20} /> ✗ Not Awarded
            </button>
          </div>
        ) : (
          // Step 2: Add note and confirm
          <>
            <div style={styles.fieldWrapper}>
              <label style={styles.label}>Award Note</label>
              <textarea
                value={awardModal.awardNote}
                onChange={(e) => setAwardModal(prev => ({ ...prev, awardNote: e.target.value }))}
                placeholder={awardModal.awarded 
                  ? "Add award details (e.g., PO number, award date, amount)..." 
                  : "Add reason for not being awarded..."}
                rows={4}
                style={styles.awardTextarea}
                autoFocus
              />
            </div>
            
            <div style={styles.modalButtons}>
              <button 
                onClick={() => setAwardModal(prev => ({ ...prev, awarded: null, awardNote: '' }))}
                style={styles.cancelBtn}
                disabled={awardModal.busy}
              >
                Back
              </button>
              <button
                onClick={() => handleAward.confirm(awardModal.awarded, awardModal.awardNote)}
                style={awardModal.awarded ? styles.submitBtn : styles.dangerBtn}
                disabled={awardModal.busy}
              >
                {awardModal.busy ? 'Processing...' : (awardModal.awarded ? 'Confirm Award' : 'Confirm Not Awarded')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  </div>
)}

    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Sub-components (extracted for clarity)
// ─────────────────────────────────────────────────────────────

const LoadingSkeleton = React.memo(({ isMobile }) => (
  <div style={{ overflowX: 'auto' }}>
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr style={{ backgroundColor: '#fafafa' }}>
          {['Quote #','Customer','Project','Query Date','Submitted','Expiry','Status','Total','Actions'].map(h => (
            <th key={h} style={styles.skeletonHeader}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {[1,2,3,4,5,6].map(i => <SkeletonRow key={i}/>)}
      </tbody>
    </table>
  </div>
));

const EmptyState = React.memo(({ search, clearSearch, isMobile }) => (
  <div style={{ ...styles.emptyState, padding: isMobile ? '3rem 1rem' : '4rem 2rem' }}>
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
));

const RejectModal = React.memo(({ open, reason, onReasonChange, onConfirm, onCancel }) => (
  <ConfirmModal
    open={open}
    title="Reject Quotation"
    message="This quotation has been reviewed by Ops. Provide a reason for rejecting it at the admin level."
    confirmLabel="Reject" danger
    onConfirm={onConfirm}
    onCancel={onCancel}
    loading={false}
  >
    <textarea
      value={reason}
      onChange={e => onReasonChange(e.target.value)}
      rows={4} placeholder="Enter rejection reason…" autoFocus
      style={styles.rejectTextarea}
    />
  </ConfirmModal>
));



// ─────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────
const styles = {
  animations: `
    @keyframes slideIn { from { transform:translateX(20px);opacity:0; } to { transform:translateX(0);opacity:1; } }
    @keyframes popIn   { from { transform:scale(0.95);opacity:0; } to { transform:scale(1);opacity:1; } }
    @keyframes spin    { to { transform:rotate(360deg); } }
    @keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
    .adm-row:hover td  { background:#f8fafc !important; }
    .adm-nav-btn:hover     { opacity:0.8 !important; }
    .adm-tab:hover         { background:rgba(255,255,255,0.6) !important; }
    .adm-action-btn:hover:not(:disabled) { opacity:0.8 !important; transform:translateY(-1px); }
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

  statsRow1: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4,1fr)',
    gap: '1rem',
    marginBottom: '1rem'
  },

  statsRow2: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3,1fr)',
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
    flexWrap: 'wrap'
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
    padding: '0.4rem 0.75rem'
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

  tableHeaderCell: {
    padding: '0.75rem 1rem',
    fontSize: '0.72rem',
    fontWeight: 700,
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    textAlign: 'left',
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

  projectCell: {
    fontSize: '0.875rem',
    color: '#0f172a'
  },

  projectName: {
    fontSize: '0.875rem',
    color: '#0f172a'
  },

  trnText: {
    fontSize: '0.7rem',
    color: '#94a3b8',
    marginTop: 2
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

  emptyState: {
    textAlign: 'center',
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
    border: '1px solid #e2e8f0',
    borderRadius: 8,
    fontSize: '0.875rem',
    resize: 'vertical',
    outline: 'none',
    boxSizing: 'border-box',
    fontFamily: 'inherit'
  },
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    backdropFilter: 'blur(4px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },

  modal: {
    backgroundColor: 'white',
    borderRadius: '16px',
    width: '90%',
    maxWidth: '450px',
    maxHeight: '90vh',
    overflow: 'auto',
    boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
  },
  
  modalHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '1rem 1.5rem',
    borderBottom: '1px solid #e2e8f0',
    backgroundColor: '#f8fafc',
  },
  
  modalTitle: {
    fontSize: '1.125rem',
    fontWeight: 700,
    color: '#0f172a',
    margin: 0,
  },
  
  modalCloseBtn: {
    background: 'none',
    border: 'none',
    fontSize: '1.25rem',
    cursor: 'pointer',
    color: '#94a3b8',
    padding: '0.25rem',
    width: '32px',
    height: '32px',
    borderRadius: '8px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  
  modalBody: {
    padding: '1.5rem',
  },
  
  modalSubtitle: {
    fontSize: '0.875rem',
    color: '#64748b',
    marginBottom: '1.5rem',
    textAlign: 'center',
  },
  
  modalButtons: {
    display: 'flex',
    gap: '12px',
    justifyContent: 'flex-end',
    marginTop: '1rem',
  },
  
  awardDecisionContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
    marginBottom: '1rem',
  },
  
  awardYesBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.75rem',
    padding: '1rem',
    backgroundColor: '#d1fae5',
    color: '#065f46',
    border: '2px solid #6ee7b7',
    borderRadius: '12px',
    fontSize: '1rem',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  
  awardNoBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.75rem',
    padding: '1rem',
    backgroundColor: '#fee2e2',
    color: '#991b1b',
    border: '2px solid #fecaca',
    borderRadius: '12px',
    fontSize: '1rem',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  
  awardTextarea: {
    width: '100%',
    padding: '0.75rem',
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    fontSize: '0.875rem',
    resize: 'vertical',
    outline: 'none',
    boxSizing: 'border-box',
    fontFamily: 'inherit',
  },
  
  fieldWrapper: {
    marginBottom: '1rem',
  },
  
  label: {
    display: 'block',
    fontSize: '0.875rem',
    fontWeight: 600,
    color: '#334155',
    marginBottom: '0.5rem',
  },
  
  dangerBtn: {
    padding: '0.5rem 1rem',
    backgroundColor: '#ef4444',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    fontSize: '0.875rem',
    fontWeight: 500,
    cursor: 'pointer',
  },
  
  submitBtn: {
    padding: '0.5rem 1rem',
    backgroundColor: '#10b981',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    fontSize: '0.875rem',
    fontWeight: 500,
    cursor: 'pointer',
  },
};