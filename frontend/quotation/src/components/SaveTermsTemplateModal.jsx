import React, { useState } from 'react';

// Prompts for a name and saves the current Terms & Conditions content as a
// new reusable template. Shared between QuotationTemplate.jsx (create) and
// ViewQuotationScreen.jsx (edit existing) so there's exactly one modal
// implementation regardless of which screen is saving a template.
export default function SaveTermsTemplateModal({ onClose, onSave, saving }) {
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = () => {
    const trimmed = name.trim();
    if (!trimmed) { setError('Template name is required'); return; }
    if (trimmed.length > 100) { setError('Name must be 100 characters or fewer'); return; }
    setError('');
    onSave(trimmed);
  };

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.dialog} onClick={(e) => e.stopPropagation()}>
        <h3 style={styles.title}>Save as Template</h3>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Standard Delivery Terms"
          style={styles.input}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); }}
        />
        {error && <p style={styles.error}>{error}</p>}
        <div style={styles.actions}>
          <button type="button" onClick={onClose} disabled={saving} style={styles.cancelBtn}>
            Cancel
          </button>
          <button type="button" onClick={handleSubmit} disabled={saving} style={styles.saveBtn}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

const styles = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' },
  dialog: { background: '#fff', borderRadius: '0.75rem', width: '100%', maxWidth: '400px', boxShadow: '0 20px 60px rgba(0,0,0,0.2)', padding: '1.25rem' },
  title: { margin: '0 0 0.75rem', fontWeight: 700, fontSize: '1.0625rem', color: '#111827' },
  input: { width: '100%', boxSizing: 'border-box', padding: '0.625rem 0.875rem', borderRadius: '0.5rem', border: '1.5px solid #e2e8f0', fontSize: '0.875rem' },
  error: { color: '#dc2626', fontSize: '0.8rem', margin: '0.5rem 0 0' },
  actions: { display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1.25rem' },
  cancelBtn: { padding: '0.5rem 1.125rem', borderRadius: '0.5rem', border: '1.5px solid #e2e8f0', background: '#fff', color: '#374151', fontWeight: 600, cursor: 'pointer', fontSize: '0.875rem' },
  saveBtn: { padding: '0.5rem 1.25rem', borderRadius: '0.5rem', border: 'none', background: '#2563eb', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: '0.875rem' },
};
