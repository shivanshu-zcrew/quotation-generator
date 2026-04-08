// QueryDateUpdater.jsx (OPTIMIZED)
import React, { useState, useMemo, useEffect, useCallback, memo } from 'react';
import { Calendar, Search, X, Check, Clock, FileText } from 'lucide-react';
import { useAppStore } from '../services/store';

// Debounce hook
const useDebounce = (value, delay) => {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);

  return debouncedValue;
};

// Memoized quotation item component
const QuotationItem = memo(({ quotation, isSelected, onSelect }) => {
  const handleClick = useCallback(() => onSelect(quotation), [quotation, onSelect]);
  
  return (
    <div
      onClick={handleClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '1rem',
        padding: '0.75rem 1rem',
        margin: '0.25rem 0',
        borderRadius: '0.5rem',
        backgroundColor: isSelected ? '#eff6ff' : 'transparent',
        border: isSelected ? '1px solid #bfdbfe' : '1px solid transparent',
        cursor: 'pointer',
        transition: 'all 0.15s'
      }}
      onMouseEnter={(e) => {
        if (!isSelected) e.currentTarget.style.backgroundColor = '#f8fafc';
      }}
      onMouseLeave={(e) => {
        if (!isSelected) e.currentTarget.style.backgroundColor = 'transparent';
      }}
    >
      <div style={{
        width: 32,
        height: 32,
        borderRadius: '8px',
        background: quotation.queryDate ? '#fef3c7' : '#f1f5f9',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        {quotation.queryDate ? <Calendar size={16} color="#92400e" /> : <FileText size={16} color="#64748b" />}
      </div>
      
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 700, color: '#0f172a', fontSize: '0.875rem' }}>
            {quotation.quotationNumber || '—'}
          </span>
          {quotation.queryDate && (
            <span style={{
              fontSize: '0.7rem',
              background: '#fef3c7',
              color: '#92400e',
              padding: '2px 8px',
              borderRadius: '999px',
              fontWeight: 600
            }}>
              Follow-up: {new Date(quotation.queryDate).toLocaleDateString()}
            </span>
          )}
        </div>
        <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
          {quotation.customerSnapshot?.name || quotation.customer || 'N/A'}
        </div>
        <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>
          {quotation.items?.length || 0} items · Total: {fmtCurrency(quotation.total)}
        </div>
      </div>

      {isSelected && <Check size={18} color="#059669" />}
    </div>
  );
});
QuotationItem.displayName = 'QuotationItem';

