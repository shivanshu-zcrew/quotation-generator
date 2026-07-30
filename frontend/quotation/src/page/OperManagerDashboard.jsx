import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Eye, Download, Clock, CheckCircle, XCircle,
  FileText, Search, X, Check, LogOut,
  AlertCircle, RefreshCw, ChevronLeft, ChevronRight,
  Shield, Award, Ban, Users, Menu, TrendingDown,
} from 'lucide-react';

import { useOpsStats } from '../hooks/customHooks';
import { useAppStore, useCompanyQuotations } from '../services/store';
import { downloadQuotationPDF } from '../utils/pdfGenerator';
import { CompanyCurrencySelector, CompanyCurrencyDisplay, useCompanyCurrency } from '../components/CompanyCurrencySelector';
import useToast, { ToastContainer } from '../hooks/useToast';

import {
  StatusBadge,
  RejectionNote,
  StatCard,
  ActionBtn,
  SortHeader,
  SkeletonRow,
  ConfirmModal,
} from '../components/SharedComponents';

import CompactStatsCard from '../components/HomePageComponent/CompactStatsCard';
import DesktopStatsGrid from '../components/HomePageComponent/DesktopStatsGrid';
import ViewToggle from '../components/HomePageComponent/ViewToggle';

import { DEBOUNCE_MS, PAGE_SIZE_OPTIONS } from '../utils/constants';
import { fmtCurrency, fmtDate, isExpired, isExpiringSoon } from '../utils/formatters';
import AwardModal from '../components/AwardModal';
import QuotationFilterBar from '../components/QuotationFilterBar';

// Helper function to format amount without currency symbol
const formatAmount = (amount) => {
  return (amount || 0).toLocaleString('en-AE', { 
    minimumFractionDigits: 2, 
    maximumFractionDigits: 2 
  });
};

// ============================================================
// DESIGN TOKENS — identical to HomeScreen
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
// STATUS CONFIG — ops-specific states
// ============================================================
const STATUS_CONFIG = {
  pending:      { label: 'Pending',          bg: '#fff7e6', color: '#b45309', borderColor: '#fde9c8', icon: '○' },
  pending_admin:{ label: 'Pending',          bg: '#fff7e6', color: '#b45309', borderColor: '#fde9c8', icon: '○' },
  ops_approved: { label: 'Awaiting Admin',   bg: '#e6f0fb', color: '#1d63c4', borderColor: '#c9defa', icon: '◔' },
  approved:     { label: 'Approved',         bg: '#e3f5ee', color: '#0f7a52', borderColor: '#c3ebda', icon: '●' },
  awarded:      { label: 'Awarded',          bg: '#efe9fb', color: '#6d28d9', borderColor: '#dccffa', icon: '◆' },
  not_awarded:  { label: 'Not Awarded',      bg: '#eef1f4', color: '#52606d', borderColor: '#dde3e8', icon: '—' },
  ops_rejected: { label: 'Returned by Me',   bg: '#fdeaf0', color: '#be185d', borderColor: '#f8d2e0', icon: '△' },
  rejected:     { label: 'Rejected by Admin',bg: '#fdeceb', color: '#c1352b', borderColor: '#f8d6d2', icon: '✕' },
  cancelled:    { label: 'Cancelled',         bg: '#fce7f3', color: '#9d174d', borderColor: '#fbcfe8', icon: '⊗' },
  amended:      { label: 'Amended',           bg: '#ffedd5', color: '#9a3412', borderColor: '#fed7aa', icon: '✎' },
};

