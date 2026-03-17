// screens/OpsDashboard.jsx
import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Eye, Download, Clock, CheckCircle, XCircle,
  FileText, Search, X, Check, LogOut,
  AlertCircle, RefreshCw, ChevronUp, ChevronDown, ChevronLeft, ChevronRight,
  Shield, Award, Ban, Users, Package, TrendingUp, Building2
} from 'lucide-react';
import {useOpsStats} from '../hooks/customHooks'
import { useAppStore, useCompanyQuotations } from '../services/store';
import { downloadQuotationPDF } from '../utils/pdfGenerator';
import { CompanyCurrencySelector, CompanyCurrencyDisplay, useCompanyCurrency } from '../components/CompanyCurrencySelector';
import useToast, { ToastContainer } from '../hooks/useToast';

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  pending:      { bg: '#fef9c3', color: '#92400e', dot: '#f59e0b', label: 'Awaiting Ops Review'     },
  ops_approved: { bg: '#dbeafe', color: '#1e40af', dot: '#3b82f6', label: 'Awaiting Admin Approval'  },
  ops_rejected: { bg: '#fee2e2', color: '#991b1b', dot: '#ef4444', label: 'Returned by Ops'          },
  approved:     { bg: '#dcfce7', color: '#166534', dot: '#22c55e', label: 'Approved by Admin'        },
  rejected:     { bg: '#fce7f3', color: '#9d174d', dot: '#ec4899', label: 'Rejected by Admin'        },
  awarded:      { bg: '#d1fae5', color: '#065f46', dot: '#10b981', label: 'Awarded'                   },
  not_awarded:  { bg: '#f3f4f6', color: '#374151', dot: '#9ca3af', label: 'Not Awarded'               },
  draft:        { bg: '#f1f5f9', color: '#475569', dot: '#94a3b8', label: 'Draft'                     },
};

const PAGE_SIZE_OPTIONS = [10, 20, 50];
const DEBOUNCE_DELAY = 350;

const TAB_KEYS = {
  pending:      { label: 'Pending Review',      Icon: Clock,       statusFilter: 'pending'      },
  ops_approved: { label: 'Awaiting Admin',      Icon: Shield,      statusFilter: 'ops_approved' },
  ops_rejected: { label: 'Returned by Me',      Icon: Ban,         statusFilter: 'ops_rejected' },
};

