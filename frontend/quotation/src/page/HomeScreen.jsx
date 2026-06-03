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

// Import the new stats hook
import { useDashboardStats } from "../hooks/useDashboardStats";

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

const STATUS_CONFIG = {
  pending: {
    label: "Pending",
    bg: "#fef3c7",
    color: "#92400e",
    borderColor: "#fde68a",
    icon: "⏳",
    description: "Awaiting submission",
  },
  pending_admin: {
    label: "Pending",
    bg: "#fef3c7",
    color: "#92400e",
    borderColor: "#fde68a",
    icon: "⏳",
    description: "Awaiting submission",
  },
  ops_approved: {
    label: "In Review",
    bg: "#dbeafe",
    color: "#0c4a6e",
    borderColor: "#7dd3fc",
    icon: "👁️",
    description: "Under ops review",
  },
  approved: {
    label: "Approved",
    bg: "#d1fae5",
    color: "#065f46",
    borderColor: "#6ee7b7",
    icon: "✓",
    description: "Ready to present",
  },
  awarded: {
    label: "Awarded",
    bg: "#e9d5ff",
    color: "#6b21a8",
    borderColor: "#d8b4fe",
    icon: "🏆",
    description: "Order confirmed",
  },
  not_awarded: {
    label: "Not Awarded",
    bg: "#fed7aa",
    color: "#9a3412",
    borderColor: "#fdba74",
    icon: "✗",
    description: "Lost to competitor",
  },
  ops_rejected: {
    label: "Returned",
    bg: "#fee2e2",
    color: "#991b1b",
    borderColor: "#fecaca",
    icon: "⚠️",
    description: "Ops rejected - revise",
  },
  rejected: {
    label: "Rejected",
    bg: "#fee2e2",
    color: "#991b1b",
    borderColor: "#fecaca",
    icon: "✗",
    description: "Customer rejected",
  },
};

// Tab to status mapping
const TAB_STATUS_MAP = {
  all: null,
  pending: 'pending',
  in_review: 'ops_approved',
  approved: 'approved',
  awarded: 'awarded',
  returned: 'ops_rejected'
};

const EnhancedStatusBadge = React.memo(({ status, quotation }) => {
  const config = STATUS_CONFIG[status] || {
    label: status?.replace(/_/g, " ") || "Unknown",
    bg: "#f1f5f9",
    color: "#64748b",
    borderColor: "#cbd5e1",
    icon: "?",
    description: "Unknown status",
  };

  const isExp = quotation && new Date(quotation.expiryDate) < new Date();
  const isExpiringSn =
    quotation &&
    !isExp &&
    new Date(quotation.expiryDate) - new Date() < 7 * 24 * 60 * 60 * 1000;

  if (isExp && status === "pending") {
    return (
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "0.4rem",
          padding: "0.35rem 0.75rem",
          borderRadius: "999px",
          fontSize: "0.8rem",
          fontWeight: 600,
          backgroundColor: "#fee2e2",
          color: "#991b1b",
          border: "1px solid #fecaca",
          whiteSpace: "nowrap",
          cursor: "help",
          title: "Quotation has expired",
        }}
      >
        <span>🔴</span> Expired
      </div>
    );
  }

  if (isExpiringSn && status === "pending") {
    return (
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "0.4rem",
          padding: "0.35rem 0.75rem",
          borderRadius: "999px",
          fontSize: "0.8rem",
          fontWeight: 600,
          backgroundColor: "#fffbeb",
          color: "#d97706",
          border: "1px solid #fde68a",
          whiteSpace: "nowrap",
          cursor: "help",
          title: "Expiring in less than 7 days",
        }}
      >
        <span>⚡</span> Expiring Soon
      </div>
    );
  }

  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.35rem",
        padding: "0.35rem 0.75rem",
        borderRadius: "999px",
        fontSize: "0.8rem",
        fontWeight: 600,
        backgroundColor: config.bg,
        color: config.color,
        border: `1px solid ${config.borderColor}`,
        whiteSpace: "nowrap",
        cursor: "help",
        title: config.description,
        transition: "all 0.2s ease",
      }}
    >
      <span>{config.icon}</span>
      {config.label}
    </div>
  );
});

// Page Button Component
const PageBtn = React.memo(({ n, current, onPage }) => (
  <button
    onClick={() => onPage(n)}
    style={{
      minWidth: 30,
      height: 30,
      borderRadius: 7,
      border: n === current ? "none" : "1px solid #e2e8f0",
      backgroundColor: n === current ? "#0f172a" : "#fff",
      color: n === current ? "#fff" : "#64748b",
      fontWeight: n === current ? 700 : 500,
      fontSize: "0.8rem",
      cursor: "pointer",
      transition: "all 0.15s ease",
    }}
  >
    {n}
  </button>
));