const QueryDateUpdater = memo(({ open, onClose, onUpdate, quotations = [], loading = false }) => {
  const [selectedQuotation, setSelectedQuotation] = useState(null);
  const [queryDate, setQueryDate] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [updating, setUpdating] = useState(false);

  const debouncedSearch = useDebounce(searchInput, 350);

  useEffect(() => {
    setSearch(debouncedSearch);
  }, [debouncedSearch]);

  // Filter quotations based on search
  const filteredQuotations = useMemo(() => {
    if (!search.trim()) return quotations;
    
    const t = search.toLowerCase();
    return quotations.filter(q => 
      (q.quotationNumber || '').toLowerCase().includes(t) ||
      (q.customerSnapshot?.name || q.customer || '').toLowerCase().includes(t) ||
      (q.contact || '').toLowerCase().includes(t)
    );
  }, [quotations, search]);

  // Reset state when modal opens/closes
  useEffect(() => {
    if (!open) {
      setSelectedQuotation(null);
      setQueryDate('');
      setSearchInput('');
      setSearch('');
      setUpdating(false);
    }
  }, [open]);

  const handleSelectQuotation = useCallback((quotation) => {
    setSelectedQuotation(quotation);
    if (!queryDate) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      setQueryDate(tomorrow.toISOString().split('T')[0]);
    }
  }, [queryDate]);

  const handleUpdate = useCallback(async () => {
    if (!selectedQuotation || !queryDate || updating) return;
    
    setUpdating(true);
    try {
      await onUpdate(selectedQuotation._id, queryDate);
      onClose();
    } catch (error) {
      console.error('Error updating query date:', error);
    } finally {
      setUpdating(false);
    }
  }, [selectedQuotation, queryDate, updating, onUpdate, onClose]);

  const handleClose = useCallback(() => {
    if (!updating) onClose();
  }, [updating, onClose]);

  const handleOverlayClick = useCallback((e) => {
    if (e.target === e.currentTarget && !updating) onClose();
  }, [updating, onClose]);

  if (!open) return null;

  return (
    <div
      onClick={handleOverlayClick}
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15,23,42,0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        backdropFilter: 'blur(2px)'
      }}
    >
      <div style={{
        backgroundColor: '#fff',
        borderRadius: '1rem',
        width: '90%',
        maxWidth: '700px',
        maxHeight: '90vh',
        overflow: 'hidden',
        boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
        animation: 'modalPop 0.2s ease'
      }}>
        
        {/* Header */}
        <div style={{
          padding: '1.25rem 1.5rem',
          borderBottom: '1px solid #f1f5f9',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: '#f8fafc'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{
              width: 40,
              height: 40,
              borderRadius: '10px',
              background: '#e0f2fe',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Calendar size={20} color="#0369a1" />
            </div>
            <div>
              <h3 style={{ fontSize: '1.125rem', fontWeight: 700, color: '#0f172a', margin: 0 }}>
                Update Query Date
              </h3>
              <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '0.25rem 0 0' }}>
                Select a quotation and set a follow-up date
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            disabled={updating}
            style={{
              background: 'none',
              border: 'none',
              cursor: updating ? 'not-allowed' : 'pointer',
              color: '#94a3b8',
              padding: '0.3rem',
              borderRadius: '0.375rem',
              opacity: updating ? 0.5 : 1
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Search Bar */}
        <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid #f1f5f9' }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            backgroundColor: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: '0.5rem',
            padding: '0.5rem 0.75rem'
          }}>
            <Search size={16} color="#94a3b8" />
            <input
              type="text"
              placeholder="Search by quotation # or customer name..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              style={{
                border: 'none',
                background: 'transparent',
                outline: 'none',
                fontSize: '0.875rem',
                color: '#0f172a',
                width: '100%'
              }}
              autoFocus
            />
          </div>
        </div>

        {/* Quotations List */}
        <div style={{
          maxHeight: '300px',
          overflowY: 'auto',
          padding: '0.5rem 1rem'
        }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: '#94a3b8' }}>
              <Clock size={32} style={{ marginBottom: '0.5rem', opacity: 0.5 }} />
              <p>Loading quotations...</p>
            </div>
          ) : filteredQuotations.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: '#94a3b8' }}>
              <FileText size={32} style={{ marginBottom: '0.5rem', opacity: 0.5 }} />
              <p>{search ? 'No quotations match your search' : 'No quotations available'}</p>
            </div>
          ) : (
            filteredQuotations.map((q) => (
              <QuotationItem
                key={q._id}
                quotation={q}
                isSelected={selectedQuotation?._id === q._id}
                onSelect={handleSelectQuotation}
              />
            ))
          )}
        </div>

        {/* Date Selection */}
        <div style={{
          padding: '1rem 1.5rem',
          borderTop: '1px solid #f1f5f9',
          borderBottom: '1px solid #f1f5f9',
          background: '#fafafa'
        }}>
          <label style={{
            display: 'block',
            fontSize: '0.8rem',
            fontWeight: 600,
            color: '#374151',
            marginBottom: '0.4rem'
          }}>
            Follow-up Date {selectedQuotation && <span style={{ color: '#94a3b8', fontWeight: 400 }}>for {selectedQuotation.quotationNumber}</span>}
          </label>
          <input
            type="date"
            value={queryDate}
            onChange={(e) => setQueryDate(e.target.value)}
            min={new Date().toISOString().split('T')[0]}
            style={{
              width: '100%',
              padding: '0.6rem 0.75rem',
              border: '1.5px solid #e2e8f0',
              borderRadius: '0.5rem',
              fontSize: '0.875rem',
              outline: 'none',
              fontFamily: 'inherit'
            }}
            disabled={!selectedQuotation}
          />
          <p style={{ fontSize: '0.7rem', color: '#94a3b8', margin: '0.4rem 0 0' }}>
            Set a reminder date to follow up on this quotation
          </p>
        </div>

        {/* Footer */}
        <div style={{
          padding: '1rem 1.5rem',
          display: 'flex',
          justifyContent: 'flex-end',
          gap: '0.75rem',
          background: '#f8fafc'
        }}>
          <button
            onClick={handleClose}
            disabled={updating}
            style={{
              padding: '0.6rem 1.25rem',
              backgroundColor: '#fff',
              border: '1.5px solid #e2e8f0',
              borderRadius: '0.5rem',
              fontSize: '0.875rem',
              fontWeight: 600,
              color: '#475569',
              cursor: updating ? 'not-allowed' : 'pointer',
              opacity: updating ? 0.5 : 1
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleUpdate}
            disabled={!selectedQuotation || !queryDate || updating}
            style={{
              padding: '0.6rem 1.5rem',
              backgroundColor: (!selectedQuotation || !queryDate || updating) ? '#e2e8f0' : '#10b981',
              border: 'none',
              borderRadius: '0.5rem',
              fontSize: '0.875rem',
              fontWeight: 700,
              color: (!selectedQuotation || !queryDate || updating) ? '#9ca3af' : '#fff',
              cursor: (!selectedQuotation || !queryDate || updating) ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}
          >
            {updating ? (
              <>
                <Clock size={16} style={{ animation: 'spin 1s linear infinite' }} />
                Updating...
              </>
            ) : (
              <>
                <Check size={16} />
                Update Query Date
              </>
            )}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes modalPop {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
});
QueryDateUpdater.displayName = 'QueryDateUpdater';

// Helper function for currency formatting (memoized)
const fmtCurrency = (n, currency = 'AED') => {
  const symbols = {
    AED: 'د.إ', SAR: '﷼', QAR: '﷼', KWD: 'د.ك',
    BHD: '.د.ب', OMR: '﷼', USD: '$', EUR: '€', GBP: '£'
  };
  const symbol = symbols[currency] || currency;
  return `${symbol} ${(n || 0).toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

export default QueryDateUpdater;