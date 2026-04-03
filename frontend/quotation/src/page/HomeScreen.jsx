import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Users, FileText, TrendingUp, AlertCircle, RefreshCw, Search, X, CheckCircle, Loader, LogOut, Plus, Calendar, Clock, Award, Ban, Eye, Download, Trash2 } from 'lucide-react';

import { useAppStore, useCompanyQuotations, useCustomerStatsWithCompany } from '../services/store';
import { useCompanyCurrency, CompanyCurrencySelector, CompanyCurrencyDisplay } from '../components/CompanyCurrencySelector';
import QueryDateUpdater from '../components/QueryDateUpdater';
import { StatusBadge, RejectionNote, Toast, StatCard, ActionBtn, SortHeader, PaginationBar, SkeletonRow, ConfirmModal, AwardModal } from '../components/SharedComponents';
import { PAGE_SIZE_OPTIONS, DEBOUNCE_MS, TAB_KEYS, DELETABLE } from '../utils/constants';
import { fmtCurrency, fmtDate, isExpired, isExpiringSoon } from '../utils/formatters';
import { downloadQuotationPDF } from '../utils/pdfGenerator';

export default function HomeScreen({ onNavigate, onViewQuotation }) {
  const { quotations: companyQuotations, loading: companyLoading, refresh: refreshCompanyQuotations } = useCompanyQuotations();
  const { totalCustomers, loading, refetch } = useCustomerStatsWithCompany();
  const customers = useAppStore((s) => s.customers);
  // const loading = useAppStore((s) => s.loading);
  const loadError = useAppStore((s) => s.loadError);
  const deleteQuotation = useAppStore((s) => s.deleteQuotation);
  const awardQuotation = useAppStore((s) => s.awardQuotation);
  const fetchAllData = useAppStore((s) => s.fetchAllData);
  const handleLogout = useAppStore((s) => s.handleLogout);
  const clearError = useAppStore((s) => s.clearError);
  const updateQueryDate = useAppStore((s) => s.updateQueryDate);
  const storeQuotations = useAppStore((s) => s.quotations);
  const { company: currentCompany, selectedCurrency, refreshCompanyData } = useCompanyCurrency();

  const [activeTab, setActiveTab] = useState('all');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState({ field: 'date', dir: 'desc' });
  const [exportingId, setExportingId] = useState(null);
  const [deleteModal, setDeleteModal] = useState({ open: false, quotation: null, busy: false });
  const [awardModal, setAwardModal] = useState({ open: false, quotation: null, busy: false });
  const [queryDateModal, setQueryDateModal] = useState({ open: false, quotation: null });
  const [toasts, setToasts] = useState([]);

  const searchRef = useRef(null);
  const searchTimer = useRef(null);
  let toastIdRef = useRef(0);

  const hasFetched = !loading || storeQuotations.length > 0;
  const safeQ = useMemo(() => Array.isArray(companyQuotations) ? companyQuotations : [], [companyQuotations]);
  const isInitialLoading = loading && !hasFetched;
  const isRefreshing = loading && hasFetched;
console.log("====",customers);
  const addToast = useCallback((message, type = 'info') => {
    const id = ++toastIdRef.current;
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
  }, []);

  const dismissToast = useCallback((id) => setToasts(prev => prev.filter(t => t.id !== id)), []);

  const { totalRevenue, statusCounts } = useMemo(() => {
    let rev = 0;
    const c = { pending: 0, in_review: 0, approved: 0, awarded: 0, returned: 0 };
    for (const q of safeQ) {
      rev += (q.total || 0);
      if (q.status === 'pending') c.pending++;
      else if (q.status === 'ops_approved') c.in_review++;
      else if (q.status === 'approved') c.approved++;
      else if (q.status === 'awarded') c.awarded++;
      else if (q.status === 'ops_rejected' || q.status === 'rejected') c.returned++;
    }
    return { totalRevenue: rev, statusCounts: c };
  }, [safeQ]);

  const tabCounts = useMemo(() => ({
    all: safeQ.length, pending: statusCounts.pending, in_review: statusCounts.in_review,
    approved: statusCounts.approved, awarded: statusCounts.awarded, returned: statusCounts.returned,
  }), [safeQ.length, statusCounts]);

  const tabFiltered = useMemo(() => {
    const { statusFilter } = TAB_KEYS[activeTab];
    if (!statusFilter) return safeQ;
    if (Array.isArray(statusFilter)) return safeQ.filter(q => statusFilter.includes(q.status));
    return safeQ.filter(q => q.status === statusFilter);
  }, [safeQ, activeTab]);

  const searchFiltered = useMemo(() => {
    if (!search.trim()) return tabFiltered;
    const t = search.toLowerCase();
    return tabFiltered.filter(q => (q.quotationNumber || '').toLowerCase().includes(t) || (q.customerSnapshot?.name || q.customer || q.customerId?.name || '').toLowerCase().includes(t));
  }, [tabFiltered, search]);

  const sorted = useMemo(() => {
    const arr = [...searchFiltered];
    const { field, dir } = sort;
    arr.sort((a, b) => {
      let av = a[field], bv = b[field];
      if (field === 'total') { av = Number(av) || 0; bv = Number(bv) || 0; }
      else if (field === 'customer') { av = (a.customerSnapshot?.name || a.customer || a.customerId?.name || '').toLowerCase(); bv = (b.customerSnapshot?.name || b.customer || b.customerId?.name || '').toLowerCase(); }
      else { av = av ?? ''; bv = bv ?? ''; }
      return dir === 'asc' ? (av < bv ? -1 : av > bv ? 1 : 0) : (av > bv ? -1 : av < bv ? 1 : 0);
    });
    return arr;
  }, [searchFiltered, sort]);

  const totalFiltered = sorted.length;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / limit));
  const safePage = Math.min(page, totalPages);
  const paginated = useMemo(() => sorted.slice((safePage - 1) * limit, safePage * limit), [sorted, safePage, limit]);

  const handleSearchChange = useCallback((e) => {
    const val = e.target.value;
    setSearchInput(val);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => { setSearch(val); setPage(1); }, DEBOUNCE_MS);
  }, []);

  const clearSearch = useCallback(() => { setSearchInput(''); setSearch(''); setPage(1); }, []);

  const handleTabChange = useCallback((key) => { setActiveTab(key); setPage(1); setSearchInput(''); setSearch(''); setSort({ field: 'date', dir: 'desc' }); }, []);

  const handleSort = useCallback((field) => { setSort(prev => ({ field, dir: prev.field === field && prev.dir === 'asc' ? 'desc' : 'asc' })); setPage(1); }, []);

  const handleUpdateQueryDate = useCallback(async (id, date) => {
    const result = await updateQueryDate(id, date);
    if (result?.success) { addToast('Follow-up date updated successfully', 'success'); refreshCompanyQuotations(); }
    else { addToast(result?.error || 'Failed to update follow-up date', 'error'); }
    setQueryDateModal({ open: false, quotation: null });
  }, [updateQueryDate, addToast, refreshCompanyQuotations]);

  const handleRefresh = useCallback(async () => {
    try { await fetchAllData(); refreshCompanyData?.(); addToast('Data refreshed', 'success'); }
    catch (err) { addToast(err.message || 'Refresh failed', 'error'); }
  }, [fetchAllData, refreshCompanyData, addToast]);

  const handleDownload = useCallback(async (q) => {
    setExportingId(q._id);
    try { await downloadQuotationPDF(q); addToast('PDF generated successfully!', 'success'); }
    catch (err) { addToast(`PDF failed: ${err.message}`, 'error'); }
    finally { setExportingId(null); }
  }, [addToast]);

  const confirmDelete = useCallback(async () => {
    const { quotation } = deleteModal;
    if (!quotation) return;
    setDeleteModal(m => ({ ...m, busy: true }));
    const result = await deleteQuotation(quotation._id);
    if (result?.success) {
      addToast(`Quotation ${quotation.quotationNumber} deleted.`, 'success');
      setDeleteModal({ open: false, quotation: null, busy: false });
      setPage(p => Math.max(1, Math.min(p, Math.ceil((totalFiltered - 1) / limit))));
      refreshCompanyQuotations();
    } else {
      addToast(result?.error || 'Delete failed', 'error');
      setDeleteModal(m => ({ ...m, busy: false }));
    }
  }, [deleteModal, deleteQuotation, addToast, totalFiltered, limit, refreshCompanyQuotations]);

  const confirmAward = useCallback(async (awarded, awardNote) => {
    const { quotation } = awardModal;
    if (!quotation || awarded === null) return;
    setAwardModal(m => ({ ...m, busy: true }));
    const result = await awardQuotation(quotation._id, awarded, awardNote);
    if (result?.success) {
      addToast(awarded ? `🏆 "${quotation.quotationNumber}" marked as Awarded!` : `"${quotation.quotationNumber}" marked as Not Awarded.`, 'success');
      setAwardModal({ open: false, quotation: null, busy: false });
      refreshCompanyQuotations();
    } else {
      addToast(result?.error || 'Failed to update', 'error');
      setAwardModal(m => ({ ...m, busy: false }));
    }
  }, [awardModal, awardQuotation, addToast, refreshCompanyQuotations]);

  useEffect(() => {
    const handler = (e) => { if (e.key === '/' && !['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) { e.preventDefault(); searchRef.current?.focus(); } };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => () => clearTimeout(searchTimer.current), []);

  const TABS = useMemo(() => Object.entries(TAB_KEYS).map(([key, { label, Icon }]) => ({ key, label, Icon, count: tabCounts[key] ?? 0 })), [tabCounts]);

  const NavBtn = React.memo(({ onClick, label, primary }) => (
    <button onClick={onClick} style={{ backgroundColor: primary ? 'white' : 'rgba(255,255,255,0.08)', color: primary ? '#0f172a' : '#94a3b8', border: primary ? 'none' : '1px solid rgba(255,255,255,0.12)', borderRadius: 8, padding: '0.45rem 0.875rem', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
      {label}
    </button>
  ));

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f1f5f9', fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
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

      <Toast toasts={toasts} onDismiss={dismissToast}/>

      <ConfirmModal open={deleteModal.open} title="Delete Quotation" message={`Are you sure you want to permanently delete ${deleteModal.quotation?.quotationNumber}? This action cannot be undone.`} confirmLabel="Delete" danger loading={deleteModal.busy} onConfirm={confirmDelete} onCancel={() => !deleteModal.busy && setDeleteModal({ open: false, quotation: null, busy: false })}>
        {deleteModal.quotation?.status === 'ops_rejected' && (
          <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '0.6rem 0.875rem', marginBottom: '0.75rem', fontSize: '0.8rem', color: '#991b1b', fontWeight: 600 }}>⚠ This quotation was returned by Ops. You'll need to create a fresh one.</div>
        )}
      </ConfirmModal>

      <AwardModal open={awardModal.open} quotation={awardModal.quotation} onConfirm={confirmAward} onCancel={() => !awardModal.busy && setAwardModal({ open: false, quotation: null, busy: false })} loading={awardModal.busy} />

      <div style={{ backgroundColor: '#0f172a', padding: '0 2rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 60, position: 'sticky', top: 0, zIndex: 50, boxShadow: '0 2px 8px rgba(0,0,0,0.25)' }}>
        <div>
          <div style={{ fontSize: '1.0625rem', fontWeight: 800, color: 'white', letterSpacing: '-0.01em' }}>📋 My Dashboard</div>
          <CompanyCurrencyDisplay />
        </div>
        <div style={{ display: 'flex', gap: '0.625rem', alignItems: 'center' }}>
          <CompanyCurrencySelector variant="compact" />
          <NavBtn onClick={() => onNavigate('customers')} label="Customers" />
          <NavBtn onClick={() => onNavigate('items')} label="Items" />
          <NavBtn onClick={() => onNavigate('addQuotation')} label="+ New Quotation" primary />
          <button onClick={handleLogout} style={{ backgroundColor: 'rgba(255,255,255,0.08)', color: '#94a3b8', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, padding: '0.45rem 0.85rem', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem', fontFamily: 'inherit' }}>
            <LogOut size={15}/> Logout
          </button>
        </div>
      </div>

      <div style={{ maxWidth: 1400, margin: '0 auto', padding: '2rem' }}>
        {loadError && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '0.875rem 1rem', marginBottom: '1.25rem', fontSize: '0.875rem', color: '#991b1b' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><AlertCircle size={16}/> {loadError}</div>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <button onClick={() => clearError()} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#991b1b', padding: 0 }}><X size={14}/></button>
              <button onClick={handleRefresh} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#991b1b', display: 'flex', alignItems: 'center', gap: '0.3rem', fontWeight: 600, fontSize: '0.8rem' }}><RefreshCw size={13}/> Retry</button>
            </div>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '1rem', marginBottom: '1rem' }}>
          <StatCard label="Total Revenue" value={fmtCurrency(totalRevenue, selectedCurrency)} accent="#6366f1" iconBg="#eff1ff" iconColor="#6366f1" Icon={TrendingUp} loading={isInitialLoading} sub={`All quotations combined in ${selectedCurrency}`}/>
          <StatCard label="Quotations" value={safeQ.length} accent="#8b5cf6" iconBg="#f5f3ff" iconColor="#8b5cf6" Icon={FileText} loading={isInitialLoading} sub="Total submitted"/>
          <StatCard label="Customers" value={totalCustomers} accent="#059669" iconBg="#ecfdf5" iconColor="#059669" Icon={Users} loading={false}/>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
          <StatCard label="Pending" value={statusCounts.pending} accent="#f59e0b" iconBg="#fef3c7" iconColor="#d97706" Icon={Clock} loading={isInitialLoading} sub="Awaiting ops review"/>
          <StatCard label="In Review" value={statusCounts.in_review} accent="#3b82f6" iconBg="#dbeafe" iconColor="#3b82f6" Icon={RefreshCw} loading={isInitialLoading} sub="Forwarded to admin"/>
          <StatCard label="Approved" value={statusCounts.approved} accent="#10b981" iconBg="#d1fae5" iconColor="#10b981" Icon={CheckCircle} loading={isInitialLoading} sub="Final approval given"/>
          <StatCard label="Awarded" value={statusCounts.awarded} accent="#059669" iconBg="#d1fae5" iconColor="#059669" Icon={Award} loading={isInitialLoading} sub="PO received"/>
          <StatCard label="Returned" value={statusCounts.returned} accent="#ec4899" iconBg="#fce7f3" iconColor="#ec4899" Icon={Ban} loading={isInitialLoading} sub="Ops or admin rejected"/>
        </div>

        <div style={{ backgroundColor: '#fff', borderRadius: 14, boxShadow: '0 1px 4px rgba(0,0,0,0.07)', overflow: 'visible', position: 'relative' }}>
          <div style={{ padding: '1.125rem 1.5rem', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div style={{ display: 'flex', gap: '0.2rem', padding: '0.35rem', backgroundColor: '#f1f5f9', borderRadius: 10, flexWrap: 'wrap' }}>
              {TABS.map(({ key, label, Icon: I, count }) => {
                const active = activeTab === key;
                const isPending = key === 'pending';
                const isReturned = key === 'returned';
                const hasAlert = (isPending || isReturned) && count > 0;
                const alertColor = isPending ? '#f59e0b' : '#ec4899';
                return (
                  <button key={key} onClick={() => handleTabChange(key)} style={{ padding: '0.4rem 0.875rem', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.35rem', backgroundColor: active ? '#fff' : 'transparent', color: active ? '#0f172a' : '#64748b', boxShadow: active ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', fontFamily: 'inherit' }}>
                    <I size={13}/> {label}
                    <span style={{ backgroundColor: active ? (hasAlert ? alertColor : '#0f172a') : (hasAlert ? alertColor : '#e2e8f0'), color: (active || hasAlert) ? '#fff' : '#64748b', borderRadius: 999, padding: '1px 7px', fontSize: '0.68rem', fontWeight: 700 }}>{isInitialLoading ? '…' : count}</span>
                  </button>
                );
              })}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <button onClick={handleRefresh} disabled={loading} style={{ width: 34, height: 34, border: '1px solid #e2e8f0', borderRadius: 8, background: '#f8fafc', cursor: loading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: loading ? 0.5 : 1 }}>
                <RefreshCw size={14} color="#64748b" style={loading ? { animation: 'hs-spin 1s linear infinite' } : {}}/>
              </button>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '0.4rem 0.75rem' }}>
                <Search size={14} color="#94a3b8"/>
                <input ref={searchRef} style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: '0.875rem', color: '#0f172a', width: 210, fontFamily: 'inherit' }} placeholder="Search… (press /)" value={searchInput} onChange={handleSearchChange} disabled={isInitialLoading}/>
                {searchInput && <button onClick={clearSearch} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 0 }}><X size={13}/></button>}
              </div>
            </div>
          </div>

          {isRefreshing && (
            <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(255,255,255,0.72)', zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 14, backdropFilter: 'blur(1px)' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem', background: 'white', padding: '1.25rem 2rem', borderRadius: 12, boxShadow: '0 4px 24px rgba(15,23,42,0.12)', border: '1px solid #e2e8f0' }}>
                <RefreshCw size={24} color="#6366f1" style={{ animation: 'hs-spin 0.8s linear infinite' }}/>
                <span style={{ fontSize: '0.82rem', color: '#6366f1', fontWeight: 700 }}>Refreshing…</span>
              </div>
            </div>
          )}

          {isInitialLoading && (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr style={{ backgroundColor: '#fafafa' }}>{['Quote #', 'Customer', 'Project Name', 'Query Date', 'Submitted', 'Expiry', 'Total', 'Created By', 'Actions'].map(h => <th key={h} style={{ padding: '0.75rem 1rem', fontSize: '0.72rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #f1f5f9', whiteSpace: 'nowrap' }}>{h}</th>)}</tr></thead>
                <tbody>{[0,1,2,3,4,5,6].map(i => <SkeletonRow key={i}/>)}</tbody>
              </table>
            </div>
          )}

          {hasFetched && (
            <>
              {safeQ.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '4rem 2rem', color: '#94a3b8' }}>
                  <FileText size={48} color="#cbd5e1" style={{ marginBottom: '1rem' }}/>
                  <p style={{ fontWeight: 600, fontSize: '1rem', color: '#475569', marginBottom: '0.5rem' }}>No quotations yet</p>
                  <p style={{ fontSize: '0.875rem', marginBottom: '1.5rem' }}>Create your first quotation to get started.</p>
                  <button onClick={() => onNavigate('addQuotation')} style={{ background: '#0f172a', color: 'white', border: 'none', borderRadius: 8, padding: '0.6rem 1.25rem', fontWeight: 600, fontSize: '0.875rem', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontFamily: 'inherit' }}><Plus size={15}/> New Quotation</button>
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead><tr>
                      <SortHeader label="Quote #" field="quotationNumber" sort={sort} onSort={handleSort}/>
                      <SortHeader label="Customer" field="customer" sort={sort} onSort={handleSort}/>
                      <th style={{ padding: '0.75rem 1rem', fontSize: '0.72rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'left', borderBottom: '1px solid #f1f5f9', backgroundColor: '#fafafa', whiteSpace: 'nowrap' }}>Project Name</th>
                      <SortHeader label="Query Date" field="queryDate" sort={sort} onSort={handleSort} align="center"/>
                      <SortHeader label="Submitted" field="date" sort={sort} onSort={handleSort}/>
                      <SortHeader label="Expiry" field="expiryDate" sort={sort} onSort={handleSort}/>
                      <SortHeader label="Total" field="total" sort={sort} onSort={handleSort} align="right"/>
                      <SortHeader label="Created By" field="createdBy" sort={sort} onSort={handleSort}/>
                      <th style={{ padding: '0.75rem 1rem', fontSize: '0.72rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'center', borderBottom: '1px solid #f1f5f9', backgroundColor: '#fafafa', whiteSpace: 'nowrap' }}>Actions</th>
                    </tr></thead>
                    <tbody>
                      {paginated.length === 0 ? (
                        <tr><td colSpan={9} style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.875rem' }}>No results for "<strong>{search}</strong>" <button onClick={clearSearch} style={{ marginLeft: '0.5rem', background: 'none', border: 'none', color: '#6366f1', cursor: 'pointer', fontWeight: 600, fontSize: '0.875rem' }}>Clear</button></td></tr>
                      ) : paginated.map((q) => {
                        const isExp = exportingId === q._id;
                        const expired = isExpired(q.expiryDate);
                        const expiring = !expired && isExpiringSoon(q.expiryDate);
                        const canDelete = DELETABLE.has(q.status);
                        const canAward = q.status === 'approved';
                        const queryDatePassed = q.queryDate && new Date(q.queryDate) < new Date();
                        return (
                          <tr key={q._id}>
                            <td style={{ padding: '0.85rem 1rem', borderBottom: '1px solid #f8fafc', verticalAlign: 'middle' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                                <span style={{ fontWeight: 700, color: '#0f172a', fontFamily: 'monospace', fontSize: '0.8rem' }}>{q.quotationNumber || '—'}</span>
                                {expired && <span style={{ fontSize: '0.62rem', fontWeight: 700, color: '#dc2626', background: '#fef2f2', padding: '1px 6px', borderRadius: 999, border: '1px solid #fecaca' }}>Expired</span>}
                                {expiring && <span style={{ fontSize: '0.62rem', fontWeight: 700, color: '#d97706', background: '#fffbeb', padding: '1px 6px', borderRadius: 999, border: '1px solid #fde68a' }}>Expiring Soon</span>}
                              </div>
                            </td>
                            <td style={{ padding: '0.85rem 1rem', borderBottom: '1px solid #f8fafc', verticalAlign: 'middle' }}>
                              <div style={{ fontWeight: 600, color: '#0f172a', fontSize: '0.875rem' }}>{q.customerSnapshot?.name || q.customer || q.customerId?.name || 'N/A'}</div>
                              {q.contact && <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: 2 }}>{q.contact}</div>}
                              <RejectionNote quotation={q} />
                            </td>
                            <td style={{ padding: '0.85rem 1rem', borderBottom: '1px solid #f8fafc', verticalAlign: 'middle' }}><div style={{ fontSize: '0.875rem', color: '#0f172a' }}>{q.projectName || '—'}</div></td>
                            <td style={{ padding: '0.85rem 1rem', borderBottom: '1px solid #f8fafc', verticalAlign: 'middle', textAlign: 'center' }}>
                              {q.queryDate ? (
                                <span style={{ background: queryDatePassed ? '#fee2e2' : '#fef3c7', color: queryDatePassed ? '#991b1b' : '#92400e', padding: '0.25rem 0.75rem', borderRadius: '999px', fontSize: '0.75rem', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                                  <Calendar size={12} /> {fmtDate(q.queryDate)} {queryDatePassed && ' ⚠️'}
                                </span>
                              ) : '—'}
                            </td>
                            <td style={{ padding: '0.85rem 1rem', fontSize: '0.8rem', color: '#64748b', borderBottom: '1px solid #f8fafc', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>{fmtDate(q.date)}</td>
                            <td style={{ padding: '0.85rem 1rem', fontSize: '0.8rem', borderBottom: '1px solid #f8fafc', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                              <span style={{ color: expired ? '#dc2626' : expiring ? '#d97706' : '#64748b', fontWeight: expired || expiring ? 600 : 400 }}>{fmtDate(q.expiryDate)}</span>
                            </td>
                            <td style={{ padding: '0.85rem 1rem', fontSize: '0.875rem', fontWeight: 700, color: '#0f172a', borderBottom: '1px solid #f8fafc', verticalAlign: 'middle', textAlign: 'right', whiteSpace: 'nowrap' }}>{fmtCurrency(q.total, selectedCurrency)}</td>
                            <td style={{ padding: '0.85rem 1rem', fontSize: '0.8rem', color: '#64748b', borderBottom: '1px solid #f8fafc', verticalAlign: 'middle' }}>{q.createdBy?.name || '—'}</td>
                            <td style={{ padding: '0.75rem 1rem', borderBottom: '1px solid #f8fafc', verticalAlign: 'middle' }}>
                              <div style={{ display: 'flex', gap: '0.3rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                                <ActionBtn bg="#e0f2fe" color="#0369a1" onClick={() => onViewQuotation(q._id)} icon={Eye} label="View" title="View quotation"/>
                                {!['awarded', 'not_awarded'].includes(q.status) && <ActionBtn bg={q.queryDate ? '#fef3c7' : '#f1f5f9'} color={q.queryDate ? '#92400e' : '#64748b'} onClick={() => setQueryDateModal({ open: true, quotation: q })} icon={Calendar} label="Follow-up" title={q.queryDate ? `Follow-up: ${fmtDate(q.queryDate)}` : 'Set follow-up date'}/>}
                                <ActionBtn bg={isExp ? '#f1f5f9' : '#f0fdf4'} color={isExp ? '#94a3b8' : '#166534'} onClick={() => !isExp && handleDownload(q)} disabled={isExp} icon={isExp ? Loader : Download} label={isExp ? '…' : 'PDF'} title="Download PDF"/>
                                {canAward && <ActionBtn bg="#d1fae5" color="#065f46" onClick={() => setAwardModal({ open: true, quotation: q, busy: false })} icon={Award} label="Outcome" title="Mark awarded / not awarded"/>}
                                {canDelete && <ActionBtn bg="#fff1f2" color="#e11d48" onClick={() => setDeleteModal({ open: true, quotation: q, busy: false })} icon={Trash2} label="Del" title="Delete quotation"/>}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              <PaginationBar total={totalFiltered} page={safePage} limit={limit} onPage={setPage} onLimit={(l) => { setLimit(l); setPage(1); }}/>
            </>
          )}
        </div>
      </div>
      <QueryDateUpdater open={queryDateModal.open} onClose={() => setQueryDateModal({ open: false, quotation: null })} onUpdate={handleUpdateQueryDate} quotations={safeQ} loading={loading} />
    </div>
  );
}