// Pagination Bar Component - Uses backend pagination
const PaginationBar = React.memo(({ 
  total, 
  page, 
  limit, 
  totalPages,
  onPageChange, 
  onLimitChange 
}) => {
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
  
  return (
    <div style={{ 
      padding: '0.75rem 1.5rem', 
      borderTop: '1px solid #f1f5f9', 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'space-between', 
      flexWrap: 'wrap', 
      gap: '0.75rem',
      backgroundColor: '#ffffff'
    }}>
      <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
        Showing <strong>{start}–{end}</strong> of <strong>{total}</strong>
      </span>
      
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <select
          value={limit}
          onChange={(e) => onLimitChange(Number(e.target.value))}
          style={{
            padding: '0.25rem 0.5rem',
            borderRadius: '6px',
            border: '1px solid #e2e8f0',
            fontSize: '0.75rem',
            backgroundColor: '#fff',
            cursor: 'pointer'
          }}
        >
          {PAGE_SIZE_OPTIONS.map(size => (
            <option key={size} value={size}>{size} per page</option>
          ))}
        </select>
        
        <button 
          onClick={() => onPageChange(Math.max(1, page - 1))} 
          disabled={page === 1} 
          style={{ 
            width: 30, 
            height: 30, 
            border: '1px solid #e2e8f0', 
            borderRadius: 7, 
            background: '#fff', 
            cursor: page === 1 ? 'not-allowed' : 'pointer', 
            opacity: page === 1 ? 0.4 : 1, 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
          }}
        >
          <ChevronLeft size={14}/>
        </button>
        
        {showStartEllipsis && (
          <>
            <PageBtn n={1} current={page} onPage={onPageChange} />
            {pages[0] > 2 && <span style={{ color: '#94a3b8', fontSize: '0.8rem' }}>…</span>}
          </>
        )}
        
        {pages.map(n => (
          <PageBtn key={n} n={n} current={page} onPage={onPageChange} />
        ))}
        
        {showEndEllipsis && (
          <>
            {pages[pages.length - 1] < totalPages - 1 && (
              <span style={{ color: '#94a3b8', fontSize: '0.8rem' }}>…</span>
            )}
            <PageBtn n={totalPages} current={page} onPage={onPageChange} />
          </>
        )}
        
        <button 
          onClick={() => onPageChange(Math.min(totalPages, page + 1))} 
          disabled={page === totalPages} 
          style={{ 
            width: 30, 
            height: 30, 
            border: '1px solid #e2e8f0', 
            borderRadius: 7, 
            background: '#fff', 
            cursor: page === totalPages ? 'not-allowed' : 'pointer', 
            opacity: page === totalPages ? 0.5 : 1, 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
          }}
        >
          <ChevronRight size={14}/>
        </button>
      </div>
    </div>
  );
});

