// components/HomePageComponent/QuotationCard.jsx
import React from 'react';
import { Calendar, Eye, Award, Trash2 } from 'lucide-react';
import { StatusBadge, RejectionNote, ActionBtn } from '../SharedComponents';
import { fmtCurrency, fmtDate, isExpired, isExpiringSoon } from '../../utils/formatters';
import { DELETABLE } from '../../utils/constants';

const T = {
  surface: '#ffffff',
  ink: '#1b1d1e',
  inkSoft: '#646a6e',
  inkFaint: '#9aa0a4',
  line: '#e8eaec',
  lineSoft: '#f0f1f3',
  red: '#c1352b', redSoft: '#fdeceb', redLine: '#f8d6d2',
  amber: '#b45309', amberSoft: '#fff7e6', amberLine: '#fde9c8',
};

// Helper function to format amount without currency symbol
const formatAmount = (amount) => {
  return (amount || 0).toLocaleString('en-AE', { 
    minimumFractionDigits: 2, 
    maximumFractionDigits: 2 
  });
};

const QuotationCard = React.memo(({
  quotation,
  selectedCurrency,
  onView,
  onFollowUp,
  onDownload,
  onAward,
  onDelete,
  isExporting
}) => {
  const expired = isExpired(quotation.expiryDate);
  const expiring = !expired && isExpiringSoon(quotation.expiryDate);
  const canDelete = DELETABLE.has(quotation.status);
  const canAward = quotation.status === 'approved';
  const queryDatePassed = quotation.queryDate && new Date(quotation.queryDate) < new Date();

  const customerName = quotation.customerSnapshot?.name || quotation.customer || quotation.customerId?.name || 'N/A';

  // Always show the currency the quotation was SAVED in (q.currency.code),
  // not the dashboard's global currency selector. Fall back to the selected
  // currency only for older records that have no stored currency.
  const quoteCurrency = quotation.currency?.code || selectedCurrency;

  // Each meta block can shrink and never forces overflow on a ~320px phone.
  const metaBlock = { minWidth: 0, flex: '1 1 auto' };
  const metaLabel = { fontSize: '0.56rem', fontWeight: 600, color: T.inkFaint, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2, whiteSpace: 'nowrap' };
  const metaValue = { fontSize: '0.74rem', color: T.inkSoft, fontWeight: 500, whiteSpace: 'nowrap' };

  const flagChip = (bg, color, border) => ({
    fontSize: '0.55rem', fontWeight: 700, color, background: bg,
    padding: '1px 6px', borderRadius: 999, border: `1px solid ${border}`,
    whiteSpace: 'nowrap', letterSpacing: '0.02em',
  });

  return (
    <div style={{
      background: T.surface,
      borderRadius: 14,
      padding: '0.9rem',
      border: `1px solid ${T.line}`,
      boxShadow: '0 1px 2px rgba(20,22,24,0.04), 0 6px 18px -14px rgba(20,22,24,0.10)',
      transition: 'transform 0.18s ease, box-shadow 0.18s ease',
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      boxSizing: 'border-box',
      minWidth: 0,
    }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateY(-1px)';
        e.currentTarget.style.boxShadow = '0 1px 2px rgba(20,22,24,0.04), 0 12px 26px -16px rgba(20,22,24,0.16)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.boxShadow = '0 1px 2px rgba(20,22,24,0.04), 0 6px 18px -14px rgba(20,22,24,0.10)';
      }}
    >
      {/* Row 1: quote # + flags (left, wraps) ........ total (right, fixed) */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem', marginBottom: '0.55rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap', minWidth: 0 }}>
          <span style={{ fontWeight: 600, color: T.ink, fontFamily: "'Inter', monospace", fontSize: '0.74rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>
            {quotation.quotationNumber || '—'}
          </span>
          {expired && <span style={flagChip(T.redSoft, T.red, T.redLine)}>Expired</span>}
          {expiring && <span style={flagChip(T.amberSoft, T.amber, T.amberLine)}>Expiring</span>}
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          {/* Main amount with smaller currency code */}
          <div style={{ whiteSpace: 'nowrap', letterSpacing: '-0.01em' }}>
            <span style={{ fontSize: '0.95rem', fontWeight: 700, color: T.ink }}>
              {formatAmount(quotation.total)}
            </span>
            <span style={{ 
              fontSize: '0.65rem', 
              fontWeight: 400, 
              color: T.inkFaint, 
              marginLeft: '0.25rem',
              letterSpacing: '0.02em'
            }}>
              {quoteCurrency}
            </span>
          </div>
          {/* Converted amount (if different currency) */}
          {(quoteCurrency !== 'AED' && quotation.totalInBaseCurrency != null) && (
            <div style={{ fontSize: '0.66rem', fontWeight: 500, color: T.inkFaint, marginTop: 1, whiteSpace: 'nowrap' }}>
              <span>≈ </span>
              <span style={{ fontSize: '0.66rem', fontWeight: 500 }}>
                {formatAmount(quotation.totalInBaseCurrency)}
              </span>
              <span style={{ 
                fontSize: '0.55rem', 
                fontWeight: 400, 
                color: T.inkFaint, 
                marginLeft: '0.2rem' 
              }}>
                AED
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Row 2: status badge on its own line so it never collides with the total */}
      <div style={{ marginBottom: '0.55rem' }}>
        <StatusBadge status={quotation.status} />
      </div>

      {/* Row 3: customer + project + contact */}
      <div style={{ marginBottom: '0.7rem', minWidth: 0 }}>
        <div style={{ fontWeight: 600, color: T.ink, fontSize: '0.875rem', lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {customerName}
        </div>
        {quotation.projectName && (
          <div style={{ fontSize: '0.76rem', color: T.inkSoft, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {quotation.projectName}
          </div>
        )}
        {quotation.contact && (
          <div style={{ fontSize: '0.7rem', color: T.inkFaint, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {quotation.contact}
          </div>
        )}
        <RejectionNote quotation={quotation} />
      </div>

      {/* Row 4: dates — fluid, wraps to two rows on narrow phones */}
      <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', marginBottom: '0.7rem' }}>
        <div style={metaBlock}>
          <div style={metaLabel}>Submitted</div>
          <div style={metaValue}>{fmtDate(quotation.date)}</div>
        </div>
        <div style={metaBlock}>
          <div style={metaLabel}>Expiry</div>
          <div style={{ ...metaValue, color: expired ? T.red : expiring ? T.amber : T.inkSoft, fontWeight: expired || expiring ? 600 : 500 }}>
            {fmtDate(quotation.expiryDate)}
          </div>
        </div>
        {quotation.queryDate && (
          <div style={metaBlock}>
            <div style={metaLabel}>Follow-up</div>
            <div style={{ ...metaValue, display: 'inline-flex', alignItems: 'center', gap: '0.2rem', color: queryDatePassed ? T.red : T.amber, fontWeight: 600 }}>
              <Calendar size={11} /> {fmtDate(quotation.queryDate)} {queryDatePassed && '⚠'}
            </div>
          </div>
        )}
      </div>

      {/* Row 5: actions + created-by, pinned to the bottom */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap', borderTop: `1px solid ${T.lineSoft}`, paddingTop: '0.65rem', marginTop: 'auto' }}>
        <ActionBtn bg="#e6f0fb" color="#1d63c4" onClick={() => onView(quotation._id)} icon={Eye} label="View" size="small" />
        {canAward && (
          <ActionBtn bg="#e3f5ee" color="#0f7a52" onClick={() => onAward(quotation)} icon={Award} label="Outcome" size="small" />
        )}
        {canDelete && (
          <ActionBtn bg="#fdeceb" color="#c1352b" onClick={() => onDelete(quotation)} icon={Trash2} label="Del" size="small" />
        )}
        {quotation.createdBy?.name && (
          <span style={{ marginLeft: 'auto', fontSize: '0.64rem', color: T.inkFaint, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '40%' }}>
            {quotation.createdBy.name}
          </span>
        )}
      </div>
    </div>
  );
});

QuotationCard.displayName = 'QuotationCard';
export default QuotationCard;