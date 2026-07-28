import React, { useState, useRef, useEffect } from 'react';
import { Save, ChevronDown, Trash2 } from 'lucide-react';

// Stateless except for its own open/closed dropdown state — all data/state
// and the actual "save" modal live in the parent (QuotationTemplate.jsx /
// useQuotation.js), which owns tcSections/termsTemplates. Rendered
// identically from both QuotationLayout.jsx (desktop) and
// MobileQuotationLayout.jsx so there's exactly one place defining what this
// control looks like, even though it's mounted in two files.
//
// A native <select>/<option> can't host a delete button inside an
// individual option — same reason PaymentTermPicker.jsx is a custom listbox
// rather than a native select — so this is too.
export default function TermsTemplateControls({
  templates = [],
  selectedTemplateId = '',
  onSelectTemplate,
  onSaveClick,
  onDeleteTemplate,
  disabled = false,
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

  const selectedTemplate = templates.find((t) => t._id === selectedTemplateId);
  const isDisabled = disabled || templates.length === 0;

  return (
    <div className="no-print" style={styles.row}>
      <div ref={containerRef} style={{ position: 'relative', flex: '1 1 220px' }}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          disabled={isDisabled}
          style={{
            ...styles.select,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: '0.5rem', width: '100%', textAlign: 'left',
            color: selectedTemplate ? '#374151' : '#6b7280',
            cursor: isDisabled ? 'not-allowed' : 'pointer',
            opacity: disabled ? 0.6 : 1,
          }}
        >
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {templates.length === 0 ? 'No saved templates' : (selectedTemplate ? selectedTemplate.name : 'Load a saved template…')}
          </span>
          <ChevronDown size={14} style={{ flexShrink: 0 }} />
        </button>

        {open && !isDisabled && (
          <div style={{
            position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 20,
            background: 'white', border: '1px solid #e2e8f0', borderRadius: '0.5rem',
            boxShadow: '0 8px 20px rgba(0,0,0,0.12)',
            // ~40px per row — caps the panel at 8 visible rows before it
            // scrolls, instead of growing to fit every saved template.
            maxHeight: '320px', overflowY: 'auto',
          }}>
            <div
              onClick={() => { onSelectTemplate?.(''); setOpen(false); }}
              style={{ padding: '0.5rem 0.625rem', cursor: 'pointer', color: '#6b7280', fontSize: '0.8125rem', borderBottom: '1px solid #f1f5f9' }}
            >
              Load a saved template…
            </div>
            {templates.map((t) => (
              <div
                key={t._id}
                onClick={() => { onSelectTemplate?.(t._id); setOpen(false); }}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  gap: '0.5rem', padding: '0.5rem 0.625rem', cursor: 'pointer',
                  borderBottom: '1px solid #f1f5f9',
                  background: t._id === selectedTemplateId ? '#eef2ff' : 'transparent',
                }}
              >
                <span style={{ fontSize: '0.8125rem', color: '#374151', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {t.name}
                </span>
                {onDeleteTemplate && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onDeleteTemplate(t._id); }}
                    title="Delete this saved template"
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      padding: '0.3rem', borderRadius: '0.375rem', border: '1px solid #fecaca',
                      background: '#fef2f2', color: '#ef4444', cursor: 'pointer', flexShrink: 0,
                    }}
                  >
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={onSaveClick}
        disabled={disabled}
        style={{ ...styles.saveBtn, opacity: disabled ? 0.6 : 1, cursor: disabled ? 'not-allowed' : 'pointer' }}
      >
        <Save size={14} /> Save as template
      </button>
    </div>
  );
}

const styles = {
  row: {
    display: 'flex',
    gap: '0.5rem',
    alignItems: 'center',
    marginBottom: '0.75rem',
    flexWrap: 'wrap',
  },
  select: {
    padding: '0.5rem 0.75rem',
    borderRadius: '0.5rem',
    border: '1px solid #e2e8f0',
    fontSize: '0.8125rem',
    color: '#374151',
    background: 'white',
  },
  saveBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.375rem',
    padding: '0.5rem 0.875rem',
    borderRadius: '0.5rem',
    border: '1px solid #6366f1',
    background: '#eef2ff',
    color: '#4338ca',
    fontSize: '0.8125rem',
    fontWeight: 600,
    whiteSpace: 'nowrap',
  },
};