// Shimmer Stats Component for loading state
const ShimmerStatsCard = ({ isMobile }) => {
  if (isMobile) {
    return (
      <div style={{ marginBottom: "1.5rem" }}>
        <div style={{
          background: 'white',
          borderRadius: '20px',
          padding: '1rem',
          border: '1px solid #f1f5f9'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <div style={{
              width: '100px',
              height: '20px',
              borderRadius: '4px',
              background: 'linear-gradient(90deg, #f1f5f9 25%, #e2e8f0 50%, #f1f5f9 75%)',
              backgroundSize: '200% 100%',
              animation: 'hs-shimmer 1.4s ease infinite'
            }} />
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              background: 'linear-gradient(90deg, #f1f5f9 25%, #e2e8f0 50%, #f1f5f9 75%)',
              backgroundSize: '200% 100%',
              animation: 'hs-shimmer 1.4s ease infinite'
            }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem' }}>
            {[1, 2, 3, 4].map(i => (
              <div key={i}>
                <div style={{
                  width: '60px',
                  height: '12px',
                  borderRadius: '4px',
                  marginBottom: '8px',
                  background: 'linear-gradient(90deg, #f1f5f9 25%, #e2e8f0 50%, #f1f5f9 75%)',
                  backgroundSize: '200% 100%',
                  animation: 'hs-shimmer 1.4s ease infinite'
                }} />
                <div style={{
                  width: '80px',
                  height: '24px',
                  borderRadius: '4px',
                  background: 'linear-gradient(90deg, #f1f5f9 25%, #e2e8f0 50%, #f1f5f9 75%)',
                  backgroundSize: '200% 100%',
                  animation: 'hs-shimmer 1.4s ease infinite'
                }} />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }
  
  return (
    <div style={{ marginBottom: "1.5rem" }}>
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(4, 1fr)', 
        gap: '1rem',
        marginBottom: '1rem'
      }}>
        {[1, 2, 3, 4].map(i => (
          <div key={i} style={{
            background: 'white',
            borderRadius: '20px',
            padding: '1.25rem',
            border: '1px solid #f1f5f9'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{
                  width: '80px',
                  height: '12px',
                  borderRadius: '4px',
                  background: 'linear-gradient(90deg, #f1f5f9 25%, #e2e8f0 50%, #f1f5f9 75%)',
                  backgroundSize: '200% 100%',
                  animation: 'hs-shimmer 1.4s ease infinite'
                }} />
                <div style={{
                  width: '100px',
                  height: '28px',
                  borderRadius: '4px',
                  marginTop: '8px',
                  background: 'linear-gradient(90deg, #f1f5f9 25%, #e2e8f0 50%, #f1f5f9 75%)',
                  backgroundSize: '200% 100%',
                  animation: 'hs-shimmer 1.4s ease infinite'
                }} />
              </div>
              <div style={{
                width: '46px',
                height: '46px',
                borderRadius: '12px',
                background: 'linear-gradient(90deg, #f1f5f9 25%, #e2e8f0 50%, #f1f5f9 75%)',
                backgroundSize: '200% 100%',
                animation: 'hs-shimmer 1.4s ease infinite'
              }} />
            </div>
          </div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
        {[1, 2, 3].map(i => (
          <div key={i} style={{
            background: 'white',
            borderRadius: '20px',
            padding: '1.25rem',
            border: '1px solid #f1f5f9'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{
                  width: '80px',
                  height: '12px',
                  borderRadius: '4px',
                  background: 'linear-gradient(90deg, #f1f5f9 25%, #e2e8f0 50%, #f1f5f9 75%)',
                  backgroundSize: '200% 100%',
                  animation: 'hs-shimmer 1.4s ease infinite'
                }} />
                <div style={{
                  width: '100px',
                  height: '28px',
                  borderRadius: '4px',
                  marginTop: '8px',
                  background: 'linear-gradient(90deg, #f1f5f9 25%, #e2e8f0 50%, #f1f5f9 75%)',
                  backgroundSize: '200% 100%',
                  animation: 'hs-shimmer 1.4s ease infinite'
                }} />
              </div>
              <div style={{
                width: '46px',
                height: '46px',
                borderRadius: '12px',
                background: 'linear-gradient(90deg, #f1f5f9 25%, #e2e8f0 50%, #f1f5f9 75%)',
                backgroundSize: '200% 100%',
                animation: 'hs-shimmer 1.4s ease infinite'
              }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default function HomeScreen({ onNavigate, onViewQuotation }) {
  const isMobile = useMediaQuery("(max-width: 768px)");
 
  const [uiState, setUiState] = useState({
    mobileMenuOpen: false,
    viewMode: "table",
    saveProgress: 0,
    saveStep: "",
    pdfProgress: 0,
    pdfStep: "",
  });

  const [filters, setFilters] = useState({
    status: null,
    search: "",
    sortBy: "date",
    sortDir: "desc",
  });
  
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);
  const [modalsState, setModalsState] = useState({
    exportingId: null,
    deleteModal: { open: false, quotation: null, busy: false },
    awardModal: { open: false, quotation: null, busy: false },
    queryDateModal: { open: false, quotation: null },
  });

  const [refreshState, setRefreshState] = useState({
    progress: 0,
    step: "",
    isRefreshing: false,
  });
  const [toasts, setToasts] = useState([]);
  const searchRef = useRef(null);
  const searchTimer = useRef(null);
  let toastIdRef = useRef(0);

  // ✅ Dashboard stats hook (global stats)
  const { 
    totalQuotations: globalTotalQuotations,
    pending: globalPending,
    inReview: globalInReview,
    returned: globalReturned,
    approved: globalApproved,
    awarded: globalAwarded,
    rejected: globalRejected,
    awardedValue: globalAwardedValue,
    totalCustomers: globalTotalCustomers,
    conversionRate: globalConversionRate,
    statusCounts: globalStatusCounts,
    loading: globalStatsLoading,
    refresh: refreshGlobalStats
  } = useDashboardStats();

  // Backend pagination hook (table data)
  const {
    quotations,
    quotationsLoading,
    quotationsInitialized,
    pagination,
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
  
  const {
    company: currentCompany,
    selectedCurrency,
    refreshCompanyData,
  } = useCompanyCurrency();

  const hasMountedRef = useRef(false);
 
  // Determine loading states
  const isLoading = (!quotationsInitialized || globalStatsLoading) && !initialLoadComplete;
  const isRefreshing = quotationsInitialized && quotationsLoading && quotations?.length > 0;
  const showEmptyState = quotationsInitialized && !quotationsLoading && (!quotations || quotations.length === 0);
  
  // Wait for both stats and quotations to be ready
  useEffect(() => {
    if (quotationsInitialized && !globalStatsLoading && !initialLoadComplete) {
      const timer = setTimeout(() => {
        setInitialLoadComplete(true);
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [quotationsInitialized, globalStatsLoading, initialLoadComplete]);
  
  // Reset loading when company changes
  useEffect(() => {
    setInitialLoadComplete(false);
  }, [selectedCompany]);
  
  // Update limit when mobile changes
  useEffect(() => {
    const newLimit = isMobile ? 10 : 20;
    if (currentLimit !== newLimit) {
      changeLimit(newLimit);
    }
  }, [isMobile, currentLimit, changeLimit]);

  // Update view mode on mobile
  useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      return;
    }
    if (isMobile) {
      setUiState((prev) => ({
        ...prev,
        viewMode: "card",
      }));
    }
  }, [isMobile]);
 
  const safeQ = quotations || [];

  const addToast = useCallback((message, type = "info") => {
    const id = ++toastIdRef.current;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(
      () => setToasts((prev) => prev.filter((t) => t.id !== id)),
      4000
    );
  }, []);

  const dismissToast = useCallback(
    (id) => setToasts((prev) => prev.filter((t) => t.id !== id)),
    []
  );

  const handleTabChange = useCallback((key) => {
    const newStatus = TAB_STATUS_MAP[key];
    
    setFilters(prev => ({ 
      ...prev, 
      status: newStatus,
      sortBy: 'date',
      sortDir: 'desc'
    }));
    
    refreshCompanyQuotations({ 
      status: newStatus,
      page: 1,
      sortBy: 'date',
      sortDir: 'desc',
      search: filters.search
    });
  }, [refreshCompanyQuotations, filters.search]);
  // Handle search
  const handleSearchChange = useCallback((e) => {
    const val = e.target.value;
    setFilters(prev => ({ ...prev, search: val }));
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      refreshCompanyQuotations({ 
        search: val,
        status: filters.status,
        page: 1,
        sortBy: filters.sortBy,
        sortDir: filters.sortDir,
      });
    }, DEBOUNCE_MS);
  }, [refreshCompanyQuotations, filters.status, filters.sortBy, filters.sortDir]);

  const clearSearch = useCallback(() => {
    setFilters(prev => ({ ...prev, search: "" }));
    refreshCompanyQuotations({ 
      search: "",
      status: filters.status,
      page: 1,
      sortBy: filters.sortBy,
      sortDir: filters.sortDir,
    });
    if (searchRef.current) searchRef.current.value = "";
  }, [refreshCompanyQuotations, filters.status, filters.sortBy, filters.sortDir]);

  // Handle sort
  const handleSort = useCallback((field) => {
    const newDir = filters.sortBy === field && filters.sortDir === "asc" ? "desc" : "asc";
    const sortField = field === "customer" ? "customerSnapshot.name" : field;
    
    setFilters(prev => ({ ...prev, sortBy: sortField, sortDir: newDir }));
    refreshCompanyQuotations({ 
      sortBy: sortField,
      sortDir: newDir,
      status: filters.status,
      search: filters.search,
      page: 1,
    });
  }, [refreshCompanyQuotations, filters.status, filters.search, filters.sortBy, filters.sortDir]);

  const handlePageChange = useCallback((newPage) => {
    goToPage(newPage);
  }, [goToPage]);

  const handleLimitChange = useCallback((newLimit) => {
    changeLimit(newLimit);
  }, [changeLimit]);

  const handleUpdateQueryDate = useCallback(
    async (id, date) => {
      const result = await updateQueryDate(id, date);
      if (result?.success) {
        addToast("Follow-up date updated successfully", "success");
        await refreshCompanyQuotations({ forceRefresh: true });
      } else {
        addToast(result?.error || "Failed to update follow-up date", "error");
      }
      setModalsState((prev) => ({
        ...prev,
        queryDateModal: { open: false, quotation: null },
      }));
    },
    [updateQueryDate, addToast, refreshCompanyQuotations]
  );

  const handleRefresh = useCallback(async () => {
    setRefreshState({
      progress: 10,
      step: "Refreshing data...",
      isRefreshing: true,
    });
  
    const progressInterval = setInterval(() => {
      setRefreshState(prev => ({
        ...prev,
        progress: prev.progress >= 90 ? 90 : prev.progress + 10,
      }));
    }, 500);
  
    try {
      await Promise.all([
        refreshGlobalStats(),
        refreshCompanyQuotations({ forceRefresh: true })
      ]);
  
      setRefreshState({
        progress: 100,
        step: "Complete!",
        isRefreshing: true,
      });
      addToast("Data refreshed", "success");
  
      setTimeout(() => {
        setRefreshState({
          progress: 0,
          step: "",
          isRefreshing: false,
        });
      }, 1000);
    } catch (err) {
      setRefreshState({
        progress: 0,
        step: "",
        isRefreshing: false,
      });
      addToast(err.message || "Refresh failed", "error");
    } finally {
      clearInterval(progressInterval);
    }
  }, [refreshGlobalStats, refreshCompanyQuotations, addToast]);

  const buildQuotationForPDF = useCallback(async (quotation) => {
    if (quotation.termsAndConditions && quotation.termsAndConditions.includes("<img")) {
      return quotation;
    }
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
        setUiState((prev) => ({
          ...prev,
          pdfProgress: prev.pdfProgress >= 90 ? 90 : prev.pdfProgress + 10,
        }));
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

        setTimeout(() => {
          setUiState((prev) => ({ ...prev, pdfProgress: 0, pdfStep: "" }));
        }, 1000);
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
      await Promise.all([
        refreshCompanyQuotations({ forceRefresh: true }),
        refreshGlobalStats()
      ]);
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
          awarded
            ? `🏆 "${quotation.quotationNumber}" marked as Awarded!`
            : `"${quotation.quotationNumber}" marked as Not Awarded.`,
          "success"
        );
        await Promise.all([
          refreshCompanyQuotations({ forceRefresh: true }),
          refreshGlobalStats()
        ]);
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

  // TABS use GLOBAL stats
  const TABS = useMemo(
    () => [
      { key: 'all', label: 'All', Icon: FileText, count: globalTotalQuotations },
      { key: 'pending', label: 'Pending', Icon: Clock, count: globalPending },
      { key: 'in_review', label: 'In Review', Icon: Shield, count: globalInReview },
      { key: 'approved', label: 'Approved', Icon: CheckCircle, count: globalApproved },
      { key: 'awarded', label: 'Awarded', Icon: Award, count: globalAwarded },
      { key: 'returned', label: 'Returned', Icon: Ban, count: globalReturned },
    ],
    [globalTotalQuotations, globalPending, globalInReview, globalApproved, globalAwarded, globalReturned]
  );

  const SkeletonLoader = () => (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ backgroundColor: "#fafafa" }}>
            {["Quote #", "Customer", "Project Name", "Query Date", "Submitted", "Expiry", "Total", "Status", "Actions"].map((h) => (
              <th key={h} style={{ padding: "0.75rem 1rem", fontSize: "0.72rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: "1px solid #f1f5f9", whiteSpace: "nowrap" }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {[0, 1, 2, 3, 4, 5, 6].map((i) => (
            <SkeletonRow key={i} />
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#f1f5f9", fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
      <style>{`
        @keyframes hs-spin { to{transform:rotate(360deg)} }
        @keyframes hs-shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
        .hs-row:hover td { background:#f8fafc !important; }
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
          <div style={{ backgroundColor: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "0.6rem 0.875rem", marginBottom: "0.75rem", fontSize: "0.8rem", color: "#991b1b", fontWeight: 600 }}>
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
      <div style={{ backgroundColor: "#0f172a", padding: isMobile ? "0.75rem 1rem" : "0 2rem", display: "flex", alignItems: "center", justifyContent: "space-between", minHeight: 60, position: "sticky", top: 0, zIndex: 50, boxShadow: "0 2px 8px rgba(0,0,0,0.25)", flexWrap: "wrap", gap: "0.75rem" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: isMobile ? "100%" : "auto" }}>
          <div>
            <div style={{ fontSize: isMobile ? "1rem" : "1.0625rem", fontWeight: 800, color: "white", letterSpacing: "-0.01em" }}>📋 My Dashboard</div>
            {!isMobile && <CompanyCurrencyDisplay />}
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
          <button onClick={() => onNavigate("customers")} style={{ backgroundColor: "#e0e7ff", color: "#4f46e5", border: "none", borderRadius: 8, padding: isMobile ? "0.35rem 0.7rem" : "0.45rem 0.875rem", fontSize: isMobile ? "0.7rem" : "0.8rem", fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: "0.4rem" }}>
            <Users size={isMobile ? 12 : 14} /> Customers
          </button>
          <button onClick={() => onNavigate("addQuotation")} style={{ backgroundColor: "#10b981", color: "white", border: "none", borderRadius: 8, padding: isMobile ? "0.35rem 0.7rem" : "0.45rem 0.875rem", fontSize: isMobile ? "0.7rem" : "0.8rem", fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: "0.4rem" }}>
            <FileText size={isMobile ? 12 : 14} /> {isMobile ? "New" : "New Quotation"}
          </button>
          <button onClick={handleLogout} style={{ backgroundColor: "rgba(255,255,255,0.08)", color: "#94a3b8", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, padding: isMobile ? "0.35rem 0.7rem" : "0.45rem 0.85rem", fontSize: isMobile ? "0.7rem" : "0.8rem", fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: "0.4rem" }}>
            <LogOut size={isMobile ? 12 : 15} /> Logout
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div style={{ maxWidth: 1400, margin: "0 auto", padding: isMobile ? "1rem" : "2rem" }}>
        {loadError && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", backgroundColor: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10, padding: "0.875rem 1rem", marginBottom: "1.25rem", fontSize: "0.875rem", color: "#991b1b", flexWrap: "wrap", gap: "0.5rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}><AlertCircle size={16} /> {loadError}</div>
            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
              <button onClick={() => clearError()} style={{ background: "none", border: "none", cursor: "pointer", color: "#991b1b", padding: 0 }}><X size={14} /></button>
              <button onClick={handleRefresh} style={{ background: "none", border: "none", cursor: "pointer", color: "#991b1b", display: "flex", alignItems: "center", gap: "0.3rem", fontWeight: 600, fontSize: "0.8rem" }}><RefreshCw size={13} /> Retry</button>
            </div>
          </div>
        )}

        {/* Stats Section - Show shimmer until initial load complete */}
        {!initialLoadComplete ? (
          <ShimmerStatsCard isMobile={isMobile} />
        ) : (
          isMobile ? (
            <CompactStatsCard 
              totalRevenue={globalAwardedValue} 
              quotationsCount={globalTotalQuotations} 
              customersCount={globalTotalCustomers} 
              selectedCurrency={selectedCurrency} 
              statusCounts={{
                pending: globalPending,
                in_review: globalInReview,
                approved: globalApproved,
                awarded: globalAwarded,
                returned: globalReturned
              }} 
              loading={false}
            />
          ) : (
            <DesktopStatsGrid 
              totalRevenue={globalAwardedValue} 
              quotationsCount={globalTotalQuotations} 
              customersCount={globalTotalCustomers} 
              selectedCurrency={selectedCurrency} 
              statusCounts={{
                pending: globalPending,
                in_review: globalInReview,
                approved: globalApproved,
                awarded: globalAwarded,
                returned: globalReturned
              }} 
              loading={false}
            />
          )
        )}

        {/* Main Table/Card Container */}
        <div style={{ backgroundColor: "#fff", borderRadius: 14, boxShadow: "0 1px 4px rgba(0,0,0,0.07)", overflow: "visible", position: "relative" }}>
          {/* Toolbar */}
          <div style={{ padding: isMobile ? "0.75rem 1rem" : "1.125rem 1.5rem", borderBottom: "1px solid #f1f5f9", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.75rem" }}>
            {/* Tabs */}
            <div style={{ display: "flex", gap: "0.2rem", padding: "0.35rem", backgroundColor: "#f1f5f9", borderRadius: 10, overflowX: isMobile ? "auto" : "visible", width: isMobile ? "100%" : "auto" }}>
              {TABS.map(({ key, label, Icon: I, count }) => {
const active = (key === "all" && !filters.status) || (filters.status === TAB_STATUS_MAP[key]); 
               const isPending = key === "pending";
                const isReturned = key === "returned";
                const hasAlert = (isPending || isReturned) && count > 0;
                const alertColor = isPending ? "#f59e0b" : "#ec4899";
                return (
                  <button key={key} onClick={() => handleTabChange(key)} style={{ padding: isMobile ? "0.3rem 0.6rem" : "0.4rem 0.875rem", borderRadius: 8, border: "none", cursor: "pointer", fontSize: isMobile ? "0.7rem" : "0.8rem", fontWeight: 600, display: "flex", alignItems: "center", gap: "0.35rem", backgroundColor: active ? "#fff" : "transparent", color: active ? "#0f172a" : "#64748b", boxShadow: active ? "0 1px 3px rgba(0,0,0,0.1)" : "none", whiteSpace: "nowrap" }}>
                    <I size={isMobile ? 11 : 13} />
                    {!isMobile && label}
                    <span style={{ backgroundColor: active ? (hasAlert ? alertColor : "#0f172a") : (hasAlert ? alertColor : "#e2e8f0"), color: active || hasAlert ? "#fff" : "#64748b", borderRadius: 999, padding: isMobile ? "1px 5px" : "1px 7px", fontSize: isMobile ? "0.6rem" : "0.68rem", fontWeight: 700 }}>{!initialLoadComplete ? "…" : count}</span>
                  </button>
                );
              })}
            </div>

            {/* Search, Refresh, View Toggle */}
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", width: isMobile ? "100%" : "auto" }}>
              <button onClick={handleRefresh} disabled={isRefreshing} style={{ width: isMobile ? 36 : 34, height: isMobile ? 36 : 34, border: "1px solid #e2e8f0", borderRadius: 8, background: "#f8fafc", cursor: isRefreshing ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", opacity: isRefreshing ? 0.5 : 1 }}>
                <RefreshCw size={isMobile ? 14 : 14} color="#64748b" style={isRefreshing ? { animation: "hs-spin 1s linear infinite" } : {}} />
              </button>

              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", backgroundColor: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: isMobile ? "0.5rem 0.75rem" : "0.4rem 0.75rem", flex: isMobile ? 1 : "auto" }}>
                <Search size={isMobile ? 14 : 14} color="#94a3b8" />
                <input 
                  ref={searchRef} 
                  style={{ border: "none", background: "transparent", outline: "none", fontSize: isMobile ? "0.875rem" : "0.875rem", color: "#0f172a", width: isMobile ? "100%" : 210 }} 
                  placeholder="Search… (press /)" 
                  defaultValue={filters.search} 
                  onChange={handleSearchChange} 
                  disabled={!initialLoadComplete} 
                />
                {filters.search && <button onClick={clearSearch} style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8", padding: 0 }}><X size={isMobile ? 13 : 13} /></button>}
              </div>

              <ViewToggle view={uiState.viewMode} onViewChange={(view) => setUiState((prev) => ({ ...prev, viewMode: view }))} isMobile={isMobile} />
            </div>
          </div>

          {/* Loading Overlay for Refresh */}
          {isRefreshing && !isLoading && (
            <div style={{ position: "absolute", inset: 0, backgroundColor: "rgba(255,255,255,0.72)", zIndex: 10, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 14, backdropFilter: "blur(1px)" }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.75rem", background: "white", padding: isMobile ? "1rem 1.5rem" : "1.25rem 2rem", borderRadius: 12, boxShadow: "0 4px 24px rgba(15,23,42,0.12)", border: "1px solid #e2e8f0" }}>
                <RefreshCw size={isMobile ? 20 : 24} color="#6366f1" style={{ animation: "hs-spin 0.8s linear infinite" }} />
                <span style={{ fontSize: isMobile ? "0.75rem" : "0.82rem", color: "#6366f1", fontWeight: 700 }}>Refreshing…</span>
              </div>
            </div>
          )}

          {/* Content */}
          {!initialLoadComplete ? (
            <SkeletonLoader />
          ) : (
            <>
              {showEmptyState ? (
                <div style={{ textAlign: "center", padding: isMobile ? "3rem 1rem" : "4rem 2rem", color: "#94a3b8" }}>
                  <FileText size={isMobile ? 36 : 48} color="#cbd5e1" style={{ marginBottom: "1rem" }} />
                  <p style={{ fontWeight: 600, fontSize: isMobile ? "0.9rem" : "1rem", color: "#475569", marginBottom: "0.5rem" }}>No quotations yet</p>
                  <p style={{ fontSize: isMobile ? "0.8rem" : "0.875rem", marginBottom: "1.5rem" }}>Create your first quotation to get started.</p>
                  <button onClick={() => onNavigate("addQuotation")} style={{ background: "#0f172a", color: "white", border: "none", borderRadius: 8, padding: isMobile ? "0.5rem 1rem" : "0.6rem 1.25rem", fontWeight: 600, fontSize: isMobile ? "0.8rem" : "0.875rem", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "0.4rem" }}>
                    <Plus size={isMobile ? 13 : 15} /> New Quotation
                  </button>
                </div>
              ) : (
                <>
                  {isMobile || uiState.viewMode === "card" ? (
                    <div style={{ padding: "1rem", display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(2, 1fr)", gap: "1rem" }}>
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
                      {totalCount > 0 && (
                        <PaginationBar 
                          total={totalCount} 
                          page={currentPage} 
                          limit={currentLimit} 
                          totalPages={totalPages} 
                          onPageChange={handlePageChange} 
                          onLimitChange={handleLimitChange} 
                        />
                      )}
                    </div>
                  ) : (
                    <>
                      <div style={{ overflowX: "auto" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse" }}>
                          <thead>
                            <tr style={{ backgroundColor: "#fafafa" }}>
                              <SortHeader label="Quote #" field="quotationNumber" sort={{ field: filters.sortBy, dir: filters.sortDir }} onSort={handleSort} />
                              <SortHeader label="Customer" field="customer" sort={{ field: filters.sortBy, dir: filters.sortDir }} onSort={handleSort} />
                              <th style={{ padding: "0.75rem 1rem", fontSize: "0.72rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", textAlign: "left", borderBottom: "1px solid #f1f5f9", backgroundColor: "#fafafa", whiteSpace: "nowrap" }}>Project Name</th>
                              <SortHeader label="Query Date" field="queryDate" sort={{ field: filters.sortBy, dir: filters.sortDir }} onSort={handleSort} align="center" />
                              <SortHeader label="Submitted" field="date" sort={{ field: filters.sortBy, dir: filters.sortDir }} onSort={handleSort} />
                              <SortHeader label="Expiry" field="expiryDate" sort={{ field: filters.sortBy, dir: filters.sortDir }} onSort={handleSort} />
                              <SortHeader label="Total" field="total" sort={{ field: filters.sortBy, dir: filters.sortDir }} onSort={handleSort} align="right" />
                              <SortHeader label="Status" field="status" sort={{ field: filters.sortBy, dir: filters.sortDir }} onSort={handleSort} />
                              <th style={{ padding: "0.75rem 1rem", fontSize: "0.72rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", textAlign: "center", borderBottom: "1px solid #f1f5f9", backgroundColor: "#fafafa", whiteSpace: "nowrap" }}>Actions</th>
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
                                <tr key={q._id} style={{ borderBottom: "1px solid #f8fafc" }} className="hs-row">
                                  <td style={{ padding: "0.85rem 1rem", verticalAlign: "middle" }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", flexWrap: "wrap" }}>
                                      <span style={{ fontWeight: 700, color: "#0f172a", fontFamily: "monospace", fontSize: "0.8rem" }}>{q.quotationNumber || "—"}</span>
                                      {expired && <span style={{ fontSize: "0.62rem", fontWeight: 700, color: "#dc2626", background: "#fef2f2", padding: "1px 6px", borderRadius: 999, border: "1px solid #fecaca" }}>Expired</span>}
                                      {expiring && <span style={{ fontSize: "0.62rem", fontWeight: 700, color: "#d97706", background: "#fffbeb", padding: "1px 6px", borderRadius: 999, border: "1px solid #fde68a" }}>Expiring Soon</span>}
                                    </div>
                                  </td>
                                  <td style={{ padding: "0.85rem 1rem", verticalAlign: "middle" }}>
                                    <div style={{ fontWeight: 600, color: "#0f172a", fontSize: "0.875rem" }}>{q.customerSnapshot?.name || q.customer || q.customerId?.name || "N/A"}</div>
                                    {q.contact && <div style={{ fontSize: "0.75rem", color: "#94a3b8", marginTop: 2 }}>{q.contact}</div>}
                                    <RejectionNote quotation={q} />
                                   </td>
                                  <td style={{ padding: "0.85rem 1rem", verticalAlign: "middle" }}><div style={{ fontSize: "0.875rem", color: "#0f172a" }}>{q.projectName || "—"}</div></td>
                                  <td style={{ padding: "0.85rem 1rem", verticalAlign: "middle", textAlign: "center" }}>
                                    {q.queryDate ? (
                                      <span style={{ background: queryDatePassed ? "#fee2e2" : "#fef3c7", color: queryDatePassed ? "#991b1b" : "#92400e", padding: "0.25rem 0.75rem", borderRadius: "999px", fontSize: "0.75rem", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: "0.25rem" }}>
                                        <Calendar size={12} /> {fmtDate(q.queryDate)} {queryDatePassed && " ⚠️"}
                                      </span>
                                    ) : "—"}
                                   </td>
                                  <td style={{ padding: "0.85rem 1rem", fontSize: "0.8rem", color: "#64748b", verticalAlign: "middle", whiteSpace: "nowrap" }}>{fmtDate(q.date)}</td>
                                  <td style={{ padding: "0.85rem 1rem", fontSize: "0.8rem", verticalAlign: "middle", whiteSpace: "nowrap" }}>
                                    <span style={{ color: expired ? "#dc2626" : expiring ? "#d97706" : "#64748b", fontWeight: expired || expiring ? 600 : 400 }}>{fmtDate(q.expiryDate)}</span>
                                   </td>
                                  <td style={{ padding: "0.85rem 1rem", fontSize: "0.875rem", fontWeight: 700, color: "#0f172a", verticalAlign: "middle", textAlign: "right", whiteSpace: "nowrap" }}>{fmtCurrency(q.total, selectedCurrency)}</td>
                                  <td style={{ padding: "0.85rem 1rem", verticalAlign: "middle" }}><EnhancedStatusBadge status={q.status} quotation={q} /></td>
                                  <td style={{ padding: "0.75rem 1rem", verticalAlign: "middle" }}>
                                    <div style={{ display: "flex", gap: "0.3rem", justifyContent: "center", flexWrap: "wrap" }}>
                                      <ActionBtn bg="#e0f2fe" color="#0369a1" onClick={() => onViewQuotation(q._id)} icon={Eye} label="View" title="View quotation" />
                                      {canAward && <ActionBtn bg="#d1fae5" color="#065f46" onClick={() => setModalsState((prev) => ({ ...prev, awardModal: { open: true, quotation: q, busy: false } }))} icon={Award} label="Award" title="Mark awarded / not awarded" />}
                                      {canDelete && <ActionBtn bg="#fff1f2" color="#e11d48" onClick={() => setModalsState((prev) => ({ ...prev, deleteModal: { open: true, quotation: q, busy: false } }))} icon={Trash2} label="Del" title="Delete quotation" />}
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                      <PaginationBar 
                        total={totalCount} 
                        page={currentPage} 
                        limit={currentLimit} 
                        totalPages={totalPages} 
                        onPageChange={handlePageChange} 
                        onLimitChange={handleLimitChange} 
                      />
                    </>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </div>

      {/* Loading Overlays */}
      {uiState.saveProgress > 0 && <LoadingOverlay type="saving" step={uiState.saveStep} progress={uiState.saveProgress} />}
      {uiState.pdfProgress > 0 && <LoadingOverlay type="pdf" step={uiState.pdfStep} progress={uiState.pdfProgress} />}
      {refreshState.isRefreshing && refreshState.progress > 0 && (
        <LoadingOverlay 
          type="processing"  
          step={refreshState.step} 
          progress={refreshState.progress} 
        />
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