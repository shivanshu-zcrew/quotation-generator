
import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Eye, Download, Trash2, Clock, CheckCircle, XCircle,
  FileText, Search, X, Check, LogOut,
  AlertCircle, RefreshCw, ChevronUp, ChevronDown, ChevronLeft, ChevronRight,
  Shield, Award, Ban, Users, TrendingUp, Calendar
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
const NavBtn = React.memo(({ onClick, label, primary }) => (
  <button onClick={onClick} className="adm-nav-btn"
    style={{
      backgroundColor: primary ? 'white' : 'rgba(255,255,255,0.08)',
      color: primary ? '#0f172a' : '#94a3b8',
      border: primary ? 'none' : '1px solid rgba(255,255,255,0.12)',
      borderRadius: 8, padding: '0.45rem 0.875rem', fontSize: '0.8rem',
      fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s'
    }}>
    {label}
  </button>
));

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

// ─────────────────────────────────────────────────────────────
// Custom Hooks
// ─────────────────────────────────────────────────────────────
const useDebounce = (value, delay) => {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);

  return debouncedValue;
};

const useTableData = (quotations, activeTab, search, sort) => {
  return useMemo(() => {
    // Tab filter
    const { statusFilter } = TAB_KEYS[activeTab];
    const tabFiltered = !statusFilter ? quotations :
      Array.isArray(statusFilter) 
        ? quotations.filter(q => statusFilter.includes(q.status))
        : quotations.filter(q => q.status === statusFilter);

    // Search filter
    const searchFiltered = !search.trim() ? tabFiltered :
      tabFiltered.filter(q => {
        const t = search.toLowerCase();
        return (q.quotationNumber || '').toLowerCase().includes(t) ||
               (q.customerSnapshot?.name || q.customer || q.customerId?.name || '').toLowerCase().includes(t);
      });

    // Sort
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
  const [limit, setLimit] = useState(20);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState({ field: 'createdAt', dir: 'desc' });

  // ── Action state ──────────────────────────────────────────
  const [exportingId, setExportingId] = useState(null);
  const [rejectModal, setRejectModal] = useState({ open: false, id: null, reason: '' });
  const [deleteModal, setDeleteModal] = useState({ open: false, id: null });

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
  }, []);

  const handleSort = useCallback((field) => {
    setSort(prev => ({ 
      field, 
      dir: prev.field === field && prev.dir === 'asc' ? 'desc' : 'asc' 
    }));
    setPage(1);
  }, []);

  const handleRefresh = useCallback(async () => {
    try {
      await fetchAllData();
      refreshCompanyData?.();
      refreshCompanyQuotations();
      addToast('Data refreshed', 'success');
    } catch (err) {
      addToast(err.message || 'Refresh failed', 'error');
    }
  }, [fetchAllData, refreshCompanyData, refreshCompanyQuotations, addToast]);

  const handleDownload = useCallback(async (q) => {
    setExportingId(q._id);
    try {
      await downloadQuotationPDF(q);
      addToast('PDF downloaded successfully!', 'success');
    } catch (err) {
      addToast(`PDF failed: ${err.message}`, 'error');
    } finally {
      setExportingId(null);
    }
  }, [addToast]);

  const handleApprove = useCallback(async (id) => {
    const result = await approveQuotation(id);
    if (result?.success) {
      addToast('Quotation approved successfully', 'success');
      refreshCompanyQuotations();
    } else {
      addToast(result?.error || 'Failed to approve quotation', 'error');
    }
  }, [approveQuotation, addToast, refreshCompanyQuotations]);

  const handleReject = {
    open: useCallback((id) => setRejectModal({ open: true, id, reason: '' }), []),
    close: useCallback(() => setRejectModal({ open: false, id: null, reason: '' }), []),
    confirm: useCallback(async () => {
      if (!rejectModal.reason.trim()) { 
        addToast('Please provide a rejection reason', 'error'); 
        return; 
      }
      
      const result = await rejectQuotation(rejectModal.id, rejectModal.reason);
      if (result?.success) {
        addToast('Quotation rejected', 'success');
        handleReject.close();
        refreshCompanyQuotations();
      } else {
        addToast(result?.error || 'Failed to reject quotation', 'error');
      }
    }, [rejectModal, rejectQuotation, addToast, refreshCompanyQuotations])
  };

  const handleDelete = {
    open: useCallback((id) => setDeleteModal({ open: true, id }), []),
    close: useCallback(() => setDeleteModal({ open: false, id: null }), []),
    confirm: useCallback(async () => {
      const result = await deleteQuotation(deleteModal.id);
      if (result?.success) {
        addToast('Quotation deleted', 'success');
        handleDelete.close();
        refreshCompanyQuotations();
      } else {
        addToast(result?.error || 'Failed to delete quotation', 'error');
      }
    }, [deleteModal, deleteQuotation, addToast, refreshCompanyQuotations])
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

  // ── Render helpers ────────────────────────────────────────
  const renderStatCards = () => (
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
        <StatCard label="Conversion Rate" value={`${conversionRate}%`} accent="#f59e0b" 
          iconBg="#fef3c7" iconColor="#f59e0b" Icon={TrendingUp} loading={statsLoading} 
          sub={`${conversionDetails.awardedCount} of ${conversionDetails.totalDecided} approved`} />
        <StatCard label="Rejected by Admin" value={rejected} accent="#ec4899" 
          iconBg="#fce7f3" iconColor="#ec4899" Icon={Ban} loading={statsLoading} sub="Rejected quotations" />
        <StatCard label="Total Customers" value={customers.length} accent="#8b5cf6" 
          iconBg="#ede9fe" iconColor="#8b5cf6" Icon={Users} loading={false} sub="Active customers" />
      </div>
    </>
  );

  const renderTableHeader = () => (
    <div style={styles.tableHeader}>
      <div style={styles.tabContainer}>
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
            }}>
              <I size={13}/>
              {label}
              <span style={{
                backgroundColor: active ? alertColor : (hasAlert ? alertColor : '#e2e8f0'),
                color: (active || hasAlert) ? '#fff' : '#64748b',
                ...styles.tabCount
              }}>
                {isInitialLoading ? '…' : count}
              </span>
            </button>
          );
        })}
      </div>

      <div style={styles.headerActions}>
        <button onClick={handleRefresh} disabled={loading} style={styles.refreshBtn}>
          <RefreshCw size={14} color="#64748b" style={loading ? styles.spin : {}}/>
        </button>
        <div style={styles.searchBox}>
          <Search size={14} color="#94a3b8"/>
          <input
            ref={searchRef}
            style={styles.searchInput}
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
      </div>
    </div>
  );

  const renderTableRow = (q) => {
    const isExp = exportingId === q._id;
    const canAct = q.status === 'ops_approved';
    const canDelete = DELETABLE.has(q.status);
    const expired = isExpired(q.expiryDate);
    const expiring = !expired && isExpiringSoon(q.expiryDate);
    const queryDatePassed = q.queryDate && new Date(q.queryDate) < new Date();

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
            <div style={styles.projectName}>{q.tl || '—'}</div>
            {q.trn && <div style={styles.trnText}>TRN: {q.trn}</div>}
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
        
        <td style={styles.totalCell}>
          {fmtCurrency(q.total, selectedCurrency)}
        </td>
        
        <td style={styles.actionsCell}>
          <div style={styles.actionsContainer}>
            {canAct && (
              <>
                <ActionBtn bg="#dcfce7" color="#166534" onClick={() => handleApprove(q._id)} 
                  icon={Check} label="Approve" title="Approve (final)"/>
                <ActionBtn bg="#fce7f3" color="#9d174d" onClick={() => handleReject.open(q._id)} 
                  icon={X} label="Reject" title="Reject"/>
              </>
            )}
            
            <ActionBtn bg="#e0f2fe" color="#0369a1" onClick={() => handleView(q._id)} 
              icon={Eye} label="View" title="View quotation"/>
            
            <ActionBtn bg={isExp ? '#f1f5f9' : '#f0fdf4'} color={isExp ? '#94a3b8' : '#166534'}
              onClick={() => !isExp && handleDownload(q)} disabled={isExp}
              icon={isExp ? RefreshCw : Download} label={isExp ? '…' : 'PDF'} title="Download PDF"/>
            
            {canDelete && (
              <ActionBtn bg="#fff1f2" color="#e11d48" onClick={() => handleDelete.open(q._id)} 
                icon={Trash2} label="Del" title="Delete quotation"/>
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

      {/* Topbar */}
      <div style={styles.topbar}>
        <div>
          <div style={styles.dashboardTitle}>⚙ Admin Dashboard</div>
          <CompanyCurrencyDisplay />
        </div>
        <div style={styles.topbarActions}>
          <CompanyCurrencySelector variant="compact" />
          <NavBtn onClick={() => onNavigate('users')} label="Manage Users" />
          <button onClick={handleLogout} className="adm-nav-btn" style={styles.logoutBtn}>
            <LogOut size={15}/> Logout
          </button>
        </div>
      </div>

      <div style={styles.mainContent}>
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
          {isRefreshing && <RefreshOverlay />}

          {/* Content */}
          {isInitialLoading ? (
            <LoadingSkeleton />
          ) : (
            <>
              {safeQ.length === 0 ? (
                <EmptyState search={search} clearSearch={clearSearch} />
              ) : (
                <>
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
                          <SortHeader label={`Total (${selectedCurrency})`} field="total" sort={sort} onSort={handleSort} align="right"/>
                          <th style={styles.actionsHeaderCell}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paginated.length === 0 ? (
                          <tr>
                            <td colSpan={10} style={styles.noResults}>
                              No results for "<strong>{search}</strong>"
                              <button onClick={clearSearch} style={styles.clearSearchLink}>
                                Clear
                              </button>
                            </td>
                          </tr>
                        ) : paginated.map(renderTableRow)}
                      </tbody>
                    </table>
                  </div>

                  <PaginationBar
                    total={totalFiltered}
                    page={safePage}
                    limit={limit}
                    onPage={setPage}
                    onLimit={(l) => { setLimit(l); setPage(1); }}
                  />
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
        loading={false}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Sub-components (extracted for clarity)
// ─────────────────────────────────────────────────────────────

const RefreshOverlay = React.memo(() => (
  <div style={styles.refreshOverlay}>
    <div style={styles.refreshCard}>
      <RefreshCw size={24} color="#6366f1" style={styles.spin}/>
      <span style={styles.refreshText}>Refreshing…</span>
    </div>
  </div>
));

const LoadingSkeleton = React.memo(() => (
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

const EmptyState = React.memo(({ search, clearSearch }) => (
  <div style={styles.emptyState}>
    <FileText size={48} color="#cbd5e1" style={{ marginBottom: '1rem' }}/>
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
    padding: '0 2rem',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 60,
    position: 'sticky',
    top: 0,
    zIndex: 50,
    boxShadow: '0 2px 8px rgba(0,0,0,0.25)'
  },

  dashboardTitle: {
    fontSize: '1.0625rem',
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
    padding: '0.45rem 0.85rem',
    fontSize: '0.8rem',
    fontWeight: 600,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '0.4rem'
  },

  mainContent: {
    maxWidth: 1400,
    margin: '0 auto',
    padding: '2rem'
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
    color: '#991b1b'
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
    padding: '0.4rem 0.875rem',
    borderRadius: 8,
    border: 'none',
    cursor: 'pointer',
    fontSize: '0.8rem',
    fontWeight: 600,
    display: 'flex',
    alignItems: 'center',
    gap: '0.35rem',
    transition: 'all 0.15s'
  },

  tabCount: {
    borderRadius: 999,
    padding: '1px 7px',
    fontSize: '0.68rem',
    fontWeight: 700
  },

  headerActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem'
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
    color: '#0f172a',
    width: 210
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
  }
};