// ─────────────────────────────────────────────────────────────
// Utility functions
// ─────────────────────────────────────────────────────────────
const fmtCurrency = (n, currency = 'AED') => {
  const symbols = {
    AED: 'د.إ', SAR: '﷼', QAR: '﷼', KWD: 'د.ك',
    BHD: '.د.ب', OMR: '﷼', USD: '$', EUR: '€', GBP: '£'
  };
  const symbol = symbols[currency] || currency;
  return `${symbol} ${(n || 0).toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const fmtDate = (d) => {
  if (!d) return '—';
  try { 
    return new Date(d).toLocaleDateString('en-GB', { 
      day: '2-digit', 
      month: 'short', 
      year: 'numeric' 
    }); 
  } catch { 
    return '—'; 
  }
};

const isExpired = (d) => { 
  if (!d) return false; 
  const dt = new Date(d); 
  return !isNaN(dt.getTime()) && dt < new Date(); 
};

const isExpiringSoon = (d) => { 
  if (!d) return false; 
  const dt = new Date(d); 
  if (isNaN(dt.getTime())) return false; 
  const days = Math.ceil((dt - new Date()) / 86400000); 
  return days >= 0 && days <= 7; 
};

// ─────────────────────────────────────────────────────────────
// Custom Hooks
// ─────────────────────────────────────────────────────────────

const useDebounce = (value, delay) => {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
};

 

// ─────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────

const StatusBadge = React.memo(({ status }) => {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.draft;
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'3px 10px', borderRadius:999, fontSize:'0.72rem', fontWeight:700, backgroundColor:cfg.bg, color:cfg.color, whiteSpace:'nowrap' }}>
      <span style={{ width:6, height:6, borderRadius:'50%', backgroundColor:cfg.dot, display:'inline-block', flexShrink:0 }} />
      {cfg.label}
    </span>
  );
});

const Toast = React.memo(({ toasts, onDismiss }) => {
  if (!toasts.length) return null;
  return (
    <div style={{ position:'fixed', bottom:'1.5rem', right:'1.5rem', zIndex:9999, display:'flex', flexDirection:'column', gap:'0.5rem' }}>
      {toasts.map(t => (
        <div key={t.id} style={{
          display:'flex', alignItems:'center', gap:'0.75rem',
          backgroundColor: t.type==='error' ? '#fef2f2' : t.type==='success' ? '#f0fdf4' : '#eff6ff',
          border:`1px solid ${t.type==='error' ? '#fecaca' : t.type==='success' ? '#bbf7d0' : '#bfdbfe'}`,
          color: t.type==='error' ? '#991b1b' : t.type==='success' ? '#166534' : '#1e40af',
          padding:'0.75rem 1rem', borderRadius:10, boxShadow:'0 4px 12px rgba(0,0,0,0.1)', minWidth:280, animation:'slideIn 0.2s ease',
        }}>
          {t.type==='error' ? <AlertCircle size={16}/> : <CheckCircle size={16}/>}
          <span style={{ fontSize:'0.875rem', fontWeight:500, flex:1 }}>{t.message}</span>
          <button onClick={() => onDismiss(t.id)} style={{ background:'none', border:'none', cursor:'pointer', color:'inherit', padding:0, opacity:0.6 }}><X size={14}/></button>
        </div>
      ))}
    </div>
  );
});

const ConfirmModal = React.memo(({ open, title, message, confirmLabel, danger, onConfirm, onCancel, children, loading }) => {
  if (!open) return null;
  return (
    <div onClick={(e) => e.target===e.currentTarget&&!loading&&onCancel()} style={{ position:'fixed', inset:0, backgroundColor:'rgba(0,0,0,0.45)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000 }}>
      <div style={{ backgroundColor:'#fff', borderRadius:16, padding:'2rem', width:'90%', maxWidth:460, boxShadow:'0 20px 60px rgba(0,0,0,0.2)', animation:'popIn 0.18s ease' }}>
        <h3 style={{ fontSize:'1.125rem', fontWeight:700, color:'#0f172a', marginBottom:'0.5rem' }}>{title}</h3>
        <p style={{ fontSize:'0.875rem', color:'#64748b', marginBottom:'1.25rem' }}>{message}</p>
        {children}
        <div style={{ display:'flex', gap:'0.75rem', justifyContent:'flex-end', marginTop:'1.25rem' }}>
          <button onClick={onCancel} disabled={loading} style={{ padding:'0.6rem 1.25rem', backgroundColor:'#f1f5f9', color:'#475569', border:'none', borderRadius:8, fontWeight:600, cursor:'pointer', fontSize:'0.875rem' }}>Cancel</button>
          <button onClick={onConfirm} disabled={loading} style={{ padding:'0.6rem 1.25rem', backgroundColor:danger?'#dc2626':'#10b981', color:'white', border:'none', borderRadius:8, fontWeight:600, cursor:loading?'not-allowed':'pointer', fontSize:'0.875rem', display:'flex', alignItems:'center', gap:'0.4rem', opacity:loading?0.7:1 }}>
            {loading?<><RefreshCw size={13} style={{ animation:'spin 1s linear infinite' }}/> Processing…</>:confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
});

const StatCard = React.memo(({ label, value, sub, accent, iconBg, iconColor, Icon, loading }) => {
  return (
    <div style={{ backgroundColor:'#fff', borderRadius:14, padding:'1.25rem 1.5rem', boxShadow:'0 1px 4px rgba(0,0,0,0.07)', borderLeft:`4px solid ${accent}`, display:'flex', alignItems:'center', gap:'1rem' }}>
      <div style={{ width:46, height:46, borderRadius:12, backgroundColor:iconBg, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
        <Icon size={22} color={iconColor}/>
      </div>
      <div style={{ minWidth:0 }}>
        <p style={{ fontSize:'0.7rem', fontWeight:700, color:'#64748b', textTransform:'uppercase', letterSpacing:'0.06em', margin:'0 0 4px' }}>{label}</p>
        {loading
          ? <div style={{ height:28, width:64, borderRadius:6, marginTop:4, background:'linear-gradient(90deg,#f1f5f9 25%,#e2e8f0 50%,#f1f5f9 75%)', backgroundSize:'200% 100%', animation:'shimmer 1.4s ease infinite' }}/>
          : <p style={{ fontSize:'1.75rem', fontWeight:800, color:'#0f172a', margin:0, lineHeight:1 }}>{value}</p>
        }
        {sub && !loading && <p style={{ fontSize:'0.72rem', color:'#94a3b8', margin:'4px 0 0' }}>{sub}</p>}
      </div>
    </div>
  );
});

const ActionBtn = React.memo(({ bg, color, onClick, disabled, title, icon: Icon, label }) => {
  return (
    <button onClick={onClick} disabled={disabled} title={title} className="ops-action-btn"
      style={{ backgroundColor:bg, color, border:'none', borderRadius:7, padding:'0.35rem 0.65rem', fontSize:'0.72rem', fontWeight:600, cursor:disabled?'not-allowed':'pointer', opacity:disabled?0.55:1, display:'inline-flex', alignItems:'center', gap:'0.3rem', whiteSpace:'nowrap', transition:'opacity 0.15s' }}>
      <Icon size={12}/> {label}
    </button>
  );
});

const SortHeader = React.memo(({ label, field, sort, onSort, align }) => {
  const active = sort.field === field;
  return (
    <th onClick={() => onSort(field)} style={{ padding:'0.75rem 1rem', fontSize:'0.72rem', fontWeight:700, color:active?'#0f172a':'#64748b', textTransform:'uppercase', letterSpacing:'0.05em', textAlign:align||'left', borderBottom:'1px solid #f1f5f9', backgroundColor:'#fafafa', whiteSpace:'nowrap', cursor:'pointer', userSelect:'none' }}>
      <span style={{ display:'inline-flex', alignItems:'center', gap:4 }}>
        {label}
        <span style={{ opacity:active?1:0.3 }}>
          {active && sort.dir==='asc' ? <ChevronUp size={12}/> : <ChevronDown size={12}/>}
        </span>
      </span>
    </th>
  );
});

const NavBtn = React.memo(({ onClick, label, primary }) => {
  return (
    <button onClick={onClick} className="ops-nav-btn"
      style={{ backgroundColor:primary?'white':'rgba(255,255,255,0.08)', color:primary?'#0f172a':'#94a3b8', border:primary?'none':'1px solid rgba(255,255,255,0.12)', borderRadius:8, padding:'0.45rem 0.875rem', fontSize:'0.8rem', fontWeight:600, cursor:'pointer', transition:'all 0.15s' }}>
      {label}
    </button>
  );
});

const PageBtn = React.memo(({ n, current, onPage }) => {
  const active = n === current;
  return (
    <button onClick={() => onPage(n)}
      style={{ width:30, height:30, border:`1px solid ${active?'#0f172a':'#e2e8f0'}`, borderRadius:7, background:active?'#0f172a':'#fff', color:active?'#fff':'#0f172a', fontWeight:active?700:400, fontSize:'0.8rem', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
      {n}
    </button>
  );
});

const PaginationBar = React.memo(({ total, page, limit, onPage, onLimit }) => {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  if (totalPages <= 1) return null;
  
  const start = (page - 1) * limit + 1;
  const end   = Math.min(page * limit, total);
  
  const pages = useMemo(() => {
    const p = [];
    for (let i = Math.max(1, page - 2); i <= Math.min(totalPages, page + 2); i++) p.push(i);
    return p;
  }, [page, totalPages]);

  return (
    <div style={{ padding:'0.75rem 1.5rem', borderTop:'1px solid #f1f5f9', display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:'0.75rem' }}>
      <span style={{ fontSize:'0.8rem', color:'#64748b' }}>
        Showing <strong>{start}–{end}</strong> of <strong>{total}</strong> quotations
      </span>
      <div style={{ display:'flex', alignItems:'center', gap:'0.5rem' }}>
        <span style={{ fontSize:'0.78rem', color:'#94a3b8' }}>Rows:</span>
        <select value={limit} onChange={e => { onLimit(Number(e.target.value)); onPage(1); }}
          style={{ fontSize:'0.78rem', border:'1px solid #e2e8f0', borderRadius:6, padding:'0.25rem 0.5rem', color:'#0f172a', background:'#fff', cursor:'pointer' }}>
          {PAGE_SIZE_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}
        </select>
        <button onClick={() => onPage(page - 1)} disabled={page === 1}
          style={{ width:30, height:30, border:'1px solid #e2e8f0', borderRadius:7, background:'#fff', cursor:page===1?'not-allowed':'pointer', opacity:page===1?0.4:1, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <ChevronLeft size={14}/>
        </button>
        {pages[0] > 1 && <><PageBtn n={1} current={page} onPage={onPage}/>{pages[0] > 2 && <span style={{ color:'#94a3b8', fontSize:'0.8rem' }}>…</span>}</>}
        {pages.map(n => <PageBtn key={n} n={n} current={page} onPage={onPage}/>)}
        {pages[pages.length-1] < totalPages && <>{pages[pages.length-1] < totalPages-1 && <span style={{ color:'#94a3b8', fontSize:'0.8rem' }}>…</span>}<PageBtn n={totalPages} current={page} onPage={onPage}/></>}
        <button onClick={() => onPage(page + 1)} disabled={page === totalPages}
          style={{ width:30, height:30, border:'1px solid #e2e8f0', borderRadius:7, background:'#fff', cursor:page===totalPages?'not-allowed':'pointer', opacity:page===totalPages?0.4:1, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <ChevronRight size={14}/>
        </button>
      </div>
    </div>
  );
});

const RejectionNote = React.memo(({ quotation }) => {
  const reason = quotation.status === 'ops_rejected' ? quotation.opsRejectionReason
               : quotation.status === 'rejected'     ? quotation.rejectionReason : null;
  if (!reason) return null;
  return (
    <div title={reason} style={{ fontSize:'0.68rem', color:quotation.status==='ops_rejected'?'#991b1b':'#9d174d', fontStyle:'italic', marginTop:3, maxWidth:200, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
      "{reason}"
    </div>
  );
});

const SkeletonRow = React.memo(() => (
  <tr style={{ borderBottom:'1px solid #f8fafc' }}>
    {[80,130,80,80,100,60,100,120].map((w,j) => (
      <td key={j} style={{ padding:'0.85rem 1rem' }}>
        <div style={{ height:14, width:w, borderRadius:6, background:'linear-gradient(90deg,#f1f5f9 25%,#e2e8f0 50%,#f1f5f9 75%)', backgroundSize:'200% 100%', animation:'shimmer 1.4s ease infinite' }}/>
      </td>
    ))}
  </tr>
));

// ─────────────────────────────────────────────────────────────
// Main Dashboard
// ─────────────────────────────────────────────────────────────
export default function OpsDashboard({ onViewQuotation }) {
  const navigate = useNavigate();
  
  // ── Use the same pattern as HomeScreen ─────────────────────
  const { quotations: companyQuotations, loading: companyLoading, refresh: refreshCompanyQuotations } = useCompanyQuotations();
  
  // ── Store ─────────────────────────────────────────────────
  const user = useAppStore((s) => s.user);
  const customers = useAppStore((s) => s.customers);
  const items = useAppStore((s) => s.items);
  const fetchAllData = useAppStore((s) => s.fetchAllData);
  const quotations = useAppStore((s) => s.quotations);
  const opsApproveQuotation = useAppStore((s) => s.opsApproveQuotation);
  const opsRejectQuotation = useAppStore((s) => s.opsRejectQuotation);
  const handleLogout = useAppStore((s) => s.handleLogout);
  const loading = useAppStore((s) => s.loading);
  const storeQuotations = useAppStore((s) => s.quotations);
  const loadError = useAppStore((s) => s.loadError);
  const clearError = useAppStore((s) => s.clearError);
  const selectedCompany = useAppStore((s) => s.selectedCompany);

  // ── Stats hook ────────────────────────────────────────────
  const { 
    stats: opsStats, 
    loading: statsLoading, 
    refresh: refreshStats,
    totalQuotations,
    pendingReview,
    awaitingAdmin,
    returnedByMe,
    totalValue
  } = useOpsStats();

  // ── Company & Currency ────────────────────────────────────
  const {
    company: currentCompany,
    selectedCurrency,
    exchangeRates,
    refreshCompanyData
  } = useCompanyCurrency();

  // ── Custom hooks ──────────────────────────────────────────
  const { toasts, addToast, dismissToast } = useToast();

  // ── Table state ───────────────────────────────────────────
  const [activeTab, setActiveTab] = useState('pending');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState({ field: 'createdAt', dir: 'desc' });
  const [loadingIds, setLoadingIds] = useState({});
  const [downloadLoadingId, setDownloadLoadingId] = useState(null);

  const searchRef = useRef(null);
  const searchTimer = useRef(null);
  const debouncedSearch = useDebounce(searchInput, DEBOUNCE_DELAY);

  // ── hasFetched derived from store (same as HomeScreen) ────
  const hasFetched = !loading || storeQuotations.length > 0;
  const isInitialLoading = loading && !hasFetched;
  const isRefreshing = loading && hasFetched;

  // ── Safe quotation array (filtered by selected company) ──
  const safeQ = useMemo(() => {
    if (!Array.isArray(quotations)) return [];
    if (!selectedCompany) return quotations;
    
    return quotations.filter(q => {
      const match = q.companyId === selectedCompany || 
                    q.companyId?._id === selectedCompany ||
                    q.companyId?.toString() === selectedCompany?.toString();
      return match;
    });
  }, [quotations, selectedCompany]);

  useEffect(() => {
    setSearch(debouncedSearch);
    setPage(1);
  }, [debouncedSearch]);

  // ── Split by status for tabs ─────────────────────────────
  const pendingQuotations = useMemo(() => 
    safeQ.filter(q => q.status === 'pending'), 
    [safeQ]
  );
  
  const approvedHistory = useMemo(() => 
    safeQ.filter(q => q.status === 'ops_approved'), 
    [safeQ]
  );
  
  const rejectedHistory = useMemo(() => 
    safeQ.filter(q => q.status === 'ops_rejected'), 
    [safeQ]
  );

  // Get current data based on active tab
  const currentData = useMemo(() => {
    switch (activeTab) {
      case 'pending':
        return pendingQuotations;
      case 'ops_approved':
        return approvedHistory;
      case 'ops_rejected':
        return rejectedHistory;
      default:
        return [];
    }
  }, [activeTab, pendingQuotations, approvedHistory, rejectedHistory]);

  // Search filter
  const searchFiltered = useMemo(() => {
    if (!search.trim()) return currentData;
    const t = search.toLowerCase();
    return currentData.filter(q =>
      (q.quotationNumber||'').toLowerCase().includes(t) ||
      (q.customerSnapshot?.name||q.customer||q.customerId?.name||'').toLowerCase().includes(t)
    );
  }, [currentData, search]);

  // Sort
  const sorted = useMemo(() => {
    const arr = [...searchFiltered];
    const { field, dir } = sort;
    arr.sort((a, b) => {
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
    return arr;
  }, [searchFiltered, sort]);

  // Pagination
  const totalFiltered = sorted.length;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / limit));
  const safePage = Math.min(page, totalPages);
  const paginated = useMemo(() => 
    sorted.slice((safePage - 1) * limit, safePage * limit), 
    [sorted, safePage, limit]
  );

  // ── Tab counts from filtered data ─────────────────────────
  const tabCounts = useMemo(() => ({
    pending: pendingQuotations.length,
    ops_approved: approvedHistory.length,
    ops_rejected: rejectedHistory.length,
  }), [pendingQuotations, approvedHistory, rejectedHistory]);

  // ── Loading helpers ───────────────────────────────────────
  const setOp = (id, action, val) =>
    setLoadingIds((p) => ({ ...p, [`${id}_${action}`]: val }));
  const isOp = (id, action) => !!loadingIds[`${id}_${action}`];

  // ── Approve ────────────────────────────────────────────────
  const handleApprove = useCallback(async (id) => {
    setOp(id, 'approve', true);
    try {
      const result = await opsApproveQuotation(id);
      if (result?.success) {
        addToast('Quotation approved and forwarded to admin', 'success');
        refreshCompanyQuotations();
        refreshStats();
      } else {
        addToast(result?.error || 'Failed to approve quotation', 'error');
      }
    } catch (error) {
      addToast(error.message || 'Failed to approve quotation', 'error');
    } finally {
      setOp(id, 'approve', false);
    }
  }, [opsApproveQuotation, addToast, refreshCompanyQuotations, refreshStats]);

  // ── Reject ─────────────────────────────────────────────────
  const [rejectTarget, setRejectTarget] = useState(null);
  const [rejectReason, setRejectReason] = useState('');

  const handleReject = useCallback((quotation) => {
    setRejectTarget(quotation);
    setRejectReason('');
  }, []);

  const handleRejectConfirm = useCallback(async () => {
    if (!rejectTarget || !rejectReason.trim()) return;
    
    setOp(rejectTarget._id, 'reject', true);
    try {
      const result = await opsRejectQuotation(rejectTarget._id, rejectReason);
      if (result?.success) {
        addToast('Quotation rejected', 'success');
        setRejectTarget(null);
        setRejectReason('');
        refreshCompanyQuotations();
        refreshStats();
      } else {
        addToast(result?.error || 'Failed to reject quotation', 'error');
      }
    } catch (error) {
      addToast(error.message || 'Failed to reject quotation', 'error');
    } finally {
      setOp(rejectTarget._id, 'reject', false);
    }
  }, [rejectTarget, rejectReason, opsRejectQuotation, addToast, refreshCompanyQuotations, refreshStats]);

  // ── Download PDF ───────────────────────────────────────────
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

  // ── View ───────────────────────────────────────────────────
  const handleView = useCallback((id) => {
    if (onViewQuotation) {
      onViewQuotation(id);
    } else {
      navigate(`/quotation/${id}`);
    }
  }, [onViewQuotation, navigate]);

  // ── Sort handler ───────────────────────────────────────────
  const handleSort = useCallback((field) => {
    setSort(prev => ({ 
      field, 
      dir: prev.field === field && prev.dir === 'asc' ? 'desc' : 'asc' 
    }));
    setPage(1);
  }, []);

  // ── Tab change handler ─────────────────────────────────────
  const handleTabChange = useCallback((key) => {
    setActiveTab(key);
    setPage(1);
    setSearchInput('');
    setSearch('');
    setSort({ field: 'createdAt', dir: 'desc' });
  }, []);

  // ── Search handler ────────────────────────────────────────
  const handleSearchChange = useCallback((e) => {
    const val = e.target.value;
    setSearchInput(val);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setSearch(val);
      setPage(1);
    }, DEBOUNCE_DELAY);
  }, []);

  const clearSearch = useCallback(() => {
    setSearchInput('');
    setSearch('');
    setPage(1);
  }, []);

  // ── Refresh handler ────────────────────────────────────────
  const handleRefresh = useCallback(async () => {
    try {
      await fetchAllData();
      refreshCompanyData?.();
      refreshCompanyQuotations();
      refreshStats();
      addToast('Data refreshed', 'success');
    } catch (err) {
      addToast(err.message || 'Refresh failed', 'error');
    }
  }, [fetchAllData, refreshCompanyData, refreshCompanyQuotations, refreshStats, addToast]);

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

  // ── Tab configuration with counts ──────────────────────────
  const TABS = useMemo(() => [
    { key: 'pending',      label: 'Pending Review',      Icon: Clock,  count: tabCounts.pending },
    { key: 'ops_approved', label: 'Awaiting Admin',      Icon: Shield, count: tabCounts.ops_approved },
    { key: 'ops_rejected', label: 'Returned by Me',      Icon: Ban,    count: tabCounts.ops_rejected },
  ], [tabCounts]);

  // Get current company name for display
  const currentCompanyName = useMemo(() => {
    if (!selectedCompany) return 'All Companies';
    const company = customers?.find(c => c._id === selectedCompany || c.code === selectedCompany);
    return company?.name || 'Selected Company';
  }, [selectedCompany, customers]);

  // ─────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight:'100vh', backgroundColor:'#f1f5f9', fontFamily:"'Segoe UI', system-ui, sans-serif" }}>
      <style>{`
        @keyframes slideIn { from { transform:translateX(20px);opacity:0; } to { transform:translateX(0);opacity:1; } }
        @keyframes popIn   { from { transform:scale(0.95);opacity:0; } to { transform:scale(1);opacity:1; } }
        @keyframes spin    { to { transform:rotate(360deg); } }
        @keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
        .ops-row:hover td  { background:#f8fafc !important; }
        .ops-nav-btn:hover     { opacity:0.8 !important; }
        .ops-tab:hover         { background:rgba(255,255,255,0.6) !important; }
        .ops-action-btn:hover:not(:disabled) { opacity:0.8 !important; transform:translateY(-1px); }
      `}</style>

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      {/* ── Topbar with Company Selector ── */}
      <div style={{ backgroundColor:'#0f172a', padding:'0 2rem', display:'flex', alignItems:'center', justifyContent:'space-between', height:60, position:'sticky', top:0, zIndex:50, boxShadow:'0 2px 8px rgba(0,0,0,0.25)' }}>
        <div>
          <div style={{ fontSize:'1.0625rem', fontWeight:800, color:'white', letterSpacing:'-0.01em' }}>
            ⚙ Operational Manager Dashboard {selectedCompany && `- ${currentCompanyName}`}
          </div>
          <CompanyCurrencyDisplay />
        </div>
        <div style={{ display:'flex', gap:'0.625rem', alignItems:'center' }}>
          <CompanyCurrencySelector variant="compact" />
          <NavBtn onClick={() => navigate('/home')} label="Back to Home" />
          <button onClick={handleLogout} className="ops-nav-btn" title="Logout"
            style={{ backgroundColor:'rgba(255,255,255,0.08)', color:'#94a3b8', border:'1px solid rgba(255,255,255,0.12)', borderRadius:8, padding:'0.45rem 0.85rem', fontSize:'0.8rem', fontWeight:600, cursor:'pointer', display:'flex', alignItems:'center', gap:'0.4rem' }}>
            <LogOut size={15}/> Logout
          </button>
        </div>
      </div>

      <div style={{ maxWidth:1400, margin:'0 auto', padding:'2rem' }}>

        {/* ── Company Info Banner ── */}
        {/* {selectedCompany && (
          <div style={{
            backgroundColor: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: 8,
            padding: '0.75rem 1rem',
            marginBottom: '1rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}>
            <Building2 size={16} color="#64748b" />
            <span style={{ fontWeight: 500, color: '#0f172a' }}>
              Showing data for: <strong>{currentCompanyName}</strong>
            </span>
          </div>
        )} */}

        {/* ── Load error banner ── */}
        {loadError && (
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', backgroundColor:'#fef2f2', border:'1px solid #fecaca', borderRadius:10, padding:'0.875rem 1rem', marginBottom:'1.25rem', fontSize:'0.875rem', color:'#991b1b' }}>
            <div style={{ display:'flex', alignItems:'center', gap:'0.5rem' }}><AlertCircle size={16}/> {loadError}</div>
            <div style={{ display:'flex', gap:'0.5rem', alignItems:'center' }}>
              <button onClick={() => clearError()} style={{ background:'none', border:'none', cursor:'pointer', color:'#991b1b', padding:0 }}><X size={14}/></button>
              <button onClick={handleRefresh} style={{ background:'none', border:'none', cursor:'pointer', color:'#991b1b', display:'flex', alignItems:'center', gap:'0.3rem', fontWeight:600, fontSize:'0.8rem' }}>
                <RefreshCw size={13}/> Retry
              </button>
            </div>
          </div>
        )}

        {/* ── Exchange Rate Info Bar ── */}
        {/* {exchangeRates && (
          <div style={{ 
            backgroundColor: '#f8fafc', 
            border: '1px solid #e2e8f0', 
            borderRadius: 8, 
            padding: '0.5rem 1rem', 
            marginBottom: '1rem',
            fontSize: '0.8rem',
            color: '#64748b',
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
            flexWrap: 'wrap'
          }}>
            <span style={{ fontWeight: 600 }}>Exchange Rates:</span>
            <span>1 {selectedCurrency} = {exchangeRates.rates?.['AED']?.toFixed(4)} AED</span>
            {exchangeRates.source && (
              <span style={{ 
                backgroundColor: exchangeRates.source === 'api' ? '#dcfce7' : 
                               exchangeRates.source === 'cache' ? '#fef3c7' : '#fee2e2',
                color: exchangeRates.source === 'api' ? '#166534' : 
                      exchangeRates.source === 'cache' ? '#92400e' : '#991b1b',
                padding: '2px 8px',
                borderRadius: 999,
                fontSize: '0.7rem',
                fontWeight: 600
              }}>
                {exchangeRates.source === 'api' ? 'Live' : 
                 exchangeRates.source === 'cache' ? 'Cached' : 'Fallback'}
              </span>
            )}
          </div>
        )} */}

        {/* ── Stat cards ── */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'1rem', marginBottom:'1.5rem' }}>
          <StatCard 
            label="Total Quotations" 
            value={totalQuotations} 
            accent="#6366f1" 
            iconBg="#eff1ff" 
            iconColor="#6366f1" 
            Icon={FileText} 
            loading={statsLoading} 
            sub="All quotations in system"
          />
          <StatCard 
            label="Pending Review" 
            value={pendingReview} 
            accent="#f59e0b" 
            iconBg="#fef3c7" 
            iconColor="#f59e0b" 
            Icon={Clock} 
            loading={statsLoading} 
            sub="Awaiting your review"
          />
          <StatCard 
            label="Awaiting Admin" 
            value={awaitingAdmin} 
            accent="#3b82f6" 
            iconBg="#dbeafe" 
            iconColor="#3b82f6" 
            Icon={Shield} 
            loading={statsLoading} 
            sub="Forwarded to admin"
          />
          <StatCard 
            label="Returned by You" 
            value={returnedByMe} 
            accent="#ef4444" 
            iconBg="#fee2e2" 
            iconColor="#ef4444" 
            Icon={Ban} 
            loading={statsLoading} 
            sub="Rejected quotations"
          />
        </div>
        
         

        {/* ── Table card ── */}
        <div style={{ backgroundColor:'#fff', borderRadius:14, boxShadow:'0 1px 4px rgba(0,0,0,0.07)', overflow:'visible', position:'relative' }}>

          {/* Card header */}
          <div style={{ padding:'1.125rem 1.5rem', borderBottom:'1px solid #f1f5f9', display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:'0.75rem' }}>
            {/* Tabs */}
            <div style={{ display:'flex', gap:'0.2rem', padding:'0.35rem', backgroundColor:'#f1f5f9', borderRadius:10, flexWrap:'wrap' }}>
              {TABS.map(({ key, label, Icon: I, count }) => {
                const active = activeTab === key;
                const alertColor = key === 'pending' ? '#f59e0b' : key === 'ops_approved' ? '#3b82f6' : '#ef4444';
                const hasAlert = count > 0;
                
                return (
                  <button key={key} className="ops-tab" onClick={() => handleTabChange(key)}
                    style={{ padding:'0.4rem 0.875rem', borderRadius:8, border:'none', cursor:'pointer', fontSize:'0.8rem', fontWeight:600, display:'flex', alignItems:'center', gap:'0.35rem', transition:'all 0.15s',
                      backgroundColor: active ? '#fff' : 'transparent',
                      color: active ? '#0f172a' : '#64748b',
                      boxShadow: active ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                    }}>
                    <I size={13}/>
                    {label}
                    <span style={{
                      backgroundColor: active ? (hasAlert ? alertColor : '#0f172a') : (hasAlert ? alertColor : '#e2e8f0'),
                      color: (active || hasAlert) ? '#fff' : '#64748b',
                      borderRadius:999, padding:'1px 7px', fontSize:'0.68rem', fontWeight:700,
                    }}>
                      {isInitialLoading ? '…' : count}
                    </span>
                  </button>
                );
              })}
            </div>

            <div style={{ display:'flex', alignItems:'center', gap:'0.75rem' }}>
              <button onClick={handleRefresh} disabled={loading} title="Refresh data"
                style={{ width:34, height:34, border:'1px solid #e2e8f0', borderRadius:8, background:'#f8fafc', cursor:loading?'not-allowed':'pointer', display:'flex', alignItems:'center', justifyContent:'center', opacity:loading?0.5:1 }}>
                <RefreshCw size={14} color="#64748b" style={loading ? { animation:'spin 1s linear infinite' } : {}}/>
              </button>
              <div style={{ display:'flex', alignItems:'center', gap:'0.5rem', backgroundColor:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:8, padding:'0.4rem 0.75rem' }}>
                <Search size={14} color="#94a3b8"/>
                <input
                  ref={searchRef}
                  style={{ border:'none', background:'transparent', outline:'none', fontSize:'0.875rem', color:'#0f172a', width:210 }}
                  placeholder="Search… (press /)"
                  value={searchInput}
                  onChange={handleSearchChange}
                />
                {searchInput && (
                  <button onClick={clearSearch} style={{ background:'none', border:'none', cursor:'pointer', color:'#94a3b8', padding:0 }}>
                    <X size={13}/>
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Skeleton — true first load only */}
          {isInitialLoading && (
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse' }}>
                <thead>
                  <tr style={{ backgroundColor:'#fafafa' }}>
                    {['Quote #','Customer','Date','Expiry','Status','Created By','Items','Total','Actions'].map(h => (
                      <th key={h} style={{ padding:'0.75rem 1rem', fontSize:'0.72rem', fontWeight:700, color:'#64748b', textTransform:'uppercase', letterSpacing:'0.05em', borderBottom:'1px solid #f1f5f9', whiteSpace:'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[1,2,3,4,5,6].map(i => <SkeletonRow key={i}/>)}
                </tbody>
              </table>
            </div>
          )}

          {/* Refresh overlay */}
          {isRefreshing && paginated.length > 0 && (
            <div style={{ position:'absolute', inset:0, backgroundColor:'rgba(255,255,255,0.72)', zIndex:10, display:'flex', alignItems:'center', justifyContent:'center', borderRadius:14, backdropFilter:'blur(1px)' }}>
              <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:'0.75rem', background:'white', padding:'1.25rem 2rem', borderRadius:12, boxShadow:'0 4px 24px rgba(15,23,42,0.12)', border:'1px solid #e2e8f0' }}>
                <RefreshCw size={24} color="#6366f1" style={{ animation:'spin 0.8s linear infinite' }}/>
                <span style={{ fontSize:'0.82rem', color:'#6366f1', fontWeight:700 }}>Refreshing…</span>
              </div>
            </div>
          )}

          {/* Data table */}
          {hasFetched && !isInitialLoading && (
            <>
              {safeQ.length === 0 ? (
                <div style={{ textAlign:'center', padding:'4rem 2rem', color:'#94a3b8' }}>
                  <FileText size={48} color="#cbd5e1" style={{ marginBottom:'1rem' }}/>
                  <p style={{ fontWeight:600, fontSize:'1rem', color:'#475569', marginBottom:'0.5rem' }}>
                    {search ? `No results for "${search}"` : 'No quotations found'}
                  </p>
                  {search && (
                    <button onClick={clearSearch} style={{ marginTop:'0.5rem', background:'none', border:'none', color:'#6366f1', cursor:'pointer', fontWeight:600, fontSize:'0.875rem' }}>
                      Clear search
                    </button>
                  )}
                </div>
              ) : (
                <div style={{ overflowX:'auto' }}>
                  <table style={{ width:'100%', borderCollapse:'collapse' }}>
                    <thead>
                      <tr>
                        <SortHeader label="Quote #" field="quotationNumber" sort={sort} onSort={handleSort}/>
                        <SortHeader label="Customer" field="customer" sort={sort} onSort={handleSort}/>
                        <SortHeader label="Date" field="date" sort={sort} onSort={handleSort}/>
                        <SortHeader label="Expiry" field="expiryDate" sort={sort} onSort={handleSort}/>
                        <SortHeader label="Status" field="status" sort={sort} onSort={handleSort}/>
                        <SortHeader label="Created By" field="createdBy" sort={sort} onSort={handleSort}/>
                        <th style={{ padding:'0.75rem 1rem', fontSize:'0.72rem', fontWeight:700, color:'#64748b', textTransform:'uppercase', letterSpacing:'0.05em', textAlign:'center', borderBottom:'1px solid #f1f5f9', backgroundColor:'#fafafa', whiteSpace:'nowrap' }}>Items</th>
                        <SortHeader label={`Total (${selectedCurrency})`} field="total" sort={sort} onSort={handleSort} align="right"/>
                        <th style={{ padding:'0.75rem 1rem', fontSize:'0.72rem', fontWeight:700, color:'#64748b', textTransform:'uppercase', letterSpacing:'0.05em', textAlign:'center', borderBottom:'1px solid #f1f5f9', backgroundColor:'#fafafa', whiteSpace:'nowrap' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginated.length === 0 ? (
                        <tr>
                          <td colSpan={9} style={{ padding:'3rem', textAlign:'center', color:'#94a3b8', fontSize:'0.875rem' }}>
                            No results for "<strong>{search}</strong>"
                            <button onClick={clearSearch} style={{ marginLeft:'0.5rem', background:'none', border:'none', color:'#6366f1', cursor:'pointer', fontWeight:600, fontSize:'0.875rem' }}>Clear</button>
                          </td>
                        </tr>
                      ) : paginated.map((q) => {
                        const isDownloading = downloadLoadingId === q._id;
                        const canAct = q.status === 'pending';
                        const exp = q.expiryDate ? new Date(q.expiryDate) : null;
                        const expired = exp && exp < new Date();
                        const expiring = !expired && isExpiringSoon(q.expiryDate);

                        return (
                          <tr key={q._id} className="ops-row">
                            <td style={{ padding:'0.85rem 1rem', borderBottom:'1px solid #f8fafc', verticalAlign:'middle' }}>
                              <div style={{ display:'flex', alignItems:'center', gap:'0.4rem', flexWrap:'wrap' }}>
                                <span style={{ fontWeight:700, color:'#0f172a', fontFamily:'monospace', fontSize:'0.8rem' }}>{q.quotationNumber||'—'}</span>
                                {expired  && <span style={{ fontSize:'0.62rem', fontWeight:700, color:'#dc2626', background:'#fef2f2', padding:'1px 6px', borderRadius:999, border:'1px solid #fecaca' }}>Expired</span>}
                                {expiring && <span style={{ fontSize:'0.62rem', fontWeight:700, color:'#d97706', background:'#fffbeb', padding:'1px 6px', borderRadius:999, border:'1px solid #fde68a' }}>Expiring Soon</span>}
                              </div>
                            </td>
                            <td style={{ padding:'0.85rem 1rem', borderBottom:'1px solid #f8fafc', verticalAlign:'middle' }}>
                              <div style={{ fontWeight:600, color:'#0f172a', fontSize:'0.875rem' }}>{q.customerSnapshot?.name || q.customer || q.customerId?.name || 'N/A'}</div>
                              {q.contact && <div style={{ fontSize:'0.75rem', color:'#94a3b8', marginTop:2 }}>{q.contact}</div>}
                            </td>
                            <td style={{ padding:'0.85rem 1rem', fontSize:'0.8rem', color:'#64748b', borderBottom:'1px solid #f8fafc', verticalAlign:'middle', whiteSpace:'nowrap' }}>{fmtDate(q.date)}</td>
                            <td style={{ padding:'0.85rem 1rem', fontSize:'0.8rem', borderBottom:'1px solid #f8fafc', verticalAlign:'middle', whiteSpace:'nowrap' }}>
                              <span style={{ color:expired?'#dc2626':expiring?'#d97706':'#64748b', fontWeight:expired||expiring?600:400 }}>
                                {fmtDate(q.expiryDate)}
                                {expired  && <span style={{ fontSize:'0.65rem', marginLeft:4 }}>⚠ Expired</span>}
                                {expiring && <span style={{ fontSize:'0.65rem', marginLeft:4 }}>⚠ Soon</span>}
                              </span>
                            </td>
                            <td style={{ padding:'0.85rem 1rem', borderBottom:'1px solid #f8fafc', verticalAlign:'middle' }}>
                              <StatusBadge status={q.status}/>
                              <RejectionNote quotation={q}/>
                            </td>
                            <td style={{ padding:'0.85rem 1rem', fontSize:'0.8rem', color:'#64748b', borderBottom:'1px solid #f8fafc', verticalAlign:'middle' }}>{q.createdBy?.name || '—'}</td>
                            <td style={{ padding:'0.85rem 1rem', borderBottom:'1px solid #f8fafc', verticalAlign:'middle', textAlign:'center' }}>
                              <span style={{ background:'#f1f5f9', color:'#475569', borderRadius:6, padding:'0.2rem 0.6rem', fontSize:'0.8rem', fontWeight:600 }}>{q.items?.length ?? 0}</span>
                            </td>
                            <td style={{ padding:'0.85rem 1rem', fontSize:'0.875rem', fontWeight:700, color:'#0f172a', borderBottom:'1px solid #f8fafc', verticalAlign:'middle', textAlign:'right', whiteSpace:'nowrap' }}>
                              {fmtCurrency(q.total, selectedCurrency)}
                            </td>
                            <td style={{ padding:'0.75rem 1rem', borderBottom:'1px solid #f8fafc', verticalAlign:'middle' }}>
                              <div style={{ display:'flex', gap:'0.3rem', justifyContent:'center', flexWrap:'wrap' }}>
                                <ActionBtn bg="#e0f2fe" color="#0369a1" onClick={() => handleView(q._id)} icon={Eye} label="View" title="View quotation"/>
                                
                                <ActionBtn
                                  bg={isDownloading?'#f1f5f9':'#f0fdf4'} 
                                  color={isDownloading?'#94a3b8':'#166534'}
                                  onClick={() => !isDownloading && handleDownload(q)} 
                                  disabled={isDownloading}
                                  icon={isDownloading?RefreshCw:Download} 
                                  label={isDownloading?'…':'PDF'} 
                                  title="Download PDF"
                                />
                                
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
                                    />
                                    <ActionBtn 
                                      bg="#fee2e2" 
                                      color="#991b1b" 
                                      onClick={() => handleReject(q)} 
                                      icon={X} 
                                      label="Reject" 
                                      title="Reject quotation"
                                      disabled={isOp(q._id, 'reject')}
                                    />
                                  </>
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
                page={safePage}
                limit={limit}
                onPage={setPage}
                onLimit={(l) => { setLimit(l); setPage(1); }}
              />
            </>
          )}
        </div>
      </div>

      {/* ── Reject Modal ── */}
      {rejectTarget && (
        <ConfirmModal
          open={true}
          title="Reject Quotation"
          message={`Are you sure you want to reject ${rejectTarget.quotationNumber}? This will return it to the creator.`}
          confirmLabel="Reject"
          danger
          onConfirm={handleRejectConfirm}
          onCancel={() => setRejectTarget(null)}
          loading={isOp(rejectTarget._id, 'reject')}
        >
          <textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Enter rejection reason (required)…"
            rows={4}
            style={{ width:'100%', padding:'0.75rem', border:'1.5px solid #e2e8f0', borderRadius:8, fontSize:'0.875rem', fontFamily:'inherit', marginBottom:'0.5rem', resize:'vertical' }}
            autoFocus
          />
          <p style={{ fontSize:'0.75rem', color:'#ef4444', margin:0 }}>Reason is required to reject a quotation.</p>
        </ConfirmModal>
      )}
    </div>
  );
}