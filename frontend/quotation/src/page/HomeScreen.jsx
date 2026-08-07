import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from "react";
import {
  AlertCircle,
  RefreshCw,
  Search,
  X,
  Clock,
  Shield,
  CheckCircle,
  Ban,
  LogOut,
  Plus,
  Calendar,
  Eye,
  Award,
  Trash2,
  Menu,
  FileText,
  Users,
  ChevronLeft,
  ChevronRight,
  XCircle,
  TrendingDown,
} from "lucide-react";

import {
  useAppStore,
  useCompanyQuotations,
  useCustomerStatsWithCompany,
} from "../services/store";
import {
  useCompanyCurrency,
  CompanyCurrencySelector,
  CompanyCurrencyDisplay,
} from "../components/CompanyCurrencySelector";
import QueryDateUpdater from "../components/QueryDateUpdater";
import {
  RejectionNote,
  Toast,
  ActionBtn,
  SortHeader,
  SkeletonRow,
  ConfirmModal,
  AwardModal,
} from "../components/SharedComponents";
import CompactStatsCard from "../components/HomePageComponent/CompactStatsCard";
import DesktopStatsGrid from "../components/HomePageComponent/DesktopStatsGrid";
import QuotationCard from "../components/HomePageComponent/QuotationCard";
import ViewToggle from "../components/HomePageComponent/ViewToggle";
import QuotationFilterBar from "../components/QuotationFilterBar";
import {
  PAGE_SIZE_OPTIONS,
  DEBOUNCE_MS,
  TAB_KEYS,
  DELETABLE,
} from "../utils/constants";
import {
  fmtCurrency,
  fmtDate,
  isExpired,
  isExpiringSoon,
} from "../utils/formatters";
import { downloadQuotationPDF } from "../utils/pdfGenerator";
import { htmlToSections, sectionsToHTML } from "../components/TermsCondition";
import LoadingOverlay from "../components/LoadingOverlay";

import { useDashboardStats } from "../hooks/useDashboardStats";

// ============================================================
// DESIGN TOKENS — refined minimal (neutral light)
// Clean neutral off-white (not cream), true-grey text scale,
// hairline borders, one soft shadow, a muted sage accent.
// ============================================================
const T = {
  canvas: "#f6f7f8",      // neutral off-white page
  surface: "#ffffff",     // cards / table
  ink: "#1b1d1e",         // near-black, neutral
  inkSoft: "#646a6e",     // muted grey
  inkFaint: "#9aa0a4",    // faint labels
  line: "#e8eaec",        // hairline borders
  lineSoft: "#f0f1f3",    // softer dividers
  accent: "#2563c4",      // clean cool blue
  accentSoft: "#e6f0fb",
  accentInk: "#1d63c4",
  shadow: "0 1px 2px rgba(20,22,24,0.04), 0 8px 24px -12px rgba(20,22,24,0.10)",
  radius: 16,
  radiusSm: 10,
};

const FONT_STACK =
  "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

const useMediaQuery = (query) => {
  const [matches, setMatches] = useState(() => {
    if (typeof window !== "undefined") {
      return window.matchMedia(query).matches;
    }
    return false;
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mediaQuery = window.matchMedia(query);
    const handler = (e) => setMatches(e.matches);
    mediaQuery.addEventListener("change", handler);
    return () => mediaQuery.removeEventListener("change", handler);
  }, [query]);

  return matches;
};

// Cool but vivid status palette — each state clearly distinct and readable.
const STATUS_CONFIG = {
  pending: { label: "Pending", bg: "#fff7e6", color: "#b45309", borderColor: "#fde9c8", icon: "○", description: "Awaiting submission" },
  pending_admin: { label: "Pending", bg: "#fff7e6", color: "#b45309", borderColor: "#fde9c8", icon: "○", description: "Awaiting submission" },
  ops_approved: { label: "In Review", bg: "#e6f0fb", color: "#1d63c4", borderColor: "#c9defa", icon: "◔", description: "Under ops review" },
  approved: { label: "Approved", bg: "#e3f5ee", color: "#0f7a52", borderColor: "#c3ebda", icon: "●", description: "Ready to present" },
  awarded: { label: "Awarded", bg: "#efe9fb", color: "#6d28d9", borderColor: "#dccffa", icon: "◆", description: "Order confirmed" },
  not_awarded: { label: "Not Awarded", bg: "#eef1f4", color: "#52606d", borderColor: "#dde3e8", icon: "—", description: "Lost to competitor" },
  ops_rejected: { label: "Returned", bg: "#fdeaf0", color: "#be185d", borderColor: "#f8d2e0", icon: "△", description: "Ops rejected — revise" },
  rejected: { label: "Rejected", bg: "#fdeceb", color: "#c1352b", borderColor: "#f8d6d2", icon: "✕", description: "Customer rejected" },
  cancelled: { label: "Cancelled", bg: "#fce7f3", color: "#9d174d", borderColor: "#fbcfe8", icon: "⊗", description: "Cancelled — edit to revise" },
  amended: { label: "Amended", bg: "#ffedd5", color: "#9a3412", borderColor: "#fed7aa", icon: "✎", description: "Awaiting edit — click Edit & Amend" },
};

const TAB_STATUS_MAP = {
  all: null, pending: "pending", in_review: "ops_approved",
  approved: "approved", awarded: "awarded", returned: "ops_rejected",
};

const EnhancedStatusBadge = React.memo(({ status, quotation }) => {
  const config = STATUS_CONFIG[status] || {
    label: status?.replace(/_/g, " ") || "Unknown",
    bg: "#f2f3f4", color: "#646a6e", borderColor: "#e8eaec", icon: "·", description: "Unknown status",
  };

  const isExp = quotation && new Date(quotation.expiryDate) < new Date();
  const isExpiringSn = quotation && !isExp && new Date(quotation.expiryDate) - new Date() < 7 * 24 * 60 * 60 * 1000;

  const base = {
    display: "inline-flex", alignItems: "center", gap: "0.4rem",
    padding: "0.28rem 0.7rem", borderRadius: 999, fontSize: "0.74rem",
    fontWeight: 600, letterSpacing: "0.01em", whiteSpace: "nowrap", cursor: "help",
  };

  if (isExp && status === "pending") {
    return (
      <span style={{ ...base, backgroundColor: "#fdeceb", color: "#c1352b", border: "1px solid #f8d6d2" }} title="Quotation has expired">
        <span style={{ opacity: 0.8 }}>✕</span> Expired
      </span>
    );
  }

  if (isExpiringSn && status === "pending") {
    return (
      <span style={{ ...base, backgroundColor: "#fff7e6", color: "#b45309", border: "1px solid #fde9c8" }} title="Expiring in less than 7 days">
        <span style={{ opacity: 0.8 }}>◷</span> Expiring Soon
      </span>
    );
  }

  return (
    <span style={{ ...base, backgroundColor: config.bg, color: config.color, border: `1px solid ${config.borderColor}`, transition: "all 0.2s ease" }} title={config.description}>
      <span style={{ fontSize: "0.6rem", opacity: 0.85 }}>{config.icon}</span>
      {config.label}
    </span>
  );
});

