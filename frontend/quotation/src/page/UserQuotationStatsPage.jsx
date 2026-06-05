// screens/UserQuotationStatsPage.jsx - SIMPLE ELEGANT VERSION
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users, FileText, TrendingUp, Award, XCircle, Clock,
  ChevronDown, ChevronUp, Eye, Download, RefreshCw,
  ArrowLeft, Search, X, AlertCircle, ChevronsUpDown,
  Inbox
} from 'lucide-react';
import { adminAPI } from '../services/api';
import { useCompanyCurrency, CompanyCurrencyDisplay } from '../components/CompanyCurrencySelector';
import { downloadQuotationPDF } from '../utils/pdfGenerator';
import { fmtCurrency, fmtDate, formatLargeCurrency } from '../utils/formatters';
import { StatusBadge } from '../components/SharedComponents';
import useToast, { ToastContainer } from '../hooks/useToast';

// Helper function to format amount without currency symbol for large values
const formatLargeAmount = (amount, currency) => {
  return formatLargeCurrency(amount, currency);
};

// Helper function to render currency with small code (for regular amounts)
const CurrencyAmount = ({ amount, currency, size = 'normal' }) => {
  const amountFontSize = size === 'small' ? '0.75rem' : '0.9rem';
  const codeFontSize = size === 'small' ? '0.6rem' : '0.65rem';
  
  // Use large format for amounts >= 10,000
  const shouldUseLargeFormat = Math.abs(amount) >= 10000;
  
  if (shouldUseLargeFormat) {
    const formatted = formatLargeCurrency(amount, currency);
    // Extract the formatted string to split number and currency
    const parts = formatted.split(' ');
    const numberPart = parts.slice(0, -1).join(' ');
    const currencyPart = parts[parts.length - 1];
    
    return (
      <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: '0.25rem' }}>
        <span style={{ fontSize: amountFontSize, fontWeight: 700, color: '#0f172a' }}>
          {numberPart}
        </span>
        <span style={{ 
          fontSize: codeFontSize, 
          fontWeight: 400, 
          color: '#94a3b8',
          letterSpacing: '0.02em'
        }}>
          {currencyPart}
        </span>
      </span>
    );
  }
  
  const formattedAmount = (amount || 0).toLocaleString('en-AE', { 
    minimumFractionDigits: 2, 
    maximumFractionDigits: 2 
  });
  
  return (
    <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: '0.25rem' }}>
      <span style={{ fontSize: amountFontSize, fontWeight: 700, color: '#0f172a' }}>
        {formattedAmount}
      </span>
      <span style={{ 
        fontSize: codeFontSize, 
        fontWeight: 400, 
        color: '#94a3b8',
        letterSpacing: '0.02em'
      }}>
        {currency}
      </span>
    </span>
  );
};

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
// Colors
// ─────────────────────────────────────────────────────────────────────────────
const C = {
  bg:          '#f8fafc',
  surface:     '#ffffff',
  border:      '#e2e8f0',
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
  topbarBg:    '#0f172a',
};

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────
const STYLES = `
  @keyframes shimmer {
    0% { background-position: 200% 0; }
    100% { background-position: -200% 0; }
  }
  .uqs-tr:hover td { background: ${C.rowHover}; }
`;

