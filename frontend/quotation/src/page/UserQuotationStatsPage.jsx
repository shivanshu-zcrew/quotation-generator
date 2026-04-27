// screens/UserQuotationStatsPage.jsx
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users, FileText, TrendingUp, Award, XCircle, Clock,
  ChevronDown, ChevronUp, Eye, Download, RefreshCw,
  ArrowLeft, Search, X, Calendar, AlertCircle, ChevronsUpDown,
  BarChart3, Inbox
} from 'lucide-react';
import { adminAPI } from '../services/api';
import { useCompanyCurrency } from '../components/CompanyCurrencySelector';
import { downloadQuotationPDF } from '../utils/pdfGenerator';
import { fmtCurrency, fmtDate } from '../utils/formatters';
import { StatusBadge } from '../components/SharedComponents';
import useToast, { ToastContainer } from '../hooks/useToast';

// ─────────────────────────────────────────────────────────────────────────────
// Responsive hook
// ─────────────────────────────────────────────────────────────────────────────
const useMediaQuery = (query) => {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(query).matches : false
  );
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia(query);
    const handler = (e) => setMatches(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [query]);
  return matches;
};

// ─────────────────────────────────────────────────────────────────────────────
// Token helpers — matching AdminDashboard colors
// ─────────────────────────────────────────────────────────────────────────────
const C = {
  bg:          '#f1f5f9',
  surface:     '#ffffff',
  border:      '#e2e8f0',
  borderLight: '#f1f5f9',
  text:        '#0f172a',
  textMid:     '#475569',
  textMuted:   '#94a3b8',
  primary:     '#4f46e5',
  primaryBg:   '#eef2ff',
  green:       '#059669',
  greenBg:     '#d1fae5',
  amber:       '#d97706',
  amberBg:     '#fef3c7',
  blue:        '#2563eb',
  blueBg:      '#dbeafe',
  red:         '#dc2626',
  redBg:       '#fee2e2',
  rowHover:    '#f8fafc',
  topbarBg:    'rgb(15, 23, 42)',
};

// ─────────────────────────────────────────────────────────────────────────────
// Badge — shared, no duplication between mobile and desktop
// ─────────────────────────────────────────────────────────────────────────────
const BADGE_COLORS = {
  pending:  { bg: C.amberBg, color: C.amber },
  approved: { bg: C.greenBg, color: C.green },
  awarded:  { bg: C.blueBg,  color: C.blue  },
  rejected: { bg: C.redBg,   color: C.red   },
};