const EnhancedStatusBadge = React.memo(({ status, quotation }) => {
  const config = STATUS_CONFIG[status] || {
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

  if (isExp && status === 'pending') {
    return (
      <span style={{ ...base, backgroundColor: '#fdeceb', color: '#c1352b', border: '1px solid #f8d6d2' }} title="Expired">
        <span style={{ opacity: 0.8 }}>✕</span> Expired
      </span>
    );
  }
  if (isExpS && status === 'pending') {
    return (
      <span style={{ ...base, backgroundColor: '#fff7e6', color: '#b45309', border: '1px solid #fde9c8' }} title="Expiring soon">
        <span style={{ opacity: 0.8 }}>◷</span> Expiring Soon
      </span>
    );
  }

  return (
    <span style={{ ...base, backgroundColor: config.bg, color: config.color, border: `1px solid ${config.borderColor}`, transition: 'all 0.2s ease' }} title={config.label}>
      <span style={{ fontSize: '0.6rem', opacity: 0.85 }}>{config.icon}</span>
      {config.label}
    </span>
  );
});

// ============================================================
// STATS SHIMMER COMPONENT
// ============================================================
const StatsShimmer = React.memo(({ isMobile }) => {
  const cardStyle = {
    background: T.surface,
    borderRadius: T.radius,
    padding: '1.25rem',
    border: `1px solid ${T.line}`,
    boxShadow: T.shadow,
  };

  const shimmerLine = {
    background: `linear-gradient(90deg, ${T.lineSoft} 25%, ${T.line} 50%, ${T.lineSoft} 75%)`,
    backgroundSize: '200% 100%',
    animation: 'ops-shimmer 1.4s ease infinite',
    borderRadius: 6,
  };

  if (isMobile) {
    return (
      <div style={{ marginBottom: '1.5rem' }}>
        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <div style={{ ...shimmerLine, width: 100, height: 18 }} />
            <div style={{ ...shimmerLine, width: 40, height: 40, borderRadius: '50%' }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: '0.75rem' }}>
            {[1, 2, 3, 4].map((i) => (
              <div key={i}>
                <div style={{ ...shimmerLine, width: 60, height: 11, marginBottom: 8 }} />
                <div style={{ ...shimmerLine, width: 80, height: 22 }} />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ marginBottom: '1.5rem' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '1rem' }}>
        {[1, 2, 3, 4].map((i) => (
          <div key={i} style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ ...shimmerLine, width: 80, height: 11 }} />
                <div style={{ ...shimmerLine, width: 100, height: 26, marginTop: 8 }} />
              </div>
              <div style={{ ...shimmerLine, width: 44, height: 44, borderRadius: 12 }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
});

// ============================================================
// PAGINATION BAR — Responsive with mobile optimization
// ============================================================
const PageBtn = React.memo(({ n, current, onPage }) => (
  <button
    onClick={() => onPage(n)}
    style={{
      minWidth: 34,
      height: 34,
      borderRadius: 8,
      border: n === current ? 'none' : `1px solid ${T.line}`,
      backgroundColor: n === current ? T.accent : T.surface,
      color: n === current ? '#fff' : T.inkSoft,
      fontWeight: n === current ? 600 : 500,
      fontSize: '0.8rem',
      cursor: 'pointer',
      transition: 'all 0.2s ease',
      boxShadow: n === current ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
    }}
    onMouseEnter={(e) => {
      if (n !== current) {
        e.currentTarget.style.backgroundColor = T.accentSoft;
        e.currentTarget.style.borderColor = T.accent;
        e.currentTarget.style.color = T.accentInk;
      }
    }}
    onMouseLeave={(e) => {
      if (n !== current) {
        e.currentTarget.style.backgroundColor = T.surface;
        e.currentTarget.style.borderColor = T.line;
        e.currentTarget.style.color = T.inkSoft;
      }
    }}
  >
    {n}
  </button>
));

const PaginationBar = React.memo(
  ({ total, page, limit, totalPages, onPageChange, onLimitChange }) => {
    const [isNarrow, setIsNarrow] = React.useState(false);
    
    React.useEffect(() => {
      const checkWidth = () => {
        setIsNarrow(window.innerWidth <= 600);
      };
      checkWidth();
      window.addEventListener('resize', checkWidth);
      return () => window.removeEventListener('resize', checkWidth);
    }, []);
    
    const windowSize = isNarrow ? 1 : 2;

    const pages = React.useMemo(() => {
      const p = [];
      const startPage = Math.max(1, page - windowSize);
      const endPage = Math.min(totalPages, page + windowSize);
      for (let i = startPage; i <= endPage; i++) p.push(i);
      return p;
    }, [page, totalPages, windowSize]);

    if (totalPages <= 1 && total <= PAGE_SIZE_OPTIONS[0]) return null;

    const start = (page - 1) * limit + 1;
    const end = Math.min(page * limit, total);

    const showStartEllipsis = pages[0] > 1;
    const showEndEllipsis = pages[pages.length - 1] < totalPages;

    const arrowBtn = (disabled) => ({
      width: 34,
      height: 34,
      border: `1px solid ${T.line}`,
      borderRadius: 8,
      background: T.surface,
      cursor: disabled ? "not-allowed" : "pointer",
      opacity: disabled ? 0.4 : 1,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      color: T.inkSoft,
      flexShrink: 0,
      transition: 'all 0.2s ease',
    });

    return (
      <div
        style={{
          padding: isNarrow ? "0.8rem 1rem" : "0.9rem 1.5rem",
          borderTop: `1px solid ${T.lineSoft}`,
          display: "flex",
          alignItems: "center",
          justifyContent: isNarrow ? "center" : "space-between",
          flexWrap: "wrap",
          gap: "0.75rem",
          backgroundColor: T.surface,
          borderBottomLeftRadius: T.radius,
          borderBottomRightRadius: T.radius,
        }}
      >
        {!isNarrow && (
          <span style={{ fontSize: "0.8rem", color: T.inkSoft }}>
            Showing{" "}
            <strong style={{ color: T.ink, fontWeight: 600 }}>{start}–{end}</strong> of{" "}
            <strong style={{ color: T.ink, fontWeight: 600 }}>{total}</strong>
          </span>
        )}

        <div style={{ 
          display: "flex", 
          alignItems: "center", 
          gap: "0.5rem", 
          flexWrap: "wrap", 
          justifyContent: "center",
          width: isNarrow ? '100%' : 'auto',
        }}>
          {onLimitChange && PAGE_SIZE_OPTIONS && !isNarrow && (
            <select
              value={limit}
              onChange={(e) => onLimitChange(Number(e.target.value))}
              style={{
                padding: "0.3rem 0.6rem",
                borderRadius: 8,
                border: `1px solid ${T.line}`,
                fontSize: "0.75rem",
                backgroundColor: T.surface,
                color: T.inkSoft,
                cursor: "pointer",
                fontFamily: FONT_STACK,
                outline: 'none',
              }}
            >
              {PAGE_SIZE_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s} per page
                </option>
              ))}
            </select>
          )}

          <button
            onClick={() => onPageChange(Math.max(1, page - 1))}
            disabled={page === 1}
            style={arrowBtn(page === 1)}
            onMouseEnter={(e) => {
              if (page !== 1) {
                e.currentTarget.style.backgroundColor = T.accentSoft;
                e.currentTarget.style.borderColor = T.accent;
              }
            }}
            onMouseLeave={(e) => {
              if (page !== 1) {
                e.currentTarget.style.backgroundColor = T.surface;
                e.currentTarget.style.borderColor = T.line;
              }
            }}
          >
            <ChevronLeft size={14} />
          </button>

          {showStartEllipsis && (
            <>
              <PageBtn n={1} current={page} onPage={onPageChange} />
              {pages[0] > 2 && (
                <span style={{ color: T.inkFaint, fontSize: "0.8rem", padding: "0 2px" }}>…</span>
              )}
            </>
          )}

          {pages.map((n) => (
            <PageBtn key={n} n={n} current={page} onPage={onPageChange} />
          ))}

          {showEndEllipsis && (
            <>
              {pages[pages.length - 1] < totalPages - 1 && (
                <span style={{ color: T.inkFaint, fontSize: "0.8rem", padding: "0 2px" }}>…</span>
              )}
              <PageBtn n={totalPages} current={page} onPage={onPageChange} />
            </>
          )}

          <button
            onClick={() => onPageChange(Math.min(totalPages, page + 1))}
            disabled={page === totalPages}
            style={arrowBtn(page === totalPages)}
            onMouseEnter={(e) => {
              if (page !== totalPages) {
                e.currentTarget.style.backgroundColor = T.accentSoft;
                e.currentTarget.style.borderColor = T.accent;
              }
            }}
            onMouseLeave={(e) => {
              if (page !== totalPages) {
                e.currentTarget.style.backgroundColor = T.surface;
                e.currentTarget.style.borderColor = T.line;
              }
            }}
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </div>
    );
  }
);

// ============================================================
// EXPIRY BADGE
// ============================================================
const ExpiryBadge = React.memo(({ type }) => {
  const cfg = type === 'expired'
    ? { bg: '#fdeceb', color: '#c1352b', border: '#f8d6d2', label: 'Expired' }
    : { bg: '#fff7e6', color: '#b45309', border: '#fde9c8', label: 'Expiring' };
  return (
    <span style={{ fontSize: '0.6rem', fontWeight: 600, color: cfg.color, background: cfg.bg, padding: '1px 6px', borderRadius: 999, border: `1px solid ${cfg.border}` }}>
      {cfg.label}
    </span>
  );
});

// ============================================================
// OPS MOBILE CARD — with updated currency formatting
// ============================================================
const OpsQuotationCard = React.memo(({ quotation, selectedCurrency, onView, onApprove, onReject, onDownload, onAward, isDownloading, isApproving, isRejecting, isAwarding }) => {
  const expired  = isExpired(quotation.expiryDate);
  const expiring = !expired && isExpiringSoon(quotation.expiryDate);
  const canAct   = quotation.status === 'pending';
  const canAward = quotation.status === 'approved' && (quotation.createdBy?.role === 'ops_manager' || quotation.createdBySnapshot?.role === 'ops_manager');
  const quoteCurrency = quotation.currency?.code || selectedCurrency;

  return (
    <div style={{ background: T.surface, borderRadius: T.radius, padding: '1rem 1.1rem', border: `1px solid ${T.line}`, boxShadow: T.shadow, fontFamily: FONT_STACK }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.65rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 700, color: T.ink, fontFamily: "'Inter', monospace", fontSize: '0.8rem' }}>{quotation.quotationNumber || '—'}</span>
          <EnhancedStatusBadge status={quotation.status} quotation={quotation} />
          {quotation.revisedFrom && <span style={{ fontSize: '0.6rem', fontWeight: 700, color: '#6d28d9', background: '#f5f3ff', padding: '1px 6px', borderRadius: 999, border: '1px solid #c4b5fd' }}>Rev</span>}
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
        <div style={{ fontWeight: 600, color: T.ink, fontSize: '0.875rem' }}>
          {quotation.customerSnapshot?.name || quotation.customer || quotation.customerId?.name || 'N/A'}
        </div>
        {quotation.contact && <div style={{ fontSize: '0.72rem', color: T.inkFaint, marginTop: 2 }}>{quotation.contact}</div>}
        <RejectionNote quotation={quotation} />
      </div>

      {quotation.projectName && (
        <div style={{ fontSize: '0.8rem', color: T.inkSoft, marginBottom: '0.5rem' }}>{quotation.projectName}</div>
      )}

      <div style={{ display: 'flex', gap: '1rem', marginBottom: '0.6rem', fontSize: '0.72rem', color: T.inkSoft, flexWrap: 'wrap' }}>
        <span>Submitted: {fmtDate(quotation.date)}</span>
        <span style={{ color: expired ? '#c1352b' : expiring ? '#b45309' : T.inkSoft, fontWeight: expired || expiring ? 600 : 400 }}>Expiry: {fmtDate(quotation.expiryDate)}</span>
        <span>Items: {quotation.items?.length ?? 0}</span>
      </div>

      <div style={{ fontSize: '0.7rem', color: T.inkFaint, marginBottom: '0.75rem' }}>
        Created by: {quotation.createdBy?.name || '—'}
      </div>

      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', borderTop: `1px solid ${T.lineSoft}`, paddingTop: '0.75rem' }}>
        <ActionBtn bg={T.accentSoft} color={T.accentInk} onClick={() => onView(quotation._id)} icon={Eye} label="View" size="small" />
        {canAct && (
          <>
            <ActionBtn bg="#e3f5ee" color="#0f7a52" onClick={() => onApprove(quotation)} icon={Check} label="Approve" size="small" disabled={isApproving} />
            <ActionBtn bg="#fdeceb" color="#c1352b" onClick={() => onReject(quotation)} icon={X} label="Reject" size="small" disabled={isRejecting} />
          </>
        )}
        {canAward && (
          <ActionBtn bg="#efe9fb" color="#6d28d9" onClick={() => onAward(quotation)} icon={Award} label="Award" size="small" disabled={isAwarding} />
        )}
      </div>
    </div>
  );
});
OpsQuotationCard.displayName = 'OpsQuotationCard';

// ============================================================
// RESPONSIVE HOOK
// ============================================================
const useMediaQuery = (query) => {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(query).matches : false
  );
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia(query);
    const h = (e) => setMatches(e.matches);
    mq.addEventListener('change', h);
    return () => mq.removeEventListener('change', h);
  }, [query]);
  return matches;
};