const PageBtn = React.memo(({ n, current, onPage }) => (
  <button
    onClick={() => onPage(n)}
    style={{
      minWidth: 32, height: 32, borderRadius: 8,
      border: n === current ? "1px solid transparent" : `1px solid ${T.line}`,
      backgroundColor: n === current ? T.ink : T.surface,
      color: n === current ? "#fff" : T.inkSoft,
      fontWeight: n === current ? 600 : 500, fontSize: "0.8rem",
      cursor: "pointer", transition: "all 0.15s ease",
    }}
  >
    {n}
  </button>
));

const PaginationBar = React.memo(
  ({ total, page, limit, totalPages, onPageChange, onLimitChange }) => {
    if (totalPages <= 1 && total <= PAGE_SIZE_OPTIONS[0]) return null;

    const start = (page - 1) * limit + 1;
    const end = Math.min(page * limit, total);

    const pages = useMemo(() => {
      const p = [];
      const startPage = Math.max(1, page - 2);
      const endPage = Math.min(totalPages, page + 2);
      for (let i = startPage; i <= endPage; i++) p.push(i);
      return p;
    }, [page, totalPages]);

    const showStartEllipsis = pages[0] > 1;
    const showEndEllipsis = pages[pages.length - 1] < totalPages;

    const arrowBtn = (disabled) => ({
      width: 32, height: 32, border: `1px solid ${T.line}`, borderRadius: 8,
      background: T.surface, cursor: disabled ? "not-allowed" : "pointer",
      opacity: disabled ? 0.4 : 1, display: "flex", alignItems: "center",
      justifyContent: "center", color: T.inkSoft,
    });

    return (
      <div style={{ padding: "0.9rem 1.5rem", borderTop: `1px solid ${T.lineSoft}`, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.75rem", backgroundColor: T.surface }}>
        <span style={{ fontSize: "0.8rem", color: T.inkSoft }}>
          Showing <strong style={{ color: T.ink, fontWeight: 600 }}>{start}–{end}</strong> of <strong style={{ color: T.ink, fontWeight: 600 }}>{total}</strong>
        </span>

        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <select value={limit} onChange={(e) => onLimitChange(Number(e.target.value))} style={{ padding: "0.3rem 0.6rem", borderRadius: 8, border: `1px solid ${T.line}`, fontSize: "0.75rem", backgroundColor: T.surface, color: T.inkSoft, cursor: "pointer", fontFamily: FONT_STACK }}>
            {PAGE_SIZE_OPTIONS.map((size) => (<option key={size} value={size}>{size} per page</option>))}
          </select>

          <button onClick={() => onPageChange(Math.max(1, page - 1))} disabled={page === 1} style={arrowBtn(page === 1)}><ChevronLeft size={14} /></button>

          {showStartEllipsis && (
            <>
              <PageBtn n={1} current={page} onPage={onPageChange} />
              {pages[0] > 2 && <span style={{ color: T.inkFaint, fontSize: "0.8rem" }}>…</span>}
            </>
          )}

          {pages.map((n) => (<PageBtn key={n} n={n} current={page} onPage={onPageChange} />))}

          {showEndEllipsis && (
            <>
              {pages[pages.length - 1] < totalPages - 1 && <span style={{ color: T.inkFaint, fontSize: "0.8rem" }}>…</span>}
              <PageBtn n={totalPages} current={page} onPage={onPageChange} />
            </>
          )}

          <button onClick={() => onPageChange(Math.min(totalPages, page + 1))} disabled={page === totalPages} style={arrowBtn(page === totalPages)}><ChevronRight size={14} /></button>
        </div>
      </div>
    );
  }
);

const shimmer = {
  background: `linear-gradient(90deg, ${T.lineSoft} 25%, ${T.line} 50%, ${T.lineSoft} 75%)`,
  backgroundSize: "200% 100%",
  animation: "hs-shimmer 1.4s ease infinite",
  borderRadius: 6,
};

const ShimmerStatsCard = ({ isMobile }) => {
  const card = { background: T.surface, borderRadius: T.radius, padding: "1.25rem", border: `1px solid ${T.line}` };
  if (isMobile) {
    return (
      <div style={{ marginBottom: "1.5rem" }}>
        <div style={card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
            <div style={{ ...shimmer, width: 100, height: 18 }} />
            <div style={{ ...shimmer, width: 40, height: 40, borderRadius: "50%" }} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "0.75rem" }}>
            {[1, 2, 3, 4].map((i) => (
              <div key={i}>
                <div style={{ ...shimmer, width: 60, height: 11, marginBottom: 8 }} />
                <div style={{ ...shimmer, width: 80, height: 22 }} />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }
  return (
    <div style={{ marginBottom: "1.5rem" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "1rem", marginBottom: "1rem" }}>
        {[1, 2, 3, 4].map((i) => (
          <div key={i} style={card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ ...shimmer, width: 80, height: 11 }} />
                <div style={{ ...shimmer, width: 100, height: 26, marginTop: 8 }} />
              </div>
              <div style={{ ...shimmer, width: 44, height: 44, borderRadius: 12 }} />
            </div>
          </div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "1rem" }}>
        {[1, 2, 3].map((i) => (
          <div key={i} style={card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ ...shimmer, width: 80, height: 11 }} />
                <div style={{ ...shimmer, width: 100, height: 26, marginTop: 8 }} />
              </div>
              <div style={{ ...shimmer, width: 44, height: 44, borderRadius: 12 }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// Helper function to get currency symbol
const getCurrencySymbol = (currencyCode) => {
  const symbols = {
    AED: "AED",
    USD: "USD",
    EUR: "EUR",
    GBP: "GBP",
    SAR: "SAR",
    QAR: "QAR",
    KWD: "KWD",
    BHD: "BHD",
    OMR: "OMR",
  };
  return symbols[currencyCode] || currencyCode;
};

export default function HomeScreen({ onNavigate, onViewQuotation }) {
  const isMobile = useMediaQuery("(max-width: 768px)");
  const isTablet = useMediaQuery("(max-width: 1100px)");
  useEffect(() => {
    console.log("🟪 HomeScreen MOUNT");
    return () => console.log("🟪 HomeScreen UNMOUNT");
  }, []);

  const [uiState, setUiState] = useState({
    mobileMenuOpen: false, viewMode: "table",
    saveProgress: 0, saveStep: "", pdfProgress: 0, pdfStep: "",
  });

  const [filters, setFilters] = useState({ status: null, search: "", sortBy: "date", sortDir: "desc", fromDate: "", toDate: "" });

  const [modalsState, setModalsState] = useState({
    exportingId: null,
    deleteModal: { open: false, quotation: null, busy: false },
    awardModal: { open: false, quotation: null, busy: false },
    queryDateModal: { open: false, quotation: null },
  });

  const [refreshState, setRefreshState] = useState({ progress: 0, step: "", isRefreshing: false });
  const [toasts, setToasts] = useState([]);
  const searchRef = useRef(null);
  const searchTimer = useRef(null);
  let toastIdRef = useRef(0);

  const {
    totalQuotations: globalTotalQuotations,
    pending: globalPending,
    inReview: globalInReview,
    returned: globalReturned,
    approved: globalApproved,
    awarded: globalAwarded,
    rejected: globalRejected,
    notAwarded: globalNotAwarded,
    cancelled: globalCancelled,
    awardedValue: globalAwardedValue,
    totalCustomers: globalTotalCustomers,
    conversionRate: globalConversionRate,
    loading: globalStatsLoading,
    refresh: refreshGlobalStats,
    stats: dashboardStats,
  } = useDashboardStats();

  const {
    quotations,
    quotationsLoading,
    quotationsInitialized,
    refresh: refreshCompanyQuotations,
    goToPage,
    changeLimit,
    currentPage,
    currentLimit,
    totalPages,
    totalCount,
  } = useCompanyQuotations();

  const loadError = useAppStore((s) => s.loadError);
  const deleteQuotation = useAppStore((s) => s.deleteQuotation);
  const awardQuotation = useAppStore((s) => s.awardQuotation);
  const fetchAllData = useAppStore((s) => s.fetchAllData);
  const handleLogout = useAppStore((s) => s.handleLogout);
  const clearError = useAppStore((s) => s.clearError);
  const updateQueryDate = useAppStore((s) => s.updateQueryDate);
  const selectedCompany = useAppStore((s) => s.selectedCompany);
  const initialized = useAppStore((s) => s.initialized);

  const { company: currentCompany, selectedCurrency, refreshCompanyData } = useCompanyCurrency();

  const hasMountedRef = useRef(false);

  const statsReady = dashboardStats?._selectionId != null;
  const tableReady = quotationsInitialized;

  const statsLatchRef = useRef(false);
  const tableLatchRef = useRef(false);
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

  const showStatsShimmer = !statsLatchRef.current && !statsReady;
  const showTableShimmer = !tableLatchRef.current && !tableReady;

  const isInitialLoading = showTableShimmer;
  const isRefreshing = tableLatchRef.current && quotationsLoading;
  const showEmptyState = tableLatchRef.current && !quotationsLoading && (!quotations || quotations.length === 0);

  const safeQ = quotations || [];

  // Applies the default page size once, on mount only — must NOT depend on
  // currentLimit (or run again on isMobile changes), or it would re-fire and
  // clobber a page size the user picked manually from the per-page dropdown,
  // e.g. right after they picked it, or on a mobile/desktop resize.
  useEffect(() => {
    changeLimit(5);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      return;
    }
    if (isMobile || isTablet) setUiState((prev) => ({ ...prev, viewMode: "card" }));
  }, [isMobile, isTablet]);

  const addToast = useCallback((message, type = "info") => {
    const id = ++toastIdRef.current;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
  }, []);

  const dismissToast = useCallback((id) => setToasts((prev) => prev.filter((t) => t.id !== id)), []);

  const handleTabChange = useCallback(
    async (key) => {
      let newStatus = null;
      switch (key) {
        case "all": newStatus = null; break;
        case "pending": newStatus = "pending"; break;
        case "in_review": newStatus = "ops_approved"; break;
        case "approved": newStatus = "approved"; break;
        case "awarded": newStatus = "awarded"; break;
        case "returned": newStatus = "ops_rejected"; break;
        case "rejected": newStatus = "rejected"; break;
        case "not_awarded": newStatus = "not_awarded"; break;
        case "cancelled": newStatus = "cancelled"; break;
        case "amended": newStatus = "amended"; break;
        default: newStatus = null;
      }
      setFilters((prev) => ({ ...prev, status: newStatus, sortBy: "date", sortDir: "desc" }));
      try {
        const result = await  refreshCompanyQuotations({ status: newStatus, page: 1, sortBy: "date", sortDir: "desc", search: filters.search });
        if (result?.error) {
          const is429 = result.status === 429
            || result.error?.includes?.('429')
            || result.error?.toLowerCase?.().includes?.('too many');
          addToast(
            is429
              ? '⚠️ Too many requests — please wait a moment before switching tabs.'
              : result.error,
            'error'
          );
        }
      } catch (err) {
        addToast(err?.message || 'Failed to load quotations', 'error');
      }
    },
    [refreshCompanyQuotations, filters.search]
  );

  const getStatusForTab = (tabKey) => {
    switch (tabKey) {
      case "all": return null;
      case "pending": return "pending";
      case "in_review": return "ops_approved";
      case "approved": return "approved";
      case "awarded": return "awarded";
      case "returned": return "ops_rejected";
      case "rejected": return "rejected";
      case "not_awarded": return "not_awarded";
      case "cancelled": return "cancelled";
      case "amended": return "amended";
      default: return null;
    }
  };

  const handleSearchChange = useCallback(
    (e) => {
      const val = e.target.value;
      setFilters((prev) => ({ ...prev, search: val }));
      clearTimeout(searchTimer.current);
 searchTimer.current = setTimeout(async () => {
  try {
    const result = await refreshCompanyQuotations({ search: val, status: filters.status, page: 1, sortBy: filters.sortBy, sortDir: filters.sortDir });
    if (result?.error) {
      const is429 = result.status === 429 || result.error?.includes?.('429')
        || result.error?.toLowerCase?.().includes?.('too many');
      if (is429) addToast('⚠️ Too many requests — please wait a moment.', 'error');
    }
  } catch (err) {
    addToast(err?.message || 'Search failed', 'error');
  }
}, DEBOUNCE_MS);
    },
    [refreshCompanyQuotations, filters.status, filters.sortBy, filters.sortDir]
  );

  const clearSearch = useCallback(() => {
    setFilters((prev) => ({ ...prev, search: "" }));
    refreshCompanyQuotations({ search: "", status: filters.status, page: 1, sortBy: filters.sortBy, sortDir: filters.sortDir });
    if (searchRef.current) searchRef.current.value = "";
  }, [refreshCompanyQuotations, filters.status, filters.sortBy, filters.sortDir]);

  const handleSort = useCallback(
    (field) => {
      let sortField = field;
      if (field === "customer") sortField = "customerSnapshot.name";
      const currentSortField = filters.sortBy;
      let newDir = "asc";
      if (currentSortField === sortField) newDir = filters.sortDir === "asc" ? "desc" : "asc";
      else newDir = "asc";
      setFilters((prev) => ({ ...prev, sortBy: sortField, sortDir: newDir }));
      refreshCompanyQuotations({ sortBy: sortField, sortDir: newDir, status: filters.status, search: filters.search, page: 1 });
    },
    [refreshCompanyQuotations, filters.status, filters.search, filters.sortBy, filters.sortDir]
  );

  const handleApplyFilters = useCallback(
    ({ fromDate, toDate }) => {
      setFilters((prev) => ({ ...prev, fromDate, toDate }));
      refreshCompanyQuotations({ fromDate, toDate, status: filters.status, search: filters.search, sortBy: filters.sortBy, sortDir: filters.sortDir, page: 1 });
    },
    [refreshCompanyQuotations, filters.status, filters.search, filters.sortBy, filters.sortDir]
  );

  const handlePageChange = useCallback((newPage) => goToPage(newPage), [goToPage]);
  const handleLimitChange = useCallback((newLimit) => changeLimit(newLimit), [changeLimit]);

  const handleUpdateQueryDate = useCallback(
    async (id, date) => {
      const result = await updateQueryDate(id, date);
      if (result?.success) {
        addToast("Follow-up date updated successfully", "success");
        await refreshCompanyQuotations({ forceRefresh: true });
      } else {
        addToast(result?.error || "Failed to update follow-up date", "error");
      }
      setModalsState((prev) => ({ ...prev, queryDateModal: { open: false, quotation: null } }));
    },
    [updateQueryDate, addToast, refreshCompanyQuotations]
  );

  const handleRefresh = useCallback(async () => {
    setRefreshState({ progress: 10, step: "Refreshing data...", isRefreshing: true });
    const progressInterval = setInterval(() => {
      setRefreshState((prev) => ({ ...prev, progress: prev.progress >= 90 ? 90 : prev.progress + 10 }));
    }, 500);
    try {
      await Promise.all([refreshGlobalStats(), refreshCompanyQuotations({ forceRefresh: true })]);
      setRefreshState({ progress: 100, step: "Complete!", isRefreshing: true });
      addToast("Data refreshed", "success");
      setTimeout(() => setRefreshState({ progress: 0, step: "", isRefreshing: false }), 1000);
    } catch (err) {
      setRefreshState({ progress: 0, step: "", isRefreshing: false });
      if (err?.response?.status === 429 || err?.message?.includes('429') || err?.message?.includes('Too many requests')) {
        addToast("⚠️ Too many requests! Please wait a moment before refreshing again.", "error");
      } else {
        addToast(err.message || "Refresh failed", "error");
      }
    } finally {
      clearInterval(progressInterval);
    }
  }, [refreshGlobalStats, refreshCompanyQuotations, addToast]);

  const buildQuotationForPDF = useCallback(async (quotation) => {
    if (quotation.termsAndConditions && quotation.termsAndConditions.includes("<img")) return quotation;
    const cloudinaryImages = quotation.termsImages || [];
    const sections = htmlToSections(quotation.termsAndConditions || "", cloudinaryImages);
    const termsHTMLWithImages = sectionsToHTML(sections);
    return { ...quotation, termsAndConditions: termsHTMLWithImages };
  }, []);

  const handleDownload = useCallback(
    async (q) => {
      setModalsState((prev) => ({ ...prev, exportingId: q._id }));
      setUiState((prev) => ({ ...prev, pdfProgress: 10, pdfStep: "Preparing PDF..." }));
      const progressInterval = setInterval(() => {
        setUiState((prev) => ({ ...prev, pdfProgress: prev.pdfProgress >= 90 ? 90 : prev.pdfProgress + 10 }));
      }, 800);
      try {
        const storeQuotations = useAppStore.getState().quotations;
        let completeQuotation = storeQuotations.find((quot) => quot._id === q._id);
        if (!completeQuotation) completeQuotation = q;
        setUiState((prev) => ({ ...prev, pdfProgress: 40, pdfStep: "Processing images..." }));
        const pdfQuotation = await buildQuotationForPDF(completeQuotation);
        setUiState((prev) => ({ ...prev, pdfProgress: 70, pdfStep: "Generating PDF..." }));
        await downloadQuotationPDF(pdfQuotation);
        setUiState((prev) => ({ ...prev, pdfProgress: 100, pdfStep: "Complete!" }));
        addToast("PDF generated successfully!", "success");
        setTimeout(() => setUiState((prev) => ({ ...prev, pdfProgress: 0, pdfStep: "" })), 1000);
      } catch (err) {
        console.error("PDF generation error:", err);
        setUiState((prev) => ({ ...prev, pdfProgress: 0, pdfStep: "" }));
        addToast(`PDF failed: ${err.message}`, "error");
      } finally {
        clearInterval(progressInterval);
        setModalsState((prev) => ({ ...prev, exportingId: null }));
      }
    },
    [addToast, buildQuotationForPDF]
  );

  const confirmDelete = useCallback(async () => {
    const { quotation } = modalsState.deleteModal;
    if (!quotation) return;
    setModalsState((prev) => ({ ...prev, deleteModal: { ...prev.deleteModal, busy: true } }));
    const result = await deleteQuotation(quotation._id);
    if (result?.success) {
      addToast(`Quotation ${quotation.quotationNumber} deleted.`, "success");
      setModalsState((prev) => ({ ...prev, deleteModal: { open: false, quotation: null, busy: false } }));
      await Promise.all([refreshCompanyQuotations({ forceRefresh: true }), refreshGlobalStats()]);
    } else {
      addToast(result?.error || "Delete failed", "error");
      setModalsState((prev) => ({ ...prev, deleteModal: { ...prev.deleteModal, busy: false } }));
    }
  }, [modalsState.deleteModal, deleteQuotation, addToast, refreshCompanyQuotations, refreshGlobalStats]);

  const confirmAward = useCallback(
    async (awarded, awardNote) => {
      const { quotation } = modalsState.awardModal;
      if (!quotation || awarded === null) return;
      setModalsState((prev) => ({ ...prev, awardModal: { ...prev.awardModal, busy: true } }));
      const result = await awardQuotation(quotation._id, awarded, awardNote);
      if (result?.success) {
        addToast(
          awarded ? `🏆 "${quotation.quotationNumber}" marked as Awarded!` : `"${quotation.quotationNumber}" marked as Not Awarded.`,
          "success"
        );
        await Promise.all([refreshCompanyQuotations({ forceRefresh: true }), refreshGlobalStats()]);
        setModalsState((prev) => ({ ...prev, awardModal: { open: false, quotation: null, busy: false } }));
      } else {
        addToast(result?.error || "Failed to update", "error");
        setModalsState((prev) => ({ ...prev, awardModal: { ...prev.awardModal, busy: false } }));
      }
    },
    [modalsState.awardModal, awardQuotation, addToast, refreshCompanyQuotations, refreshGlobalStats]
  );

  useEffect(() => {
    const handler = (e) => {
      if (e.key === "/" && !["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName)) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => () => clearTimeout(searchTimer.current), []);

  const TABS = useMemo(
    () => [
      { key: "all",         label: "All",         Icon: FileText,     count: globalTotalQuotations },
      { key: "pending",     label: "Pending",     Icon: Clock,        count: globalPending },
      { key: "in_review",   label: "In Review",   Icon: Shield,       count: globalInReview },
      { key: "approved",    label: "Approved",    Icon: CheckCircle,  count: globalApproved },
      { key: "awarded",     label: "Awarded",     Icon: Award,        count: globalAwarded },
      { key: "returned",    label: "Returned",    Icon: Ban,          count: globalReturned },
      { key: "rejected",    label: "Rejected",    Icon: XCircle,      count: globalRejected },
      { key: "not_awarded", label: "Not Awarded", Icon: TrendingDown, count: globalNotAwarded },
      { key: "cancelled",   label: "Cancelled",   Icon: XCircle,     count: globalCancelled },
      // "Amended" tab hidden for now — amend feature is disabled.
    ],
    [globalTotalQuotations, globalPending, globalInReview, globalApproved, globalAwarded, globalReturned, globalRejected, globalNotAwarded, globalCancelled]
  );

  const thStyle = {
    padding: "0.85rem 1rem", fontSize: "0.68rem", fontWeight: 600, color: T.inkFaint,
    textTransform: "uppercase", letterSpacing: "0.08em", textAlign: "left",
    borderBottom: `1px solid ${T.line}`, backgroundColor: T.surface, whiteSpace: "nowrap",
    position: "sticky", top: 0, zIndex: 1,
  };

  const SkeletonLoader = () => (
    <div style={{ overflowX: "auto", width: "100%", WebkitOverflowScrolling: "touch" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 940 }}>
        <thead>
          <tr>
            {["Quote #", "Customer", "Project Name", "Query Date", "Submitted", "Expiry", "Total", "Status", "Actions"].map((h) => (
              <th key={h} style={thStyle}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {[0, 1, 2, 3, 4, 5, 6].map((i) => (<SkeletonRow key={i} />))}
        </tbody>
      </table>
    </div>
  );

  const headerBtn = (variant) => {
    const variants = {
      ghost: { background: "transparent", color: "#c7cccf", border: "1px solid rgba(255,255,255,0.14)" },
      soft: { background: "rgba(255,255,255,0.08)", color: "#e6e9ea", border: "1px solid rgba(255,255,255,0.10)" },
      accent: { background: T.accent, color: "#fff", border: "1px solid transparent" },
    };
    return {
      ...variants[variant], borderRadius: 10,
      padding: isMobile ? "0.4rem 0.7rem" : "0.5rem 0.95rem",
      fontSize: isMobile ? "0.72rem" : "0.8rem", fontWeight: 600, cursor: "pointer",
      display: "flex", alignItems: "center", gap: "0.45rem", fontFamily: FONT_STACK,
      transition: "all 0.18s ease",
    };
  };

  return (
    <div style={{ minHeight: "100vh", backgroundColor: T.canvas, fontFamily: FONT_STACK, color: T.ink, overflowX: "hidden" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        @keyframes hs-spin { to{transform:rotate(360deg)} }
        @keyframes hs-shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
        @keyframes hs-fade-in { from{opacity:0; transform: translateY(4px)} to{opacity:1; transform:none} }
        .hs-fade-in { animation: hs-fade-in 0.32s cubic-bezier(0.22,1,0.36,1) both; }
        .hs-row { transition: background 0.15s ease; }
        .hs-row:hover td { background:#f9fafb !important; }
      `}</style>

      <Toast toasts={toasts} onDismiss={dismissToast} />

      <ConfirmModal
        open={modalsState.deleteModal.open}
        title="Delete Quotation"
        message={`Are you sure you want to permanently delete ${modalsState.deleteModal.quotation?.quotationNumber}? This action cannot be undone.`}
        confirmLabel="Delete"
        danger
        loading={modalsState.deleteModal.busy}
        onConfirm={confirmDelete}
        onCancel={() => !modalsState.deleteModal.busy && setModalsState((prev) => ({ ...prev, deleteModal: { open: false, quotation: null, busy: false } }))}
      >
        {modalsState.deleteModal.quotation?.status === "ops_rejected" && (
          <div style={{ backgroundColor: "#fdeceb", border: "1px solid #f8d6d2", borderRadius: 10, padding: "0.6rem 0.875rem", marginBottom: "0.75rem", fontSize: "0.8rem", color: "#c1352b", fontWeight: 600 }}>
            ⚠ This quotation was returned by Ops. You'll need to create a fresh one.
          </div>
        )}
      </ConfirmModal>

      <AwardModal
        open={modalsState.awardModal.open}
        quotation={modalsState.awardModal.quotation}
        onConfirm={confirmAward}
        onCancel={() => !modalsState.awardModal.busy && setModalsState((prev) => ({ ...prev, awardModal: { open: false, quotation: null, busy: false } }))}
        loading={modalsState.awardModal.busy}
      />

      {/* Header */}
      <div style={{ backgroundColor: T.ink, padding: isMobile ? "0.75rem 1rem" : "0 2rem", display: "flex", alignItems: "center", justifyContent: "space-between", minHeight: 64, position: "sticky", top: 0, zIndex: 50, flexWrap: "wrap", gap: "0.75rem" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: isMobile ? "100%" : "auto" }}>
          <div>
            <div style={{ fontSize: isMobile ? "1rem" : "1.05rem", fontWeight: 700, color: "#fff", letterSpacing: "-0.01em", display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: T.accent, display: "inline-block" }} />
              My Dashboard
            </div>
            {!isMobile && <div style={{ marginTop: 2 }}><CompanyCurrencyDisplay /></div>}
          </div>
          {isMobile && (
            <button onClick={() => setUiState((prev) => ({ ...prev, mobileMenuOpen: !prev.mobileMenuOpen }))} style={{ background: "rgba(255,255,255,0.1)", border: "none", borderRadius: 8, padding: "0.4rem 0.7rem", color: "white", cursor: "pointer" }}>
              <Menu size={20} />
            </button>
          )}
        </div>

        {isMobile && <CompanyCurrencyDisplay />}

        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap", ...(isMobile && !uiState.mobileMenuOpen ? { display: "none" } : { display: "flex" }), width: isMobile ? "100%" : "auto", justifyContent: isMobile ? "center" : "flex-end" }}>
          <CompanyCurrencySelector variant="compact" />
          <button onClick={() => onNavigate("customers")} style={headerBtn("soft")}>
            <Users size={isMobile ? 12 : 14} /> Customers
          </button>
          <button onClick={() => onNavigate("addQuotation")} style={headerBtn("accent")}>
            <Plus size={isMobile ? 12 : 14} /> {isMobile ? "New" : "New Quotation"}
          </button>
          <button onClick={handleLogout} style={headerBtn("ghost")}>
            <LogOut size={isMobile ? 12 : 15} /> Logout
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div style={{ maxWidth: 1400, margin: "0 auto", padding: isMobile ? "1.25rem 1rem" : "2.5rem 2rem" }}>
        {loadError && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", backgroundColor: "#fdeceb", border: "1px solid #f8d6d2", borderRadius: 12, padding: "0.875rem 1rem", marginBottom: "1.5rem", fontSize: "0.875rem", color: "#c1352b", flexWrap: "wrap", gap: "0.5rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}><AlertCircle size={16} /> {loadError}</div>
            <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
              <button onClick={() => clearError()} style={{ background: "none", border: "none", cursor: "pointer", color: "#c1352b", padding: 0 }}><X size={14} /></button>
              <button onClick={handleRefresh} style={{ background: "none", border: "none", cursor: "pointer", color: "#c1352b", display: "flex", alignItems: "center", gap: "0.3rem", fontWeight: 600, fontSize: "0.8rem" }}><RefreshCw size={13} /> Retry</button>
            </div>
          </div>
        )}

        {/* Stats */}
        {showStatsShimmer ? (
          <ShimmerStatsCard isMobile={isMobile} />
        ) : (
          <div className="hs-fade-in" style={{ marginBottom: "1.75rem" }}>
            {isMobile ? (
              <CompactStatsCard
                totalRevenue={globalAwardedValue}
                quotationsCount={globalTotalQuotations}
                customersCount={globalTotalCustomers}
                selectedCurrency={selectedCurrency}
                statusCounts={{ pending: globalPending, in_review: globalInReview, approved: globalApproved, awarded: globalAwarded, returned: globalReturned }}
                loading={false}
              />
            ) : (
              <DesktopStatsGrid
                totalRevenue={globalAwardedValue}
                quotationsCount={globalTotalQuotations}
                customersCount={globalTotalCustomers}
                selectedCurrency={selectedCurrency}
                statusCounts={{ pending: globalPending, in_review: globalInReview, approved: globalApproved, awarded: globalAwarded, returned: globalReturned }}
                loading={false}
              />
            )}
          </div>
        )}

        {/* Main Table/Card Container */}
        <div style={{ backgroundColor: T.surface, borderRadius: T.radius, boxShadow: T.shadow, overflow: "visible", position: "relative", border: `1px solid ${T.line}` }}>
          {/* Toolbar */}
          <div style={{ padding: isMobile ? "0.9rem 1rem" : "1.25rem 1.5rem", borderBottom: `1px solid ${T.lineSoft}`, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.9rem" }}>
            {/* Tabs */}
            <div style={{ display: "flex", gap: "0.15rem", padding: "0.3rem", backgroundColor: T.canvas, borderRadius: 12, overflowX: "auto", WebkitOverflowScrolling: "touch", width: "100%", border: `1px solid ${T.line}` }}>
              {TABS.map(({ key, label, Icon: I, count }) => {
                const active = (key === "all" && !filters.status) || filters.status === getStatusForTab(key);
                const isPending = key === "pending";
                const isReturned = key === "returned";
                const hasAlert = (isPending || isReturned) && count > 0;
                const alertColor = isPending ? "#b58a3c" : "#a85563";
                return (
                  <button
                    key={key}
                    onClick={() => handleTabChange(key)}
                    style={{
                      padding: isMobile ? "0.35rem 0.65rem" : "0.45rem 0.9rem",
                      borderRadius: 9, border: "none", cursor: "pointer",
                      fontSize: isMobile ? "0.72rem" : "0.8rem",
                      fontWeight: active ? 600 : 500,
                      display: "flex", alignItems: "center", gap: "0.4rem",
                      backgroundColor: active ? T.surface : "transparent",
                      color: active ? T.ink : T.inkSoft,
                      boxShadow: active ? "0 1px 3px rgba(20,22,24,0.08)" : "none",
                      whiteSpace: "nowrap", transition: "all 0.15s ease", fontFamily: FONT_STACK,
                    }}
                  >
                    <I size={isMobile ? 11 : 13} />
                    {!isMobile && label}
                    <span style={{ backgroundColor: hasAlert ? alertColor : active ? T.ink : T.line, color: hasAlert || active ? "#fff" : T.inkSoft, borderRadius: 999, padding: isMobile ? "1px 5px" : "1px 7px", fontSize: isMobile ? "0.6rem" : "0.66rem", fontWeight: 700, minWidth: 16, textAlign: "center" }}>
                      {showStatsShimmer ? "…" : count}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Search, Refresh, View Toggle */}
            <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", width: isMobile ? "100%" : "auto" }}>
              <button onClick={handleRefresh} disabled={isRefreshing} style={{ width: isMobile ? 38 : 36, height: isMobile ? 38 : 36, border: `1px solid ${T.line}`, borderRadius: 10, background: T.canvas, cursor: isRefreshing ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", opacity: isRefreshing ? 0.5 : 1 }}>
                <RefreshCw size={14} color={T.inkSoft} style={isRefreshing ? { animation: "hs-spin 1s linear infinite" } : {}} />
              </button>

              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", backgroundColor: T.canvas, border: `1px solid ${T.line}`, borderRadius: 10, padding: isMobile ? "0.5rem 0.8rem" : "0.45rem 0.8rem", flex: isMobile ? 1 : "auto" }}>
                <Search size={14} color={T.inkFaint} />
                <input ref={searchRef} style={{ border: "none", background: "transparent", outline: "none", fontSize: "0.875rem", color: T.ink, width: isMobile ? "100%" : 210, fontFamily: FONT_STACK }} placeholder="Search…  /" defaultValue={filters.search} onChange={handleSearchChange} disabled={isInitialLoading} />
                {filters.search && <button onClick={clearSearch} style={{ background: "none", border: "none", cursor: "pointer", color: T.inkFaint, padding: 0 }}><X size={13} /></button>}
              </div>

              <QuotationFilterBar
                T={T}
                FONT_STACK={FONT_STACK}
                isMobile={isMobile}
                fromDate={filters.fromDate}
                toDate={filters.toDate}
                onApply={handleApplyFilters}
              />

              <ViewToggle view={uiState.viewMode} onViewChange={(view) => setUiState((prev) => ({ ...prev, viewMode: view }))} isMobile={isMobile} />
            </div>
          </div>

          {/* Refresh overlay */}
          {isRefreshing && !isInitialLoading && (
            <div style={{ position: "absolute", inset: 0, backgroundColor: "rgba(255,255,255,0.80)", zIndex: 10, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: T.radius, backdropFilter: "blur(1.5px)" }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.75rem", background: T.surface, padding: isMobile ? "1rem 1.5rem" : "1.25rem 2rem", borderRadius: 14, boxShadow: T.shadow, border: `1px solid ${T.line}` }}>
                <RefreshCw size={isMobile ? 20 : 24} color={T.accent} style={{ animation: "hs-spin 0.8s linear infinite" }} />
                <span style={{ fontSize: isMobile ? "0.75rem" : "0.82rem", color: T.accentInk, fontWeight: 600 }}>Refreshing…</span>
              </div>
            </div>
          )}

          {/* Content */}
          {isInitialLoading ? (
            <SkeletonLoader />
          ) : (
            <div className="hs-fade-in">
              {showEmptyState ? (
                <div style={{ textAlign: "center", padding: isMobile ? "3.5rem 1rem" : "5rem 2rem", color: T.inkFaint }}>
                  <div style={{ width: 64, height: 64, borderRadius: "50%", background: T.accentSoft, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 1.25rem" }}>
                    <FileText size={28} color={T.accent} />
                  </div>
                  <p style={{ fontWeight: 600, fontSize: isMobile ? "0.95rem" : "1.05rem", color: T.ink, marginBottom: "0.4rem" }}>No quotations yet</p>
                  <p style={{ fontSize: isMobile ? "0.82rem" : "0.9rem", marginBottom: "1.75rem", color: T.inkSoft }}>Create your first quotation to get started.</p>
                  <button onClick={() => onNavigate("addQuotation")} style={{ background: T.accent, color: "white", border: "none", borderRadius: 10, padding: isMobile ? "0.6rem 1.1rem" : "0.7rem 1.4rem", fontWeight: 600, fontSize: isMobile ? "0.82rem" : "0.9rem", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "0.45rem", fontFamily: FONT_STACK }}>
                    <Plus size={isMobile ? 14 : 16} /> New Quotation
                  </button>
                </div>
              ) : (
                <>
                  {isMobile || uiState.viewMode === "card" ? (
                    <>
                      <div style={{ padding: isMobile ? "0.75rem" : "1rem", display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(2, 1fr)", gap: isMobile ? "0.75rem" : "1rem" }}>
                        {safeQ.map((q) => (
                          <QuotationCard
                            key={q._id}
                            quotation={q}
                            selectedCurrency={selectedCurrency}
                            onView={onViewQuotation}
                            onFollowUp={(quotation) => setModalsState((prev) => ({ ...prev, queryDateModal: { open: true, quotation } }))}
                            onDownload={handleDownload}
                            onAward={(quotation) => setModalsState((prev) => ({ ...prev, awardModal: { open: true, quotation, busy: false } }))}
                            onDelete={(quotation) => setModalsState((prev) => ({ ...prev, deleteModal: { open: true, quotation, busy: false } }))}
                            isExporting={modalsState.exportingId === q._id}
                          />
                        ))}
                      </div>
                      {totalCount > 0 && (
                        <PaginationBar total={totalCount} page={currentPage} limit={currentLimit} totalPages={totalPages} onPageChange={handlePageChange} onLimitChange={handleLimitChange} />
                      )}
                    </>
                  ) : (
                    <>
                      <div style={{ overflowX: "auto", width: "100%", WebkitOverflowScrolling: "touch" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 940 }}>
                          <thead>
                            <tr>
                              <SortHeader label="Quote #" field="quotationNumber" sort={{ field: filters.sortBy, dir: filters.sortDir }} onSort={handleSort} />
                              <SortHeader label="Customer" field="customer" sort={{ field: filters.sortBy, dir: filters.sortDir }} onSort={handleSort} />
                              <th style={thStyle}>Project Name</th>
                              <SortHeader label="Query Date" field="queryDate" sort={{ field: filters.sortBy, dir: filters.sortDir }} onSort={handleSort} align="center" />
                              <SortHeader label="Submitted" field="date" sort={{ field: filters.sortBy, dir: filters.sortDir }} onSort={handleSort} />
                              <SortHeader label="Expiry" field="expiryDate" sort={{ field: filters.sortBy, dir: filters.sortDir }} onSort={handleSort} />
                              <SortHeader label="Total" field="total" sort={{ field: filters.sortBy, dir: filters.sortDir }} onSort={handleSort} align="right" />
                              <SortHeader label="Status" field="status" sort={{ field: filters.sortBy, dir: filters.sortDir }} onSort={handleSort} />
                              <th style={{ ...thStyle, textAlign: "center" }}>Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {safeQ.map((q) => {
                              const expired = isExpired(q.expiryDate);
                              const expiring = !expired && isExpiringSoon(q.expiryDate);
                              const canDelete = DELETABLE.has(q.status);
                              const canAward = q.status === "approved";
                              const queryDatePassed = q.queryDate && new Date(q.queryDate) < new Date();
                              return (
                                <tr key={q._id} style={{ borderBottom: `1px solid ${T.lineSoft}` }} className="hs-row">
                                  <td style={{ padding: "1rem", verticalAlign: "middle" }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", flexWrap: "wrap" }}>
                                      <span style={{ fontWeight: 600, color: T.ink, fontFamily: "'Inter', monospace", fontSize: "0.8rem" }}>{q.quotationNumber || "—"}</span>
                                      {q.revisedFrom && <span style={{ fontSize: "0.6rem", fontWeight: 700, color: "#6d28d9", background: "#f5f3ff", padding: "1px 6px", borderRadius: 999, border: "1px solid #c4b5fd" }}>Rev</span>}
                                      {expired && <span style={{ fontSize: "0.6rem", fontWeight: 600, color: "#c1352b", background: "#fdeceb", padding: "1px 6px", borderRadius: 999, border: "1px solid #f8d6d2" }}>Expired</span>}
                                      {expiring && <span style={{ fontSize: "0.6rem", fontWeight: 600, color: "#b45309", background: "#fff7e6", padding: "1px 6px", borderRadius: 999, border: "1px solid #fde9c8" }}>Expiring</span>}
                                    </div>
                                  </td>
                                  <td style={{ padding: "1rem", verticalAlign: "middle" }}>
                                    <div style={{ fontWeight: 600, color: T.ink, fontSize: "0.875rem" }}>{q.customerSnapshot?.name || q.customer || q.customerId?.name || "N/A"}</div>
                                    {q.contact && <div style={{ fontSize: "0.75rem", color: T.inkFaint, marginTop: 2 }}>{q.contact}</div>}
                                    <RejectionNote quotation={q} />
                                  </td>
                                  <td style={{ padding: "1rem", verticalAlign: "middle" }}>
                                    <div style={{ fontSize: "0.875rem", color: T.inkSoft }}>{q.projectName || "—"}</div>
                                  </td>
                                  <td style={{ padding: "1rem", verticalAlign: "middle", textAlign: "center" }}>
                                    {q.queryDate ? (
                                      <span style={{ background: queryDatePassed ? "#fdeceb" : "#fff7e6", color: queryDatePassed ? "#c1352b" : "#b45309", padding: "0.25rem 0.7rem", borderRadius: 999, fontSize: "0.75rem", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: "0.25rem" }}>
                                        <Calendar size={12} /> {fmtDate(q.queryDate)} {queryDatePassed && "⚠"}
                                      </span>
                                    ) : (
                                      <span style={{ color: T.inkFaint }}>—</span>
                                    )}
                                  </td>
                                  <td style={{ padding: "1rem", fontSize: "0.8rem", color: T.inkSoft, verticalAlign: "middle", whiteSpace: "nowrap" }}>{fmtDate(q.date)}</td>
                                  <td style={{ padding: "1rem", fontSize: "0.8rem", verticalAlign: "middle", whiteSpace: "nowrap" }}>
                                    <span style={{ color: expired ? "#c1352b" : expiring ? "#b45309" : T.inkSoft, fontWeight: expired || expiring ? 600 : 400 }}>{fmtDate(q.expiryDate)}</span>
                                  </td>
                                  <td style={{ padding: "1rem", verticalAlign: "middle", textAlign: "right", whiteSpace: "nowrap" }}>
  <div>
    <span style={{ fontSize: "0.9rem", fontWeight: 700, color: T.ink }}>
      {fmtCurrency(q.total)}
    </span>
    <span style={{ fontSize: "0.65rem", fontWeight: 400, color: T.inkFaint, marginLeft: "0.25rem" }}>
      {q.currency?.code || selectedCurrency}
    </span>
  </div>
  {(q.currency?.code && q.currency.code !== selectedCurrency && q.totalInBaseCurrency != null) && (
    <div style={{ marginTop: 2 }}>
      <span style={{ fontSize: "0.7rem", fontWeight: 500, color: T.inkFaint }}>≈ </span>
      <span style={{ fontSize: "0.7rem", fontWeight: 500, color: T.inkFaint }}>
        {fmtCurrency(q.totalInBaseCurrency)}
      </span>
      <span style={{ fontSize: "0.6rem", fontWeight: 400, color: T.inkFaint, marginLeft: "0.2rem" }}>
        {selectedCurrency}
      </span>
    </div>
  )}
</td>
                                  <td style={{ padding: "1rem", verticalAlign: "middle" }}><EnhancedStatusBadge status={q.status} quotation={q} /></td>
                                  <td style={{ padding: "0.85rem 1rem", verticalAlign: "middle" }}>
                                    <div style={{ display: "flex", gap: "0.3rem", justifyContent: "center", flexWrap: "wrap" }}>
                                      <ActionBtn bg="#e6f0fb" color="#1d63c4" onClick={() => onViewQuotation(q._id)} icon={Eye} label="View" title="View quotation" />
                                      {canAward && <ActionBtn bg="#e3f5ee" color="#0f7a52" onClick={() => setModalsState((prev) => ({ ...prev, awardModal: { open: true, quotation: q, busy: false } }))} icon={Award} label="Award" title="Mark awarded / not awarded" />}
                                      {canDelete && <ActionBtn bg="#fdeceb" color="#c1352b" onClick={() => setModalsState((prev) => ({ ...prev, deleteModal: { open: true, quotation: q, busy: false } }))} icon={Trash2} label="Del" title="Delete quotation" />}
                                    </div>
                                   </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                      <PaginationBar total={totalCount} page={currentPage} limit={currentLimit} totalPages={totalPages} onPageChange={handlePageChange} onLimitChange={handleLimitChange} />
                    </>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Loading Overlays */}
      {uiState.saveProgress > 0 && <LoadingOverlay type="saving" step={uiState.saveStep} progress={uiState.saveProgress} />}
      {uiState.pdfProgress > 0 && <LoadingOverlay type="pdf" step={uiState.pdfStep} progress={uiState.pdfProgress} />}
      {refreshState.isRefreshing && refreshState.progress > 0 && (
        <LoadingOverlay type="processing" step={refreshState.step} progress={refreshState.progress} />
      )}
      <QueryDateUpdater
        open={modalsState.queryDateModal.open}
        onClose={() => setModalsState((prev) => ({ ...prev, queryDateModal: { open: false, quotation: null } }))}
        onUpdate={handleUpdateQueryDate}
        quotations={safeQ}
        loading={globalStatsLoading}
      />
    </div>
  );
}