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
  Loader,
  LogOut,
  Plus,
  Calendar,
  Eye,
  Download,
  Award,
  Trash2,
  Menu,
  FileText,
  Users,
  ShoppingCart,
  Bell,
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
  StatusBadge,
  RejectionNote,
  Toast,
  ActionBtn,
  SortHeader,
  PaginationBar,
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
import useNotificationStore from "../services/notificationStore";
import NotificationDrawer from "../components/NotificationDrawer";

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
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "translateY(-2px)";
        e.currentTarget.style.boxShadow = `0 2px 8px ${config.color}30`;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "translateY(0)";
        e.currentTarget.style.boxShadow = "none";
      }}
    >
      <span>{config.icon}</span>
      {config.label}
    </div>
  );
});



export default function HomeScreen({ onNavigate, onViewQuotation }) {
  const isMobile = useMediaQuery("(max-width: 768px)");
  const isTablet = useMediaQuery("(min-width: 769px) and (max-width: 1024px)");
 
  const { isOpen: notificationOpen, setOpen, unreadCount } = useNotificationStore();
  const [uiState, setUiState] = useState({
    mobileMenuOpen: false,
    viewMode: "table",
    saveProgress: 0,
    saveStep: "",
    pdfProgress: 0,
    pdfStep: "",
  });

  const [tableState, setTableState] = useState({
    activeTab: "all",
    page: 1,
    limit: 20,
    searchInput: "",
    search: "",
    sort: { field: "date", dir: "desc" },
  });

  const [modalsState, setModalsState] = useState({
    exportingId: null,
    deleteModal: { open: false, quotation: null, busy: false },
    awardModal: { open: false, quotation: null, busy: false },
    queryDateModal: { open: false, quotation: null },
  });

  const [toasts, setToasts] = useState([]);

  const searchRef = useRef(null);
  const searchTimer = useRef(null);
  let toastIdRef = useRef(0);

  const {
    quotations: companyQuotations,
    quotationsLoading,
    quotationsInitialized,
    refresh: refreshCompanyQuotations,
  } = useCompanyQuotations();
  
  const {
    totalCustomers,
    loading: statsLoading,
    refetch: refetchCustomerStats,
  } = useCustomerStatsWithCompany();
  
  const customers = useAppStore((s) => s.customers);
  const loadError = useAppStore((s) => s.loadError);
  const deleteQuotation = useAppStore((s) => s.deleteQuotation);
  const awardQuotation = useAppStore((s) => s.awardQuotation);
  const fetchAllData = useAppStore((s) => s.fetchAllData);
  const handleLogout = useAppStore((s) => s.handleLogout);
  const clearError = useAppStore((s) => s.clearError);
  const updateQueryDate = useAppStore((s) => s.updateQueryDate);
  const storeQuotations = useAppStore((s) => s.quotations);
  const selectedCompany = useAppStore((s) => s.selectedCompany);
  
  const {
    company: currentCompany,
    selectedCurrency,
    refreshCompanyData,
  } = useCompanyCurrency();

  const hasMountedRef = useRef(false);

  useEffect(() => {
    if (selectedCompany) {
      refetchCustomerStats();
    }
  }, [selectedCompany, refetchCustomerStats]);

  useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      return;
    }
    setTableState((prev) => ({
      ...prev,
      limit: isMobile ? 10 : 20,
    }));
  }, [isMobile]);

  useEffect(() => {
    if (!hasMountedRef.current) return;
    if (isMobile) {
      setUiState((prev) => ({
        ...prev,
        viewMode: "card",
      }));
    }
  }, [isMobile]);
 
  const safeQ = companyQuotations || [];
  const hasData = safeQ.length > 0;
    const isInitialLoading = (!quotationsInitialized || quotationsLoading) && !hasData;
  const isRefreshing = quotationsInitialized && quotationsLoading && hasData;
  const showEmptyState = quotationsInitialized && !quotationsLoading && safeQ.length === 0;

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

  const { totalRevenue, statusCounts } = useMemo(() => {
    let rev = 0;
    const c = {
      pending: 0,
      in_review: 0,
      approved: 0,
      awarded: 0,
      returned: 0,
    };
    for (const q of safeQ) {
      rev += q.total || 0;
      if (q.status === "pending" || q.status === "pending_admin") c.pending++;
      else if (q.status === "ops_approved") c.in_review++;
      else if (q.status === "approved") c.approved++;
      else if (q.status === "awarded") c.awarded++;
      else if (q.status === "ops_rejected" || q.status === "rejected")
        c.returned++;
    }
    return { totalRevenue: rev, statusCounts: c };
  }, [safeQ]);

  const tabCounts = useMemo(
    () => ({
      all: safeQ.length,
      pending: statusCounts.pending,
      in_review: statusCounts.in_review,
      approved: statusCounts.approved,
      awarded: statusCounts.awarded,
      returned: statusCounts.returned,
    }),
    [safeQ.length, statusCounts]
  );

  const tabFiltered = useMemo(() => {
    const { statusFilter } = TAB_KEYS[tableState.activeTab];
    if (!statusFilter) return safeQ;
    if (Array.isArray(statusFilter))
      return safeQ.filter((q) => statusFilter.includes(q.status));
    return safeQ.filter((q) => q.status === statusFilter);
  }, [safeQ, tableState.activeTab]);

  const searchFiltered = useMemo(() => {
    if (!tableState.search.trim()) return tabFiltered;
    const t = tableState.search.toLowerCase();
    return tabFiltered.filter(
      (q) =>
        (q.quotationNumber || "").toLowerCase().includes(t) ||
        (q.customerSnapshot?.name || q.customer || q.customerId?.name || "")
          .toLowerCase()
          .includes(t)
    );
  }, [tabFiltered, tableState.search]);

  const sorted = useMemo(() => {
    const arr = [...searchFiltered];
    const { field, dir } = tableState.sort;
    arr.sort((a, b) => {
      let av = a[field],
        bv = b[field];
      if (field === "total") {
        av = Number(av) || 0;
        bv = Number(bv) || 0;
      } else if (field === "customer") {
        av = (
          a.customerSnapshot?.name ||
          a.customer ||
          a.customerId?.name ||
          ""
        ).toLowerCase();
        bv = (
          b.customerSnapshot?.name ||
          b.customer ||
          b.customerId?.name ||
          ""
        ).toLowerCase();
      } else {
        av = av ?? "";
        bv = bv ?? "";
      }
      return dir === "asc"
        ? av < bv
          ? -1
          : av > bv
          ? 1
          : 0
        : av > bv
        ? -1
        : av < bv
        ? 1
        : 0;
    });
    return arr;
  }, [searchFiltered, tableState.sort]);

  const totalFiltered = sorted.length;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / tableState.limit));
  const safePage = Math.min(tableState.page, totalPages);
  const paginated = useMemo(
    () => sorted.slice((safePage - 1) * tableState.limit, safePage * tableState.limit),
    [sorted, safePage, tableState.limit]
  );

  const handleSearchChange = useCallback((e) => {
    const val = e.target.value;
    setTableState((prev) => ({ ...prev, searchInput: val }));
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setTableState((prev) => ({ ...prev, search: val, page: 1 }));
    }, DEBOUNCE_MS);
  }, []);

  const clearSearch = useCallback(() => {
    setTableState((prev) => ({
      ...prev,
      searchInput: "",
      search: "",
      page: 1,
    }));
  }, []);

  const handleTabChange = useCallback((key) => {
    setTableState((prev) => ({
      ...prev,
      activeTab: key,
      page: 1,
      searchInput: "",
      search: "",
      sort: { field: "date", dir: "desc" },
    }));
    setUiState((prev) => ({ ...prev, mobileMenuOpen: false }));
  }, []);

  const handleSort = useCallback((field) => {
    setTableState((prev) => ({
      ...prev,
      sort: {
        field,
        dir: prev.sort.field === field && prev.sort.dir === "asc" ? "desc" : "asc",
      },
      page: 1,
    }));
  }, []);

  const handleUpdateQueryDate = useCallback(
    async (id, date) => {
      const result = await updateQueryDate(id, date);
      if (result?.success) {
        addToast("Follow-up date updated successfully", "success");
        await refreshCompanyQuotations();
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
    try {
      setUiState((prev) => ({
        ...prev,
        saveProgress: 10,
        saveStep: "Refreshing data...",
      }));

      const progressInterval = setInterval(() => {
        setUiState((prev) => ({
          ...prev,
          saveProgress:
            prev.saveProgress >= 90 ? 90 : prev.saveProgress + 10,
        }));
      }, 500);

      await fetchAllData();
      refreshCompanyData?.();

      setUiState((prev) => ({
        ...prev,
        saveProgress: 100,
        saveStep: "Complete!",
      }));
      addToast("Data refreshed", "success");

      setTimeout(() => {
        setUiState((prev) => ({
          ...prev,
          saveProgress: 0,
          saveStep: "",
        }));
      }, 1000);

      clearInterval(progressInterval);
    } catch (err) {
      setUiState((prev) => ({
        ...prev,
        saveProgress: 0,
        saveStep: "",
      }));
      addToast(err.message || "Refresh failed", "error");
    }
  }, [fetchAllData, refreshCompanyData, addToast]);

  const buildQuotationForPDF = useCallback(async (quotation) => {
    if (
      quotation.termsAndConditions &&
      quotation.termsAndConditions.includes("<img")
    ) {
      return quotation;
    }

    const cloudinaryImages = quotation.termsImages || [];
    const sections = htmlToSections(
      quotation.termsAndConditions || "",
      cloudinaryImages
    );
    const termsHTMLWithImages = sectionsToHTML(sections);

    return {
      ...quotation,
      termsAndConditions: termsHTMLWithImages,
    };
  }, []);

  const handleDownload = useCallback(
    async (q) => {
      setModalsState((prev) => ({
        ...prev,
        exportingId: q._id,
      }));
      setUiState((prev) => ({
        ...prev,
        pdfProgress: 10,
        pdfStep: "Preparing PDF...",
      }));

      const progressInterval = setInterval(() => {
        setUiState((prev) => ({
          ...prev,
          pdfProgress: prev.pdfProgress >= 90 ? 90 : prev.pdfProgress + 10,
        }));
      }, 800);

      try {
        const storeQuotations = useAppStore.getState().quotations;
        let completeQuotation = storeQuotations.find(
          (quot) => quot._id === q._id
        );

        if (!completeQuotation) {
          completeQuotation = q;
        }

        setUiState((prev) => ({
          ...prev,
          pdfProgress: 40,
          pdfStep: "Processing images...",
        }));

        const pdfQuotation = await buildQuotationForPDF(completeQuotation);

        setUiState((prev) => ({
          ...prev,
          pdfProgress: 70,
          pdfStep: "Generating PDF...",
        }));

        await downloadQuotationPDF(pdfQuotation);

        setUiState((prev) => ({
          ...prev,
          pdfProgress: 100,
          pdfStep: "Complete!",
        }));
        addToast("PDF generated successfully!", "success");

        setTimeout(() => {
          setUiState((prev) => ({
            ...prev,
            pdfProgress: 0,
            pdfStep: "",
          }));
        }, 1000);
      } catch (err) {
        console.error("PDF generation error:", err);
        setUiState((prev) => ({
          ...prev,
          pdfProgress: 0,
          pdfStep: "",
        }));
        addToast(`PDF failed: ${err.message}`, "error");
      } finally {
        clearInterval(progressInterval);
        setModalsState((prev) => ({
          ...prev,
          exportingId: null,
        }));
      }
    },
    [addToast, buildQuotationForPDF]
  );

  const confirmDelete = useCallback(async () => {
    const { quotation } = modalsState.deleteModal;
    if (!quotation) return;
    
    setModalsState((prev) => ({
      ...prev,
      deleteModal: { ...prev.deleteModal, busy: true },
    }));
    
    const result = await deleteQuotation(quotation._id);
    if (result?.success) {
      addToast(`Quotation ${quotation.quotationNumber} deleted.`, "success");
      setModalsState((prev) => ({
        ...prev,
        deleteModal: { open: false, quotation: null, busy: false },
      }));
      setTableState((prev) => ({
        ...prev,
        page: Math.max(1, Math.min(prev.page, Math.ceil((totalFiltered - 1) / prev.limit))),
      }));
      await refreshCompanyQuotations();
    } else {
      addToast(result?.error || "Delete failed", "error");
      setModalsState((prev) => ({
        ...prev,
        deleteModal: { ...prev.deleteModal, busy: false },
      }));
    }
  }, [
    modalsState.deleteModal,
    deleteQuotation,
    addToast,
    totalFiltered,
    tableState.limit,
    refreshCompanyQuotations,
  ]);

  const confirmAward = useCallback(
    async (awarded, awardNote) => {
      const { quotation } = modalsState.awardModal;
      if (!quotation || awarded === null) return;

      setModalsState((prev) => ({
        ...prev,
        awardModal: { ...prev.awardModal, busy: true },
      }));
      
      const result = await awardQuotation(quotation._id, awarded, awardNote);

      if (result?.success) {
        addToast(
          awarded
            ? `🏆 "${quotation.quotationNumber}" marked as Awarded!`
            : `"${quotation.quotationNumber}" marked as Not Awarded.`,
          "success"
        );

        await refreshCompanyQuotations();

        setModalsState((prev) => ({
          ...prev,
          awardModal: { open: false, quotation: null, busy: false },
        }));
      } else {
        addToast(result?.error || "Failed to update", "error");
        setModalsState((prev) => ({
          ...prev,
          awardModal: { ...prev.awardModal, busy: false },
        }));
      }
    },
    [modalsState.awardModal, awardQuotation, addToast, refreshCompanyQuotations]
  );

  useEffect(() => {
    const handler = (e) => {
      if (
        e.key === "/" &&
        !["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName)
      ) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => () => clearTimeout(searchTimer.current), []);

  const TABS = useMemo(
    () =>
      Object.entries(TAB_KEYS).map(([key, { label, Icon }]) => ({
        key,
        label,
        Icon,
        count: tabCounts[key] ?? 0,
      })),
    [tabCounts]
  );

  // Skeleton loader component
  const SkeletonLoader = () => (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ backgroundColor: "#fafafa" }}>
            {[
              "Quote #",
              "Customer",
              "Project Name",
              "Query Date",
              "Submitted",
              "Expiry",
              "Total",
              "Created By",
              "Actions",
            ].map((h) => (
              <th
                key={h}
                style={{
                  padding: "0.75rem 1rem",
                  fontSize: "0.72rem",
                  fontWeight: 700,
                  color: "#64748b",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  borderBottom: "1px solid #f1f5f9",
                  whiteSpace: "nowrap",
                }}
              >
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

  const NavBtn = React.memo(({ onClick, label, primary }) => (
    <button
      onClick={onClick}
      style={{
        backgroundColor: primary ? "white" : "rgba(255,255,255,0.08)",
        color: primary ? "#0f172a" : "#94a3b8",
        border: primary ? "none" : "1px solid rgba(255,255,255,0.12)",
        borderRadius: 8,
        padding: isMobile ? "0.35rem 0.7rem" : "0.45rem 0.875rem",
        fontSize: isMobile ? "0.7rem" : "0.8rem",
        fontWeight: 600,
        cursor: "pointer",
        fontFamily: "inherit",
        whiteSpace: "nowrap",
      }}
    >
      {!isMobile && label}
    </button>
  ));

  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: "#f1f5f9",
        fontFamily: "'Segoe UI', system-ui, sans-serif",
      }}
    >
      <style>{`
        @keyframes hs-slideIn { from{transform:translateX(20px);opacity:0} to{transform:translateX(0);opacity:1} }
        @keyframes hs-popIn { from{transform:scale(0.95);opacity:0} to{transform:scale(1);opacity:1} }
        @keyframes hs-spin { to{transform:rotate(360deg)} }
        @keyframes hs-shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
        .hs-row:hover td { background:#f8fafc !important; }
        .hs-nav-btn:hover { opacity:0.8 !important; }
        .hs-tab:hover { background:rgba(255,255,255,0.6) !important; }
        .hs-action-btn:hover:not(:disabled) { opacity:0.8 !important; transform:translateY(-1px); }
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
        onCancel={() =>
          !modalsState.deleteModal.busy &&
          setModalsState((prev) => ({
            ...prev,
            deleteModal: { open: false, quotation: null, busy: false },
          }))
        }
      >
        {modalsState.deleteModal.quotation?.status === "ops_rejected" && (
          <div
            style={{
              backgroundColor: "#fef2f2",
              border: "1px solid #fecaca",
              borderRadius: 8,
              padding: "0.6rem 0.875rem",
              marginBottom: "0.75rem",
              fontSize: "0.8rem",
              color: "#991b1b",
              fontWeight: 600,
            }}
          >
            ⚠ This quotation was returned by Ops. You'll need to create a fresh
            one.
          </div>
        )}
      </ConfirmModal>

      <AwardModal
        open={modalsState.awardModal.open}
        quotation={modalsState.awardModal.quotation}
        onConfirm={confirmAward}
        onCancel={() =>
          !modalsState.awardModal.busy &&
          setModalsState((prev) => ({
            ...prev,
            awardModal: { open: false, quotation: null, busy: false },
          }))
        }
        loading={modalsState.awardModal.busy}
      />

      {/* Header */}
      <div
        style={{
          backgroundColor: "#0f172a",
          padding: isMobile ? "0.75rem 1rem" : "0 2rem",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          minHeight: 60,
          position: "sticky",
          top: 0,
          zIndex: 50,
          boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
          flexWrap: "wrap",
          gap: "0.75rem",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            width: isMobile ? "100%" : "auto",
          }}
        >
          <div>
            <div
              style={{
                fontSize: isMobile ? "1rem" : "1.0625rem",
                fontWeight: 800,
                color: "white",
                letterSpacing: "-0.01em",
              }}
            >
              📋 My Dashboard
            </div>
            {!isMobile && <CompanyCurrencyDisplay />}
          </div>
          {isMobile && (
            <button
              onClick={() =>
                setUiState((prev) => ({
                  ...prev,
                  mobileMenuOpen: !prev.mobileMenuOpen,
                }))
              }
              style={{
                background: "rgba(255,255,255,0.1)",
                border: "none",
                borderRadius: 8,
                padding: "0.4rem 0.7rem",
                color: "white",
                cursor: "pointer",
              }}
            >
              <Menu size={20} />
            </button>
          )}
        </div>

        {isMobile && <CompanyCurrencyDisplay />}

        <div
          style={{
            display: "flex",
            gap: "0.5rem",
            alignItems: "center",
            flexWrap: "wrap",
            ...(isMobile && !uiState.mobileMenuOpen
              ? { display: "none" }
              : { display: "flex" }),
            width: isMobile ? "100%" : "auto",
            justifyContent: isMobile ? "center" : "flex-end",
          }}
        >
          <CompanyCurrencySelector variant="compact" />

          <button
            onClick={() => onNavigate("customers")}
            style={{
              backgroundColor: "#e0e7ff",
              color: "#4f46e5",
              border: "none",
              borderRadius: 8,
              padding: isMobile ? "0.35rem 0.7rem" : "0.45rem 0.875rem",
              fontSize: isMobile ? "0.7rem" : "0.8rem",
              fontWeight: 600,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "0.4rem",
            }}
          >
            <Users size={isMobile ? 12 : 14} /> Customers
          </button>

          <button
            onClick={() => onNavigate("items")}
            style={{
              backgroundColor: "#e0e7ff",
              color: "#4f46e5",
              border: "none",
              borderRadius: 8,
              padding: isMobile ? "0.35rem 0.7rem" : "0.45rem 0.875rem",
              fontSize: isMobile ? "0.7rem" : "0.8rem",
              fontWeight: 600,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "0.4rem",
            }}
          >
            <ShoppingCart size={isMobile ? 12 : 14} /> Items
          </button>

          <button
            onClick={() => onNavigate("addQuotation")}
            style={{
              backgroundColor: "#10b981",
              color: "white",
              border: "none",
              borderRadius: 8,
              padding: isMobile ? "0.35rem 0.7rem" : "0.45rem 0.875rem",
              fontSize: isMobile ? "0.7rem" : "0.8rem",
              fontWeight: 600,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "0.4rem",
            }}
          >
            <FileText size={isMobile ? 12 : 14} /> {isMobile ? "New" : "New Quotation"}
          </button>

          <button
            onClick={handleLogout}
            style={{
              backgroundColor: "rgba(255,255,255,0.08)",
              color: "#94a3b8",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 8,
              padding: isMobile ? "0.35rem 0.7rem" : "0.45rem 0.85rem",
              fontSize: isMobile ? "0.7rem" : "0.8rem",
              fontWeight: 600,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "0.4rem",
              fontFamily: "inherit",
            }}
          >
            <LogOut size={isMobile ? 12 : 15} /> Logout
          </button>
 
        </div>
      </div>

      {/* Main Content */}
      <div
        style={{
          maxWidth: 1400,
          margin: "0 auto",
          padding: isMobile ? "1rem" : "2rem",
        }}
      >
        {loadError && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              backgroundColor: "#fef2f2",
              border: "1px solid #fecaca",
              borderRadius: 10,
              padding: "0.875rem 1rem",
              marginBottom: "1.25rem",
              fontSize: "0.875rem",
              color: "#991b1b",
              flexWrap: "wrap",
              gap: "0.5rem",
            }}
          >
            <div
              style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
            >
              <AlertCircle size={16} /> {loadError}
            </div>
            <div
              style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}
            >
              <button
                onClick={() => clearError()}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "#991b1b",
                  padding: 0,
                }}
              >
                <X size={14} />
              </button>
              <button
                onClick={handleRefresh}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "#991b1b",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.3rem",
                  fontWeight: 600,
                  fontSize: "0.8rem",
                }}
              >
                <RefreshCw size={13} /> Retry
              </button>
            </div>
          </div>
        )}

        {/* Stats Section - Show skeleton while loading */}
        {isInitialLoading ? (
          <div style={{ marginBottom: "1.5rem" }}>
            <div style={{ 
              height: isMobile ? "120px" : "100px", 
              background: "linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%)",
              backgroundSize: "200% 100%",
              animation: "hs-shimmer 1.5s infinite",
              borderRadius: "12px"
            }} />
          </div>
        ) : isMobile ? (
          <CompactStatsCard
            totalRevenue={totalRevenue}
            quotationsCount={safeQ.length}
            customersCount={totalCustomers}
            selectedCurrency={selectedCurrency}
            statusCounts={statusCounts}
            loading={false}
          />
        ) : (
          <DesktopStatsGrid
            totalRevenue={totalRevenue}
            quotationsCount={safeQ.length}
            customersCount={totalCustomers}
            selectedCurrency={selectedCurrency}
            statusCounts={statusCounts}
            loading={false}
          />
        )}

        {/* Main Table/Card Container */}
        <div
          style={{
            backgroundColor: "#fff",
            borderRadius: 14,
            boxShadow: "0 1px 4px rgba(0,0,0,0.07)",
            overflow: "visible",
            position: "relative",
          }}
        >
          {/* Toolbar */}
          <div
            style={{
              padding: isMobile ? "0.75rem 1rem" : "1.125rem 1.5rem",
              borderBottom: "1px solid #f1f5f9",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: "0.75rem",
            }}
          >
            {/* Tabs */}
            <div
              style={{
                display: "flex",
                gap: "0.2rem",
                padding: "0.35rem",
                backgroundColor: "#f1f5f9",
                borderRadius: 10,
                overflowX: isMobile ? "auto" : "visible",
                width: isMobile ? "100%" : "auto",
              }}
            >
              {TABS.map(({ key, label, Icon: I, count }) => {
                const active = tableState.activeTab === key;
                const isPending = key === "pending";
                const isReturned = key === "returned";
                const hasAlert = (isPending || isReturned) && count > 0;
                const alertColor = isPending ? "#f59e0b" : "#ec4899";
                return (
                  <button
                    key={key}
                    onClick={() => handleTabChange(key)}
                    style={{
                      padding: isMobile ? "0.3rem 0.6rem" : "0.4rem 0.875rem",
                      borderRadius: 8,
                      border: "none",
                      cursor: "pointer",
                      fontSize: isMobile ? "0.7rem" : "0.8rem",
                      fontWeight: 600,
                      display: "flex",
                      alignItems: "center",
                      gap: "0.35rem",
                      backgroundColor: active ? "#fff" : "transparent",
                      color: active ? "#0f172a" : "#64748b",
                      boxShadow: active ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                      fontFamily: "inherit",
                      whiteSpace: "nowrap",
                    }}
                  >
                    <I size={isMobile ? 11 : 13} />
                    {!isMobile && label}
                    <span
                      style={{
                        backgroundColor: active
                          ? hasAlert
                            ? alertColor
                            : "#0f172a"
                          : hasAlert
                          ? alertColor
                          : "#e2e8f0",
                        color: active || hasAlert ? "#fff" : "#64748b",
                        borderRadius: 999,
                        padding: isMobile ? "1px 5px" : "1px 7px",
                        fontSize: isMobile ? "0.6rem" : "0.68rem",
                        fontWeight: 700,
                      }}
                    >
                      {isInitialLoading ? "…" : count}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Search, Refresh, and View Toggle */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.75rem",
                width: isMobile ? "100%" : "auto",
              }}
            >
              <button
                onClick={handleRefresh}
                disabled={isRefreshing}
                style={{
                  width: isMobile ? 36 : 34,
                  height: isMobile ? 36 : 34,
                  border: "1px solid #e2e8f0",
                  borderRadius: 8,
                  background: "#f8fafc",
                  cursor: isRefreshing ? "not-allowed" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  opacity: isRefreshing ? 0.5 : 1,
                }}
              >
                <RefreshCw
                  size={isMobile ? 14 : 14}
                  color="#64748b"
                  style={
                    isRefreshing
                      ? { animation: "hs-spin 1s linear infinite" }
                      : {}
                  }
                />
              </button>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  backgroundColor: "#f8fafc",
                  border: "1px solid #e2e8f0",
                  borderRadius: 8,
                  padding: isMobile ? "0.5rem 0.75rem" : "0.4rem 0.75rem",
                  flex: isMobile ? 1 : "auto",
                }}
              >
                <Search size={isMobile ? 14 : 14} color="#94a3b8" />
                <input
                  ref={searchRef}
                  style={{
                    border: "none",
                    background: "transparent",
                    outline: "none",
                    fontSize: isMobile ? "0.875rem" : "0.875rem",
                    color: "#0f172a",
                    width: isMobile ? "100%" : 210,
                    fontFamily: "inherit",
                  }}
                  placeholder="Search… (press /)"
                  value={tableState.searchInput}
                  onChange={handleSearchChange}
                  disabled={isInitialLoading}
                />
                {tableState.searchInput && (
                  <button
                    onClick={clearSearch}
                    style={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      color: "#94a3b8",
                      padding: 0,
                    }}
                  >
                    <X size={isMobile ? 13 : 13} />
                  </button>
                )}
              </div>

              {/* View Toggle */}
              <ViewToggle
                view={uiState.viewMode}
                onViewChange={(view) =>
                  setUiState((prev) => ({ ...prev, viewMode: view }))
                }
                isMobile={isMobile}
              />
            </div>
          </div>

          {/* Loading Overlay for refresh */}
          {isRefreshing && !isInitialLoading && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                backgroundColor: "rgba(255,255,255,0.72)",
                zIndex: 10,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 14,
                backdropFilter: "blur(1px)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "0.75rem",
                  background: "white",
                  padding: isMobile ? "1rem 1.5rem" : "1.25rem 2rem",
                  borderRadius: 12,
                  boxShadow: "0 4px 24px rgba(15,23,42,0.12)",
                  border: "1px solid #e2e8f0",
                }}
              >
                <RefreshCw
                  size={isMobile ? 20 : 24}
                  color="#6366f1"
                  style={{ animation: "hs-spin 0.8s linear infinite" }}
                />
                <span
                  style={{
                    fontSize: isMobile ? "0.75rem" : "0.82rem",
                    color: "#6366f1",
                    fontWeight: 700,
                  }}
                >
                  Refreshing…
                </span>
              </div>
            </div>
          )}

          {/* Content - Show skeleton during initial load */}
          {(isInitialLoading) && <SkeletonLoader />}

          {/* Show actual content when loaded */}
          {!isInitialLoading && (
            <>
              {showEmptyState ? (
                <div
                  style={{
                    textAlign: "center",
                    padding: isMobile ? "3rem 1rem" : "4rem 2rem",
                    color: "#94a3b8",
                  }}
                >
                  <FileText
                    size={isMobile ? 36 : 48}
                    color="#cbd5e1"
                    style={{ marginBottom: "1rem" }}
                  />
                  <p
                    style={{
                      fontWeight: 600,
                      fontSize: isMobile ? "0.9rem" : "1rem",
                      color: "#475569",
                      marginBottom: "0.5rem",
                    }}
                  >
                    No quotations yet
                  </p>
                  <p
                    style={{
                      fontSize: isMobile ? "0.8rem" : "0.875rem",
                      marginBottom: "1.5rem",
                    }}
                  >
                    Create your first quotation to get started.
                  </p>
                  <button
                    onClick={() => onNavigate("addQuotation")}
                    style={{
                      background: "#0f172a",
                      color: "white",
                      border: "none",
                      borderRadius: 8,
                      padding: isMobile ? "0.5rem 1rem" : "0.6rem 1.25rem",
                      fontWeight: 600,
                      fontSize: isMobile ? "0.8rem" : "0.875rem",
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.4rem",
                      fontFamily: "inherit",
                    }}
                  >
                    <Plus size={isMobile ? 13 : 15} /> New Quotation
                  </button>
                </div>
              ) : (
                <>
                  {isMobile || uiState.viewMode === "card" ? (
                    <div
                      style={{
                        padding: "1rem",
                        display: "grid",
                        gridTemplateColumns: isMobile
                          ? "1fr"
                          : "repeat(2, 1fr)",
                        gap: "1rem",
                      }}
                    >
                      {paginated.length === 0 ? (
                        <div
                          style={{
                            gridColumn: "1 / -1",
                            padding: "3rem",
                            textAlign: "center",
                            color: "#94a3b8",
                            fontSize: "0.875rem",
                          }}
                        >
                          No results for "<strong>{tableState.search}</strong>"
                          <button
                            onClick={clearSearch}
                            style={{
                              marginLeft: "0.5rem",
                              background: "none",
                              border: "none",
                              color: "#6366f1",
                              cursor: "pointer",
                              fontWeight: 600,
                              fontSize: "0.875rem",
                            }}
                          >
                            Clear
                          </button>
                        </div>
                      ) : (
                        paginated.map((q) => (
                          <QuotationCard
                            key={q._id}
                            quotation={q}
                            selectedCurrency={selectedCurrency}
                            onView={onViewQuotation}
                            onFollowUp={(quotation) =>
                              setModalsState((prev) => ({
                                ...prev,
                                queryDateModal: { open: true, quotation },
                              }))
                            }
                            onDownload={handleDownload}
                            onAward={(quotation) =>
                              setModalsState((prev) => ({
                                ...prev,
                                awardModal: {
                                  open: true,
                                  quotation,
                                  busy: false,
                                },
                              }))
                            }
                            onDelete={(quotation) =>
                              setModalsState((prev) => ({
                                ...prev,
                                deleteModal: {
                                  open: true,
                                  quotation,
                                  busy: false,
                                },
                              }))
                            }
                            isExporting={modalsState.exportingId === q._id}
                          />
                        ))
                      )}

                      {/* Mobile Pagination */}
                      {isMobile && totalFiltered > 0 && (
                        <div
                          style={{
                            marginTop: "1rem",
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            gap: "0.5rem",
                            flexWrap: "wrap",
                            padding: "0.5rem",
                          }}
                        >
                          <div
                            style={{ fontSize: "0.75rem", color: "#64748b" }}
                          >
                            {(safePage - 1) * tableState.limit + 1}–
                            {Math.min(safePage * tableState.limit, totalFiltered)}{" "}
                            of {totalFiltered}
                          </div>
                          <div
                            style={{
                              display: "flex",
                              gap: "0.5rem",
                              alignItems: "center",
                            }}
                          >
                            <button
                              onClick={() =>
                                setTableState((prev) => ({
                                  ...prev,
                                  page: Math.max(1, prev.page - 1),
                                }))
                              }
                              disabled={safePage === 1}
                              style={{
                                padding: "0.4rem 0.8rem",
                                borderRadius: 6,
                                border: "1px solid #e2e8f0",
                                background: "white",
                                cursor:
                                  safePage === 1 ? "not-allowed" : "pointer",
                                opacity: safePage === 1 ? 0.5 : 1,
                                fontSize: "0.75rem",
                              }}
                            >
                              Previous
                            </button>
                            <span
                              style={{
                                fontSize: "0.75rem",
                                fontWeight: 600,
                                color: "#0f172a",
                              }}
                            >
                              {safePage} / {totalPages}
                            </span>
                            <button
                              onClick={() =>
                                setTableState((prev) => ({
                                  ...prev,
                                  page: Math.min(totalPages, prev.page + 1),
                                }))
                              }
                              disabled={safePage === totalPages}
                              style={{
                                padding: "0.4rem 0.8rem",
                                borderRadius: 6,
                                border: "1px solid #e2e8f0",
                                background: "white",
                                cursor:
                                  safePage === totalPages
                                    ? "not-allowed"
                                    : "pointer",
                                opacity: safePage === totalPages ? 0.5 : 1,
                                fontSize: "0.75rem",
                              }}
                            >
                              Next
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    // Desktop Table View
                    <div style={{ overflowX: "auto" }}>
                      <table
                        style={{ width: "100%", borderCollapse: "collapse" }}
                      >
                        <thead>
                          <tr>
                            <SortHeader
                              label="Quote #"
                              field="quotationNumber"
                              sort={tableState.sort}
                              onSort={handleSort}
                            />
                            <SortHeader
                              label="Customer"
                              field="customer"
                              sort={tableState.sort}
                              onSort={handleSort}
                            />
                            <th
                              style={{
                                padding: "0.75rem 1rem",
                                fontSize: "0.72rem",
                                fontWeight: 700,
                                color: "#64748b",
                                textTransform: "uppercase",
                                letterSpacing: "0.05em",
                                textAlign: "left",
                                borderBottom: "1px solid #f1f5f9",
                                backgroundColor: "#fafafa",
                                whiteSpace: "nowrap",
                              }}
                            >
                              Project Name
                            </th>
                            <SortHeader
                              label="Query Date"
                              field="queryDate"
                              sort={tableState.sort}
                              onSort={handleSort}
                              align="center"
                            />
                            <SortHeader
                              label="Submitted"
                              field="date"
                              sort={tableState.sort}
                              onSort={handleSort}
                            />
                            <SortHeader
                              label="Expiry"
                              field="expiryDate"
                              sort={tableState.sort}
                              onSort={handleSort}
                            />
                            <SortHeader
                              label="Total"
                              field="total"
                              sort={tableState.sort}
                              onSort={handleSort}
                              align="right"
                            />
                            <SortHeader
                              label="Status"
                              field="status"
                              sort={tableState.sort}
                              onSort={handleSort}
                            />
                            <th
                              style={{
                                padding: "0.75rem 1rem",
                                fontSize: "0.72rem",
                                fontWeight: 700,
                                color: "#64748b",
                                textTransform: "uppercase",
                                letterSpacing: "0.05em",
                                textAlign: "center",
                                borderBottom: "1px solid #f1f5f9",
                                backgroundColor: "#fafafa",
                                whiteSpace: "nowrap",
                              }}
                            >
                              Actions
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {paginated.length === 0 ? (
                            <tr>
                              <td
                                colSpan={9}
                                style={{
                                  padding: "3rem",
                                  textAlign: "center",
                                  color: "#94a3b8",
                                  fontSize: "0.875rem",
                                }}
                              >
                                No results for "<strong>{tableState.search}</strong>"
                                {" "}
                                <button
                                  onClick={clearSearch}
                                  style={{
                                    marginLeft: "0.5rem",
                                    background: "none",
                                    border: "none",
                                    color: "#6366f1",
                                    cursor: "pointer",
                                    fontWeight: 600,
                                    fontSize: "0.875rem",
                                  }}
                                >
                                  Clear
                                </button>
                              </td>
                            </tr>
                          ) : (
                            paginated.map((q) => {
                              const isExp = modalsState.exportingId === q._id;
                              const expired = isExpired(q.expiryDate);
                              const expiring =
                                !expired && isExpiringSoon(q.expiryDate);
                              const canDelete = DELETABLE.has(q.status);
                              const canAward = q.status === "approved";
                              const queryDatePassed =
                                q.queryDate &&
                                new Date(q.queryDate) < new Date();
                              return (
                                <tr
                                  key={q._id}
                                  style={{ borderBottom: "1px solid #f8fafc" }}
                                >
                                  <td
                                    style={{
                                      padding: "0.85rem 1rem",
                                      verticalAlign: "middle",
                                    }}
                                  >
                                    <div
                                      style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: "0.4rem",
                                        flexWrap: "wrap",
                                      }}
                                    >
                                      <span
                                        style={{
                                          fontWeight: 700,
                                          color: "#0f172a",
                                          fontFamily: "monospace",
                                          fontSize: "0.8rem",
                                        }}
                                      >
                                        {q.quotationNumber || "—"}
                                      </span>
                                      {expired && (
                                        <span
                                          style={{
                                            fontSize: "0.62rem",
                                            fontWeight: 700,
                                            color: "#dc2626",
                                            background: "#fef2f2",
                                            padding: "1px 6px",
                                            borderRadius: 999,
                                            border: "1px solid #fecaca",
                                          }}
                                        >
                                          Expired
                                        </span>
                                      )}
                                      {expiring && (
                                        <span
                                          style={{
                                            fontSize: "0.62rem",
                                            fontWeight: 700,
                                            color: "#d97706",
                                            background: "#fffbeb",
                                            padding: "1px 6px",
                                            borderRadius: 999,
                                            border: "1px solid #fde68a",
                                          }}
                                        >
                                          Expiring Soon
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                  <td
                                    style={{
                                      padding: "0.85rem 1rem",
                                      verticalAlign: "middle",
                                    }}
                                  >
                                    <div
                                      style={{
                                        fontWeight: 600,
                                        color: "#0f172a",
                                        fontSize: "0.875rem",
                                      }}
                                    >
                                      {q.customerSnapshot?.name ||
                                        q.customer ||
                                        q.customerId?.name ||
                                        "N/A"}
                                    </div>
                                    {q.contact && (
                                      <div
                                        style={{
                                          fontSize: "0.75rem",
                                          color: "#94a3b8",
                                          marginTop: 2,
                                        }}
                                      >
                                        {q.contact}
                                      </div>
                                    )}
                                    <RejectionNote quotation={q} />
                                  </td>
                                  <td
                                    style={{
                                      padding: "0.85rem 1rem",
                                      verticalAlign: "middle",
                                    }}
                                  >
                                    <div
                                      style={{
                                        fontSize: "0.875rem",
                                        color: "#0f172a",
                                      }}
                                    >
                                      {q.projectName || "—"}
                                    </div>
                                  </td>
                                  <td
                                    style={{
                                      padding: "0.85rem 1rem",
                                      verticalAlign: "middle",
                                      textAlign: "center",
                                    }}
                                  >
                                    {q.queryDate ? (
                                      <span
                                        style={{
                                          background: queryDatePassed
                                            ? "#fee2e2"
                                            : "#fef3c7",
                                          color: queryDatePassed
                                            ? "#991b1b"
                                            : "#92400e",
                                          padding: "0.25rem 0.75rem",
                                          borderRadius: "999px",
                                          fontSize: "0.75rem",
                                          fontWeight: 600,
                                          display: "inline-flex",
                                          alignItems: "center",
                                          gap: "0.25rem",
                                        }}
                                      >
                                        <Calendar size={12} />{" "}
                                        {fmtDate(q.queryDate)}{" "}
                                        {queryDatePassed && " ⚠️"}
                                      </span>
                                    ) : (
                                      "—"
                                    )}
                                  </td>
                                  <td
                                    style={{
                                      padding: "0.85rem 1rem",
                                      fontSize: "0.8rem",
                                      color: "#64748b",
                                      verticalAlign: "middle",
                                      whiteSpace: "nowrap",
                                    }}
                                  >
                                    {fmtDate(q.date)}
                                  </td>
                                  <td
                                    style={{
                                      padding: "0.85rem 1rem",
                                      fontSize: "0.8rem",
                                      verticalAlign: "middle",
                                      whiteSpace: "nowrap",
                                    }}
                                  >
                                    <span
                                      style={{
                                        color: expired
                                          ? "#dc2626"
                                          : expiring
                                          ? "#d97706"
                                          : "#64748b",
                                        fontWeight:
                                          expired || expiring ? 600 : 400,
                                      }}
                                    >
                                      {fmtDate(q.expiryDate)}
                                    </span>
                                  </td>
                                  <td
                                    style={{
                                      padding: "0.85rem 1rem",
                                      fontSize: "0.875rem",
                                      fontWeight: 700,
                                      color: "#0f172a",
                                      verticalAlign: "middle",
                                      textAlign: "right",
                                      whiteSpace: "nowrap",
                                    }}
                                  >
                                    {fmtCurrency(q.total, selectedCurrency)}
                                  </td>
                                  <td
                                    style={{
                                      padding: "0.85rem 1rem",
                                      verticalAlign: "middle",
                                    }}
                                  >
                                    <EnhancedStatusBadge
                                      status={q.status}
                                      quotation={q}
                                    />
                                  </td>
                                  <td
                                    style={{
                                      padding: "0.75rem 1rem",
                                      verticalAlign: "middle",
                                    }}
                                  >
                                    <div
                                      style={{
                                        display: "flex",
                                        gap: "0.3rem",
                                        justifyContent: "center",
                                        flexWrap: "wrap",
                                      }}
                                    >
                                      <ActionBtn
                                        bg="#e0f2fe"
                                        color="#0369a1"
                                        onClick={() => onViewQuotation(q._id)}
                                        icon={Eye}
                                        label="View"
                                        title="View quotation"
                                      />
                                      {/* <ActionBtn
                                        bg={isExp ? "#f1f5f9" : "#f0fdf4"}
                                        color={isExp ? "#94a3b8" : "#166534"}
                                        onClick={() =>
                                          !isExp && handleDownload(q)
                                        }
                                        disabled={isExp}
                                        icon={isExp ? Loader : Download}
                                        label={isExp ? "…" : "PDF"}
                                        title="Download PDF"
                                      /> */}
                                      {canAward && (
                                        <ActionBtn
                                          bg="#d1fae5"
                                          color="#065f46"
                                          onClick={() =>
                                            setModalsState((prev) => ({
                                              ...prev,
                                              awardModal: {
                                                open: true,
                                                quotation: q,
                                                busy: false,
                                              },
                                            }))
                                          }
                                          icon={Award}
                                          label="Award"
                                          title="Mark awarded / not awarded"
                                        />
                                      )}
                                      {canDelete && (
                                        <ActionBtn
                                          bg="#fff1f2"
                                          color="#e11d48"
                                          onClick={() =>
                                            setModalsState((prev) => ({
                                              ...prev,
                                              deleteModal: {
                                                open: true,
                                                quotation: q,
                                                busy: false,
                                              },
                                            }))
                                          }
                                          icon={Trash2}
                                          label="Del"
                                          title="Delete quotation"
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
                      <PaginationBar
                        total={totalFiltered}
                        page={safePage}
                        limit={tableState.limit}
                        onPage={(p) =>
                          setTableState((prev) => ({ ...prev, page: p }))
                        }
                        onLimit={(l) => {
                          setTableState((prev) => ({
                            ...prev,
                            limit: l,
                            page: 1,
                          }));
                        }}
                      />
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </div>

      {/* Loading Overlays */}
      {uiState.saveProgress > 0 && (
        <LoadingOverlay
          type="saving"
          step={uiState.saveStep}
          progress={uiState.saveProgress}
        />
      )}

      {uiState.pdfProgress > 0 && (
        <LoadingOverlay
          type="pdf"
          step={uiState.pdfStep}
          progress={uiState.pdfProgress}
        />
      )}

      {/* <NotificationDrawer 
        isOpen={notificationOpen} 
        onClose={() => setOpen(false)} 
      /> */}
      <QueryDateUpdater
        open={modalsState.queryDateModal.open}
        onClose={() =>
          setModalsState((prev) => ({
            ...prev,
            queryDateModal: { open: false, quotation: null },
          }))
        }
        onUpdate={handleUpdateQueryDate}
        quotations={safeQ}
        loading={statsLoading}
      />
    </div>
  );
}