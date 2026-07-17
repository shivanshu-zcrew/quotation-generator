import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Eye, Download, Trash2, Clock, CheckCircle, XCircle,
  FileText, Search, X, Check, LogOut,
  AlertCircle, RefreshCw, ChevronLeft, ChevronRight,
  Shield, Award, Ban, Users, TrendingUp, Calendar, Menu, Building2,
} from 'lucide-react';

import { useAppStore, useCompanyQuotations } from '../services/store';
import { useCustomersList, useAdminStats, useCompanyContext, useUserRole } from '../hooks/customHooks';
import { CompanyCurrencySelector, CompanyCurrencyDisplay, useCompanyCurrency } from '../components/CompanyCurrencySelector';
import { downloadQuotationPDF } from '../utils/pdfGenerator';
import useToast, { ToastContainer } from '../hooks/useToast';

import {
  RejectionNote,
  ActionBtn,
  SortHeader,
  SkeletonRow,
  ConfirmModal,
} from '../components/SharedComponents';

import CompactStatsCard from '../components/HomePageComponent/CompactStatsCard';
import DesktopStatsGrid from '../components/HomePageComponent/DesktopStatsGrid';
import ViewToggle from '../components/HomePageComponent/ViewToggle';

import {
  PAGE_SIZE_OPTIONS,
  DEBOUNCE_MS,
  DELETABLE,
} from '../utils/constants';
import { fmtCurrency, fmtDate, isExpired, isExpiringSoon } from '../utils/formatters';
import { SimpleLoadingOverlay } from '../components/LoadingOverlay';
import AwardModal from '../components/AwardModal';
import { adminAPI } from '../services/api';
import AdminDesktopStatsGrid from '../components/AdminDesktopstatsCard';

// Helper function to format amount without currency symbol
const formatAmount = (amount) => {
  return (amount || 0).toLocaleString('en-AE', { 
    minimumFractionDigits: 2, 
    maximumFractionDigits: 2 
  });
};

// ============================================================
// DESIGN TOKENS — identical to HomeScreen / OpsDashboard
// ============================================================
const T = {
  canvas:     '#f6f7f8',
  surface:    '#ffffff',
  ink:        '#1b1d1e',
  inkSoft:    '#646a6e',
  inkFaint:   '#9aa0a4',
  line:       '#e8eaec',
  lineSoft:   '#f0f1f3',
  accent:     '#2563c4',
  accentSoft: '#e6f0fb',
  accentInk:  '#1d63c4',
  shadow:     '0 1px 2px rgba(20,22,24,0.04), 0 8px 24px -12px rgba(20,22,24,0.10)',
  radius:     16,
  radiusSm:   10,
};

const FONT_STACK = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

// ============================================================
// STATUS CONFIG
// ============================================================
const STATUS_CFG = {
  pending:       { label: 'Pending',          bg: '#fff7e6', color: '#b45309', borderColor: '#fde9c8', icon: '○' },
  pending_admin: { label: 'Pending Admin',    bg: '#fff7e6', color: '#b45309', borderColor: '#fde9c8', icon: '○' },
  ops_approved:  { label: 'Action Required',  bg: '#e6f0fb', color: '#1d63c4', borderColor: '#c9defa', icon: '◔' },
  approved:      { label: 'Approved',         bg: '#e3f5ee', color: '#0f7a52', borderColor: '#c3ebda', icon: '●' },
  awarded:       { label: 'Awarded',          bg: '#efe9fb', color: '#6d28d9', borderColor: '#dccffa', icon: '◆' },
  not_awarded:   { label: 'Not Awarded',      bg: '#eef1f4', color: '#52606d', borderColor: '#dde3e8', icon: '—' },
  ops_rejected:  { label: 'Returned by Ops',  bg: '#fdeaf0', color: '#be185d', borderColor: '#f8d2e0', icon: '△' },
  rejected:      { label: 'Rejected',         bg: '#fdeceb', color: '#c1352b', borderColor: '#f8d6d2', icon: '✕' },
};

const EnhancedStatusBadge = React.memo(({ status, quotation }) => {
  const config = STATUS_CFG[status] || {
    label: status?.replace(/_/g, ' ') || 'Unknown',
    bg: '#f2f3f4', color: '#646a6e', borderColor: '#e8eaec', icon: '·',
  };
  const isExp  = quotation && new Date(quotation.expiryDate) < new Date();
  const isExpS = quotation && !isExp && new Date(quotation.expiryDate) - new Date() < 7 * 24 * 60 * 60 * 1000;
  const base = {
    display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
    padding: '0.28rem 0.7rem', borderRadius: 999, fontSize: '0.74rem',
    fontWeight: 600, letterSpacing: '0.01em', whiteSpace: 'nowrap', cursor: 'help',
  };
  if (isExp && status === 'pending')
    return <span style={{ ...base, backgroundColor: '#fdeceb', color: '#c1352b', border: '1px solid #f8d6d2' }} title="Expired"><span style={{ opacity: 0.8 }}>✕</span> Expired</span>;
  if (isExpS && status === 'pending')
    return <span style={{ ...base, backgroundColor: '#fff7e6', color: '#b45309', border: '1px solid #fde9c8' }} title="Expiring soon"><span style={{ opacity: 0.8 }}>◷</span> Expiring Soon</span>;
  return (
    <span style={{ ...base, backgroundColor: config.bg, color: config.color, border: `1px solid ${config.borderColor}`, transition: 'all 0.2s ease' }} title={config.label}>
      <span style={{ fontSize: '0.6rem', opacity: 0.85 }}>{config.icon}</span>
      {config.label}
    </span>
  );
});

// ============================================================
// PAGINATION BAR
// ============================================================
const PageBtn = React.memo(({ n, current, onPage }) => (
  <button onClick={() => onPage(n)} style={{ minWidth: 32, height: 32, borderRadius: 8, border: n === current ? '1px solid transparent' : `1px solid ${T.line}`, backgroundColor: n === current ? T.ink : T.surface, color: n === current ? '#fff' : T.inkSoft, fontWeight: n === current ? 600 : 500, fontSize: '0.8rem', cursor: 'pointer', transition: 'all 0.15s ease' }}>{n}</button>
));

