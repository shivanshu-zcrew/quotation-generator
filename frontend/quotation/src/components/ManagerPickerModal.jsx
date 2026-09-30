import React, { useState, useEffect } from 'react';
import { X, Loader } from 'lucide-react';
import { authAPI } from '../services/api';

// "Select Manager to Notify" dialog shown when a quotation is submitted for
// review (not when it's only saved as a draft). Loads the active ops
// managers itself each time it opens; onConfirm receives [managerEmail].
export default function ManagerPickerModal({ isOpen, onClose, onConfirm, onLoadError, confirmLabel = 'Confirm & Save' }) {
  const [managers, setManagers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState(null);

  useEffect(() => {
    if (!isOpen) return undefined;
    let cancelled = false;
    setSelectedId(null);
    setLoading(true);
    authAPI.getOpsManagers()
      .then((res) => { if (!cancelled) setManagers(res.data?.managers || []); })
      .catch(() => { if (!cancelled) { onLoadError?.("Failed to load managers"); onClose(); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div style={managerModalStyles.overlay} onClick={onClose}>
      <div style={managerModalStyles.dialog} onClick={(e) => e.stopPropagation()}>
        <div style={managerModalStyles.header}>
          <span style={managerModalStyles.title}>Select Manager to Notify</span>
          <button style={managerModalStyles.closeBtn} onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <p style={managerModalStyles.subtitle}>
          The quotation will be visible to all managers. Choose who receives the email notification.
        </p>

        <div style={managerModalStyles.list}>
          {loading ? (
            <div style={managerModalStyles.loading}>
              <Loader size={20} style={{ animation: 'spin 1s linear infinite' }} />
              <span>Loading managers…</span>
            </div>
          ) : managers.length === 0 ? (
            <p style={managerModalStyles.empty}>No active ops managers found.</p>
          ) : (
            managers.map((mgr) => (
              <label key={mgr._id} style={{
                ...managerModalStyles.option,
                background: selectedId === mgr._id ? '#eff6ff' : 'transparent',
                borderColor: selectedId === mgr._id ? '#3b82f6' : '#e2e8f0',
              }}>
                <input
                  type="radio"
                  name="managerPick"
                  value={mgr._id}
                  checked={selectedId === mgr._id}
                  onChange={() => setSelectedId(mgr._id)}
                  style={{ accentColor: '#3b82f6' }}
                />
                <div>
                  <div style={managerModalStyles.mgrName}>{mgr.name}</div>
                  <div style={managerModalStyles.mgrEmail}>{mgr.email}</div>
                </div>
              </label>
            ))
          )}
        </div>

        <div style={managerModalStyles.footer}>
          <button style={managerModalStyles.cancelBtn} onClick={onClose}>Cancel</button>
          <button
            style={{
              ...managerModalStyles.confirmBtn,
              opacity: !selectedId ? 0.5 : 1,
              cursor: !selectedId ? 'not-allowed' : 'pointer',
            }}
            disabled={!selectedId || loading}
            onClick={() => {
              const mgr = managers.find((m) => m._id === selectedId);
              onConfirm(mgr ? [mgr.email] : []);
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

const managerModalStyles = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' },
  dialog: { background: '#fff', borderRadius: '0.75rem', width: '100%', maxWidth: '440px', boxShadow: '0 20px 60px rgba(0,0,0,0.2)', display: 'flex', flexDirection: 'column', maxHeight: '90vh' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1.25rem 1.25rem 0' },
  title: { fontWeight: 700, fontSize: '1.0625rem', color: '#111827' },
  closeBtn: { background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', display: 'flex', alignItems: 'center', padding: '0.25rem' },
  subtitle: { fontSize: '0.8125rem', color: '#6b7280', margin: '0.5rem 1.25rem 0.75rem', lineHeight: 1.5 },
  list: { overflowY: 'auto', padding: '0 1.25rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '260px' },
  loading: { display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#6b7280', fontSize: '0.875rem', padding: '1rem 0' },
  empty: { color: '#9ca3af', fontSize: '0.875rem', textAlign: 'center', padding: '1rem 0' },
  option: { display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.625rem 0.875rem', borderRadius: '0.5rem', border: '1.5px solid', cursor: 'pointer', transition: 'all 0.15s' },
  mgrName: { fontWeight: 600, fontSize: '0.9rem', color: '#111827' },
  mgrEmail: { fontSize: '0.8rem', color: '#6b7280' },
  footer: { display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', padding: '1rem 1.25rem', borderTop: '1px solid #f1f5f9', marginTop: '0.75rem' },
  cancelBtn: { padding: '0.5rem 1.125rem', borderRadius: '0.5rem', border: '1.5px solid #e2e8f0', background: '#fff', color: '#374151', fontWeight: 600, cursor: 'pointer', fontSize: '0.875rem' },
  confirmBtn: { padding: '0.5rem 1.25rem', borderRadius: '0.5rem', border: 'none', background: '#2563eb', color: '#fff', fontWeight: 700, fontSize: '0.875rem', transition: 'opacity 0.15s' },
};
