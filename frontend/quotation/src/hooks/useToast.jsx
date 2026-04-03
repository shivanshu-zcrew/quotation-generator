// hooks/useToast.jsx
import React, { useState, useCallback, useRef } from 'react';
import { AlertCircle, CheckCircle, X } from 'lucide-react';

/**
 * Custom hook for managing toast notifications
 */
export const useToast = () => {
  const [toasts, setToasts] = useState([]);
  const toastIdRef = useRef(0);

  const addToast = useCallback((message, type = 'info') => {
    const id = ++toastIdRef.current;
    setToasts(prev => [...prev, { id, message, type }]);
    
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  }, []);

  const dismissToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const clearAllToasts = useCallback(() => {
    setToasts([]);
  }, []);

  return {
    toasts,
    addToast,
    dismissToast,
    clearAllToasts,
  };
};

/**
 * Toast display component
 */
export const ToastContainer = ({ toasts, onDismiss }) => {
  if (!toasts || toasts.length === 0) return null;

  const getToastStyles = (type) => {
    switch (type) {
      case 'success':
        return {
          bg: '#f0fdf4',
          border: '#bbf7d0',
          color: '#166534',
          icon: <CheckCircle size={16} />,
        };
      case 'error':
        return {
          bg: '#fef2f2',
          border: '#fecaca',
          color: '#991b1b',
          icon: <AlertCircle size={16} />,
        };
      default:
        return {
          bg: '#eff6ff',
          border: '#bfdbfe',
          color: '#1e40af',
          icon: <AlertCircle size={16} />,
        };
    }
  };

  return (
    <div style={{
      position: 'fixed',
      bottom: '1.5rem',
      right: '1.5rem',
      zIndex: 9999,
      display: 'flex',
      flexDirection: 'column',
      gap: '0.5rem',
    }}>
      {toasts.map(toast => {
        const styles = getToastStyles(toast.type);
        
        return (
          <div
            key={toast.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              backgroundColor: styles.bg,
              border: `1px solid ${styles.border}`,
              color: styles.color,
              padding: '0.75rem 1rem',
              borderRadius: '10px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
              minWidth: '280px',
              maxWidth: '400px',
              animation: 'slideIn 0.2s ease',
              fontFamily: "'Segoe UI', system-ui, sans-serif",
            }}
          >
            {styles.icon}
            <span style={{ fontSize: '0.875rem', fontWeight: 500, flex: 1 }}>
              {toast.message}
            </span>
            <button
              onClick={() => onDismiss(toast.id)}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'inherit',
                padding: 0,
                opacity: 0.6,
                fontSize: '1rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
};

// Add the keyframe animation to your global styles or component
const style = document.createElement('style');
style.textContent = `
  @keyframes slideIn {
    from {
      transform: translateX(20px);
      opacity: 0;
    }
    to {
      transform: translateX(0);
      opacity: 1;
    }
  }
`;
document.head.appendChild(style);

export default useToast;