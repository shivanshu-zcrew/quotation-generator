import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Eye, Download, Trash2, Clock, CheckCircle, XCircle,
  FileText, Search, X, Check, LogOut,
  AlertCircle, RefreshCw, ChevronUp, ChevronDown, ChevronLeft, ChevronRight,
  Shield, Award, Ban, Users, TrendingUp, Calendar, Menu,
  ShoppingCartIcon,
  Loader
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
import AwardModal from '../components/AwardModal';
import { adminAPI } from '../services/api';

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
const AdminQuotationCard = React.memo(({ quotation, onAward, isAwarding, selectedCurrency, onView, onApprove, onReject, onDownload, onDelete, isExporting, isApproving, isRejecting }) => {
  const expired = isExpired(quotation.expiryDate);
  const expiring = !expired && isExpiringSoon(quotation.expiryDate);
  const canAct = quotation.status === 'ops_approved' || quotation.status == 'pending_admin';
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
        
        {/* <ActionBtn bg={isExporting ? '#f1f5f9' : '#f0fdf4'} color={isExporting ? '#94a3b8' : '#166534'}
          onClick={() => !isExporting && onDownload(quotation)} disabled={isExporting}
          icon={isExporting ? RefreshCw : Download} label={isExporting ? '…' : 'PDF'} size="small"/>
         */}
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
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportMessage, setExportMessage] = useState('');
  const [exportFilters, setExportFilters] = useState({
    showFilters: false,
    fromDate: '',
    toDate: '',
    status: 'all',
  });
  
  // ── Store subscriptions ───────────────────────────────────
  const { 
    quotations: companyQuotations, 
    pagination: quotationsPagination,
    refresh: refreshCompanyQuotations, 
    quotationsLoading, 
    quotationsInitialized,
    goToPage,
    changeLimit,
    resetPagination,
    currentPage,
    currentLimit
  } = useCompanyQuotations();
  
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
    statusCounts,
    rejected,
    conversionDetails, 
    totalAwardedValue,
    totalCustomers
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

  // ── Server-side filters state ───────────────────────────────────────────
  const [serverFilters, setServerFilters] = useState({
    status: 'all',
    search: '',
    fromDate: '',
    toDate: ''
  });
  const [activeTab, setActiveTab] = useState('all');
  const [searchInput, setSearchInput] = useState('');
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

  useEffect(() => {
    changeLimit(isMobile ? 10 : 20);
  }, [isMobile, changeLimit]);

  useEffect(() => {
    if (isMobile) {
      setViewMode('card');
    }
  }, [isMobile]);

  // ── Derived state ─────────────────────────────────────────
  const safeQ = useMemo(() => Array.isArray(companyQuotations) ? companyQuotations : [], [companyQuotations]);
  const safeQuotationsLoading = quotationsLoading === undefined ? true : quotationsLoading;
  const isInitialLoading = !quotationsInitialized || safeQuotationsLoading;
  const isRefreshing = quotationsInitialized && safeQuotationsLoading && safeQ.length > 0;
  const showEmptyState = quotationsInitialized && !safeQuotationsLoading && safeQ.length === 0;

  // Auto-refresh if needed
  useEffect(() => {
    if (!quotationsInitialized && !quotationsLoading && safeQ.length === 0 && selectedCompany) {
      refreshCompanyQuotations();
    }
  }, [quotationsInitialized, quotationsLoading, safeQ.length, selectedCompany, refreshCompanyQuotations]);

  // ── Effects ───────────────────────────────────────────────
  useEffect(() => {
    refreshStats();
  }, [selectedCompany, refreshStats]);

  const prevCompanyForPagination = useRef(selectedCompany);

  useEffect(() => {
    if (prevCompanyForPagination.current !== selectedCompany) {
      // Company changed - reset pagination
      resetPagination();
      prevCompanyForPagination.current = selectedCompany;
    }
  }, [selectedCompany, resetPagination]);

const refreshWithFilters = useCallback(async () => {
  if (!selectedCompany) return;
  
  await refreshCompanyQuotations({
    page: currentPage,
    limit: currentLimit,
    status: serverFilters.status !== 'all' ? serverFilters.status : undefined,
    search: serverFilters.search || undefined,
    fromDate: serverFilters.fromDate || undefined,
    toDate: serverFilters.toDate || undefined,
    sortBy: sort.field,
    sortDir: sort.dir
  });
}, [refreshCompanyQuotations, currentPage, currentLimit, serverFilters, sort.field, sort.dir, selectedCompany]);

// Use a ref to track initial load
const initialLoadDone = useRef(false);

// Single useEffect for initial load
useEffect(() => {
  if (selectedCompany && !initialLoadDone.current && !quotationsInitialized) {
    initialLoadDone.current = true;
    refreshWithFilters();
  }
}, [selectedCompany, quotationsInitialized, refreshWithFilters]);

// Separate useEffect for filter changes (but prevent infinite loops)
const prevFiltersRef = useRef(serverFilters);
const prevSortRef = useRef(sort);

useEffect(() => {
  // Only refresh if filters or sort actually changed
  if (initialLoadDone.current && 
      (JSON.stringify(prevFiltersRef.current) !== JSON.stringify(serverFilters) ||
       JSON.stringify(prevSortRef.current) !== JSON.stringify(sort))) {
    prevFiltersRef.current = serverFilters;
    prevSortRef.current = sort;
    refreshWithFilters();
  }
}, [serverFilters, sort, refreshWithFilters]);

 
// ── Tab counts from adminStats (already has backend counts) ──
const tabCounts = useMemo(() => {
   
  return {
    all: statusCounts.total || 0,
    ops_approved: statusCounts.ops_approved || 0,
    approved: statusCounts.approved || 0,
    awarded: statusCounts.awarded || 0,
    rejected: statusCounts.rejected || 0,
  };
}, [statusCounts]);

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
    searchTimer.current = setTimeout(() => {
      setServerFilters(prev => ({ ...prev, search: val }));
      goToPage(1);
    }, DEBOUNCE_MS);
  }, [goToPage]);

  const clearSearch = useCallback(() => { 
    setSearchInput(''); 
    setServerFilters(prev => ({ ...prev, search: '' }));
    goToPage(1);
  }, [goToPage]);

  const handleTabChange = useCallback((key) => {
    setActiveTab(key);
    setServerFilters(prev => ({ ...prev, status: key }));
    setSearchInput('');
    setServerFilters(prev => ({ ...prev, search: '' }));
    setSort({ field: 'createdAt', dir: 'desc' });
    goToPage(1);
    setMobileMenuOpen(false);
  }, [goToPage]);

  const handleSort = useCallback((field) => {
    setSort(prev => ({ 
      field, 
      dir: prev.field === field && prev.dir === 'asc' ? 'desc' : 'asc' 
    }));
    goToPage(1);
  }, [goToPage]);

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
      await refreshWithFilters();
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
  }, [fetchAllData, refreshCompanyData, refreshWithFilters, addToast]);

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

  const handleExportDateChange = (type, value) => {
    setExportFilters(prev => ({ ...prev, [type]: value }));
  };
  
  const toggleExportFilters = () => {
    setExportFilters(prev => ({ ...prev, showFilters: !prev.showFilters }));
  };

  const handleExportToExcel = useCallback(async () => {
    setIsExporting(true);
    setExportProgress(10);
    setExportMessage('Preparing export...');
    
    const progressInterval = setInterval(() => {
      setExportProgress(prev => {
        if (prev >= 90) {
          clearInterval(progressInterval);
          return 90;
        }
        return prev + 10;
      });
    }, 500);
    
    try {
      setExportProgress(30);
      setExportMessage('Fetching data...');
      
      const params = {
        companyId: selectedCompany,
      };
      
      if (exportFilters.status && exportFilters.status !== 'all') {
        params.status = exportFilters.status;
      } else if (activeTab !== 'all') {
        params.status = activeTab;
      }
      
      if (exportFilters.fromDate) {
        params.fromDate = exportFilters.fromDate;
      }
      if (exportFilters.toDate) {
        params.toDate = exportFilters.toDate;
      }
      
      if (serverFilters.search && serverFilters.search.trim()) {
        params.search = serverFilters.search;
      }
      
      setExportProgress(60);
      setExportMessage('Generating Excel file...');
      
      const response = await adminAPI.exportQuotationsToExcel(params);
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `quotations_export_${new Date().toISOString().split('T')[0]}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      
      setExportProgress(100);
      setExportMessage('Complete!');
      addToast('Quotations exported successfully!', 'success');
      
      setTimeout(() => {
        setExportProgress(0);
        setExportMessage('');
      }, 1500);
      
    } catch (error) {
      console.error('Export error:', error);
      setExportProgress(0);
      setExportMessage('');
      addToast(error.response?.data?.message || 'Export failed', 'error');
    } finally {
      clearInterval(progressInterval);
      setIsExporting(false);
    }
  }, [selectedCompany, activeTab, serverFilters.search, exportFilters, addToast]);

  const handleApprove = useCallback(async (id) => {
    setActionLoading(id, 'approve', true);
    const result = await approveQuotation(id);
    if (result?.success) {
      addToast('Quotation approved successfully', 'success');
      refreshWithFilters();
    } else {
      addToast(result?.error || 'Failed to approve quotation', 'error');
    }
    setActionLoading(id, 'approve', false);
  }, [approveQuotation, addToast, refreshWithFilters, setActionLoading]);

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
        refreshWithFilters();
      } else {
        addToast(result?.error || 'Failed to reject quotation', 'error');
      }
      setActionLoading(rejectModal.id, 'reject', false);
    }, [rejectModal, rejectQuotation, addToast, refreshWithFilters, setActionLoading])
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
        refreshWithFilters();
      } else {
        addToast(result?.error || 'Failed to delete quotation', 'error');
      }
      setActionLoading(deleteModal.id, 'delete', false);
    }, [deleteModal, deleteQuotation, addToast, refreshWithFilters, setActionLoading])
  };

  const handleView = useCallback((id) => {
    if (onViewQuotation) {
      onViewQuotation(id);
    } else {
      navigate(`/quotation/${id}`);
    }
  }, [onViewQuotation, navigate]);

  const handleAward = {
    open: useCallback((quotation) => {
      setAwardModal({ open: true, quotation, busy: false, awardNote: '', awarded: null });
    }, []),
  
    close: useCallback(() => {
      setAwardModal({ open: false, quotation: null, busy: false, awardNote: '', awarded: null });
    }, []),
  
    confirm: useCallback(async (awarded, awardNote) => {
      if (!awardModal.quotation) return;
      
      setAwardModal(prev => ({ ...prev, busy: true }));
      setActionLoading(awardModal.quotation._id, 'award', true);
      
      try {
        const result = await awardQuotation(awardModal.quotation._id, awarded, awardNote);
        
        if (result?.success) {
          addToast(
            awarded 
              ? `🏆 Quotation ${awardModal.quotation.quotationNumber} marked as Awarded!` 
              : `Quotation ${awardModal.quotation.quotationNumber} marked as Not Awarded.`,
            "success"
          );
          refreshWithFilters();
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
        setActionLoading(awardModal.quotation?._id, 'award', false);
      }
    }, [awardModal.quotation, awardQuotation, addToast, refreshWithFilters, refreshStats, setActionLoading])
  };

  const handleGoToCustomers = useCallback(() => {
    if (onNavigate) {
      onNavigate('customers');
    }
  }, [onNavigate]);
  
  const handleGoToItems = useCallback(() => {
    if (onNavigate) {
      onNavigate('items');
    }
  }, [onNavigate]);

  const handleCreateQuotation = useCallback(() => {
    if (onNavigate) {
      onNavigate('addQuotation');
    }
  }, [onNavigate]);

  const handleUserStats = useCallback(() => {
    if (onNavigate) {
      onNavigate('userStats');
    }
  }, [onNavigate]);

  const handleUsers = useCallback(() => {
    if (onNavigate) {
      onNavigate('users');
    }
  }, [onNavigate]);

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
    { key: 'all',           label: 'All',              Icon: FileText,    count: tabCounts.all },
    { key: 'ops_approved',  label: 'Action Required',  Icon: Clock,       count: tabCounts.ops_approved },
    { key: 'approved',      label: 'Approved',         Icon: CheckCircle, count: tabCounts.approved },
    { key: 'awarded',       label: 'Awarded',          Icon: Award,       count: tabCounts.awarded },
    { key: 'rejected',      label: 'Rejected',         Icon: XCircle,     count: tabCounts.rejected },
  ], [tabCounts]);

  // ── Render helpers ────────────────────────────────────────
  const renderStatCards = () => {
    const safeCustomersLength = Array.isArray(customers) ? customers.length : 0;
    
    // Helper function to format large numbers
    const formatLargeNumber = (num) => {
      if (num === null || num === undefined || isNaN(num)) return '0';
      if (num === 0) return '0';
      
      const absNum = Math.abs(num);
      
      if (absNum >= 1_000_000_000) {
        return (absNum / 1_000_000_000).toFixed(1) + 'B';
      }
      if (absNum >= 1_000_000) {
        return (absNum / 1_000_000).toFixed(1) + 'M';
      }
      if (absNum >= 1_000) {
        return (absNum / 1_000).toFixed(1) + 'K';
      }
      
      return num.toString();
    };
  
    // Helper function to format currency with abbreviations
    const formatLargeCurrency = (num, currency) => {
      if (num === null || num === undefined || isNaN(num)) return `0 ${currency}`;
      if (num === 0) return `0 ${currency}`;
      
      const absNum = Math.abs(num);
      
      if (absNum >= 1_000_000_000) {
        return `${(absNum / 1_000_000_000).toFixed(1)}B ${currency}`;
      }
      if (absNum >= 1_000_000) {
        return `${(absNum / 1_000_000).toFixed(1)}M ${currency}`;
      }
      if (absNum >= 1_000) {
        return `${(absNum / 1_000).toFixed(1)}K ${currency}`;
      }
      
      return `${num.toLocaleString()} ${currency}`;
    };
  
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
          customersCount={totalCustomers}
          selectedCurrency={selectedCurrency}
          statusCounts={statusCounts}
          loading={statsLoading}
        />
      );
    }
    
    return (
      <>
        <div style={styles.statsRow1}>
          <StatCard 
            label="Total Quotations" 
            value={formatLargeNumber(totalQuotations)} 
            fullValue={totalQuotations.toLocaleString()}
            accent="#6366f1" 
            iconBg="#eff1ff" 
            iconColor="#6366f1" 
            Icon={FileText} 
            loading={statsLoading} 
            sub="All time" 
          />
          <StatCard 
            label="Action Required" 
            value={formatLargeNumber(actionRequired)} 
            fullValue={actionRequired.toLocaleString()}
            accent="#3b82f6" 
            iconBg="#dbeafe" 
            iconColor="#3b82f6" 
            Icon={Shield} 
            loading={statsLoading} 
            sub="Awaiting your approval" 
          />
          <StatCard 
            label="Approved" 
            value={formatLargeNumber(approved)} 
            fullValue={approved.toLocaleString()}
            accent="#10b981" 
            iconBg="#d1fae5" 
            iconColor="#10b981" 
            Icon={TrendingUp} 
            loading={statsLoading} 
            sub="quotations approved" 
          />
          <StatCard 
            label="Awarded Value" 
            value={formatLargeCurrency(totalAwardedValue, selectedCurrency)} 
            fullValue={fmtCurrency(totalAwardedValue, selectedCurrency)}
            accent="#059669" 
            iconBg="#d1fae5" 
            iconColor="#059669" 
            Icon={Award} 
            loading={statsLoading} 
            sub={`${formatLargeNumber(awarded)} deals won`} 
          />
        </div>
  
        <div style={styles.statsRow2}>
          <StatCard 
            label="Conversion Rate" 
            value={`${conversionDetails}%`} 
            accent="#f59e0b" 
            iconBg="#fef3c7" 
            iconColor="#f59e0b" 
            Icon={TrendingUp} 
            loading={statsLoading} 
          />
          <StatCard 
            label="Rejected by Admin" 
            value={formatLargeNumber(rejected)} 
            fullValue={rejected.toLocaleString()}
            accent="#ec4899" 
            iconBg="#fce7f3" 
            iconColor="#ec4899" 
            Icon={Ban} 
            loading={statsLoading} 
            sub="Rejected quotations" 
          />
          <StatCard 
            label="Total Customers" 
            value={formatLargeNumber(totalCustomers)} 
            fullValue={totalCustomers.toLocaleString()}
            accent="#8b5cf6" 
            iconBg="#ede9fe" 
            iconColor="#8b5cf6" 
            Icon={Users} 
            loading={statsLoading} 
            sub="Active customers" 
          />
        </div>
      </>
    );
  };

  const renderTableRow = (q) => {
    if (!q) return null;
    
    const isExp = exportingId === q._id;
    const canAct = q.status === 'ops_approved' || q.status === 'pending_admin';
    const canAward = q.status === 'approved' && (q.createdBy?.role === 'admin' || q.createdBySnapshot?.role === 'admin');
    const canDelete = DELETABLE.has(q.status);
    const expired = isExpired(q.expiryDate);
    const expiring = !expired && isExpiringSoon(q.expiryDate);
    const queryDatePassed = q.queryDate && new Date(q.queryDate) < new Date();
    const createdByName = q.createdBy?.name || q.createdBySnapshot?.name || '—';
    
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
          {createdByName}
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
            
            {/* <ActionBtn bg={isExp ? '#f1f5f9' : '#f0fdf4'} color={isExp ? '#94a3b8' : '#166534'}
              onClick={() => !isExp && handleDownload(q)} disabled={isExp}
              icon={isExp ? RefreshCw : Download} label={isExp ? '…' : 'PDF'} title="Download PDF" size="small"/> */}
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
          
          <button onClick={handleGoToCustomers} className="adm-nav-btn" style={{
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
          }}>
            <Users size={isMobile ? 12 : 14} /> {!isMobile && "Customers"}
          </button>
          
          <button onClick={handleGoToItems} className="adm-nav-btn" style={{
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
          }}>
            <ShoppingCartIcon size={isMobile ? 12 : 14} /> {!isMobile && "Items"}
          </button>

          <div style={{ position: 'relative' }}>
            <button onClick={toggleExportFilters} disabled={isExporting} style={styles.exportBtn}>
              <Download size={14} /> Export Excel {exportFilters.showFilters ? '▲' : '▼'}
            </button>
            
            {exportFilters.showFilters && (
              <div style={styles.exportFilterDropdown}>
                <div style={styles.filterGroup}>
                  <label style={styles.filterLabel}>Date Range</label>
                  <div style={styles.dateRangeRow}>
                    <input
                      type="date"
                      value={exportFilters.fromDate}
                      onChange={(e) => handleExportDateChange('fromDate', e.target.value)}
                      style={styles.filterInput}
                    />
                    <span>to</span>
                    <input
                      type="date"
                      value={exportFilters.toDate}
                      onChange={(e) => handleExportDateChange('toDate', e.target.value)}
                      style={styles.filterInput}
                    />
                  </div>
                </div>
                
                <div style={styles.filterGroup}>
                  <label style={styles.filterLabel}>Status</label>
                  <select
                    value={exportFilters.status}
                    onChange={(e) => handleExportDateChange('status', e.target.value)}
                    style={styles.filterSelect}
                  >
                    <option value="all">All Statuses</option>
                    <option value="pending">Pending</option>
                    <option value="ops_approved">Awaiting Admin</option>
                    <option value="ops_rejected">Returned by Ops</option>
                    <option value="approved">Approved</option>
                    <option value="rejected">Rejected</option>
                    <option value="awarded">Awarded</option>
                  </select>
                </div>
                
                <div style={styles.filterActions}>
                  <button
                    onClick={() => {
                      setExportFilters({
                        showFilters: false,
                        fromDate: '',
                        toDate: '',
                        status: 'all',
                      });
                    }}
                    style={styles.filterResetBtn}
                  >
                    Reset
                  </button>
                  <button onClick={handleExportToExcel} style={styles.filterApplyBtn}>
                    Export Now
                  </button>
                </div>
              </div>
            )}
          </div>

          <button onClick={handleCreateQuotation} className="adm-nav-btn" style={{
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
          }}>
            <FileText size={isMobile ? 12 : 14} /> {!isMobile && "New Quotation"}
          </button>
          
          <button onClick={handleUserStats} style={{
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
          }}>
            <Users size={isMobile ? 12 : 14} /> User Stats
          </button>

          <button onClick={handleUsers} style={{
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
          }}>
            <Users size={isMobile ? 12 : 14} /> Users
          </button>

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

          {/* Refresh overlay - only show when refreshing existing data */}
          {isRefreshing && safeQ.length > 0 && (
            <div style={styles.refreshOverlay}>
              <div style={styles.refreshCard}>
                <RefreshCw size={isMobile ? 20 : 24} color="#6366f1" style={styles.spin}/>
                <span style={styles.refreshText}>Refreshing…</span>
              </div>
            </div>
          )}

          {/* Content - Show skeleton during initial load */}
          {isInitialLoading ? (
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
          ) : (
            <>
              {showEmptyState ? (
                <div style={{ ...styles.emptyState, padding: isMobile ? '3rem 1rem' : '4rem 2rem' }}>
                  <FileText size={isMobile ? 36 : 48} color="#cbd5e1" style={{ marginBottom: '1rem' }}/>
                  <p style={styles.emptyStateTitle}>
                    {serverFilters.search ? `No results for "${serverFilters.search}"` : 'No quotations found'}
                  </p>
                  {serverFilters.search && (
                    <button onClick={clearSearch} style={styles.emptyStateClear}>
                      Clear search
                    </button>
                  )}
                </div>
              ) : (
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
                          No results for "<strong>{serverFilters.search}</strong>"
                          <button onClick={clearSearch} style={{ marginLeft: '0.5rem', background: 'none', border: 'none', color: '#6366f1', cursor: 'pointer', fontWeight: 600 }}>Clear</button>
                        </div>
                      ) : (
                        safeQ.map((q) => (
                          <AdminQuotationCard
                            key={q._id}
                            quotation={q}
                            selectedCurrency={selectedCurrency}
                            onView={handleView}
                            onApprove={handleApprove}
                            onReject={handleReject.open}
                            onDownload={handleDownload}
                            onDelete={handleDelete.open}
                            onAward={handleAward.open}
                            isExporting={exportingId === q._id}
                            isApproving={isActionLoading(q._id, 'approve')}
                            isRejecting={isActionLoading(q._id, 'reject')}
                            isAwarding={isActionLoading(q._id, 'award')}
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
                          {safeQ.length === 0 ? (
                            <tr>
                              <td colSpan={10} style={styles.noResults}>
                                No results for "<strong>{serverFilters.search}</strong>"
                                <button onClick={clearSearch} style={styles.clearSearchLink}>Clear</button>
                              </td>
                            </tr>
                          ) : (
                            safeQ.map(renderTableRow)
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}
                  
                  {/* Server-side Pagination */}
                  {!isMobile && quotationsPagination && quotationsPagination.totalPages > 1 && (
                    <PaginationBar
                      total={quotationsPagination.total || 0}
                      page={quotationsPagination.page || 1}
                      limit={currentLimit}
                      onPage={(newPage) => goToPage(newPage)}
                      onLimit={(newLimit) => changeLimit(newLimit)}
                    />
                  )}
                  
                  {/* Mobile Pagination */}
                  {isMobile && quotationsPagination && quotationsPagination.totalPages > 1 && (
                    <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', padding: '0.5rem' }}>
                      <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                        {((quotationsPagination.page - 1) * currentLimit) + 1}–{Math.min(quotationsPagination.page * currentLimit, quotationsPagination.total)} of {quotationsPagination.total}
                      </div>
                      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        <button 
                          onClick={() => goToPage(quotationsPagination.page - 1)} 
                          disabled={quotationsPagination.page === 1}
                          style={{ padding: '0.4rem 0.8rem', borderRadius: 6, border: '1px solid #e2e8f0', background: 'white', cursor: quotationsPagination.page === 1 ? 'not-allowed' : 'pointer', opacity: quotationsPagination.page === 1 ? 0.5 : 1, fontSize: '0.75rem' }}
                        >
                          Previous
                        </button>
                        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#0f172a' }}>
                          {quotationsPagination.page} / {quotationsPagination.totalPages}
                        </span>
                        <button 
                          onClick={() => goToPage(quotationsPagination.page + 1)} 
                          disabled={quotationsPagination.page === quotationsPagination.totalPages}
                          style={{ padding: '0.4rem 0.8rem', borderRadius: 6, border: '1px solid #e2e8f0', background: 'white', cursor: quotationsPagination.page === quotationsPagination.totalPages ? 'not-allowed' : 'pointer', opacity: quotationsPagination.page === quotationsPagination.totalPages ? 0.5 : 1, fontSize: '0.75rem' }}
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
      <ConfirmModal
        open={rejectModal.open}
        title="Reject Quotation"
        message="This quotation has been reviewed by Ops. Provide a reason for rejecting it at the admin level."
        confirmLabel="Reject"
        danger
        onConfirm={handleReject.confirm}
        onCancel={handleReject.close}
        loading={false}
      >
        <textarea
          value={rejectModal.reason}
          onChange={(e) => setRejectModal(prev => ({ ...prev, reason: e.target.value }))}
          rows={4}
          placeholder="Enter rejection reason…"
          autoFocus
          style={styles.rejectTextarea}
        />
      </ConfirmModal>

      <ConfirmModal
        open={deleteModal.open}
        title="Delete Quotation"
        message="This action cannot be undone. The quotation and all associated images will be permanently removed."
        confirmLabel="Delete"
        danger
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
 
      <AwardModal
        open={awardModal.open}
        quotation={awardModal.quotation}
        onConfirm={handleAward.confirm}
        onCancel={handleAward.close}
        loading={awardModal.busy || isActionLoading(awardModal.quotation?._id, 'award')}
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
  exportBtn: {
    backgroundColor: '#10b981',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    padding: '0.45rem 0.875rem',
    fontSize: '0.8rem',
    fontWeight: 600,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '0.4rem'
  },
  
  exportFilterDropdown: {
    position: 'absolute',
    top: '100%',
    right: 0,
    marginTop: '8px',
    backgroundColor: 'white',
    borderRadius: '12px',
    boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)',
    padding: '1rem',
    minWidth: '300px',
    zIndex: 100,
    border: '1px solid #e2e8f0'
  },
  
  filterGroup: {
    marginBottom: '1rem'
  },
  
  filterLabel: {
    display: 'block',
    fontSize: '0.75rem',
    fontWeight: 600,
    color: '#374151',
    marginBottom: '0.5rem'
  },
  
  dateRangeRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem'
  },
  
  filterInput: {
    flex: 1,
    padding: '0.5rem',
    border: '1px solid #e2e8f0',
    borderRadius: '6px',
    fontSize: '0.75rem',
    outline: 'none'
  },
  
  filterSelect: {
    width: '100%',
    padding: '0.5rem',
    border: '1px solid #e2e8f0',
    borderRadius: '6px',
    fontSize: '0.75rem',
    outline: 'none',
    backgroundColor: 'white'
  },
  
  filterActions: {
    display: 'flex',
    gap: '0.5rem',
    justifyContent: 'flex-end',
    marginTop: '0.5rem'
  },
  
  filterResetBtn: {
    padding: '0.5rem 1rem',
    backgroundColor: '#f3f4f6',
    color: '#374151',
    border: 'none',
    borderRadius: '6px',
    fontSize: '0.75rem',
    fontWeight: 500,
    cursor: 'pointer'
  },
  
  filterApplyBtn: {
    padding: '0.5rem 1rem',
    backgroundColor: '#10b981',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    fontSize: '0.75rem',
    fontWeight: 600,
    cursor: 'pointer'
  },
};