function CountBadge({ value, variant }) {
  const { bg, color } = BADGE_COLORS[variant] || { bg: C.borderLight, color: C.textMid };
  return (
    <span style={{
      display: 'inline-block', minWidth: 28,
      padding: '2px 8px', borderRadius: 999,
      background: bg, color, fontSize: '0.7rem', fontWeight: 700,
      textAlign: 'center',
    }}>
      {value ?? 0}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Avatar
// ─────────────────────────────────────────────────────────────────────────────
function Avatar({ name, size = 36 }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: `linear-gradient(135deg, ${C.primary}, #7c3aed)`,
      color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontWeight: 700, fontSize: size * 0.38,
      boxShadow: `0 0 0 2px ${C.surface}, 0 0 0 3px ${C.primaryBg}`,
    }}>
      {name?.charAt(0)?.toUpperCase() || '?'}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Shimmer skeleton
// ─────────────────────────────────────────────────────────────────────────────
function Shimmer({ width = '100%', height = 14, radius = 8 }) {
  return (
    <div style={{
      width, height, borderRadius: radius,
      background: 'linear-gradient(90deg, #f1f5f9 25%, #e2e8f0 50%, #f1f5f9 75%)',
      backgroundSize: '200% 100%',
      animation: 'uqs-shimmer 1.4s ease infinite',
    }}/>
  );
}

function TableSkeleton({ cols = 8, rows = 6 }) {
  const colWidths = [200, 80, 120, 70, 70, 70, 70, 80];
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr style={{ background: C.bg }}>
          {Array.from({ length: cols }).map((_, i) => (
            <th key={i} style={{ padding: '0.75rem 1rem', borderBottom: `1px solid ${C.border}` }}>
              <Shimmer width={colWidths[i] ? Math.round(colWidths[i] * 0.6) : 60} height={12} radius={6}/>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {Array.from({ length: rows }).map((_, r) => (
          <tr key={r}>
            {Array.from({ length: cols }).map((_, c) => (
              <td key={c} style={{ padding: '0.85rem 1rem', borderBottom: `1px solid ${C.borderLight}` }}>
                <Shimmer width={c === 0 ? '80%' : '60%'} height={13} radius={6}/>
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Empty state
// ─────────────────────────────────────────────────────────────────────────────
function EmptyState({ message, icon: Icon = Inbox }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '4rem 2rem', gap: '0.75rem' }}>
      <div style={{ width: 56, height: 56, borderRadius: 16, background: C.borderLight, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Icon size={26} color={C.textMuted}/>
      </div>
      <p style={{ margin: 0, color: C.textMid, fontWeight: 600, fontSize: '0.9rem' }}>{message}</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Summary stat card
// ─────────────────────────────────────────────────────────────────────────────
function SummaryCard({ label, value, icon: Icon, bg, color }) {
  return (
    <div style={{
      background: C.surface, borderRadius: 16, padding: '1.25rem',
      display: 'flex', alignItems: 'center', gap: '1rem',
      boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
      border: `1px solid ${C.borderLight}`,
      transition: 'transform 0.15s, box-shadow 0.15s',
    }}
    onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 6px 16px rgba(0,0,0,0.08)'; }}
    onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.06)'; }}>
      <div style={{ width: 48, height: 48, borderRadius: 14, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon size={22} color={color}/>
      </div>
      <div>
        <div style={{ fontSize: '1.75rem', fontWeight: 800, color: C.text, lineHeight: 1 }}>{value}</div>
        <div style={{ fontSize: '0.75rem', color: C.textMuted, marginTop: 4 }}>{label}</div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sort icon — shows arrows for both active and inactive columns
// ─────────────────────────────────────────────────────────────────────────────
function SortIcon({ field, sortBy, sortOrder }) {
  const active = sortBy === field;
  if (!active) return <ChevronsUpDown size={13} style={{ opacity: 0.35, marginLeft: 3, flexShrink: 0 }}/>;
  return sortOrder === 'desc'
    ? <ChevronDown size={13} style={{ color: C.primary, marginLeft: 3, flexShrink: 0 }}/>
    : <ChevronUp   size={13} style={{ color: C.primary, marginLeft: 3, flexShrink: 0 }}/>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Table header cell
// ─────────────────────────────────────────────────────────────────────────────
function Th({ children, onClick, align = 'left', sortable, field, sortBy, sortOrder, style: s = {} }) {
  const alignMap = { left: 'left', center: 'center', right: 'right' };
  return (
    <th
      onClick={onClick}
      style={{
        padding: '0.75rem 1rem',
        textAlign: alignMap[align],
        fontSize: '0.7rem', fontWeight: 700, color: C.textMuted,
        textTransform: 'uppercase', letterSpacing: '0.05em',
        borderBottom: `2px solid ${C.border}`,
        background: C.bg,
        cursor: sortable ? 'pointer' : 'default',
        userSelect: 'none',
        whiteSpace: 'nowrap',
        position: 'sticky', top: 0, zIndex: 2,
        transition: 'color 0.1s',
        ...s,
      }}
      onMouseEnter={e => { if (sortable) e.currentTarget.style.color = C.primary; }}
      onMouseLeave={e => { e.currentTarget.style.color = C.textMuted; }}
    >
      <span style={{ display: 'inline-flex', alignItems: 'center' }}>
        {children}
        {sortable && <SortIcon field={field} sortBy={sortBy} sortOrder={sortOrder}/>}
      </span>
    </th>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Td — body cell with matching alignment
// ─────────────────────────────────────────────────────────────────────────────
function Td({ children, align = 'left', style: s = {} }) {
  return (
    <td style={{
      padding: '0.85rem 1rem',
      textAlign: align,
      fontSize: '0.875rem', color: C.text,
      borderBottom: `1px solid ${C.borderLight}`,
      verticalAlign: 'middle',
      ...s,
    }}>
      {children}
    </td>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Icon button
// ─────────────────────────────────────────────────────────────────────────────
function IconBtn({ onClick, disabled, children, variant = 'ghost', title, style: s = {} }) {
  const base = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    gap: '0.3rem', border: 'none', cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1, borderRadius: 8, fontWeight: 500, fontSize: '0.75rem',
    transition: 'all 0.15s', ...s,
  };
  const variants = {
    ghost:    { padding: '6px 8px', background: 'transparent', color: C.textMid },
    primary:  { padding: '6px 12px', background: C.primaryBg, color: C.primary },
    view:     { padding: '5px 10px', background: '#e0f2fe', color: '#0369a1' },
    download: { padding: '5px 10px', background: C.greenBg, color: '#166534' },
    back:     { padding: '7px 14px', background: C.surface, color: C.textMid, border: `1px solid ${C.border}`, borderRadius: 10 },
  };
  return (
    <button onClick={onClick} disabled={disabled} title={title}
      style={{ ...base, ...variants[variant] }}
      onMouseEnter={e => { if (!disabled) e.currentTarget.style.opacity = '0.8'; }}
      onMouseLeave={e => { e.currentTarget.style.opacity = disabled ? '0.5' : '1'; }}>
      {children}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Mobile User Card
// ─────────────────────────────────────────────────────────────────────────────
function MobileUserCard({ user, selectedCurrency, onViewQuotations }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div style={{ background: C.surface, borderRadius: 14, overflow: 'hidden', border: `1px solid ${C.borderLight}`, transition: 'box-shadow 0.15s' }}
      onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.07)'}
      onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}>

      <div onClick={() => setExpanded(p => !p)}
        style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.875rem 1rem', cursor: 'pointer' }}>
        <Avatar name={user.userName} size={40}/>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, color: C.text, fontSize: '0.875rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.userName}</div>
          <div style={{ fontSize: '0.7rem', color: C.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.userEmail}</div>
        </div>
        <div style={{ textAlign: 'center', flexShrink: 0 }}>
          <div style={{ fontWeight: 800, color: C.text, fontSize: '1.1rem', lineHeight: 1 }}>{user.totalQuotations}</div>
          <div style={{ fontSize: '0.6rem', color: C.textMuted, marginTop: 2 }}>Quotes</div>
        </div>
        <div style={{ color: C.textMuted, transition: 'transform 0.2s', transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)' }}>
          <ChevronDown size={17}/>
        </div>
      </div>

      {expanded && (
        <div style={{ padding: '0.875rem 1rem', borderTop: `1px solid ${C.borderLight}`, display: 'flex', flexDirection: 'column', gap: '0.75rem', animation: 'uqs-fadeIn 0.15s ease' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.72rem', color: C.textMuted }}>Total Value</span>
            <span style={{ fontWeight: 700, color: C.green, fontSize: '0.9rem' }}>{fmtCurrency(user.totalValue, selectedCurrency)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
            {['pending','approved','awarded','rejected'].map(v => (
              <div key={v} style={{ textAlign: 'center', flex: 1 }}>
                <CountBadge value={user[v]} variant={v}/>
                <div style={{ fontSize: '0.58rem', color: C.textMuted, marginTop: 3, textTransform: 'capitalize' }}>{v}</div>
              </div>
            ))}
          </div>
          <IconBtn variant="view" onClick={() => onViewQuotations(user.userId, user.userName)}
            style={{ width: '100%', justifyContent: 'center', padding: '0.5rem' }}>
            <Eye size={15}/> View Quotations
          </IconBtn>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Mobile Quotation Card
// ─────────────────────────────────────────────────────────────────────────────
function MobileQuotationCard({ quotation, selectedCurrency, onDownload, isExporting }) {
  return (
    <div style={{ background: C.surface, borderRadius: 14, padding: '1rem', border: `1px solid ${C.borderLight}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
        <span style={{ fontFamily: 'monospace', fontWeight: 700, color: C.text, fontSize: '0.8rem' }}>
          {quotation.quotationNumber}
        </span>
        <StatusBadge status={quotation.status}/>
      </div>
      <div style={{ fontWeight: 600, color: C.text, fontSize: '0.875rem', marginBottom: '0.375rem' }}>
        {quotation.customerSnapshot?.name || quotation.customer || 'N/A'}
      </div>
      <div style={{ display: 'flex', gap: '1rem', fontSize: '0.7rem', color: C.textMuted, marginBottom: '0.75rem' }}>
        <span>📅 {fmtDate(quotation.date)}</span>
        <span>⏰ {fmtDate(quotation.expiryDate)}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '0.625rem', borderTop: `1px solid ${C.borderLight}` }}>
        <span style={{ fontWeight: 700, color: C.green, fontSize: '0.9rem' }}>
          {fmtCurrency(quotation.total, selectedCurrency)}
        </span>
        <IconBtn variant="download" onClick={() => onDownload(quotation)} disabled={isExporting === quotation._id}>
          <Download size={13}/>
          {isExporting === quotation._id ? 'Saving…' : 'PDF'}
        </IconBtn>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────────────
export default function UserQuotationStatsPage() {
  const navigate = useNavigate();
  const { selectedCurrency } = useCompanyCurrency();
  const { addToast } = useToast();

  const isMobile = useMediaQuery('(max-width: 768px)');

  const [stats,            setStats]            = useState([]);
  const [summary,          setSummary]          = useState(null);
  const [loading,          setLoading]          = useState(true);
  const [error,            setError]            = useState(null);
  const [selectedUser,     setSelectedUser]     = useState(null);
  const [userQuotations,   setUserQuotations]   = useState([]);
  const [loadingQuotations,setLoadingQuotations]= useState(false);
  const [sortBy,           setSortBy]           = useState('totalQuotations');
  const [sortOrder,        setSortOrder]        = useState('desc');
  const [searchTerm,       setSearchTerm]       = useState('');
  const [exportingId,      setExportingId]      = useState(null);

  useEffect(() => { fetchStats(); }, []);

  const fetchStats = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await adminAPI.getUserQuotationStats();
      if (res.data.success) { setStats(res.data.stats); setSummary(res.data.summary); }
      else setError(res.data.message || 'Failed to load stats');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load statistics');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchUserQuotations = useCallback(async (userId, userName) => {
    setLoadingQuotations(true);
    setSelectedUser({ id: userId, name: userName });
    try {
      const res = await adminAPI.getQuotationsByUser(userId);
      if (res.data.success) setUserQuotations(res.data.quotations);
      else addToast(res.data.message || 'Failed to load user quotations', 'error');
    } catch (err) {
      addToast(err.response?.data?.message || 'Failed to load user quotations', 'error');
    } finally {
      setLoadingQuotations(false);
    }
  }, [addToast]);

  const handleDownload = useCallback(async (quotation) => {
    setExportingId(quotation._id);
    try {
      await downloadQuotationPDF(quotation);
      addToast('PDF downloaded successfully!', 'success');
    } catch (err) {
      addToast(`PDF failed: ${err.message}`, 'error');
    } finally {
      setExportingId(null);
    }
  }, [addToast]);

  const handleSortField = (field) => {
    if (sortBy === field) {
      setSortOrder(o => o === 'desc' ? 'asc' : 'desc');
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
  };

  const filteredStats = useMemo(() => {
    if (!searchTerm.trim()) return stats;
    const t = searchTerm.toLowerCase();
    return stats.filter(u => u.userName.toLowerCase().includes(t) || u.userEmail.toLowerCase().includes(t));
  }, [stats, searchTerm]);

  const sortedStats = useMemo(() => {
    return [...filteredStats].sort((a, b) => {
      const av = sortBy === 'totalValue' ? parseFloat(a[sortBy]) : a[sortBy];
      const bv = sortBy === 'totalValue' ? parseFloat(b[sortBy]) : b[sortBy];
      return sortOrder === 'desc' ? bv - av : av - bv;
    });
  }, [filteredStats, sortBy, sortOrder]);

  const handleBack = () => {
    if (selectedUser) { setSelectedUser(null); setUserQuotations([]); }
    else navigate('/admin');
  };

  // ── Early returns ─────────────────────────────────────────────────────────
  if (error && !selectedUser) {
    return (
      <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
        <div style={{ textAlign: 'center', padding: '2rem' }}>
          <AlertCircle size={48} color={C.red} style={{ marginBottom: '1rem' }}/>
          <p style={{ color: C.red, fontWeight: 600, marginBottom: '1.5rem' }}>{error}</p>
          <IconBtn variant="back" onClick={() => navigate('/admin')}><ArrowLeft size={16}/> Back to Dashboard</IconBtn>
        </div>
      </div>
    );
  }

  const thProps = { sortBy, sortOrder };

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: C.bg, fontFamily: "'Segoe UI', system-ui, sans-serif", padding: isMobile ? '1rem' : '1.5rem 2rem' }}>
      <style>{`
        @keyframes uqs-shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
        @keyframes uqs-spin    { to{transform:rotate(360deg)} }
        @keyframes uqs-fadeIn  { from{opacity:0;transform:translateY(-4px)} to{opacity:1;transform:translateY(0)} }
        .uqs-tr:hover td { background: ${C.rowHover}; }
      `}</style>
      <ToastContainer/>

      {/* ── Page header with topbar style ── */}
      <div style={{ 
        backgroundColor: C.topbarBg, 
        margin: '-1.5rem -2rem 1.5rem -2rem', 
        padding: '1rem 2rem',
        display: 'flex', 
        alignItems: 'center', 
        gap: '0.75rem', 
        flexWrap: 'wrap',
        position: 'sticky',
        top: 0,
        zIndex: 50,
        boxShadow: '0 2px 8px rgba(0,0,0,0.25)'
      }}>
        <button onClick={handleBack} style={{
          backgroundColor: 'rgba(255,255,255,0.08)',
          color: '#94a3b8',
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 8,
          padding: '0.45rem 0.875rem',
          fontSize: '0.8rem',
          fontWeight: 600,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem'
        }}>
          <ArrowLeft size={16}/> {selectedUser ? 'Back' : 'Dashboard'}
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ 
            margin: 0, 
            fontWeight: 800, 
            color: 'white', 
            fontSize: isMobile ? '1.2rem' : '1.5rem', 
            letterSpacing: '-0.01em',
            overflow: 'hidden', 
            textOverflow: 'ellipsis', 
            whiteSpace: 'nowrap' 
          }}>
            {selectedUser ? `Quotations — ${selectedUser.name}` : 'User Quotation Statistics'}
          </h1>
        </div>
        <button onClick={fetchStats} style={{
          backgroundColor: 'rgba(255,255,255,0.08)',
          color: '#94a3b8',
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 8,
          padding: '0.45rem 0.875rem',
          fontSize: '0.8rem',
          fontWeight: 600,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '0.4rem'
        }}>
          <RefreshCw size={14}/> Refresh
        </button>
      </div>

      {!selectedUser ? (
        <>
          {/* ── Summary cards ── */}
          {summary && (
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
              <SummaryCard label="Active Users"      value={summary.totalUsers}      icon={Users}     bg={C.primaryBg} color={C.primary}/>
              <SummaryCard label="Total Quotations"  value={summary.totalQuotations} icon={FileText}  bg="#ede9fe"     color="#7c3aed"/>
            </div>
          )}

          {/* ── Toolbar: search + count ── */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: C.surface, border: `1.5px solid ${C.border}`, borderRadius: 10, padding: '0.5rem 0.75rem', flex: isMobile ? '1 1 100%' : '1 1 300px', maxWidth: isMobile ? '100%' : 380, transition: 'border-color 0.15s', boxSizing: 'border-box' }}
              onFocusCapture={e => e.currentTarget.style.borderColor = C.primary}
              onBlurCapture={e  => e.currentTarget.style.borderColor = C.border}>
              <Search size={15} color={C.textMuted}/>
              <input
                type="text" placeholder="Search users…" value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                style={{ flex: 1, border: 'none', outline: 'none', fontSize: '0.875rem', background: 'transparent', color: C.text }}
              />
              {searchTerm && (
                <button onClick={() => setSearchTerm('')} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', padding: 0 }}>
                  <X size={14} color={C.textMuted}/>
                </button>
              )}
            </div>
            {searchTerm && (
              <span style={{ fontSize: '0.78rem', color: C.textMuted, flexShrink: 0 }}>
                {sortedStats.length} result{sortedStats.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>

          {/* ── User list ── */}
          {isMobile ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {loading
                ? Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} style={{ background: C.surface, borderRadius: 14, padding: '0.875rem 1rem', border: `1px solid ${C.borderLight}`, display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <Shimmer width={40} height={40} radius={999}/>
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}><Shimmer width="60%" height={13}/><Shimmer width="40%" height={10}/></div>
                      <Shimmer width={40} height={24} radius={8}/>
                    </div>
                  ))
                : sortedStats.length === 0
                  ? <EmptyState message={searchTerm ? `No results for "${searchTerm}"` : 'No user data available'} icon={Users}/>
                  : sortedStats.map(u => <MobileUserCard key={u.userId} user={u} selectedCurrency={selectedCurrency} onViewQuotations={fetchUserQuotations}/>)
              }
            </div>
          ) : (
            /* ── Desktop table ── */
            <div style={{ background: C.surface, borderRadius: 16, border: `1px solid ${C.borderLight}`, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
              <div style={{ overflowX: 'auto' }}>
                {loading ? (
                  <TableSkeleton cols={8} rows={6}/>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        <Th align="left"   sortable field="userName"        onClick={() => handleSortField('userName')}        {...thProps}>User</Th>
                        <Th align="center" sortable field="totalQuotations" onClick={() => handleSortField('totalQuotations')} {...thProps}>Quotations</Th>
                        <Th align="right"  sortable field="totalValue"      onClick={() => handleSortField('totalValue')}      {...thProps}>Total Value</Th>
                        <Th align="center"                                                                                     {...thProps}>Pending</Th>
                        <Th align="center"                                                                                     {...thProps}>Approved</Th>
                        <Th align="center"                                                                                     {...thProps}>Awarded</Th>
                        <Th align="center"                                                                                     {...thProps}>Rejected</Th>
                        <Th align="center"                                                                                     {...thProps}>Actions</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedStats.length === 0 ? (
                        <tr><td colSpan={8}><EmptyState message={searchTerm ? `No results for "${searchTerm}"` : 'No user data available'} icon={Users}/></td></tr>
                      ) : sortedStats.map(user => (
                        <tr key={user.userId} className="uqs-tr" style={{ cursor: 'pointer' }}>
                          <Td align="left">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                              <Avatar name={user.userName} size={34}/>
                              <div>
                                <div style={{ fontWeight: 600, color: C.text, fontSize: '0.875rem' }}>{user.userName}</div>
                                <div style={{ fontSize: '0.7rem', color: C.textMuted }}>{user.userEmail}</div>
                              </div>
                            </div>
                          </Td>
                          <Td align="center"><span style={{ fontWeight: 700, color: C.text }}>{user.totalQuotations}</span></Td>
                          <Td align="right"><span style={{ fontWeight: 600, color: C.green }}>{fmtCurrency(user.totalValue, selectedCurrency)}</span></Td>
                          <Td align="center"><CountBadge value={user.pending}  variant="pending"/></Td>
                          <Td align="center"><CountBadge value={user.approved} variant="approved"/></Td>
                          <Td align="center"><CountBadge value={user.awarded}  variant="awarded"/></Td>
                          <Td align="center"><CountBadge value={user.rejected} variant="rejected"/></Td>
                          <Td align="center">
                            <IconBtn variant="view" onClick={() => fetchUserQuotations(user.userId, user.userName)}>
                              <Eye size={14}/> View
                            </IconBtn>
                          </Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}
        </>
      ) : (
        /* ── User quotations view ── */
        loadingQuotations ? (
          <div style={{ background: C.surface, borderRadius: 16, border: `1px solid ${C.borderLight}`, overflow: 'hidden' }}>
            <TableSkeleton cols={isMobile ? 3 : 7} rows={5}/>
          </div>
        ) : isMobile ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {userQuotations.length === 0
              ? <EmptyState message="No quotations found for this user" icon={FileText}/>
              : userQuotations.map(q => (
                  <MobileQuotationCard key={q._id} quotation={q} selectedCurrency={selectedCurrency} onDownload={handleDownload} isExporting={exportingId}/>
                ))
            }
          </div>
        ) : (
          <div style={{ background: C.surface, borderRadius: 16, border: `1px solid ${C.borderLight}`, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <Th align="left"   {...thProps}>Quote #</Th>
                    <Th align="left"   {...thProps}>Customer</Th>
                    <Th align="center" {...thProps}>Date</Th>
                    <Th align="center" {...thProps}>Expiry</Th>
                    <Th align="center" {...thProps}>Status</Th>
                    <Th align="right"  {...thProps}>Total</Th>
                    <Th align="center" {...thProps}>Actions</Th>
                  </tr>
                </thead>
                <tbody>
                  {userQuotations.length === 0 ? (
                    <tr><td colSpan={7}><EmptyState message="No quotations found for this user" icon={FileText}/></td></tr>
                  ) : userQuotations.map(q => (
                    <tr key={q._id} className="uqs-tr">
                      <Td align="left"><span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '0.8rem' }}>{q.quotationNumber}</span></Td>
                      <Td align="left">{q.customerSnapshot?.name || q.customer || 'N/A'}</Td>
                      <Td align="center" style={{ color: C.textMid }}>{fmtDate(q.date)}</Td>
                      <Td align="center" style={{ color: C.textMid }}>{fmtDate(q.expiryDate)}</Td>
                      <Td align="center"><StatusBadge status={q.status}/></Td>
                      <Td align="right"><span style={{ fontWeight: 600, color: C.green }}>{fmtCurrency(q.total, selectedCurrency)}</span></Td>
                      <Td align="center">
                        <IconBtn variant="download" onClick={() => handleDownload(q)} disabled={exportingId === q._id}>
                          <Download size={13}/>{exportingId === q._id ? 'Saving…' : 'PDF'}
                        </IconBtn>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}
    </div>
  );
}