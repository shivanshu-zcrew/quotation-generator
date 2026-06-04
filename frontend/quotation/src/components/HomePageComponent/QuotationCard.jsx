// components/QuotationCard.jsx
import React from 'react';
import { Calendar, Eye, Download, Loader, Award, Trash2, Clock } from 'lucide-react';
import { StatusBadge, RejectionNote, ActionBtn } from '../SharedComponents';
import { fmtCurrency, fmtDate, isExpired, isExpiringSoon } from '../../utils/formatters';
import { DELETABLE } from '../../utils/constants';

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

  const metaLabel = { fontSize: '0.58rem', fontWeight: 600, color: '#9aa0a4', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 1 };
  const metaValue = { fontSize: '0.72rem', color: '#646a6e', fontWeight: 500 };

  return (
    <div style={{
      background: '#ffffff',
      borderRadius: '12px',
      padding: '0.85rem 0.9rem',
      border: '1px solid #e8eaec',
      boxShadow: '0 1px 2px rgba(20,22,24,0.04), 0 6px 18px -14px rgba(20,22,24,0.10)',
      transition: 'transform 0.18s ease, box-shadow 0.18s ease',
      cursor: 'pointer'
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
      {/* Header: quote # + status + flags, total on right */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem', marginBottom: '0.6rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap', minWidth: 0 }}>
          <span style={{ fontWeight: 600, color: '#1b1d1e', fontFamily: "'Inter', monospace", fontSize: '0.76rem' }}>
            {quotation.quotationNumber || '—'}
          </span>
          <StatusBadge status={quotation.status} />
          {expired && <span style={{ fontSize: '0.56rem', fontWeight: 600, color: '#c1352b', background: '#fdeceb', padding: '1px 5px', borderRadius: 999, border: '1px solid #f8d6d2' }}>Expired</span>}
          {expiring && <span style={{ fontSize: '0.56rem', fontWeight: 600, color: '#b45309', background: '#fff7e6', padding: '1px 5px', borderRadius: 999, border: '1px solid #fde9c8' }}>Expiring</span>}
        </div>
        <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#1b1d1e', whiteSpace: 'nowrap', letterSpacing: '-0.01em' }}>
          {fmtCurrency(quotation.total, selectedCurrency)}
        </div>
      </div>

      {/* Customer + project */}
      <div style={{ marginBottom: '0.65rem' }}>
        <div style={{ fontWeight: 600, color: '#1b1d1e', fontSize: '0.875rem', lineHeight: 1.25, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {customerName}
        </div>
        {quotation.projectName && (
          <div style={{ fontSize: '0.76rem', color: '#646a6e', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {quotation.projectName}
          </div>
        )}
        {quotation.contact && (
          <div style={{ fontSize: '0.7rem', color: '#9aa0a4', marginTop: 2 }}>{quotation.contact}</div>
        )}
        <RejectionNote quotation={quotation} />
      </div>

      {/* Dates — labeled, wrap on small widths */}
      <div style={{ display: 'flex', gap: '1.1rem', flexWrap: 'wrap', marginBottom: '0.6rem' }}>
        <div>
          <div style={metaLabel}>Submitted</div>
          <div style={metaValue}>{fmtDate(quotation.date)}</div>
        </div>
        <div>
          <div style={metaLabel}>Expiry</div>
          <div style={{ ...metaValue, color: expired ? '#c1352b' : expiring ? '#b45309' : '#646a6e', fontWeight: expired || expiring ? 600 : 500 }}>
            {fmtDate(quotation.expiryDate)}
          </div>
        </div>
        {quotation.queryDate && (
          <div>
            <div style={metaLabel}>Follow-up</div>
            <div style={{ ...metaValue, display: 'inline-flex', alignItems: 'center', gap: '0.2rem', color: queryDatePassed ? '#c1352b' : '#b45309', fontWeight: 600 }}>
              <Calendar size={11} /> {fmtDate(quotation.queryDate)} {queryDatePassed && '⚠'}
            </div>
          </div>
        )}
      </div>

      {/* Actions + created-by */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap', borderTop: '1px solid #f0f1f3', paddingTop: '0.65rem' }}>
        <ActionBtn bg="#e6f0fb" color="#1d63c4" onClick={() => onView(quotation._id)} icon={Eye} label="View" size="small" />
        {canAward && (
          <ActionBtn bg="#e3f5ee" color="#0f7a52" onClick={() => onAward(quotation)} icon={Award} label="Outcome" size="small" />
        )}
        {canDelete && (
          <ActionBtn bg="#fdeceb" color="#c1352b" onClick={() => onDelete(quotation)} icon={Trash2} label="Del" size="small" />
        )}
        {quotation.createdBy?.name && (
          <span style={{ marginLeft: 'auto', fontSize: '0.66rem', color: '#9aa0a4', whiteSpace: 'nowrap' }}>
            {quotation.createdBy.name}
          </span>
        )}
      </div>
    </div>
  );
});

QuotationCard.displayName = 'QuotationCard';
export default QuotationCard;