// ============================================================
// MAIN DASHBOARD
// ============================================================
export default function OpsDashboard({ onViewQuotation }) {
  const navigate = useNavigate();
  const isMobile = useMediaQuery('(max-width: 768px)');
  const isTablet = useMediaQuery('(max-width: 1100px)');

  const [uiState, setUiState] = useState({ mobileMenuOpen: false, viewMode: 'table' });
  const [awardModal, setAwardModal] = useState({ open: false, quotation: null, loading: false });
  const [forceHideLoading, setForceHideLoading] = useState(false);
  const loadingTimeoutRef = useRef(null);

  // ── Store ─────────────────────────────────────────────────
  const {
    quotations: companyQuotations,
    pagination,
    quotationCounts,
    refresh: refreshCompanyQuotations,
    loading: quotationsLoading,
    goToPage,
    changeLimit,
    currentPage,
    currentLimit,
    quotationsInitialized,
  } = useCompanyQuotations();

  const user               = useAppStore((s) => s.user);
  const awardQuotation     = useAppStore((s) => s.awardQuotation);
  const opsApproveQuotation= useAppStore((s) => s.opsApproveQuotation);
  const opsRejectQuotation = useAppStore((s) => s.opsRejectQuotation);
  const handleLogout       = useAppStore((s) => s.handleLogout);
  const loadError          = useAppStore((s) => s.loadError);
  const clearError         = useAppStore((s) => s.clearError);
  const selectedCompany    = useAppStore((s) => s.selectedCompany);

  const {
    refresh: refreshStats,
    totalQuotations,
    pendingReview, 
    awaitingAdmin, 
    returnedByMe, 
    totalValue, 
    tabCounts, 
    approved, 
    awarded,
    totalCustomers
  } = useOpsStats();
  
  const { selectedCurrency } = useCompanyCurrency();
  const { toasts, addToast, dismissToast } = useToast();

  const searchRef   = useRef(null);
  const searchTimer = useRef(null);
  const isMountedRef      = useRef(true);
  const initialLoadDone   = useRef(false);
  const refreshInProgress = useRef(false);

  // ── Table state ───────────────────────────────────────────
  const [activeTab,    setActiveTab]    = useState('all');
  const [searchInput,  setSearchInput]  = useState('');
  const [search,       setSearch]       = useState('');
  const [sort,         setSort]         = useState({ field: 'createdAt', dir: 'desc' });
  const [dateFilters, setDateFilters] = useState({ fromDate: '', toDate: '' });
  const [loadingIds,   setLoadingIds]   = useState({});
  const [downloadLoadingId, setDownloadLoadingId] = useState(null);
  const [rejectTarget, setRejectTarget] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [approveTarget, setApproveTarget] = useState(null);

  // Latch refs — prevent shimmer flashing on re-renders
  const statsLatchRef = useRef(false);
  const tableLatchRef = useRef(false);

  const statsReady = quotationsInitialized;
  const tableReady = quotationsInitialized;

  if (statsReady) statsLatchRef.current = true;
  if (tableReady) tableLatchRef.current = true;

  const prevCompanyRef = useRef(selectedCompany);
  useEffect(() => {
    const prev = prevCompanyRef.current;
    prevCompanyRef.current = selectedCompany;
    if (prev && selectedCompany && prev !== selectedCompany) {
      statsLatchRef.current = false;
      tableLatchRef.current = false;
    }
  }, [selectedCompany]);

  const showStatsShimmer = !statsLatchRef.current;
  const showTableShimmer = !tableLatchRef.current && !tableReady;

  const safeQ = useMemo(() => Array.isArray(companyQuotations) ? companyQuotations : [], [companyQuotations]);
  const totalFiltered = pagination?.total    || 0;
  const totalPages    = pagination?.totalPages || 1;

  const tabCountsResolved = useMemo(() => {
    // quotationCounts comes from the list API and reflects the current filter/search,
    // so it's the most accurate source. Fall back to stats-based tabCounts when not yet loaded.
    if (quotationCounts && Object.keys(quotationCounts).length > 0) return quotationCounts;
    if (tabCounts && Object.values(tabCounts).some(v => v > 0)) return tabCounts;
    return {
      all:          pagination?.total || 0,
      pending:      0,
      ops_approved: 0,
      ops_rejected: 0,
      rejected:     0,
      approved:     0,
      awarded:      0,
      not_awarded:  0,
      cancelled:    0,
      amended:      0,
    };
  }, [quotationCounts, pagination, tabCounts]);

  // ── Responsive defaults ───────────────────────────────────
  useEffect(() => {
    const newLimit = isMobile ? 10 : 20;
    if (currentLimit !== newLimit) changeLimit(newLimit);
  }, [isMobile, currentLimit, changeLimit]);

  useEffect(() => {
    if (isMobile || isTablet) setUiState(p => ({ ...p, viewMode: 'card' }));
  }, [isMobile, isTablet]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  // ── Load both quotations and stats in parallel ────────────
  useEffect(() => {
    if (!selectedCompany || initialLoadDone.current) return;
    
    const load = async () => {
      if (refreshInProgress.current) return;
      refreshInProgress.current = true;
      
      loadingTimeoutRef.current = setTimeout(() => {
        setForceHideLoading(true);
        initialLoadDone.current = true;
        refreshInProgress.current = false;
      }, 8000);
      
      try {
        await Promise.all([
          refreshCompanyQuotations({ 
            page: 1, 
            limit: isMobile ? 10 : 20, 
            status: undefined, 
            search: '', 
            sortBy: 'createdAt', 
            sortDir: 'desc' 
          }),
          refreshStats()
        ]);
        
        if (isMountedRef.current) { 
          initialLoadDone.current = true; 
          setForceHideLoading(false); 
        }
      } catch (e) {
        console.error('Initial load error:', e);
        if (isMountedRef.current) { 
          initialLoadDone.current = true; 
          setForceHideLoading(true); 
        }
      } finally {
        clearTimeout(loadingTimeoutRef.current);
        refreshInProgress.current = false;
      }
    };
    
    load();
  }, [selectedCompany, refreshCompanyQuotations, refreshStats, isMobile]);

  // ── Op helpers ────────────────────────────────────────────
  const setOp  = useCallback((id, action, val) => setLoadingIds(p => ({ ...p, [`${id}_${action}`]: val })), []);
  const isOp   = useCallback((id, action) => !!loadingIds[`${id}_${action}`], [loadingIds]);

  // ── Handlers ──────────────────────────────────────────────
  const handleSearchChange = useCallback((e) => {
    const val = e.target.value;
    setSearchInput(val);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setSearch(val);
      refreshCompanyQuotations({ page: 1, search: val, status: activeTab === 'all' ? undefined : activeTab, sortBy: sort.field, sortDir: sort.dir });
    }, DEBOUNCE_MS);
  }, [refreshCompanyQuotations, activeTab, sort]);

  const clearSearch = useCallback(() => {
    setSearchInput(''); setSearch('');
    refreshCompanyQuotations({ page: 1, search: '', status: activeTab === 'all' ? undefined : activeTab, sortBy: sort.field, sortDir: sort.dir });
  }, [refreshCompanyQuotations, activeTab, sort]);

  const handleTabChange = useCallback((key) => {
    setActiveTab(key); setSearchInput(''); setSearch('');
    setSort({ field: 'createdAt', dir: 'desc' });
    setUiState(p => ({ ...p, mobileMenuOpen: false }));
    refreshCompanyQuotations({ page: 1, status: key === 'all' ? undefined : key, search: '', sortBy: 'createdAt', sortDir: 'desc' });
  }, [refreshCompanyQuotations]);

  const handleSort = useCallback((field) => {
    const newDir = sort.field === field && sort.dir === 'asc' ? 'desc' : 'asc';
    setSort({ field, dir: newDir });
    refreshCompanyQuotations({ page: 1, sortBy: field, sortDir: newDir, status: activeTab === 'all' ? undefined : activeTab, search });
  }, [refreshCompanyQuotations, activeTab, search, sort]);

  const handleApplyFilters = useCallback(({ fromDate, toDate }) => {
    setDateFilters({ fromDate, toDate });
    refreshCompanyQuotations({ page: 1, fromDate, toDate, status: activeTab === 'all' ? undefined : activeTab, search, sortBy: sort.field, sortDir: sort.dir });
  }, [refreshCompanyQuotations, activeTab, search, sort]);

  const handleRefresh = useCallback(async () => {
    if (refreshInProgress.current) return;
    refreshInProgress.current = true;
    try {
      await Promise.all([
        refreshCompanyQuotations({ page: currentPage, limit: currentLimit, status: activeTab === 'all' ? undefined : activeTab, search, sortBy: sort.field, sortDir: sort.dir }),
        refreshStats(),
      ]);
      addToast('Data refreshed', 'success');
    } catch (err) {
      addToast(err.message || 'Refresh failed', 'error');
    } finally { refreshInProgress.current = false; }
  }, [refreshCompanyQuotations, refreshStats, addToast, currentPage, currentLimit, activeTab, search, sort]);

  const handleApprove = {
    open:    useCallback((q) => setApproveTarget(q), []),
    close:   useCallback(() => setApproveTarget(null), []),
    confirm: useCallback(async () => {
      if (!approveTarget) return;
      const id = approveTarget._id;
      setOp(id, 'approve', true);
      try {
        const result = await opsApproveQuotation(id);
        if (result?.success) {
          addToast('Approved and forwarded to admin', 'success');
          setApproveTarget(null);
          await Promise.all([refreshCompanyQuotations({ page: currentPage, limit: currentLimit, status: activeTab === 'all' ? undefined : activeTab, search, sortBy: sort.field, sortDir: sort.dir }), refreshStats()]);
        } else { addToast(result?.error || 'Failed to approve', 'error'); }
      } catch (e) { addToast(e.message || 'Failed to approve', 'error'); }
      finally { setOp(id, 'approve', false); }
    }, [approveTarget, opsApproveQuotation, addToast, refreshCompanyQuotations, refreshStats, setOp, currentPage, currentLimit, activeTab, search, sort]),
  };

  const handleReject = {
    open:    useCallback((q) => { setRejectTarget(q); setRejectReason(''); }, []),
    close:   useCallback(() => setRejectTarget(null), []),
    confirm: useCallback(async () => {
      if (!rejectTarget || !rejectReason.trim()) return;
      setOp(rejectTarget._id, 'reject', true);
      try {
        const result = await opsRejectQuotation(rejectTarget._id, rejectReason);
        if (result?.success) {
          addToast('Quotation rejected', 'success');
          setRejectTarget(null);
          await Promise.all([refreshCompanyQuotations({ page: currentPage, limit: currentLimit, status: activeTab === 'all' ? undefined : activeTab, search, sortBy: sort.field, sortDir: sort.dir }), refreshStats()]);
        } else { addToast(result?.error || 'Failed to reject', 'error'); }
      } catch (e) { addToast(e.message || 'Failed to reject', 'error'); }
      finally { setOp(rejectTarget?._id, 'reject', false); }
    }, [rejectTarget, rejectReason, opsRejectQuotation, addToast, refreshCompanyQuotations, refreshStats, setOp, currentPage, currentLimit, activeTab, search, sort]),
  };

  const handleDownload = useCallback(async (q) => {
    setDownloadLoadingId(q._id);
    try { await downloadQuotationPDF(q); addToast('PDF downloaded!', 'success'); }
    catch (e) { addToast(`PDF failed: ${e.message}`, 'error'); }
    finally { setDownloadLoadingId(null); }
  }, [addToast]);

  const handleView = useCallback((id) => {
    if (onViewQuotation) onViewQuotation(id); else navigate(`/quotation/${id}`);
  }, [onViewQuotation, navigate]);

  const handleAwardOpen    = useCallback((q) => setAwardModal({ open: true, quotation: q, loading: false }), []);
  const handleAwardClose   = useCallback(() => setAwardModal({ open: false, quotation: null, loading: false }), []);
  const handleAwardConfirm = useCallback(async (awarded, note) => {
    if (!awardModal.quotation) return;
    setAwardModal(p => ({ ...p, loading: true }));
    try {
      const result = await awardQuotation(awardModal.quotation._id, awarded, note);
      if (result?.success) {
        addToast(awarded ? `🏆 "${awardModal.quotation.quotationNumber}" Awarded!` : `"${awardModal.quotation.quotationNumber}" Not Awarded.`, 'success');
        await Promise.all([refreshCompanyQuotations({ page: currentPage, limit: currentLimit, status: activeTab === 'all' ? undefined : activeTab, search, sortBy: sort.field, sortDir: sort.dir }), refreshStats()]);
        handleAwardClose();
      } else { addToast(result?.error || 'Failed', 'error'); setAwardModal(p => ({ ...p, loading: false })); }
    } catch (e) { addToast(e.message || 'Failed', 'error'); setAwardModal(p => ({ ...p, loading: false })); }
  }, [awardModal.quotation, awardQuotation, addToast, refreshCompanyQuotations, refreshStats, handleAwardClose, currentPage, currentLimit, activeTab, search, sort]);

  // ── Keyboard shortcut ─────────────────────────────────────
  useEffect(() => {
    const h = (e) => {
      if (e.key === '/' && !['INPUT','TEXTAREA'].includes(document.activeElement?.tagName)) {
        e.preventDefault(); searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);
  useEffect(() => () => clearTimeout(searchTimer.current), []);

  // ── Tab config ────────────────────────────────────────────
  const TABS = useMemo(() => [
    { key: 'all',          label: 'All',             Icon: FileText,     count: tabCountsResolved.all },
    { key: 'pending',      label: 'Pending',         Icon: Clock,        count: tabCountsResolved.pending },
    { key: 'ops_approved', label: 'Awaiting Admin',  Icon: Shield,       count: tabCountsResolved.ops_approved },
    { key: 'ops_rejected', label: 'Returned',        Icon: Ban,          count: tabCountsResolved.ops_rejected },
    { key: 'rejected',     label: 'Admin Rejected',  Icon: XCircle,      count: tabCountsResolved.rejected },
    { key: 'approved',     label: 'Approved',        Icon: CheckCircle,  count: tabCountsResolved.approved },
    { key: 'awarded',      label: 'Awarded',         Icon: Award,        count: tabCountsResolved.awarded },
    { key: 'not_awarded',  label: 'Not Awarded',     Icon: TrendingDown, count: tabCountsResolved.not_awarded },
    { key: 'cancelled',    label: 'Cancelled',        Icon: XCircle,      count: tabCountsResolved.cancelled },
    // "Amended" tab hidden for now — amend feature is disabled.
  ], [tabCountsResolved]);

  // ── Header button style ──────────────────────────────────
  const headerBtn = (variant) => {
    const variants = {
      ghost:  { background: 'transparent', color: '#c7cccf', border: '1px solid rgba(255,255,255,0.14)' },
      soft:   { background: 'rgba(255,255,255,0.08)', color: '#e6e9ea', border: '1px solid rgba(255,255,255,0.10)' },
      accent: { background: T.accent, color: '#fff', border: '1px solid transparent' },
    };
    return {
      ...variants[variant], borderRadius: T.radiusSm,
      padding: isMobile ? '0.4rem 0.7rem' : '0.5rem 0.95rem',
      fontSize: isMobile ? '0.72rem' : '0.8rem', fontWeight: 600, cursor: 'pointer',
      display: 'flex', alignItems: 'center', gap: '0.45rem', fontFamily: FONT_STACK,
      transition: 'all 0.18s ease',
    };
  };

  const thStyle = {
    padding: '0.85rem 1rem', fontSize: '0.68rem', fontWeight: 600, color: T.inkFaint,
    textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: 'left',
    borderBottom: `1px solid ${T.line}`, backgroundColor: T.surface, whiteSpace: 'nowrap',
    position: 'sticky', top: 0, zIndex: 1,
  };

  const isRefreshing = tableLatchRef.current && quotationsLoading;
  const showEmptyState = tableLatchRef.current && !quotationsLoading && safeQ.length === 0;

  // ── Render ────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', backgroundColor: T.canvas, fontFamily: FONT_STACK, color: T.ink, overflowX: 'hidden' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        @keyframes ops-spin    { to { transform: rotate(360deg); } }
        @keyframes ops-shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
        @keyframes ops-fade-in { from{opacity:0;transform:translateY(4px)} to{opacity:1;transform:none} }
        .ops-fade-in { animation: ops-fade-in 0.32s cubic-bezier(0.22,1,0.36,1) both; }
        .ops-row { transition: background 0.15s ease; }
        .ops-row:hover td { background: #f9fafb !important; }
      `}</style>

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      {/* ── MODALS ── */}
      <ConfirmModal
        open={!!approveTarget}
        title="Approve Quotation"
        message={`Approve ${approveTarget?.quotationNumber ? `quotation ${approveTarget.quotationNumber}` : 'this quotation'} and forward it to admin for final approval?`}
        confirmLabel="Approve"
        icon={CheckCircle}
        loading={isOp(approveTarget?._id, 'approve')}
        onConfirm={handleApprove.confirm}
        onCancel={handleApprove.close}
      />
      <ConfirmModal
        open={!!rejectTarget}
        title="Reject Quotation"
        message={`Return ${rejectTarget?.quotationNumber} to the creator?`}
        confirmLabel="Reject"
        danger
        loading={isOp(rejectTarget?._id, 'reject')}
        onConfirm={handleReject.confirm}
        onCancel={handleReject.close}
      >
        <textarea
          value={rejectReason}
          onChange={(e) => setRejectReason(e.target.value)}
          placeholder="Enter rejection reason (required)…"
          rows={4}
          style={{ width: '100%', padding: '0.75rem', border: `1.5px solid ${T.line}`, borderRadius: T.radiusSm, fontSize: '0.875rem', fontFamily: FONT_STACK, marginBottom: '0.5rem', resize: 'vertical', outline: 'none', color: T.ink }}
          autoFocus
        />
        <p style={{ fontSize: '0.75rem', color: '#c1352b', margin: 0 }}>Reason is required to reject a quotation.</p>
      </ConfirmModal>

      <AwardModal
        open={awardModal.open}
        quotation={awardModal.quotation}
        onCancel={handleAwardClose}
        onConfirm={handleAwardConfirm}
        loading={awardModal.loading}
      />

      {/* ── HEADER — identical structure to HomeScreen ── */}
      <div style={{
        backgroundColor: T.ink,
        padding: isMobile ? '0.75rem 1rem' : '0 2rem',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        minHeight: 64, position: 'sticky', top: 0, zIndex: 50,
        flexWrap: 'wrap', gap: '0.75rem',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: isMobile ? '100%' : 'auto' }}>
          <div>
            <div style={{ fontSize: isMobile ? '1rem' : '1.05rem', fontWeight: 700, color: '#fff', letterSpacing: '-0.01em', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#f59e0b', display: 'inline-block' }} />
              Ops Dashboard
            </div>
            {!isMobile && <div style={{ marginTop: 2 }}><CompanyCurrencyDisplay /></div>}
          </div>
          {isMobile && (
            <button onClick={() => setUiState(p => ({ ...p, mobileMenuOpen: !p.mobileMenuOpen }))} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: 8, padding: '0.4rem 0.7rem', color: 'white', cursor: 'pointer' }}>
              <Menu size={20} />
            </button>
          )}
        </div>

        {isMobile && <CompanyCurrencyDisplay />}

        <div style={{
          ...(isMobile && !uiState.mobileMenuOpen ? { display: 'none' } : { display: 'flex' }),
          gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap',
          width: isMobile ? '100%' : 'auto', justifyContent: isMobile ? 'center' : 'flex-end',
        }}>
          <CompanyCurrencySelector variant="compact" />
          <button onClick={() => navigate('/customers')} style={headerBtn('soft')}>
            <Users size={isMobile ? 12 : 14} /> Customers
          </button>
          <button onClick={() => navigate('/quotation/new')} style={headerBtn('accent')}>
            <FileText size={isMobile ? 12 : 14} /> {isMobile ? 'New' : 'New Quotation'}
          </button>
          <button onClick={handleLogout} style={headerBtn('ghost')}>
            <LogOut size={isMobile ? 12 : 15} /> Logout
          </button>
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
          <StatsShimmer isMobile={isMobile} />
        ) : (
          <div className="ops-fade-in" style={{ marginBottom: '1.75rem' }}>
            {isMobile ? (
              <CompactStatsCard
                totalRevenue={totalValue || 0}
                quotationsCount={totalQuotations || 0}
                customersCount={totalCustomers || 0}
                selectedCurrency={selectedCurrency}
                statusCounts={{ 
                  pending: pendingReview || 0, 
                  in_review: awaitingAdmin || 0, 
                  approved: approved || 0, 
                  awarded: awarded || 0, 
                  returned: returnedByMe || 0 
                }}
                loading={false}
              />
            ) : (
              <DesktopStatsGrid
                totalRevenue={totalValue || 0}
                quotationsCount={totalQuotations || 0}
                customersCount={totalCustomers || 0}
                selectedCurrency={selectedCurrency}
                statusCounts={{ 
                  pending: pendingReview || 0, 
                  in_review: awaitingAdmin || 0, 
                  approved: approved || 0, 
                  awarded: awarded || 0, 
                  returned: returnedByMe || 0 
                }}
                loading={false}
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
                const active    = activeTab === key;
                const isPending = key === 'pending';
                const isReturned= key === 'ops_rejected' || key === 'rejected';
                const hasAlert  = (isPending || isReturned) && count > 0;
                const alertColor= isPending ? '#b58a3c' : '#a85563';
                return (
                  <button
                    key={key}
                    onClick={() => handleTabChange(key)}
                    style={{
                      padding: isMobile ? '0.35rem 0.65rem' : '0.45rem 0.9rem',
                      borderRadius: 9, border: 'none', cursor: 'pointer',
                      fontSize: isMobile ? '0.72rem' : '0.8rem',
                      fontWeight: active ? 600 : 500,
                      display: 'flex', alignItems: 'center', gap: '0.4rem',
                      backgroundColor: active ? T.surface : 'transparent',
                      color: active ? T.ink : T.inkSoft,
                      boxShadow: active ? '0 1px 3px rgba(20,22,24,0.08)' : 'none',
                      whiteSpace: 'nowrap', transition: 'all 0.15s ease', fontFamily: FONT_STACK,
                    }}
                  >
                    <I size={isMobile ? 11 : 13} />
                    {!isMobile && label}
                    <span style={{
                      backgroundColor: hasAlert ? alertColor : active ? T.ink : T.line,
                      color: hasAlert || active ? '#fff' : T.inkSoft,
                      borderRadius: 999, padding: isMobile ? '1px 5px' : '1px 7px',
                      fontSize: isMobile ? '0.6rem' : '0.66rem', fontWeight: 700, minWidth: 16, textAlign: 'center',
                    }}>
                      {showStatsShimmer ? '…' : count}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Search + actions */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', width: isMobile ? '100%' : 'auto' }}>
              <button onClick={handleRefresh} disabled={isRefreshing} style={{ width: isMobile ? 38 : 36, height: isMobile ? 38 : 36, border: `1px solid ${T.line}`, borderRadius: T.radiusSm, background: T.canvas, cursor: isRefreshing ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: isRefreshing ? 0.5 : 1 }}>
                <RefreshCw size={14} color={T.inkSoft} style={isRefreshing ? { animation: 'ops-spin 1s linear infinite' } : {}} />
              </button>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', backgroundColor: T.canvas, border: `1px solid ${T.line}`, borderRadius: T.radiusSm, padding: isMobile ? '0.5rem 0.8rem' : '0.45rem 0.8rem', flex: isMobile ? 1 : 'auto' }}>
                <Search size={14} color={T.inkFaint} />
                <input
                  ref={searchRef}
                  style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: '0.875rem', color: T.ink, width: isMobile ? '100%' : 210, fontFamily: FONT_STACK }}
                  placeholder="Search…  /"
                  value={searchInput}
                  onChange={handleSearchChange}
                  disabled={showTableShimmer}
                />
                {searchInput && (
                  <button onClick={clearSearch} style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.inkFaint, padding: 0 }}><X size={13} /></button>
                )}
              </div>

              <QuotationFilterBar
                T={T}
                FONT_STACK={FONT_STACK}
                isMobile={isMobile}
                fromDate={dateFilters.fromDate}
                toDate={dateFilters.toDate}
                onApply={handleApplyFilters}
              />

              <ViewToggle view={uiState.viewMode} onViewChange={(v) => setUiState(p => ({ ...p, viewMode: v }))} isMobile={isMobile} />
            </div>
          </div>

          {/* Refreshing overlay */}
          {isRefreshing && !showTableShimmer && (
            <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(255,255,255,0.80)', zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: T.radius, backdropFilter: 'blur(1.5px)' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem', background: T.surface, padding: isMobile ? '1rem 1.5rem' : '1.25rem 2rem', borderRadius: 14, boxShadow: T.shadow, border: `1px solid ${T.line}` }}>
                <RefreshCw size={isMobile ? 20 : 24} color={T.accent} style={{ animation: 'ops-spin 0.8s linear infinite' }} />
                <span style={{ fontSize: isMobile ? '0.75rem' : '0.82rem', color: T.accentInk, fontWeight: 600 }}>Refreshing…</span>
              </div>
            </div>
          )}

          {/* Content */}
          {showTableShimmer ? (
            <div style={{ overflowX: 'auto', width: '100%', WebkitOverflowScrolling: 'touch' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 940 }}>
                <thead>
                  <tr>
                    {['Quote #','Customer','Date','Expiry','Status','Created By','Items','Total','Actions'].map(h => (
                      <th key={h} style={thStyle}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[0,1,2,3,4,5,6].map(i => <SkeletonRow key={i} />)}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="ops-fade-in">
              {showEmptyState ? (
                <div style={{ textAlign: 'center', padding: isMobile ? '3.5rem 1rem' : '5rem 2rem', color: T.inkFaint }}>
                  <div style={{ width: 64, height: 64, borderRadius: '50%', background: T.accentSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.25rem' }}>
                    <FileText size={28} color={T.accent} />
                  </div>
                  <p style={{ fontWeight: 600, fontSize: isMobile ? '0.95rem' : '1.05rem', color: T.ink, marginBottom: '0.4rem' }}>
                    {search ? `No results for "${search}"` : 'No quotations found'}
                  </p>
                  {search && (
                    <button onClick={clearSearch} style={{ background: T.accent, color: '#fff', border: 'none', borderRadius: T.radiusSm, padding: '0.6rem 1.1rem', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer', fontFamily: FONT_STACK }}>
                      Clear search
                    </button>
                  )}
                </div>
              ) : (
                <>
                  {/* Card view */}
                  {(isMobile || uiState.viewMode === 'card') ? (
                    <div style={{ padding: isMobile ? '1rem' : '1.5rem', display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2,1fr)', gap: isMobile ? '0.75rem' : '1rem' }}>
                      {safeQ.map(q => (
                        <OpsQuotationCard
                          key={q._id}
                          quotation={q}
                          selectedCurrency={selectedCurrency}
                          onView={handleView}
                          onApprove={handleApprove.open}
                          onReject={handleReject.open}
                          onDownload={handleDownload}
                          onAward={handleAwardOpen}
                          isDownloading={downloadLoadingId === q._id}
                          isApproving={isOp(q._id, 'approve')}
                          isRejecting={isOp(q._id, 'reject')}
                          isAwarding={isOp(q._id, 'award')}
                        />
                      ))}
                    </div>
                  ) : (
                    /* Table view */
                    <div style={{ overflowX: 'auto', width: '100%', WebkitOverflowScrolling: 'touch' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 940 }}>
                        <thead>
                          <tr>
                            <SortHeader label="Quote #"    field="quotationNumber" sort={{ field: sort.field, dir: sort.dir }} onSort={handleSort} />
                            <SortHeader label="Customer"   field="customer"        sort={{ field: sort.field, dir: sort.dir }} onSort={handleSort} />
                            <SortHeader label="Date"       field="date"            sort={{ field: sort.field, dir: sort.dir }} onSort={handleSort} />
                            <SortHeader label="Expiry"     field="expiryDate"      sort={{ field: sort.field, dir: sort.dir }} onSort={handleSort} />
                            <SortHeader label="Status"     field="status"          sort={{ field: sort.field, dir: sort.dir }} onSort={handleSort} />
                            <SortHeader label="Created By" field="createdBy"       sort={{ field: sort.field, dir: sort.dir }} onSort={handleSort} />
                            <th style={{ ...thStyle, textAlign: 'center' }}>Items</th>
                            <SortHeader label="Total"      field="total"           sort={{ field: sort.field, dir: sort.dir }} onSort={handleSort} align="right" />
                            <th style={{ ...thStyle, textAlign: 'center' }}>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {safeQ.map(q => {
                            const expired    = isExpired(q.expiryDate);
                            const expiring   = !expired && isExpiringSoon(q.expiryDate);
                            const canAct     = q.status === 'pending';
                            const canAward   = q.status === 'approved' && (q.createdBy?.role === 'ops_manager' || q.createdBySnapshot?.role === 'ops_manager');
                            const isAdminRej = q.status === 'rejected';
                            const quoteCurrency = q.currency?.code || selectedCurrency;
                            
                            return (
                              <tr key={q._id} className="ops-row" style={{ borderBottom: `1px solid ${T.lineSoft}`, backgroundColor: isAdminRej ? '#fef9f9' : 'transparent' }}>
                                <td style={{ padding: '1rem', verticalAlign: 'middle' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                                    <span style={{ fontWeight: 600, color: T.ink, fontFamily: "'Inter', monospace", fontSize: '0.8rem' }}>{q.quotationNumber || '—'}</span>
                                    {q.revisedFrom && <span style={{ fontSize: '0.6rem', fontWeight: 700, color: '#6d28d9', background: '#f5f3ff', padding: '1px 6px', borderRadius: 999, border: '1px solid #c4b5fd' }}>Rev</span>}
                                    {expired  && <ExpiryBadge type="expired" />}
                                    {expiring && <ExpiryBadge type="expiring" />}
                                  </div>
                                </td>
                                <td style={{ padding: '1rem', verticalAlign: 'middle' }}>
                                  <div style={{ fontWeight: 600, color: T.ink, fontSize: '0.875rem' }}>{q.customerSnapshot?.name || q.customer || q.customerId?.name || 'N/A'}</div>
                                  {q.contact && <div style={{ fontSize: '0.75rem', color: T.inkFaint, marginTop: 2 }}>{q.contact}</div>}
                                  <RejectionNote quotation={q} />
                                </td>
                                <td style={{ padding: '1rem', fontSize: '0.8rem', color: T.inkSoft, verticalAlign: 'middle', whiteSpace: 'nowrap' }}>{fmtDate(q.date)}</td>
                                <td style={{ padding: '1rem', fontSize: '0.8rem', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                                  <span style={{ color: expired ? '#c1352b' : expiring ? '#b45309' : T.inkSoft, fontWeight: expired || expiring ? 600 : 400 }}>{fmtDate(q.expiryDate)}</span>
                                </td>
                                <td style={{ padding: '1rem', verticalAlign: 'middle' }}>
                                  <EnhancedStatusBadge status={q.status} quotation={q} />
                                  <RejectionNote quotation={q} />
                                </td>
                                <td style={{ padding: '1rem', fontSize: '0.8rem', color: T.inkSoft, verticalAlign: 'middle' }}>{q.createdBy?.name || '—'}</td>
                                <td style={{ padding: '1rem', verticalAlign: 'middle', textAlign: 'center' }}>
                                  <span style={{ background: T.lineSoft, color: T.inkSoft, borderRadius: 6, padding: '0.2rem 0.6rem', fontSize: '0.8rem', fontWeight: 600 }}>
                                    {q.items?.length ?? 0}
                                  </span>
                                </td>
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
                                    <ActionBtn bg={T.accentSoft} color={T.accentInk} onClick={() => handleView(q._id)} icon={Eye} label="View" title="View quotation" />
                                    {canAct && (
                                      <>
                                        <ActionBtn bg="#e3f5ee" color="#0f7a52" onClick={() => handleApprove.open(q)} icon={Check} label="Approve" title="Approve" disabled={isOp(q._id, 'approve')} />
                                        <ActionBtn bg="#fdeceb" color="#c1352b" onClick={() => handleReject.open(q)} icon={X} label="Reject" title="Reject" disabled={isOp(q._id, 'reject')} />
                                      </>
                                    )}
                                    {canAward && (
                                      <ActionBtn bg="#efe9fb" color="#6d28d9" onClick={() => handleAwardOpen(q)} icon={Award} label="Award" title="Mark awarded" disabled={isOp(q._id, 'award')} />
                                    )}
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Pagination */}
                  <PaginationBar
                    total={totalFiltered}
                    page={currentPage}
                    limit={currentLimit}
                    totalPages={totalPages}
                    onPageChange={goToPage}
                    onLimitChange={changeLimit}
                  />
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}