const PaginationBar = React.memo(({ total, page, limit, totalPages, onPageChange, onLimitChange }) => {
  if (!total || totalPages <= 1) return null;
  const start = (page - 1) * limit + 1;
  const end   = Math.min(page * limit, total);
  const pages = useMemo(() => {
    const p = []; const s = Math.max(1, page - 2); const e = Math.min(totalPages, page + 2);
    for (let i = s; i <= e; i++) p.push(i); return p;
  }, [page, totalPages]);
  const showStart = pages[0] > 1;
  const showEnd   = pages[pages.length - 1] < totalPages;
  const arrowBtn  = (d) => ({ width: 32, height: 32, border: `1px solid ${T.line}`, borderRadius: 8, background: T.surface, cursor: d ? 'not-allowed' : 'pointer', opacity: d ? 0.4 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.inkSoft });
  return (
    <div style={{ padding: '0.9rem 1.5rem', borderTop: `1px solid ${T.lineSoft}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem', backgroundColor: T.surface }}>
      <span style={{ fontSize: '0.8rem', color: T.inkSoft }}>Showing <strong style={{ color: T.ink }}>{start}–{end}</strong> of <strong style={{ color: T.ink }}>{total}</strong></span>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <button onClick={() => onPageChange(Math.max(1, page - 1))} disabled={page === 1} style={arrowBtn(page === 1)}><ChevronLeft size={14} /></button>
        {showStart && <><PageBtn n={1} current={page} onPage={onPageChange} />{pages[0] > 2 && <span style={{ color: T.inkFaint, fontSize: '0.8rem' }}>…</span>}</>}
        {pages.map((n) => <PageBtn key={n} n={n} current={page} onPage={onPageChange} />)}
        {showEnd && <>{pages[pages.length - 1] < totalPages - 1 && <span style={{ color: T.inkFaint, fontSize: '0.8rem' }}>…</span>}<PageBtn n={totalPages} current={page} onPage={onPageChange} /></>}
        <button onClick={() => onPageChange(Math.min(totalPages, page + 1))} disabled={page === totalPages} style={arrowBtn(page === totalPages)}><ChevronRight size={14} /></button>
      </div>
    </div>
  );
});

// ============================================================
// SHIMMER
// ============================================================
const shimmer = { background: `linear-gradient(90deg, ${T.lineSoft} 25%, ${T.line} 50%, ${T.lineSoft} 75%)`, backgroundSize: '200% 100%', animation: 'adm-shimmer 1.4s ease infinite', borderRadius: 6 };

const ShimmerStatsCard = ({ isMobile }) => {
  const card = { background: T.surface, borderRadius: T.radius, padding: '1.25rem', border: `1px solid ${T.line}` };
  if (isMobile) return (
    <div style={{ marginBottom: '1.5rem' }}>
      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <div style={{ ...shimmer, width: 100, height: 18 }} /><div style={{ ...shimmer, width: 40, height: 40, borderRadius: '50%' }} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: '0.75rem' }}>
          {[1,2,3,4].map((i) => <div key={i}><div style={{ ...shimmer, width: 60, height: 11, marginBottom: 8 }} /><div style={{ ...shimmer, width: 80, height: 22 }} /></div>)}
        </div>
      </div>
    </div>
  );
  return (
    <div style={{ marginBottom: '1.5rem' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '1rem', marginBottom: '1rem' }}>
        {[1,2,3,4].map((i) => <div key={i} style={card}><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}><div><div style={{ ...shimmer, width: 80, height: 11 }} /><div style={{ ...shimmer, width: 100, height: 26, marginTop: 8 }} /></div><div style={{ ...shimmer, width: 44, height: 44, borderRadius: 12 }} /></div></div>)}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '1rem' }}>
        {[1,2,3].map((i) => <div key={i} style={card}><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}><div><div style={{ ...shimmer, width: 80, height: 11 }} /><div style={{ ...shimmer, width: 100, height: 26, marginTop: 8 }} /></div><div style={{ ...shimmer, width: 44, height: 44, borderRadius: 12 }} /></div></div>)}
      </div>
    </div>
  );
};

// ============================================================
// RESPONSIVE HOOK
// ============================================================
const useMediaQuery = (query) => {
  const [matches, setMatches] = useState(() => typeof window !== 'undefined' ? window.matchMedia(query).matches : false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia(query);
    const h = (e) => setMatches(e.matches);
    mq.addEventListener ? mq.addEventListener('change', h) : mq.addListener(h);
    return () => mq.removeEventListener ? mq.removeEventListener('change', h) : mq.removeListener(h);
  }, [query]);
  return matches;
};

// ============================================================
// SUB-COMPONENTS
// ============================================================
const ExpiryBadge = React.memo(({ type }) => {
  const cfg = type === 'expired'
    ? { bg: '#fdeceb', color: '#c1352b', border: '#f8d6d2', label: 'Expired' }
    : { bg: '#fff7e6', color: '#b45309', border: '#fde9c8', label: 'Expiring' };
  return <span style={{ fontSize: '0.6rem', fontWeight: 600, color: cfg.color, background: cfg.bg, padding: '1px 6px', borderRadius: 999, border: `1px solid ${cfg.border}` }}>{cfg.label}</span>;
});

const QueryDateBadge = React.memo(({ date, passed }) => (
  <span style={{ background: passed ? '#fdeceb' : '#fff7e6', color: passed ? '#c1352b' : '#b45309', padding: '0.25rem 0.7rem', borderRadius: 999, fontSize: '0.75rem', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
     {fmtDate(date)}{passed && ' ⚠'}
  </span>
));

// Admin mobile card with updated currency formatting
const AdminQuotationCard = React.memo(({ quotation, onAward, isAwarding, selectedCurrency, onView, onApprove, onReject, onDownload, onDelete, isExporting, isApproving, isRejecting }) => {
  const expired  = isExpired(quotation.expiryDate);
  const expiring = !expired && isExpiringSoon(quotation.expiryDate);
  const canAct   = quotation.status === 'ops_approved' || quotation.status === 'pending_admin';
  const canDelete= DELETABLE.has(quotation.status);
  const canAward = quotation.status === 'approved' && (quotation.createdBy?.role === 'admin' || quotation.createdBySnapshot?.role === 'admin');
  const queryDatePassed = quotation.queryDate && new Date(quotation.queryDate) < new Date();
  const quoteCurrency = quotation.currency?.code || selectedCurrency;
  
  return (
    <div style={{ background: T.surface, borderRadius: T.radius, padding: '1rem 1.1rem', border: `1px solid ${T.line}`, boxShadow: T.shadow, fontFamily: FONT_STACK }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.65rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 700, color: T.ink, fontFamily: "'Inter', monospace", fontSize: '0.8rem' }}>{quotation.quotationNumber || '—'}</span>
          <EnhancedStatusBadge status={quotation.status} quotation={quotation} />
          {expired  && <ExpiryBadge type="expired" />}
          {expiring && <ExpiryBadge type="expiring" />}
        </div>
        <div style={{ textAlign: 'right' }}>
          <div>
            <span style={{ fontSize: '0.9rem', fontWeight: 700, color: T.ink }}>
              {formatAmount(quotation.total)}
            </span>
            <span style={{ fontSize: '0.65rem', fontWeight: 400, color: T.inkFaint, marginLeft: '0.25rem' }}>
              {quoteCurrency}
            </span>
          </div>
          {(quoteCurrency !== 'AED' && quotation.totalInBaseCurrency != null) && (
            <div style={{ marginTop: 1 }}>
              <span style={{ fontSize: '0.6rem', fontWeight: 500, color: T.inkFaint }}>≈ </span>
              <span style={{ fontSize: '0.6rem', fontWeight: 500, color: T.inkFaint }}>
                {formatAmount(quotation.totalInBaseCurrency)}
              </span>
              <span style={{ fontSize: '0.55rem', fontWeight: 400, color: T.inkFaint, marginLeft: '0.15rem' }}>
                AED
              </span>
            </div>
          )}
        </div>
      </div>
      <div style={{ marginBottom: '0.5rem' }}>
        <div style={{ fontWeight: 600, color: T.ink, fontSize: '0.875rem' }}>{quotation.customerSnapshot?.name || quotation.customer || quotation.customerId?.name || 'N/A'}</div>
        {quotation.contact && <div style={{ fontSize: '0.72rem', color: T.inkFaint, marginTop: 2 }}>{quotation.contact}</div>}
        <RejectionNote quotation={quotation} />
      </div>
      {quotation.projectName && <div style={{ fontSize: '0.8rem', color: T.inkSoft, marginBottom: '0.5rem' }}>{quotation.projectName}</div>}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '0.6rem', fontSize: '0.72rem', color: T.inkSoft, flexWrap: 'wrap' }}>
        {quotation.queryDate && <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}> <span style={{ color: queryDatePassed ? '#c1352b' : '#b45309', fontWeight: 500 }}>Follow-up: {fmtDate(quotation.queryDate)}{queryDatePassed && ' ⚠'}</span></div>}
        <span>Submitted: {fmtDate(quotation.date)}</span>
        <span style={{ color: expired ? '#c1352b' : expiring ? '#b45309' : T.inkSoft, fontWeight: expired || expiring ? 600 : 400 }}>Expiry: {fmtDate(quotation.expiryDate)}</span>
      </div>
      <div style={{ fontSize: '0.7rem', color: T.inkFaint, marginBottom: '0.75rem' }}>Created by: {quotation.createdBy?.name || '—'}</div>
      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', borderTop: `1px solid ${T.lineSoft}`, paddingTop: '0.75rem' }}>
        {canAct && (
          <>
            <ActionBtn bg="#e3f5ee" color="#0f7a52" onClick={() => onApprove(quotation._id)} icon={Check} label="Approve" size="small" disabled={isApproving} />
            <ActionBtn bg="#fdeceb" color="#c1352b" onClick={() => onReject(quotation._id)} icon={X} label="Reject" size="small" disabled={isRejecting} />
          </>
        )}
        <ActionBtn bg={T.accentSoft} color={T.accentInk} onClick={() => onView(quotation._id)} icon={Eye} label="View" size="small" />
        {canAward && <ActionBtn bg="#efe9fb" color="#6d28d9" onClick={() => onAward(quotation)} icon={Award} label="Award" size="small" disabled={isAwarding} />}
        {canDelete && <ActionBtn bg="#fdeceb" color="#c1352b" onClick={() => onDelete(quotation._id)} icon={Trash2} label="Del" size="small" />}
      </div>
    </div>
  );
});
AdminQuotationCard.displayName = 'AdminQuotationCard';

// ============================================================
// MAIN COMPONENT
// ============================================================
export default function AdminDashboard({ onNavigate, onViewQuotation }) {
  const navigate  = useNavigate();
  const isMobile  = useMediaQuery('(max-width: 768px)');
  const isTablet  = useMediaQuery('(max-width: 1100px)');

  const [uiState, setUiState] = useState({ mobileMenuOpen: false, viewMode: 'table' });
  const [exportFilters, setExportFilters] = useState({ showFilters: false, fromDate: '', toDate: '', status: 'all' });
  const [isExporting, setIsExporting]     = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportMessage, setExportMessage]   = useState('');
  const [refreshProgress, setRefreshProgress] = useState(0);
  const [refreshMessage,  setRefreshMessage]  = useState('');
  const [pdfProgress, setPdfProgress] = useState(0);
  const [pdfMessage,  setPdfMessage]  = useState('');
  const [exportingId, setExportingId] = useState(null);

  // ── Store ─────────────────────────────────────────────────
  const {
    quotations: companyQuotations,
    pagination: quotationsPagination,
    quotationCounts,
    refresh: refreshCompanyQuotations,
    quotationsLoading,
    quotationsInitialized,
    goToPage, changeLimit, resetPagination,
    currentPage, currentLimit,
  } = useCompanyQuotations();

  const approveQuotation = useAppStore((s) => s.approveQuotation);
  const rejectQuotation  = useAppStore((s) => s.rejectQuotation);
  const deleteQuotation  = useAppStore((s) => s.deleteQuotation);
  const handleLogout     = useAppStore((s) => s.handleLogout);
  const loading          = useAppStore((s) => s.loading);
  const loadError        = useAppStore((s) => s.loadError);
  const clearError       = useAppStore((s) => s.clearError);
  const fetchAllData     = useAppStore((s) => s.fetchAllData);
  const selectedCompany  = useAppStore((s) => s.selectedCompany);
  const initialized      = useAppStore((s) => s.initialized);
  const awardQuotation   = useAppStore((s) => s.awardQuotation);

  const { stats, loading: statsLoading, refresh: refreshStats, totalQuotations, actionRequired, approved, awarded, awardedValue, conversionRate, statusCounts, rejected, conversionDetails, totalAwardedValue, totalCustomers } = useAdminStats();
  const { selectedCompany: companyId, currentCompany, selectedCurrency, hasCompany, isSwitchingCompany } = useCompanyContext();
  const { isAdmin, user } = useUserRole();
  const { toasts, addToast, dismissToast } = useToast();

  const searchRef   = useRef(null);
  const searchTimer = useRef(null);
  const isMountedRef      = useRef(true);
  const loadingTimeoutRef = useRef(null);
  const initialLoadTriggered = useRef(false);

  // ── Filters ───────────────────────────────────────────────
  const [filters, setFilters] = useState({ status: null, search: '', sortBy: 'createdAt', sortDir: 'desc' });
  const [searchInput, setSearchInput] = useState('');

  // ── Action state ──────────────────────────────────────────
  const [rejectModal, setRejectModal]   = useState({ open: false, id: null, reason: '' });
  const [deleteModal, setDeleteModal]   = useState({ open: false, id: null });
  const [actionLoadingIds, setActionLoadingIds] = useState({});
  const [awardModal, setAwardModal]     = useState({ open: false, quotation: null, busy: false });

  // Latch refs
  const statsLatchRef = useRef(false);
  const tableLatchRef = useRef(false);

  const statsReady = totalQuotations != null && !statsLoading;
  const tableReady = quotationsInitialized && !quotationsLoading;

  if (statsReady) statsLatchRef.current = true;
  if (tableReady) tableLatchRef.current = true;

  const prevCompanyRef = useRef(selectedCompany);
  useEffect(() => {
    const prev = prevCompanyRef.current;
    prevCompanyRef.current = selectedCompany;
    if (prev && selectedCompany && prev !== selectedCompany) {
      statsLatchRef.current = false;
      tableLatchRef.current = false;
      resetPagination();
      setFilters({ status: null, search: '', sortBy: 'createdAt', sortDir: 'desc' });
      setSearchInput('');
      initialLoadTriggered.current = false;
    }
  }, [selectedCompany, resetPagination]);

  const showStatsShimmer = !statsLatchRef.current;
  const showTableShimmer = !tableLatchRef.current;

  const safeQ        = useMemo(() => Array.isArray(companyQuotations) ? companyQuotations : [], [companyQuotations]);
  const isRefreshing = tableLatchRef.current && quotationsLoading;
  const showEmptyState = tableLatchRef.current && !quotationsLoading && safeQ.length === 0;

  const activeTab = useMemo(() => filters.status === null ? 'all' : filters.status, [filters.status]);

  const tabCounts = useMemo(() => {
    // quotationCounts from the list API reflects the active filter/search — most accurate.
    if (quotationCounts && Object.keys(quotationCounts).length > 0) return {
      all:          quotationCounts.all          ?? 0,
      ops_approved: quotationCounts.ops_approved ?? 0,
      approved:     quotationCounts.approved     ?? 0,
      awarded:      quotationCounts.awarded      ?? 0,
      rejected:     quotationCounts.rejected     ?? 0,
    };
    return {
      all:          statusCounts?.total        || totalQuotations || 0,
      ops_approved: statusCounts?.ops_approved || actionRequired  || 0,
      approved:     statusCounts?.approved     || approved        || 0,
      awarded:      statusCounts?.awarded      || awarded         || 0,
      rejected:     statusCounts?.rejected     || rejected        || 0,
    };
  }, [quotationCounts, statusCounts, totalQuotations, actionRequired, approved, awarded, rejected]);

  // ── Effects ───────────────────────────────────────────────
  useEffect(() => {
    if (hasCompany && initialized && !initialLoadTriggered.current && !isSwitchingCompany) {
      initialLoadTriggered.current = true;
      refreshCompanyQuotations({ page: 1, limit: currentLimit, status: filters.status, sortBy: filters.sortBy, sortDir: filters.sortDir, search: filters.search });
    }
  }, [hasCompany, initialized, isSwitchingCompany, refreshCompanyQuotations, currentLimit, filters]);

  useEffect(() => { changeLimit(isMobile ? 10 : 20); }, [isMobile, changeLimit]);
  useEffect(() => { if (isMobile || isTablet) setUiState(p => ({ ...p, viewMode: 'card' })); }, [isMobile, isTablet]);
  useEffect(() => { isMountedRef.current = true; return () => { isMountedRef.current = false; if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current); if (searchTimer.current) clearTimeout(searchTimer.current); }; }, []);

  // ── Op helpers ────────────────────────────────────────────
  const setActionLoading  = useCallback((id, action, val) => setActionLoadingIds(p => ({ ...p, [`${id}_${action}`]: val })), []);
  const isActionLoading   = useCallback((id, action) => !!actionLoadingIds[`${id}_${action}`], [actionLoadingIds]);

  // ── Handlers ──────────────────────────────────────────────
  const handleTabChange = useCallback((key) => {
    const newStatus = key === 'all' ? null : key;
    setFilters(p => ({ ...p, status: newStatus, sortBy: 'createdAt', sortDir: 'desc' }));
    setSearchInput('');
    setUiState(p => ({ ...p, mobileMenuOpen: false }));
    refreshCompanyQuotations({ status: newStatus, sortBy: 'createdAt', sortDir: 'desc', page: 1, limit: currentLimit, search: '' });
  }, [refreshCompanyQuotations, currentLimit]);

  const handleSearchChange = useCallback((e) => {
    const val = e.target.value;
    setSearchInput(val);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setFilters(p => ({ ...p, search: val }));
      refreshCompanyQuotations({ search: val, status: filters.status, sortBy: filters.sortBy, sortDir: filters.sortDir, page: 1, limit: currentLimit });
    }, DEBOUNCE_MS);
  }, [refreshCompanyQuotations, filters.status, filters.sortBy, filters.sortDir, currentLimit]);

  const clearSearch = useCallback(() => {
    setSearchInput('');
    setFilters(p => ({ ...p, search: '' }));
    refreshCompanyQuotations({ search: '', status: filters.status, sortBy: filters.sortBy, sortDir: filters.sortDir, page: 1, limit: currentLimit });
    if (searchRef.current) searchRef.current.value = '';
  }, [refreshCompanyQuotations, filters.status, filters.sortBy, filters.sortDir, currentLimit]);

  const handleSort = useCallback((field) => {
    let sortField = field;
    if (field === 'customer')   sortField = 'customerSnapshot.name';
    if (field === 'createdby')  sortField = 'createdBy.name';
    const newDir = filters.sortBy === sortField && filters.sortDir === 'asc' ? 'desc' : 'asc';
    setFilters(p => ({ ...p, sortBy: sortField, sortDir: newDir }));
    refreshCompanyQuotations({ sortBy: sortField, sortDir: newDir, status: filters.status, search: filters.search, page: 1, limit: currentLimit });
  }, [refreshCompanyQuotations, filters, currentLimit]);

  const handleRefresh = useCallback(async () => {
    setRefreshProgress(10); setRefreshMessage('Refreshing data…');
    const t = setInterval(() => setRefreshProgress(p => p >= 90 ? 90 : p + 10), 500);
    try {
      await fetchAllData();
      await refreshCompanyQuotations({ status: filters.status, search: filters.search, sortBy: filters.sortBy, sortDir: filters.sortDir, page: currentPage, limit: currentLimit, forceRefresh: true });
      await refreshStats();
      setRefreshProgress(100); setRefreshMessage('Complete!');
      addToast('Data refreshed', 'success');
      setTimeout(() => { setRefreshProgress(0); setRefreshMessage(''); }, 800);
    } catch (err) { setRefreshProgress(0); setRefreshMessage(''); addToast(err.message || 'Refresh failed', 'error'); }
    finally { clearInterval(t); }
  }, [fetchAllData, refreshCompanyQuotations, refreshStats, addToast, filters, currentPage, currentLimit]);

  const handleDownload = useCallback(async (q) => {
    setExportingId(q._id); setPdfProgress(10); setPdfMessage('Preparing PDF…');
    const t = setInterval(() => setPdfProgress(p => p >= 90 ? 90 : p + 10), 800);
    try { await downloadQuotationPDF(q); setPdfProgress(100); setPdfMessage('Complete!'); addToast('PDF downloaded!', 'success'); setTimeout(() => { setPdfProgress(0); setPdfMessage(''); }, 800); }
    catch (err) { setPdfProgress(0); setPdfMessage(''); addToast(`PDF failed: ${err.message}`, 'error'); }
    finally { clearInterval(t); setExportingId(null); }
  }, [addToast]);

  const handleExportToExcel = useCallback(async () => {
    setIsExporting(true); setExportProgress(10); setExportMessage('Preparing export…');
    const t = setInterval(() => setExportProgress(p => p >= 90 ? 90 : p + 10), 500);
    try {
      const params = { companyId: selectedCompany };
      if (exportFilters.status && exportFilters.status !== 'all') params.status = exportFilters.status;
      else if (activeTab !== 'all') params.status = activeTab;
      if (exportFilters.fromDate) params.fromDate = exportFilters.fromDate;
      if (exportFilters.toDate)   params.toDate   = exportFilters.toDate;
      if (filters.search?.trim()) params.search   = filters.search;
      const response = await adminAPI.exportQuotationsToExcel(params);
      const url  = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `quotations_export_${new Date().toISOString().split('T')[0]}.xlsx`);
      document.body.appendChild(link); link.click(); link.remove();
      window.URL.revokeObjectURL(url);
      setExportProgress(100); setExportMessage('Complete!');
      addToast('Exported successfully!', 'success');
      setTimeout(() => { setExportProgress(0); setExportMessage(''); }, 1500);
    } catch (err) { setExportProgress(0); setExportMessage(''); addToast(err.response?.data?.message || 'Export failed', 'error'); }
    finally { clearInterval(t); setIsExporting(false); }
  }, [selectedCompany, activeTab, filters.search, exportFilters, addToast]);

  const handleApprove = useCallback(async (id) => {
    setActionLoading(id, 'approve', true);
    try {
      const result = await approveQuotation(id);
      if (result?.success) { addToast('Quotation approved', 'success'); await Promise.all([refreshCompanyQuotations({ status: filters.status, search: filters.search, sortBy: filters.sortBy, sortDir: filters.sortDir, page: currentPage, limit: currentLimit, forceRefresh: true }), refreshStats()]); }
      else addToast(result?.error || 'Failed to approve', 'error');
    } finally { setActionLoading(id, 'approve', false); }
  }, [approveQuotation, addToast, refreshCompanyQuotations, refreshStats, setActionLoading, filters, currentPage, currentLimit]);

  const handleReject = {
    open:    useCallback((id) => setRejectModal({ open: true, id, reason: '' }), []),
    close:   useCallback(() => setRejectModal({ open: false, id: null, reason: '' }), []),
    confirm: useCallback(async () => {
      if (!rejectModal.reason.trim()) { addToast('Please provide a rejection reason', 'error'); return; }
      setActionLoading(rejectModal.id, 'reject', true);
      try {
        const result = await rejectQuotation(rejectModal.id, rejectModal.reason);
        if (result?.success) { addToast('Quotation rejected', 'success'); setRejectModal({ open: false, id: null, reason: '' }); await Promise.all([refreshCompanyQuotations({ status: filters.status, search: filters.search, sortBy: filters.sortBy, sortDir: filters.sortDir, page: currentPage, limit: currentLimit }), refreshStats()]); }
        else addToast(result?.error || 'Failed to reject', 'error');
      } finally { setActionLoading(rejectModal.id, 'reject', false); }
    }, [rejectModal, rejectQuotation, addToast, refreshCompanyQuotations, refreshStats, setActionLoading, filters, currentPage, currentLimit]),
  };

  const handleDelete = {
    open:    useCallback((id) => setDeleteModal({ open: true, id }), []),
    close:   useCallback(() => setDeleteModal({ open: false, id: null }), []),
    confirm: useCallback(async () => {
      setActionLoading(deleteModal.id, 'delete', true);
      try {
        const result = await deleteQuotation(deleteModal.id);
        if (result?.success) { addToast('Quotation deleted', 'success'); setDeleteModal({ open: false, id: null }); await Promise.all([refreshCompanyQuotations({ status: filters.status, search: filters.search, sortBy: filters.sortBy, sortDir: filters.sortDir, page: currentPage, limit: currentLimit }), refreshStats()]); }
        else addToast(result?.error || 'Failed to delete', 'error');
      } finally { setActionLoading(deleteModal.id, 'delete', false); }
    }, [deleteModal, deleteQuotation, addToast, refreshCompanyQuotations, refreshStats, setActionLoading, filters, currentPage, currentLimit]),
  };

  const handleView = useCallback((id) => { if (onViewQuotation) onViewQuotation(id); else navigate(`/quotation/${id}`); }, [onViewQuotation, navigate]);

  const handleAward = {
    open:    useCallback((q) => setAwardModal({ open: true, quotation: q, busy: false }), []),
    close:   useCallback(() => setAwardModal({ open: false, quotation: null, busy: false }), []),
    confirm: useCallback(async (awarded, note) => {
      if (!awardModal.quotation) return;
      setAwardModal(p => ({ ...p, busy: true }));
      setActionLoading(awardModal.quotation._id, 'award', true);
      try {
        const result = await awardQuotation(awardModal.quotation._id, awarded, note);
        if (result?.success) { addToast(awarded ? `🏆 ${awardModal.quotation.quotationNumber} Awarded!` : `${awardModal.quotation.quotationNumber} Not Awarded.`, 'success'); await Promise.all([refreshCompanyQuotations({ status: filters.status, search: filters.search, sortBy: filters.sortBy, sortDir: filters.sortDir, page: currentPage, limit: currentLimit }), refreshStats()]); handleAward.close(); }
        else { addToast(result?.error || 'Failed', 'error'); setAwardModal(p => ({ ...p, busy: false })); }
      } catch (e) { addToast(e.message || 'Failed', 'error'); setAwardModal(p => ({ ...p, busy: false })); }
      finally { setActionLoading(awardModal.quotation?._id, 'award', false); }
    }, [awardModal.quotation, awardQuotation, addToast, refreshCompanyQuotations, refreshStats, setActionLoading, filters, currentPage, currentLimit]),
  };

  // ── Keyboard shortcut ─────────────────────────────────────
  useEffect(() => {
    const h = (e) => { if (e.key === '/' && !['INPUT','TEXTAREA'].includes(document.activeElement?.tagName)) { e.preventDefault(); searchRef.current?.focus(); } };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  // ── Tabs ──────────────────────────────────────────────────
  const TABS = useMemo(() => [
    { key: 'all',          label: 'All',             Icon: FileText,    count: tabCounts.all },
    { key: 'ops_approved', label: 'Action Required', Icon: Clock,       count: tabCounts.ops_approved },
    { key: 'approved',     label: 'Approved',        Icon: CheckCircle, count: tabCounts.approved },
    { key: 'awarded',      label: 'Awarded',         Icon: Award,       count: tabCounts.awarded },
    { key: 'rejected',     label: 'Rejected',        Icon: XCircle,     count: tabCounts.rejected },
  ], [tabCounts]);

  // ── Header button helper ──────────────────────────────────
  const headerBtn = (variant) => {
    const v = {
      ghost:  { background: 'transparent',             color: '#c7cccf', border: '1px solid rgba(255,255,255,0.14)' },
      soft:   { background: 'rgba(255,255,255,0.08)',  color: '#e6e9ea', border: '1px solid rgba(255,255,255,0.10)' },
      accent: { background: T.accent,                  color: '#fff',    border: '1px solid transparent' },
      green:  { background: '#10b981',                 color: '#fff',    border: '1px solid transparent' },
    };
    return { ...v[variant], borderRadius: T.radiusSm, padding: isMobile ? '0.4rem 0.7rem' : '0.5rem 0.95rem', fontSize: isMobile ? '0.72rem' : '0.8rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.45rem', fontFamily: FONT_STACK, transition: 'all 0.18s ease' };
  };

  const thStyle = { padding: '0.85rem 1rem', fontSize: '0.68rem', fontWeight: 600, color: T.inkFaint, textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: 'left', borderBottom: `1px solid ${T.line}`, backgroundColor: T.surface, whiteSpace: 'nowrap', position: 'sticky', top: 0, zIndex: 1 };

  // ── Table row renderer with updated currency formatting ───
  const renderTableRow = (q) => {
    if (!q) return null;
    const expired  = isExpired(q.expiryDate);
    const expiring = !expired && isExpiringSoon(q.expiryDate);
    const canAct   = q.status === 'ops_approved' || q.status === 'pending_admin';
    const canAward = q.status === 'approved' && (q.createdBy?.role === 'admin' || q.createdBySnapshot?.role === 'admin');
    const canDelete= DELETABLE.has(q.status);
    const queryDatePassed = q.queryDate && new Date(q.queryDate) < new Date();
    const createdByName = q.createdBy?.name || q.createdBySnapshot?.name || '—';
    const quoteCurrency = q.currency?.code || selectedCurrency;
    
    return (
      <tr key={q._id} className="adm-row" style={{ borderBottom: `1px solid ${T.lineSoft}` }}>
        <td style={{ padding: '1rem', verticalAlign: 'middle' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 600, color: T.ink, fontFamily: "'Inter', monospace", fontSize: '0.8rem' }}>{q.quotationNumber || '—'}</span>
            {expired  && <ExpiryBadge type="expired" />}
            {expiring && <ExpiryBadge type="expiring" />}
          </div>
        </td>
        <td style={{ padding: '1rem', verticalAlign: 'middle' }}>
          <div style={{ fontWeight: 600, color: T.ink, fontSize: '0.875rem' }}>{q.customerSnapshot?.name || q.customer || q.customerId?.name || 'N/A'}</div>
          {q.contact && <div style={{ fontSize: '0.75rem', color: T.inkFaint, marginTop: 2 }}>{q.contact}</div>}
        </td>
        <td style={{ padding: '1rem', verticalAlign: 'middle' }}>
          <div style={{ fontSize: '0.875rem', color: T.inkSoft }}>{q.projectName || '—'}</div>
        </td>
        <td style={{ padding: '1rem', verticalAlign: 'middle', textAlign: 'center' }}>
          {q.queryDate ? <QueryDateBadge date={q.queryDate} passed={queryDatePassed} /> : <span style={{ color: T.inkFaint }}>—</span>}
        </td>
        <td style={{ padding: '1rem', fontSize: '0.8rem', color: T.inkSoft, verticalAlign: 'middle', whiteSpace: 'nowrap' }}>{fmtDate(q.date)}</td>
        <td style={{ padding: '1rem', fontSize: '0.8rem', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
          <span style={{ color: expired ? '#c1352b' : expiring ? '#b45309' : T.inkSoft, fontWeight: expired || expiring ? 600 : 400 }}>{fmtDate(q.expiryDate)}</span>
        </td>
        <td style={{ padding: '1rem', verticalAlign: 'middle' }}>
          <EnhancedStatusBadge status={q.status} quotation={q} />
          <RejectionNote quotation={q} />
        </td>
        <td style={{ padding: '1rem', fontSize: '0.8rem', color: T.inkSoft, verticalAlign: 'middle' }}>{createdByName}</td>
        <td style={{ padding: '1rem', verticalAlign: 'middle', textAlign: 'right', whiteSpace: 'nowrap' }}>
          <div>
            <span style={{ fontSize: '0.9rem', fontWeight: 700, color: T.ink }}>
              {formatAmount(q.total)}
            </span>
            <span style={{ fontSize: '0.65rem', fontWeight: 400, color: T.inkFaint, marginLeft: '0.25rem' }}>
              {quoteCurrency}
            </span>
          </div>
          {(quoteCurrency !== 'AED' && q.totalInBaseCurrency != null) && (
            <div style={{ marginTop: 1 }}>
              <span style={{ fontSize: '0.6rem', fontWeight: 500, color: T.inkFaint }}>≈ </span>
              <span style={{ fontSize: '0.6rem', fontWeight: 500, color: T.inkFaint }}>
                {formatAmount(q.totalInBaseCurrency)}
              </span>
              <span style={{ fontSize: '0.55rem', fontWeight: 400, color: T.inkFaint, marginLeft: '0.15rem' }}>
                AED
              </span>
            </div>
          )}
        </td>
        <td style={{ padding: '0.85rem 1rem', verticalAlign: 'middle' }}>
          <div style={{ display: 'flex', gap: '0.3rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            {canAct && (
              <>
                <ActionBtn bg="#e3f5ee" color="#0f7a52" onClick={() => handleApprove(q._id)} icon={Check} label="Approve" title="Approve" size="small" disabled={isActionLoading(q._id, 'approve')} />
                <ActionBtn bg="#fdeceb" color="#c1352b" onClick={() => handleReject.open(q._id)} icon={X} label="Reject" title="Reject" size="small" disabled={isActionLoading(q._id, 'reject')} />
              </>
            )}
            <ActionBtn bg={T.accentSoft} color={T.accentInk} onClick={() => handleView(q._id)} icon={Eye} label="View" title="View" size="small" />
            {canAward && <ActionBtn bg="#efe9fb" color="#6d28d9" onClick={() => handleAward.open(q)} icon={Award} label="Award" title="Award" size="small" disabled={isActionLoading(q._id, 'award')} />}
            {canDelete && <ActionBtn bg="#fdeceb" color="#c1352b" onClick={() => handleDelete.open(q._id)} icon={Trash2} label="Del" title="Delete" size="small" disabled={isActionLoading(q._id, 'delete')} />}
          </div>
        </td>
      </tr>
    );
  };

  // ── Render ────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', backgroundColor: T.canvas, fontFamily: FONT_STACK, color: T.ink, overflowX: 'hidden' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        @keyframes adm-spin    { to { transform: rotate(360deg); } }
        @keyframes adm-shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
        @keyframes adm-fade-in { from{opacity:0;transform:translateY(4px)} to{opacity:1;transform:none} }
        .adm-fade-in { animation: adm-fade-in 0.32s cubic-bezier(0.22,1,0.36,1) both; }
        .adm-row { transition: background 0.15s ease; }
        .adm-row:hover td { background: #f9fafb !important; }
      `}</style>

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      {/* Modals */}
      <ConfirmModal open={rejectModal.open} title="Reject Quotation" message="Provide a reason for rejecting this quotation." confirmLabel="Reject" danger onConfirm={handleReject.confirm} onCancel={handleReject.close} loading={false}>
        <textarea value={rejectModal.reason} onChange={(e) => setRejectModal(p => ({ ...p, reason: e.target.value }))} rows={4} placeholder="Enter rejection reason…" autoFocus style={{ width: '100%', padding: '0.75rem', border: `1.5px solid ${T.line}`, borderRadius: T.radiusSm, fontSize: '0.875rem', fontFamily: FONT_STACK, marginBottom: '0.5rem', resize: 'vertical', outline: 'none', color: T.ink }} />
      </ConfirmModal>
      <ConfirmModal open={deleteModal.open} title="Delete Quotation" message="This action cannot be undone. The quotation will be permanently removed." confirmLabel="Delete" danger onConfirm={handleDelete.confirm} onCancel={handleDelete.close} loading={isActionLoading(deleteModal.id, 'delete')} />
      <AwardModal open={awardModal.open} quotation={awardModal.quotation} onConfirm={handleAward.confirm} onCancel={handleAward.close} loading={awardModal.busy || isActionLoading(awardModal.quotation?._id, 'award')} />

      {/* ── HEADER ── */}
      <div style={{ backgroundColor: T.ink, padding: isMobile ? '0.75rem 1rem' : '0 2rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: 64, position: 'sticky', top: 0, zIndex: 50, flexWrap: 'wrap', gap: '0.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: isMobile ? '100%' : 'auto' }}>
          <div>
            <div style={{ fontSize: isMobile ? '1rem' : '1.05rem', fontWeight: 700, color: '#fff', letterSpacing: '-0.01em', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981', display: 'inline-block' }} />
              Admin Dashboard
            </div>
            {!isMobile && <div style={{ marginTop: 2 }}><CompanyCurrencyDisplay /></div>}
          </div>
          {isMobile && <button onClick={() => setUiState(p => ({ ...p, mobileMenuOpen: !p.mobileMenuOpen }))} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: 8, padding: '0.4rem 0.7rem', color: 'white', cursor: 'pointer' }}><Menu size={20} /></button>}
        </div>

        {isMobile && <CompanyCurrencyDisplay />}

        <div style={{ ...(isMobile && !uiState.mobileMenuOpen ? { display: 'none' } : { display: 'flex' }), gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap', width: isMobile ? '100%' : 'auto', justifyContent: isMobile ? 'center' : 'flex-end' }}>
          <CompanyCurrencySelector variant="compact" />
          <button onClick={() => onNavigate?.('customers')} style={headerBtn('soft')}><Users size={isMobile ? 12 : 14} /> Customers</button>

          {/* Export Excel with dropdown */}
          <div style={{ position: 'relative' }}>
            <button onClick={() => setExportFilters(p => ({ ...p, showFilters: !p.showFilters }))} disabled={isExporting} style={{ ...headerBtn('soft'), gap: '0.4rem' }}>
              <Download size={isMobile ? 12 : 14} /> Export {exportFilters.showFilters ? '▲' : '▼'}
            </button>
            {exportFilters.showFilters && (
              <div style={{ position: isMobile ? 'fixed' : 'absolute', ...(isMobile ? { bottom: 0, left: 0, right: 0, borderRadius: '16px 16px 0 0' } : { top: '100%', right: 0, minWidth: 300, borderRadius: T.radius, marginTop: 8 }), backgroundColor: T.surface, border: `1px solid ${T.line}`, boxShadow: T.shadow, padding: '1rem', zIndex: 200 }}>
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: T.ink, marginBottom: '0.5rem' }}>Date Range</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <input type="date" value={exportFilters.fromDate} onChange={(e) => setExportFilters(p => ({ ...p, fromDate: e.target.value }))} style={{ flex: 1, padding: '0.5rem', border: `1px solid ${T.line}`, borderRadius: T.radiusSm, fontSize: '0.75rem', outline: 'none', fontFamily: FONT_STACK }} />
                    <span style={{ color: T.inkSoft, fontSize: '0.75rem' }}>to</span>
                    <input type="date" value={exportFilters.toDate} onChange={(e) => setExportFilters(p => ({ ...p, toDate: e.target.value }))} style={{ flex: 1, padding: '0.5rem', border: `1px solid ${T.line}`, borderRadius: T.radiusSm, fontSize: '0.75rem', outline: 'none', fontFamily: FONT_STACK }} />
                  </div>
                </div>
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: T.ink, marginBottom: '0.5rem' }}>Status</label>
                  <select value={exportFilters.status} onChange={(e) => setExportFilters(p => ({ ...p, status: e.target.value }))} style={{ width: '100%', padding: '0.5rem', border: `1px solid ${T.line}`, borderRadius: T.radiusSm, fontSize: '0.75rem', outline: 'none', backgroundColor: T.surface, fontFamily: FONT_STACK }}>
                    <option value="all">All Statuses</option>
                    <option value="pending">Pending</option>
                    <option value="ops_approved">Awaiting Admin</option>
                    <option value="ops_rejected">Returned by Ops</option>
                    <option value="approved">Approved</option>
                    <option value="rejected">Rejected</option>
                    <option value="awarded">Awarded</option>
                  </select>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                  <button onClick={() => setExportFilters({ showFilters: false, fromDate: '', toDate: '', status: 'all' })} style={{ padding: '0.4rem 0.8rem', background: T.canvas, border: `1px solid ${T.line}`, borderRadius: T.radiusSm, fontSize: '0.75rem', cursor: 'pointer', fontFamily: FONT_STACK, color: T.inkSoft }}>Reset</button>
                  <button onClick={handleExportToExcel} style={{ padding: '0.4rem 0.8rem', background: '#10b981', color: '#fff', border: 'none', borderRadius: T.radiusSm, fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', fontFamily: FONT_STACK }}>Export Now</button>
                </div>
              </div>
            )}
          </div>

          <button onClick={() => onNavigate?.('addQuotation')} style={headerBtn('green')}><FileText size={isMobile ? 12 : 14} /> {isMobile ? 'New' : 'New Quotation'}</button>
          <button onClick={() => onNavigate?.('userStats')} style={headerBtn('soft')}><TrendingUp size={isMobile ? 12 : 14} /> {!isMobile && 'User Stats'}</button>
          <button onClick={() => onNavigate?.('users')} style={headerBtn('soft')}><Users size={isMobile ? 12 : 14} /> {!isMobile && 'Users'}</button>
          {/* <button onClick={() => onNavigate?.('companies')} style={headerBtn('soft')}><Building2 size={isMobile ? 12 : 14} /> {!isMobile && 'Companies'}</button> */}
          <button onClick={handleLogout} style={headerBtn('ghost')}><LogOut size={isMobile ? 12 : 15} /> {!isMobile && 'Logout'}</button>
        </div>
      </div>

      {/* ── MAIN CONTENT ── */}
      <div style={{ maxWidth: 1400, margin: '0 auto', padding: isMobile ? '1.25rem 1rem' : '2.5rem 2rem' }}>

        {/* Error banner */}
        {loadError && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#fdeceb', border: '1px solid #f8d6d2', borderRadius: 12, padding: '0.875rem 1rem', marginBottom: '1.5rem', fontSize: '0.875rem', color: '#c1352b', flexWrap: 'wrap', gap: '0.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><AlertCircle size={16} /> {loadError}</div>
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
              <button onClick={() => clearError()} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#c1352b', padding: 0 }}><X size={14} /></button>
              <button onClick={handleRefresh} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#c1352b', display: 'flex', alignItems: 'center', gap: '0.3rem', fontWeight: 600, fontSize: '0.8rem' }}><RefreshCw size={13} /> Retry</button>
            </div>
          </div>
        )}

        {/* ── STATS ── */}
        {showStatsShimmer ? (
          <ShimmerStatsCard isMobile={isMobile} />
        ) : (
          <div className="adm-fade-in" style={{ marginBottom: '1.75rem' }}>
            {isMobile ? (
              <CompactStatsCard
                totalRevenue={totalAwardedValue}
                quotationsCount={totalQuotations}
                customersCount={totalCustomers}
                selectedCurrency={selectedCurrency}
                statusCounts={{ pending: actionRequired, in_review: 0, approved, awarded, returned: rejected }}
                loading={false}
              />
            ) : (
              <AdminDesktopStatsGrid
                totalRevenue={totalAwardedValue}
                quotationsCount={totalQuotations}
                customersCount={totalCustomers}
                selectedCurrency={selectedCurrency}
                statusCounts={statusCounts}
                loading={false}
                actionRequired={actionRequired}
                approved={approved}
                awarded={awarded}
                rejected={rejected}
                totalAwardedValue={totalAwardedValue}
                conversionDetails={conversionDetails}
                conversionRate={conversionRate}
              />
            )}
          </div>
        )}

        {/* ── TABLE CARD ── */}
        <div style={{ backgroundColor: T.surface, borderRadius: T.radius, boxShadow: T.shadow, overflow: 'visible', position: 'relative', border: `1px solid ${T.line}` }}>

          {/* Toolbar */}
          <div style={{ padding: isMobile ? '0.9rem 1rem' : '1.25rem 1.5rem', borderBottom: `1px solid ${T.lineSoft}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.9rem' }}>
            {/* Tabs */}
            <div style={{ display: 'flex', gap: '0.15rem', padding: '0.3rem', backgroundColor: T.canvas, borderRadius: 12, overflowX: 'auto', WebkitOverflowScrolling: 'touch', width: '100%', border: `1px solid ${T.line}` }}>
              {TABS.map(({ key, label, Icon: I, count }) => {
                const active   = activeTab === key;
                const isAction = key === 'ops_approved';
                const isRej    = key === 'rejected';
                const hasAlert = (isAction || isRej) && count > 0;
                const alertColor = isAction ? '#b58a3c' : '#a85563';
                return (
                  <button key={key} onClick={() => handleTabChange(key)} style={{ padding: isMobile ? '0.35rem 0.65rem' : '0.45rem 0.9rem', borderRadius: 9, border: 'none', cursor: 'pointer', fontSize: isMobile ? '0.72rem' : '0.8rem', fontWeight: active ? 600 : 500, display: 'flex', alignItems: 'center', gap: '0.4rem', backgroundColor: active ? T.surface : 'transparent', color: active ? T.ink : T.inkSoft, boxShadow: active ? '0 1px 3px rgba(20,22,24,0.08)' : 'none', whiteSpace: 'nowrap', transition: 'all 0.15s ease', fontFamily: FONT_STACK }}>
                    <I size={isMobile ? 11 : 13} />
                    {!isMobile && label}
                    <span style={{ backgroundColor: hasAlert ? alertColor : active ? T.ink : T.line, color: hasAlert || active ? '#fff' : T.inkSoft, borderRadius: 999, padding: isMobile ? '1px 5px' : '1px 7px', fontSize: isMobile ? '0.6rem' : '0.66rem', fontWeight: 700, minWidth: 16, textAlign: 'center' }}>
                      {showStatsShimmer ? '…' : count}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Search + actions */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', width: isMobile ? '100%' : 'auto' }}>
              <button onClick={handleRefresh} disabled={isRefreshing} style={{ width: isMobile ? 38 : 36, height: isMobile ? 38 : 36, border: `1px solid ${T.line}`, borderRadius: T.radiusSm, background: T.canvas, cursor: isRefreshing ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: isRefreshing ? 0.5 : 1 }}>
                <RefreshCw size={14} color={T.inkSoft} style={isRefreshing ? { animation: 'adm-spin 1s linear infinite' } : {}} />
              </button>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', backgroundColor: T.canvas, border: `1px solid ${T.line}`, borderRadius: T.radiusSm, padding: isMobile ? '0.5rem 0.8rem' : '0.45rem 0.8rem', flex: isMobile ? 1 : 'auto' }}>
                <Search size={14} color={T.inkFaint} />
                <input ref={searchRef} style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: '0.875rem', color: T.ink, width: isMobile ? '100%' : 210, fontFamily: FONT_STACK }} placeholder="Search…  /" value={searchInput} onChange={handleSearchChange} disabled={showTableShimmer} />
                {searchInput && <button onClick={clearSearch} style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.inkFaint, padding: 0 }}><X size={13} /></button>}
              </div>
              <ViewToggle view={uiState.viewMode} onViewChange={(v) => setUiState(p => ({ ...p, viewMode: v }))} isMobile={isMobile} />
            </div>
          </div>

          {/* Refresh overlay */}
          {isRefreshing && !showTableShimmer && (
            <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(255,255,255,0.80)', zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: T.radius, backdropFilter: 'blur(1.5px)' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem', background: T.surface, padding: isMobile ? '1rem 1.5rem' : '1.25rem 2rem', borderRadius: 14, boxShadow: T.shadow, border: `1px solid ${T.line}` }}>
                <RefreshCw size={isMobile ? 20 : 24} color={T.accent} style={{ animation: 'adm-spin 0.8s linear infinite' }} />
                <span style={{ fontSize: isMobile ? '0.75rem' : '0.82rem', color: T.accentInk, fontWeight: 600 }}>Refreshing…</span>
              </div>
            </div>
          )}

          {/* Content */}
          {showTableShimmer ? (
            <div style={{ overflowX: 'auto', width: '100%', WebkitOverflowScrolling: 'touch' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1100 }}>
                <thead>{['Quote #','Customer','Project','Query Date','Submitted','Expiry','Status','Created By','Total','Actions'].map(h => <th key={h} style={thStyle}>{h}</th>)}</thead>
                <tbody>{[0,1,2,3,4,5,6].map(i => <SkeletonRow key={i} />)}</tbody>
              </table>
            </div>
          ) : (
            <div className="adm-fade-in">
              {showEmptyState ? (
                <div style={{ textAlign: 'center', padding: isMobile ? '3.5rem 1rem' : '5rem 2rem', color: T.inkFaint }}>
                  <div style={{ width: 64, height: 64, borderRadius: '50%', background: T.accentSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.25rem' }}>
                    <FileText size={28} color={T.accent} />
                  </div>
                  <p style={{ fontWeight: 600, fontSize: isMobile ? '0.95rem' : '1.05rem', color: T.ink, marginBottom: '0.4rem' }}>{filters.search ? `No results for "${filters.search}"` : 'No quotations found'}</p>
                  {filters.search && <button onClick={clearSearch} style={{ background: T.accent, color: '#fff', border: 'none', borderRadius: T.radiusSm, padding: '0.6rem 1.1rem', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer', fontFamily: FONT_STACK }}>Clear search</button>}
                </div>
              ) : (
                <>
                  {(isMobile || uiState.viewMode === 'card') ? (
                    <div style={{ padding: isMobile ? '1rem' : '1.5rem', display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2,1fr)', gap: isMobile ? '0.75rem' : '1rem' }}>
                      {safeQ.map((q) => (
                        <AdminQuotationCard key={q._id} quotation={q} selectedCurrency={selectedCurrency} onView={handleView} onApprove={handleApprove} onReject={handleReject.open} onDownload={handleDownload} onDelete={handleDelete.open} onAward={handleAward.open} isExporting={exportingId === q._id} isApproving={isActionLoading(q._id, 'approve')} isRejecting={isActionLoading(q._id, 'reject')} isAwarding={isActionLoading(q._id, 'award')} />
                      ))}
                    </div>
                  ) : (
                    <div style={{ overflowX: 'auto', width: '100%', WebkitOverflowScrolling: 'touch' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1100 }}>
                        <thead>
                          <tr>
                            <SortHeader label="Quote #"     field="quotationNumber" sort={{ field: filters.sortBy, dir: filters.sortDir }} onSort={handleSort} />
                            <SortHeader label="Customer"    field="customer"        sort={{ field: filters.sortBy, dir: filters.sortDir }} onSort={handleSort} />
                            <th style={thStyle}>Project Name</th>
                            <SortHeader label="Query Date"  field="queryDate"       sort={{ field: filters.sortBy, dir: filters.sortDir }} onSort={handleSort} align="center" />
                            <SortHeader label="Submitted"   field="date"            sort={{ field: filters.sortBy, dir: filters.sortDir }} onSort={handleSort} />
                            <SortHeader label="Expiry"      field="expiryDate"      sort={{ field: filters.sortBy, dir: filters.sortDir }} onSort={handleSort} />
                            <SortHeader label="Status"      field="status"          sort={{ field: filters.sortBy, dir: filters.sortDir }} onSort={handleSort} />
                            <SortHeader label="Created By"  field="createdby"       sort={{ field: filters.sortBy, dir: filters.sortDir }} onSort={handleSort} />
                            <SortHeader label="Total"       field="total"           sort={{ field: filters.sortBy, dir: filters.sortDir }} onSort={handleSort} align="right" />
                            <th style={{ ...thStyle, textAlign: 'center' }}>Actions</th>
                          </tr>
                        </thead>
                        <tbody>{safeQ.map(renderTableRow)}</tbody>
                      </table>
                    </div>
                  )}

                  <PaginationBar
                    total={quotationsPagination?.total || 0}
                    page={quotationsPagination?.page || currentPage}
                    limit={currentLimit}
                    totalPages={quotationsPagination?.totalPages || 1}
                    onPageChange={goToPage}
                    onLimitChange={changeLimit}
                  />
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Loading overlays */}
      {isSwitchingCompany && <SimpleLoadingOverlay type="processing" message="Switching company…" />}
      {refreshProgress > 0 && <SimpleLoadingOverlay type="processing" message={refreshMessage} />}
      {pdfProgress > 0 && <SimpleLoadingOverlay type="pdf" message={pdfMessage} />}
    </div>
  );
}