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

  return (
    <div style={{
      background: 'white',
      borderRadius: '12px',
      padding: '1rem',
      marginBottom: '0.75rem',
      boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
      border: '1px solid #f1f5f9',
      transition: 'transform 0.2s, box-shadow 0.2s',
      cursor: 'pointer'
    }}
    onMouseEnter={(e) => {
      e.currentTarget.style.transform = 'translateY(-2px)';
      e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
    }}
    onMouseLeave={(e) => {
      e.currentTarget.style.transform = 'translateY(0)';
      e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';
    }}
    >
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.25rem' }}>
            <span style={{ fontWeight: 700, color: '#0f172a', fontFamily: 'monospace', fontSize: '0.85rem' }}>
              {quotation.quotationNumber || '—'}
            </span>
            <StatusBadge status={quotation.status} />
            {expired && <span style={{ fontSize: '0.6rem', fontWeight: 700, color: '#dc2626', background: '#fef2f2', padding: '2px 6px', borderRadius: 999 }}>Expired</span>}
            {expiring && <span style={{ fontSize: '0.6rem', fontWeight: 700, color: '#d97706', background: '#fffbeb', padding: '2px 6px', borderRadius: 999 }}>Expiring Soon</span>}
          </div>
        </div>
        <div style={{ fontSize: '1rem', fontWeight: 700, color: '#0f172a' }}>
          {fmtCurrency(quotation.total, selectedCurrency)}
        </div>
      </div>

      {/* Customer Info */}
      <div style={{ marginBottom: '0.5rem' }}>
        <div style={{ fontWeight: 600, color: '#0f172a', fontSize: '0.875rem' }}>
          {quotation.customerSnapshot?.name || quotation.customer || quotation.customerId?.name || 'N/A'}
        </div>
        {quotation.contact && (
          <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: 2 }}>{quotation.contact}</div>
        )}
        <RejectionNote quotation={quotation} />
      </div>

      {/* Project Name */}
      {quotation.projectName && (
        <div style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: '0.5rem' }}>
          📋 {quotation.projectName}
        </div>
      )}

      {/* Dates */}
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

      {/* Created By */}
      <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginBottom: '0.75rem' }}>
        Created by: {quotation.createdBy?.name || '—'}
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', borderTop: '1px solid #f1f5f9', paddingTop: '0.75rem' }}>
        <ActionBtn bg="#e0f2fe" color="#0369a1" onClick={() => onView(quotation._id)} icon={Eye} label="View" size="small" />
        {!['awarded', 'not_awarded'].includes(quotation.status) && (
          <ActionBtn 
            bg={quotation.queryDate ? '#fef3c7' : '#f1f5f9'} 
            color={quotation.queryDate ? '#92400e' : '#64748b'} 
            onClick={() => onFollowUp(quotation)} 
            icon={Calendar} 
            label="Follow-up" 
            size="small" 
          />
        )}
        <ActionBtn 
          bg={isExporting ? '#f1f5f9' : '#f0fdf4'} 
          color={isExporting ? '#94a3b8' : '#166534'} 
          onClick={() => !isExporting && onDownload(quotation)} 
          disabled={isExporting} 
          icon={isExporting ? Loader : Download} 
          label={isExporting ? '…' : 'PDF'} 
          size="small" 
        />
        {canAward && (
          <ActionBtn bg="#d1fae5" color="#065f46" onClick={() => onAward(quotation)} icon={Award} label="Outcome" size="small" />
        )}
        {canDelete && (
          <ActionBtn bg="#fff1f2" color="#e11d48" onClick={() => onDelete(quotation)} icon={Trash2} label="Del" size="small" />
        )}
      </div>
    </div>
  );
});

QuotationCard.displayName = 'QuotationCard';
export default QuotationCard;