// ─────────────────────────────────────────────────────────────────────────────
// Badge
// ─────────────────────────────────────────────────────────────────────────────
function Badge({ value, variant }) {
  const colors = {
    pending:  { bg: C.amberBg, color: C.amber },
    approved: { bg: C.greenBg, color: C.green },
    awarded:  { bg: C.blueBg,  color: C.blue  },
    rejected: { bg: C.redBg,   color: C.red   },
  };
  const { bg, color } = colors[variant] || { bg: C.border, color: C.textMid };
  
  return (
    <span style={{
      display: 'inline-block',
      minWidth: 32,
      padding: '4px 10px',
      borderRadius: 6,
      background: bg,
      color,
      fontSize: '0.7rem',
      fontWeight: 700,
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
      width: size,
      height: size,
      borderRadius: '50%',
      flexShrink: 0,
      background: C.primary,
      color: 'white',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontWeight: 600,
      fontSize: size * 0.4,
    }}>
      {name?.charAt(0)?.toUpperCase() || '?'}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Shimmer
// ─────────────────────────────────────────────────────────────────────────────
function Shimmer({ width = '100%', height = 14 }) {
  return (
    <div style={{
      width,
      height,
      borderRadius: 4,
      background: 'linear-gradient(90deg, #f1f5f9 25%, #e2e8f0 50%, #f1f5f9 75%)',
      backgroundSize: '200% 100%',
      animation: 'shimmer 1.4s ease infinite',
    }}/>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Empty State
// ─────────────────────────────────────────────────────────────────────────────
function EmptyState({ message, icon: Icon = Inbox }) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '3rem 2rem',
      gap: '0.75rem',
    }}>
      <Icon size={32} color={C.textMuted}/>
      <p style={{ margin: 0, color: C.textMid, fontWeight: 500, fontSize: '0.9rem' }}>
        {message}
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Summary Card - Simple
// ─────────────────────────────────────────────────────────────────────────────
function SummaryCard({ label, value, icon: Icon, bg, color }) {
  return (
    <div style={{
      background: C.surface,
      borderRadius: 12,
      padding: '1.25rem',
      border: `1px solid ${C.border}`,
      display: 'flex',
      alignItems: 'center',
      gap: '1rem',
    }}>
      <div style={{
        width: 44,
        height: 44,
        borderRadius: 8,
        background: bg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}>
        <Icon size={20} color={color}/>
      </div>
      <div>
        <div style={{ fontSize: '0.7rem', color: C.textMuted, fontWeight: 600, textTransform: 'uppercase' }}>
          {label}
        </div>
        <div style={{ fontSize: '1.5rem', fontWeight: 700, color: C.text, marginTop: 2 }}>
          {value}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sort Icon
// ─────────────────────────────────────────────────────────────────────────────
function SortIcon({ field, sortBy, sortOrder }) {
  const active = sortBy === field;
  if (!active) return <ChevronsUpDown size={12} style={{ opacity: 0.3, marginLeft: 3, flexShrink: 0 }}/>;
  return sortOrder === 'desc'
    ? <ChevronDown size={12} style={{ color: C.primary, marginLeft: 3, flexShrink: 0 }}/>
    : <ChevronUp size={12} style={{ color: C.primary, marginLeft: 3, flexShrink: 0 }}/>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Table Header
// ─────────────────────────────────────────────────────────────────────────────
function Th({ children, onClick, align = 'left', sortable, field, sortBy, sortOrder }) {
  const alignMap = { left: 'left', center: 'center', right: 'right' };
  return (
    <th
      onClick={onClick}
      style={{
        padding: '0.85rem 1rem',
        textAlign: alignMap[align],
        fontSize: '0.7rem',
        fontWeight: 700,
        color: C.textMuted,
        textTransform: 'uppercase',
        borderBottom: `1px solid ${C.border}`,
        background: C.bg,
        cursor: sortable ? 'pointer' : 'default',
        userSelect: 'none',
        whiteSpace: 'nowrap',
        position: 'sticky',
        top: 0,
        zIndex: 2,
      }}
      onMouseEnter={e => { if (sortable) e.currentTarget.style.color = C.primary; }}
      onMouseLeave={e => { e.currentTarget.style.color = C.textMuted; }}
    >
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
        {children}
        {sortable && <SortIcon field={field} sortBy={sortBy} sortOrder={sortOrder}/>}
      </span>
    </th>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Table Cell
// ─────────────────────────────────────────────────────────────────────────────
function Td({ children, align = 'left' }) {
  return (
    <td style={{
      padding: '0.9rem 1rem',
      textAlign: align,
      fontSize: '0.875rem',
      color: C.text,
      borderBottom: `1px solid #f1f5f9`,
      verticalAlign: 'middle',
    }}>
      {children}
    </td>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Button
// ─────────────────────────────────────────────────────────────────────────────
function Button({ onClick, disabled, children, variant = 'primary' }) {
  const variants = {
    primary: { bg: C.primaryBg, color: C.primary, border: 'none' },
    view:    { bg: C.blueBg, color: C.blue, border: 'none' },
    download:{ bg: C.greenBg, color: C.green, border: 'none' },
    back:    { bg: 'transparent', color: C.textMid, border: `1px solid ${C.border}` },
  };
  const style = variants[variant];
  
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.4rem',
        padding: '6px 12px',
        borderRadius: 6,
        fontSize: '0.75rem',
        fontWeight: 600,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transition: 'all 0.15s',
        ...style,
      }}
      onMouseEnter={e => { if (!disabled) e.currentTarget.style.opacity = '0.8'; }}
      onMouseLeave={e => { e.currentTarget.style.opacity = disabled ? '0.5' : '1'; }}
    >
      {children}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Mobile User Card with updated currency
// ─────────────────────────────────────────────────────────────────────────────
function MobileUserCard({ user, selectedCurrency, onViewQuotations }) {
  const [expanded, setExpanded] = useState(false);
  
  return (
    <div style={{
      background: C.surface,
      borderRadius: 10,
      border: `1px solid ${C.border}`,
      overflow: 'hidden',
    }}>
      <div
        onClick={() => setExpanded(p => !p)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          padding: '0.875rem 1rem',
          cursor: 'pointer',
          backgroundColor: C.bg,
        }}>
        <Avatar name={user.userName} size={40}/>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontWeight: 600,
            color: C.text,
            fontSize: '0.875rem',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {user.userName}
          </div>
          <div style={{
            fontSize: '0.7rem',
            color: C.textMuted,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {user.userEmail}
          </div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontWeight: 700, color: C.text, fontSize: '1rem' }}>
            {user.totalQuotations}
          </div>
          <div style={{ fontSize: '0.65rem', color: C.textMuted }}>Quotes</div>
        </div>
        <ChevronDown size={16} color={C.textMuted} style={{
          transition: 'transform 0.2s',
          transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
          flexShrink: 0,
        }}/>
      </div>

      {expanded && (
        <div style={{
          padding: '0.875rem 1rem',
          borderTop: `1px solid ${C.border}`,
          display: 'flex',
          flexDirection: 'column',
          gap: '0.75rem',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.7rem', color: C.textMuted }}>Total Value</span>
            <CurrencyAmount amount={user.totalValue} currency={selectedCurrency} size="small" />
          </div>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem' }}>
            {['pending','approved','awarded','rejected'].map(v => (
              <div key={v} style={{ textAlign: 'center' }}>
                <Badge value={user[v]} variant={v}/>
                <div style={{ fontSize: '0.6rem', color: C.textMuted, marginTop: 3, textTransform: 'capitalize' }}>
                  {v}
                </div>
              </div>
            ))}
          </div>
          
          <Button variant="view" onClick={() => onViewQuotations(user.userId, user.userName)} style={{ width: '100%' }}>
            <Eye size={14}/> View Quotes
          </Button>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Mobile Quotation Card with updated currency
// ─────────────────────────────────────────────────────────────────────────────
function MobileQuotationCard({ quotation, selectedCurrency, onDownload, isExporting }) {
  const quoteCurrency = quotation.currency?.code || selectedCurrency;
  
  return (
    <div style={{
      background: C.surface,
      borderRadius: 10,
      padding: '1rem',
      border: `1px solid ${C.border}`,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
        <span style={{ fontFamily: 'monospace', fontWeight: 700, color: C.text, fontSize: '0.8rem' }}>
          {quotation.quotationNumber}
        </span>
        <StatusBadge status={quotation.status}/>
      </div>
      <div style={{ fontWeight: 600, color: C.text, fontSize: '0.875rem', marginBottom: '0.5rem' }}>
        {quotation.customerSnapshot?.name || quotation.customer || 'N/A'}
      </div>
      <div style={{ display: 'flex', gap: '1rem', fontSize: '0.7rem', color: C.textMuted, marginBottom: '0.75rem' }}>
        <span>📅 {fmtDate(quotation.date)}</span>
        <span>⏰ {fmtDate(quotation.expiryDate)}</span>
      </div>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingTop: '0.75rem',
        borderTop: `1px solid ${C.border}`,
      }}>
        <CurrencyAmount amount={quotation.total} currency={quoteCurrency} />
        {(quoteCurrency !== 'AED' && quotation.totalInBaseCurrency != null) && (
          <div style={{ fontSize: '0.6rem', color: C.textMuted, marginTop: 2 }}>
            ≈ <CurrencyAmount amount={quotation.totalInBaseCurrency} currency="AED" size="small" />
          </div>
        )}
        <Button variant="download" onClick={() => onDownload(quotation)} disabled={isExporting === quotation._id}>
          <Download size={13}/>
          {isExporting === quotation._id ? 'Saving…' : 'PDF'}
        </Button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────
export default function UserQuotationStatsPage() {
  const navigate = useNavigate();
  const { selectedCurrency } = useCompanyCurrency();
  const { addToast } = useToast();
  const isMobile = useMediaQuery('(max-width: 768px)');

  const [stats, setStats] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedUser, setSelectedUser] = useState(null);
  const [userQuotations, setUserQuotations] = useState([]);
  const [loadingQuotations, setLoadingQuotations] = useState(false);
  const [sortBy, setSortBy] = useState('totalQuotations');
  const [sortOrder, setSortOrder] = useState('desc');
  const [searchTerm, setSearchTerm] = useState('');
  const [exportingId, setExportingId] = useState(null);

  useEffect(() => { fetchStats(); }, []);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminAPI.getUserQuotationStats();
      if (res.data.success) {
        setStats(res.data.stats);
        setSummary(res.data.summary);
      } else setError(res.data.message || 'Failed to load stats');
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
      if (res.data.success) {
        setUserQuotations(res.data.quotations);
      } else {
        addToast(res.data.message || 'Failed to load', 'error');
      }
    } catch (err) {
      addToast(err.response?.data?.message || 'Failed to load', 'error');
    } finally {
      setLoadingQuotations(false);
    }
  }, [addToast]);

  const handleDownload = useCallback(async (quotation) => {
    setExportingId(quotation._id);
    try {
      await downloadQuotationPDF(quotation);
      addToast('PDF downloaded!', 'success');
    } catch (err) {
      addToast(`Failed: ${err.message}`, 'error');
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
    if (selectedUser) {
      setSelectedUser(null);
      setUserQuotations([]);
    } else {
      navigate('/admin');
    }
  };

  if (error && !selectedUser) {
    return (
      <div style={{
        minHeight: '100vh',
        background: C.bg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}>
        <div style={{ textAlign: 'center', maxWidth: 400 }}>
          <AlertCircle size={40} color={C.red} style={{ marginBottom: '1rem' }}/>
          <p style={{ color: C.red, fontWeight: 600 }}>{error}</p>
          <Button variant="back" onClick={() => navigate('/admin')} style={{ marginTop: '1rem' }}>
            <ArrowLeft size={14}/> Back
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: C.bg,
      fontFamily: 'system-ui, -apple-system, sans-serif',
      padding: isMobile ? '1rem' : '1.5rem 2rem',
    }}>
      <style>{STYLES}</style>
      <ToastContainer/>

      {/* Header */}
      <div style={{
        backgroundColor: C.topbarBg,
        margin: isMobile ? '-1rem -1rem 1.5rem -1rem' : '-1.5rem -2rem 1.5rem -2rem',
        padding: isMobile ? '0.75rem 1rem' : '1rem 2rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '1rem',
        minHeight: isMobile ? 'auto' : 60,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button onClick={handleBack} style={{
            background: 'rgba(255,255,255,0.1)',
            color: '#94a3b8',
            border: '1px solid rgba(255,255,255,0.2)',
            borderRadius: 6,
            padding: '0.4rem 0.75rem',
            cursor: 'pointer',
            fontSize: '0.75rem',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
          }}>
            <ArrowLeft size={14}/>
          </button>
          <div>
            <div style={{ fontWeight: 700, fontSize: isMobile ? '0.95rem' : '1rem', color: 'white' }}>
              {selectedUser ? `${selectedUser.name}` : 'User Quotation Statistics'}
            </div>
            {!isMobile && <CompanyCurrencyDisplay/>}
          </div>
        </div>
        {isMobile && <CompanyCurrencyDisplay isMobile={true}/>}
        <button onClick={fetchStats} style={{
          background: 'rgba(255,255,255,0.1)',
          color: '#94a3b8',
          border: '1px solid rgba(255,255,255,0.2)',
          borderRadius: 6,
          padding: '0.4rem 0.75rem',
          cursor: 'pointer',
          fontSize: '0.75rem',
          fontWeight: 600,
          display: 'flex',
          alignItems: 'center',
          gap: '0.3rem',
        }}>
          <RefreshCw size={14}/>
        </button>
      </div>

      {!selectedUser ? (
        <>
          {/* Summary */}
          {summary && !loading && (
            <div style={{
              display: 'grid',
              gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, 1fr)',
              gap: '1rem',
              marginBottom: '1.5rem',
            }}>
              <SummaryCard label="Active Users" value={summary.totalUsers} icon={Users} bg={C.primaryBg} color={C.primary}/>
              <SummaryCard label="Total Quotations" value={summary.totalQuotations} icon={FileText} bg="#ede9fe" color="#7c3aed"/>
            </div>
          )}

          {/* Search */}
          <div style={{ marginBottom: '1.5rem' }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              background: C.surface,
              border: `1px solid ${C.border}`,
              borderRadius: 8,
              padding: '0.5rem 0.75rem',
              maxWidth: isMobile ? '100%' : 350,
            }}>
              <Search size={14} color={C.textMuted}/>
              <input
                type="text"
                placeholder="Search users…"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                style={{
                  flex: 1,
                  border: 'none',
                  outline: 'none',
                  fontSize: '0.8rem',
                  background: 'transparent',
                  color: C.text,
                }}
              />
              {searchTerm && (
                <button onClick={() => setSearchTerm('')} style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 0,
                  color: C.textMuted,
                }}>
                  <X size={14}/>
                </button>
              )}
            </div>
          </div>

          {/* Users List */}
          {isMobile ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {loading
                ? Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} style={{
                      background: C.surface,
                      borderRadius: 10,
                      padding: '0.875rem 1rem',
                      border: `1px solid ${C.border}`,
                      display: 'flex',
                      gap: '0.75rem',
                    }}>
                      <Shimmer width={40} height={40}/>
                      <div style={{ flex: 1 }}><Shimmer width="60%" height={10}/></div>
                    </div>
                  ))
                : sortedStats.length === 0
                  ? <EmptyState message={searchTerm ? 'No results' : 'No data'} icon={Users}/>
                  : sortedStats.map(u => <MobileUserCard key={u.userId} user={u} selectedCurrency={selectedCurrency} onViewQuotations={fetchUserQuotations}/>)
              }
            </div>
          ) : (
            /* Desktop Table */
            <div style={{ background: C.surface, borderRadius: 12, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                {loading ? (
                  <div style={{ padding: '1rem' }}><Shimmer/></div>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        <Th align="left" sortable field="userName" onClick={() => handleSortField('userName')} sortBy={sortBy} sortOrder={sortOrder}>User</Th>
                        <Th align="center" sortable field="totalQuotations" onClick={() => handleSortField('totalQuotations')} sortBy={sortBy} sortOrder={sortOrder}>Quotations</Th>
                        <Th align="right" sortable field="totalValue" onClick={() => handleSortField('totalValue')} sortBy={sortBy} sortOrder={sortOrder}>Total Value</Th>
                        <Th align="center" sortBy={sortBy} sortOrder={sortOrder}>Pending</Th>
                        <Th align="center" sortBy={sortBy} sortOrder={sortOrder}>Approved</Th>
                        <Th align="center" sortBy={sortBy} sortOrder={sortOrder}>Awarded</Th>
                        <Th align="center" sortBy={sortBy} sortOrder={sortOrder}>Rejected</Th>
                        <Th align="center" sortBy={sortBy} sortOrder={sortOrder}>Actions</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedStats.length === 0 ? (
                        <tr><td colSpan={8}><EmptyState message="No data" icon={Users}/></td></tr>
                      ) : sortedStats.map(user => (
                        <tr key={user.userId} className="uqs-tr">
                          <Td align="left">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              <Avatar name={user.userName} size={32}/>
                              <div>
                                <div style={{ fontWeight: 600, color: C.text, fontSize: '0.8rem' }}>{user.userName}</div>
                                <div style={{ fontSize: '0.65rem', color: C.textMuted }}>{user.userEmail}</div>
                              </div>
                            </div>
                          </Td>
                          <Td align="center"><span style={{ fontWeight: 700, color: C.primary }}>{user.totalQuotations}</span></Td>
                          <Td align="right">
                            <CurrencyAmount amount={user.totalValue} currency={selectedCurrency} />
                          </Td>
                          <Td align="center"><Badge value={user.pending} variant="pending"/></Td>
                          <Td align="center"><Badge value={user.approved} variant="approved"/></Td>
                          <Td align="center"><Badge value={user.awarded} variant="awarded"/></Td>
                          <Td align="center"><Badge value={user.rejected} variant="rejected"/></Td>
                          <Td align="center">
                            <Button variant="view" onClick={() => fetchUserQuotations(user.userId, user.userName)}>
                              <Eye size={13}/> View
                            </Button>
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
        /* User Quotations */
        <>
          <div style={{ marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
              <Avatar name={selectedUser.name} size={40}/>
              <div style={{ flex: 1 }}>
                <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: C.text }}>
                  {selectedUser.name}
                </h2>
                <p style={{ margin: '0.25rem 0 0', fontSize: '0.7rem', color: C.textMuted }}>
                  Quotation History
                </p>
              </div>
              <button onClick={handleBack} style={{
                background: C.primaryBg,
                color: C.primary,
                border: 'none',
                borderRadius: 6,
                padding: '0.4rem 0.75rem',
                cursor: 'pointer',
                fontSize: '0.75rem',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '0.3rem',
              }}>
                <ArrowLeft size={14}/> Back
              </button>
            </div>
          </div>

          {loadingQuotations ? (
            <div style={{ background: C.surface, borderRadius: 12, padding: '1rem', border: `1px solid ${C.border}` }}>
              <Shimmer/>
            </div>
          ) : isMobile ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {userQuotations.length === 0
                ? <EmptyState message="No quotations" icon={FileText}/>
                : userQuotations.map(q => (
                    <MobileQuotationCard key={q._id} quotation={q} selectedCurrency={selectedCurrency} onDownload={handleDownload} isExporting={exportingId}/>
                  ))
              }
            </div>
          ) : (
            <div style={{ background: C.surface, borderRadius: 12, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <Th align="left" sortBy={sortBy} sortOrder={sortOrder}>Quote #</Th>
                      <Th align="left" sortBy={sortBy} sortOrder={sortOrder}>Customer</Th>
                      <Th align="center" sortBy={sortBy} sortOrder={sortOrder}>Date</Th>
                      <Th align="center" sortBy={sortBy} sortOrder={sortOrder}>Expiry</Th>
                      <Th align="center" sortBy={sortBy} sortOrder={sortOrder}>Status</Th>
                      <Th align="right" sortBy={sortBy} sortOrder={sortOrder}>Total</Th>
                      <Th align="center" sortBy={sortBy} sortOrder={sortOrder}>Actions</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {userQuotations.length === 0 ? (
                      <tr><td colSpan={7}><EmptyState message="No quotations" icon={FileText}/></td></tr>
                    ) : userQuotations.map(q => {
                      const quoteCurrency = q.currency?.code || selectedCurrency;
                      return (
                        <tr key={q._id} className="uqs-tr">
                          <Td align="left"><span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '0.75rem' }}>{q.quotationNumber}</span></Td>
                          <Td align="left">{q.customerSnapshot?.name || q.customer || 'N/A'}</Td>
                          <Td align="center" style={{ color: C.textMid }}>{fmtDate(q.date)}</Td>
                          <Td align="center" style={{ color: C.textMid }}>{fmtDate(q.expiryDate)}</Td>
                          <Td align="center"><StatusBadge status={q.status}/></Td>
                          <Td align="right">
                            <CurrencyAmount amount={q.total} currency={quoteCurrency} />
                            {(quoteCurrency !== 'AED' && q.totalInBaseCurrency != null) && (
                              <div style={{ fontSize: '0.6rem', marginTop: 2 }}>
                                ≈ <CurrencyAmount amount={q.totalInBaseCurrency} currency="AED" size="small" />
                              </div>
                            )}
                          </Td>
                          <Td align="center">
                            <Button variant="download" onClick={() => handleDownload(q)} disabled={exportingId === q._id}>
                              <Download size={12}/>
                              {exportingId === q._id ? 'Saving…' : 'PDF'}
                            </Button>
                          </Td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}