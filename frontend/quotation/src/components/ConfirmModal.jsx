import React from 'react';
import { AlertTriangle, X } from 'lucide-react';

const ConfirmModal = ({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
  loading = false,
  danger = false,
  icon: Icon = AlertTriangle,
  children
}) => {
  if (!open) return null;

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget && !loading) {
      onCancel();
    }
  };

  return (
    <div
      style={styles.overlay}
      onClick={handleOverlayClick}
    >
      <div style={styles.modal}>
        <div style={styles.header}>
          <div style={{ ...styles.iconContainer, backgroundColor: danger ? '#fee2e2' : '#e0e7ff' }}>
            <Icon size={20} color={danger ? '#dc2626' : '#4f46e5'} />
          </div>
          <h3 style={styles.title}>{title}</h3>
          <button onClick={onCancel} style={styles.closeBtn} disabled={loading}>
            <X size={18} />
          </button>
        </div>

        <div style={styles.body}>
          {message && <p style={styles.message}>{message}</p>}
          {children}
        </div>

        <div style={styles.footer}>
          <button
            onClick={onCancel}
            disabled={loading}
            style={styles.cancelBtn}
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            style={{
              ...styles.confirmBtn,
              backgroundColor: danger ? '#dc2626' : '#4f46e5',
              ...(loading && styles.disabledBtn)
            }}
          >
            {loading ? (
              <>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: 'spin 1s linear infinite' }}>
                  <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="8">
                    <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="1s" repeatCount="indefinite"/>
                  </circle>
                </svg>
                Processing...
              </>
            ) : (
              confirmLabel
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

const styles = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    backdropFilter: 'blur(4px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  modal: {
    backgroundColor: 'white',
    borderRadius: '1rem',
    width: '90%',
    maxWidth: '420px',
    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    padding: '1rem 1.25rem',
    borderBottom: '1px solid #e5e7eb',
    position: 'relative',
  },
  iconContainer: {
    width: '32px',
    height: '32px',
    borderRadius: '50%',
    backgroundColor: '#fee2e2',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    margin: 0,
    fontSize: '1rem',
    fontWeight: '600',
    color: '#111827',
  },
  closeBtn: {
    width: '28px',
    height: '28px',
    borderRadius: '6px',
    border: 'none',
    backgroundColor: '#f3f4f6',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'background-color 0.2s',
  },
  body: {
    padding: '1.25rem',
  },
  message: {
    margin: 0,
    fontSize: '0.875rem',
    color: '#374151',
    lineHeight: 1.5,
  },
  footer: {
    display: 'flex',
    gap: '0.75rem',
    justifyContent: 'flex-end',
    padding: '1rem 1.25rem',
    borderTop: '1px solid #e5e7eb',
    backgroundColor: '#f9fafb',
  },
  cancelBtn: {
    padding: '0.5rem 1rem',
    borderRadius: '0.5rem',
    border: '1px solid #e5e7eb',
    backgroundColor: 'white',
    color: '#374151',
    fontWeight: '500',
    cursor: 'pointer',
    fontSize: '0.875rem',
    transition: 'all 0.2s',
  },
  confirmBtn: {
    padding: '0.5rem 1rem',
    borderRadius: '0.5rem',
    border: 'none',
    color: 'white',
    fontWeight: '500',
    cursor: 'pointer',
    fontSize: '0.875rem',
    transition: 'all 0.2s',
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
  },
  disabledBtn: {
    opacity: 0.6,
    cursor: 'not-allowed',
  },
};

// Add animation styles to your global CSS or component
const globalStyles = `
  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
`;

// Inject styles if not already present
if (typeof document !== 'undefined' && !document.querySelector('#confirm-modal-styles')) {
  const styleSheet = document.createElement('style');
  styleSheet.id = 'confirm-modal-styles';
  styleSheet.textContent = globalStyles;
  document.head.appendChild(styleSheet);
}

export default ConfirmModal;