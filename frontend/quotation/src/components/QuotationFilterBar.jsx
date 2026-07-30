// components/QuotationFilterBar.jsx
// Reusable date-range filter popover for quotation dashboards.
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Calendar } from 'lucide-react';

const QuotationFilterBar = ({
  T,
  FONT_STACK,
  isMobile = false,
  fromDate = '',
  toDate = '',
  onApply,
}) => {
  const [open, setOpen] = useState(false);
  const [localFrom, setLocalFrom] = useState(fromDate);
  const [localTo, setLocalTo] = useState(toDate);

  const popRef = useRef(null);

  const openPopover = useCallback(() => {
    setLocalFrom(fromDate);
    setLocalTo(toDate);
    setOpen(true);
  }, [fromDate, toDate]);

  useEffect(() => {
    const handler = (e) => {
      if (popRef.current && !popRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const activeCount = [fromDate, toDate].filter(Boolean).length;

  const apply = () => {
    onApply({ fromDate: localFrom, toDate: localTo });
    setOpen(false);
  };

  const clearAll = () => {
    setLocalFrom(''); setLocalTo('');
    onApply({ fromDate: '', toDate: '' });
    setOpen(false);
  };

  const inputStyle = {
    flex: 1, padding: '0.5rem', border: `1px solid ${T.line}`, borderRadius: T.radiusSm,
    fontSize: '0.75rem', outline: 'none', fontFamily: FONT_STACK, color: T.ink, background: T.surface,
  };

  return (
    <div style={{ position: 'relative' }} ref={popRef}>
      <button
        onClick={() => (open ? setOpen(false) : openPopover())}
        style={{
          display: 'flex', alignItems: 'center', gap: '0.4rem',
          height: isMobile ? 38 : 36, padding: '0 0.75rem',
          border: `1px solid ${activeCount ? T.accent : T.line}`,
          borderRadius: T.radiusSm,
          background: activeCount ? T.accentSoft : T.canvas,
          color: activeCount ? T.accentInk : T.inkSoft,
          fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer',
          fontFamily: FONT_STACK, whiteSpace: 'nowrap',
        }}
      >
        <Calendar size={14} />
        {!isMobile && 'Date Filter'}{activeCount > 0 ? ` (${activeCount})` : ''}
      </button>

      {open && (
        <div
          style={{
            position: isMobile ? 'fixed' : 'absolute',
            ...(isMobile
              ? { bottom: 0, left: 0, right: 0, borderRadius: '16px 16px 0 0' }
              : { top: 'calc(100% + 8px)', right: 0, minWidth: 280, borderRadius: T.radius }),
            backgroundColor: T.surface,
            border: `1px solid ${T.line}`,
            boxShadow: T.shadow,
            padding: '1rem',
            zIndex: 200,
          }}
        >
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: T.ink, marginBottom: '0.4rem' }}>
              Date Range
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <input type="date" value={localFrom} onChange={(e) => setLocalFrom(e.target.value)} style={inputStyle} />
              <span style={{ color: T.inkSoft, fontSize: '0.72rem' }}>to</span>
              <input type="date" value={localTo} onChange={(e) => setLocalTo(e.target.value)} style={inputStyle} />
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
            <button onClick={clearAll} style={{ padding: '0.4rem 0.8rem', background: T.canvas, border: `1px solid ${T.line}`, borderRadius: T.radiusSm, fontSize: '0.75rem', cursor: 'pointer', fontFamily: FONT_STACK, color: T.inkSoft }}>
              Clear
            </button>
            <button onClick={apply} style={{ padding: '0.4rem 0.8rem', background: T.accent, color: '#fff', border: 'none', borderRadius: T.radiusSm, fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', fontFamily: FONT_STACK }}>
              Apply
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default QuotationFilterBar;
