import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Trash2 } from 'lucide-react';

// A native <select>/<option> can't host a button inside an individual
// option — this custom listbox exists specifically so every saved payment
// term can have its own remove button, not just whichever one happens to
// be currently selected.
export default function PaymentTermPicker({
  options = [],
  selectedId = '',
  onSelect,
  onDelete,
  inputStyle = {},
  placeholder = '+ Add new, or pick a saved term below',
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const selectedOption = options.find((o) => o._id === selectedId);

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          ...inputStyle,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: '0.5rem', cursor: 'pointer', color: selectedOption ? '#111827' : '#6b7280',
          textAlign: 'left', width: '100%',
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {selectedOption ? selectedOption.value : placeholder}
        </span>
        <ChevronDown size={14} style={{ flexShrink: 0 }} />
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 20,
          background: 'white', border: '1px solid #e2e8f0', borderRadius: '0.5rem',
          boxShadow: '0 8px 20px rgba(0,0,0,0.12)',
          // ~40px per row (padding + text/delete-button height + border) — caps
          // the panel at 4 visible rows before it scrolls, instead of growing
          // to fit every saved term.
          maxHeight: '160px', overflowY: 'auto',
        }}>
          {options.length === 0 ? (
            <div style={{ padding: '0.625rem 0.75rem', color: '#9ca3af', fontSize: '0.8rem' }}>
              No saved payment terms
            </div>
          ) : (
            options.map((opt) => (
              <div
                key={opt._id}
                onClick={() => { onSelect?.(opt._id); setOpen(false); }}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  gap: '0.5rem', padding: '0.5rem 0.625rem', cursor: 'pointer',
                  borderBottom: '1px solid #f1f5f9',
                  background: opt._id === selectedId ? '#eff6ff' : 'transparent',
                }}
              >
                <span style={{ fontSize: '0.8125rem', color: '#374151', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {opt.value}
                </span>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onDelete?.(opt._id); }}
                  title="Remove this saved payment term"
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    padding: '0.3rem', borderRadius: '0.375rem', border: '1px solid #fecaca',
                    background: '#fef2f2', color: '#ef4444', cursor: 'pointer', flexShrink: 0,
                  }}
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
