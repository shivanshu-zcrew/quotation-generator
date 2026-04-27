// components/LoadingOverlay.jsx
import React, { useState, useEffect } from 'react';
import { Loader, CheckCircle, FileImage, Upload } from 'lucide-react';

/**
 * Loading Dots Animation Component
 */
const LoadingDots = () => {
  const [dots, setDots] = useState('');
  
  useEffect(() => {
    const interval = setInterval(() => {
      setDots(prev => {
        if (prev.length >= 3) return '';
        return prev + '.';
      });
    }, 400);
    
    return () => clearInterval(interval);
  }, []);
  
  return <span style={{ minWidth: '24px', display: 'inline-block', textAlign: 'left' }}>{dots}</span>;
};

/**
 * Rotating dots animation
 */
const RotatingDots = () => {
  const [dots, setDots] = useState('●');
  
  useEffect(() => {
    const frames = ['●', '◐', '◑', '◒', '◓'];
    let index = 0;
    const interval = setInterval(() => {
      index = (index + 1) % frames.length;
      setDots(frames[index]);
    }, 300);
    
    return () => clearInterval(interval);
  }, []);
  
  return <span style={{ fontSize: '20px', color: '#6366f1' }}>{dots}</span>;
};

/**
 * Reusable Loading Overlay Component
 * Supports different types: 'saving', 'pdf', 'upload', 'processing'
 */
export const LoadingOverlay = ({ 
  type = 'saving', 
  message = 'Processing...',
  imageCount = 0,
  title,
  subtitle,
  onCancel,
  showCancel = false
}) => {
  
  // Configuration based on type
  const config = {
    saving: {
      title: title || 'Saving Quotation',
      icon: <Loader size={48} color="#10b981" />,
      color: '#10b981',
      defaultMessage: 'Saving your changes...'
    },
    pdf: {
      title: title || 'Generating PDF',
      icon: <Loader size={48} color="#0369a1" />,
      color: '#0369a1',
      defaultMessage: 'Preparing your PDF...'
    },
    upload: {
      title: title || 'Uploading Files',
      icon: <Upload size={48} color="#f59e0b" />,
      color: '#f59e0b',
      defaultMessage: 'Uploading your files...'
    },
    processing: {
      title: title || 'Processing',
      icon: <Loader size={48} color="#6366f1" />,
      color: '#6366f1',
      defaultMessage: 'Processing your request...'
    }
  };

  const currentConfig = config[type] || config.saving;
  const displayMessage = message || currentConfig.defaultMessage;

  return (
    <div style={styles.overlay}>
      <div style={styles.content}>
        {/* Icon / Spinner */}
        <div style={styles.iconContainer}>
          <div style={styles.spinnerWrapper}>
            {currentConfig.icon}
            <div style={{ ...styles.spinnerRing, borderColor: `${currentConfig.color}20`, borderTopColor: currentConfig.color }} />
          </div>
        </div>

        {/* Title */}
        <div style={styles.title}>{currentConfig.title}</div>

        {/* Message with animated dots */}
        <div style={styles.messageContainer}>
          <span style={styles.messageText}>{displayMessage}</span>
          <LoadingDots />
        </div>

        {/* Subtitle (optional) */}
        {subtitle && (
          <div style={styles.subtitle}>{subtitle}</div>
        )}

        {/* Image Count Info */}
        {imageCount > 0 && (
          <div style={styles.imageInfo}>
            <FileImage size={14} />
            <span>Processing {imageCount} image{imageCount !== 1 ? 's' : ''}</span>
            <RotatingDots />
          </div>
        )}

        {/* Cancel Button */}
        {showCancel && onCancel && (
          <button onClick={onCancel} style={styles.cancelBtn}>
            Cancel
          </button>
        )}

        {/* Note */}
        <div style={styles.note}>
          {type === 'pdf' 
            ? 'This may take a moment depending on image count'
            : type === 'saving'
            ? 'Please don\'t close the browser'
            : 'Please wait while we process your request'}
        </div>
      </div>
    </div>
  );
};

// ============================================================
// Simple Loading Overlay (minimal version)
// ============================================================

export const SimpleLoadingOverlay = ({ 
  type = 'saving', 
  message = 'Processing...',
  onCancel,
  showCancel = false
}) => {
  
  const config = {
    saving: { title: 'Saving Changes', color: '#10b981' },
    pdf: { title: 'Generating PDF', color: '#0369a1' },
    upload: { title: 'Uploading Files', color: '#f59e0b' },
    processing: { title: 'Processing', color: '#6366f1' }
  };

  const currentConfig = config[type] || config.saving;

  return (
    <div style={styles.overlay}>
      <div style={styles.simpleContent}>
        <div style={styles.spinnerWrapper}>
          <Loader size={40} color={currentConfig.color} />
          <div style={{ ...styles.simpleSpinnerRing, borderColor: `${currentConfig.color}20`, borderTopColor: currentConfig.color }} />
        </div>
        <div style={styles.simpleTitle}>{currentConfig.title}</div>
        <div style={styles.simpleMessage}>
          {message}
          <LoadingDots />
        </div>
        {showCancel && onCancel && (
          <button onClick={onCancel} style={styles.simpleCancelBtn}>
            Cancel
          </button>
        )}
      </div>
    </div>
  );
};

// ============================================================
// Inline Loading Spinner (for buttons)
// ============================================================

export const LoadingSpinner = ({ size = 16, color = '#ffffff' }) => (
  <div style={{ 
    width: size, 
    height: size, 
    border: `2px solid ${color}30`, 
    borderTopColor: color, 
    borderRadius: '50%', 
    animation: 'spin 0.8s linear infinite' 
  }} />
);

// ============================================================
// Skeleton Loader Component
// ============================================================

export const SkeletonLoader = ({ type = 'card', count = 1 }) => {
  if (type === 'card') {
    return (
      <div style={styles.skeletonCard}>
        <div style={styles.skeletonAvatar} />
        <div style={styles.skeletonLines}>
          <div style={styles.skeletonLine} />
          <div style={styles.skeletonLineSmall} />
        </div>
      </div>
    );
  }
  
  if (type === 'table') {
    return (
      <div style={styles.skeletonTable}>
        <div style={styles.skeletonTableHeader} />
        {Array(count).fill(0).map((_, i) => (
          <div key={i} style={styles.skeletonTableRow}>
            <div style={styles.skeletonTableCell} />
            <div style={styles.skeletonTableCell} />
            <div style={styles.skeletonTableCell} />
            <div style={styles.skeletonTableCell} />
          </div>
        ))}
      </div>
    );
  }
  
  return null;
};

// ============================================================
// Styles
// ============================================================

const styles = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    backdropFilter: 'blur(4px)',
    zIndex: 10000,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  
  content: {
    backgroundColor: 'white',
    borderRadius: '1.5rem',
    padding: '2rem 2.5rem',
    textAlign: 'center',
    boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
    minWidth: '320px',
    maxWidth: '420px'
  },
  
  simpleContent: {
    backgroundColor: 'white',
    borderRadius: '1rem',
    padding: '1.5rem 2rem',
    textAlign: 'center',
    boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
    minWidth: '280px',
    maxWidth: '360px'
  },
  
  iconContainer: {
    marginBottom: '1.5rem',
    position: 'relative',
    display: 'inline-flex',
    justifyContent: 'center',
    width: '100%'
  },
  
  spinnerWrapper: {
    position: 'relative',
    display: 'inline-flex'
  },
  
  spinnerRing: {
    position: 'absolute',
    top: -4,
    left: -4,
    right: -4,
    bottom: -4,
    borderRadius: '50%',
    borderWidth: '3px',
    borderStyle: 'solid',
    animation: 'spin 1s linear infinite'
  },
  
  simpleSpinnerRing: {
    position: 'absolute',
    top: -3,
    left: -3,
    right: -3,
    bottom: -3,
    borderRadius: '50%',
    borderWidth: '2px',
    borderStyle: 'solid',
    animation: 'spin 1s linear infinite'
  },
  
  title: {
    fontWeight: '800',
    fontSize: '1.25rem',
    color: '#0f172a',
    marginBottom: '1rem'
  },
  
  simpleTitle: {
    fontWeight: '700',
    fontSize: '1rem',
    color: '#0f172a',
    marginBottom: '0.75rem'
  },
  
  messageContainer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '2px',
    marginBottom: '0.5rem'
  },
  
  messageText: {
    fontSize: '0.875rem',
    color: '#64748b'
  },
  
  subtitle: {
    fontSize: '0.75rem',
    color: '#94a3b8',
    marginTop: '0.5rem'
  },
  
  simpleMessage: {
    fontSize: '0.8rem',
    color: '#64748b',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '2px'
  },
  
  imageInfo: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.5rem',
    fontSize: '0.75rem',
    color: '#64748b',
    marginTop: '1rem',
    padding: '0.5rem',
    backgroundColor: '#f8fafc',
    borderRadius: '0.5rem'
  },
  
  cancelBtn: {
    marginTop: '1rem',
    padding: '0.5rem 1rem',
    backgroundColor: '#f1f5f9',
    color: '#64748b',
    border: 'none',
    borderRadius: '0.5rem',
    fontSize: '0.75rem',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'all 0.2s'
  },
  
  simpleCancelBtn: {
    marginTop: '0.75rem',
    padding: '0.4rem 0.8rem',
    backgroundColor: '#f1f5f9',
    color: '#64748b',
    border: 'none',
    borderRadius: '0.5rem',
    fontSize: '0.7rem',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'all 0.2s'
  },
  
  note: {
    fontSize: '0.7rem',
    color: '#94a3b8',
    marginTop: '1rem',
    paddingTop: '0.75rem',
    borderTop: '1px solid #e2e8f0'
  },
  
  // Skeleton styles
  skeletonCard: {
    display: 'flex',
    alignItems: 'center',
    gap: '1rem',
    padding: '1rem',
    backgroundColor: 'white',
    borderRadius: '0.75rem',
    border: '1px solid #e2e8f0'
  },
  
  skeletonAvatar: {
    width: '40px',
    height: '40px',
    borderRadius: '50%',
    background: 'linear-gradient(90deg,#f1f5f9 25%,#e2e8f0 50%,#f1f5f9 75%)',
    backgroundSize: '200% 100%',
    animation: 'skeleton 1.4s ease infinite'
  },
  
  skeletonLines: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem'
  },
  
  skeletonLine: {
    height: '14px',
    width: '80%',
    borderRadius: '6px',
    background: 'linear-gradient(90deg,#f1f5f9 25%,#e2e8f0 50%,#f1f5f9 75%)',
    backgroundSize: '200% 100%',
    animation: 'skeleton 1.4s ease infinite'
  },
  
  skeletonLineSmall: {
    height: '12px',
    width: '50%',
    borderRadius: '6px',
    background: 'linear-gradient(90deg,#f1f5f9 25%,#e2e8f0 50%,#f1f5f9 75%)',
    backgroundSize: '200% 100%',
    animation: 'skeleton 1.4s ease infinite'
  },
  
  skeletonTable: {
    border: '1px solid #e2e8f0',
    borderRadius: '0.75rem',
    overflow: 'hidden'
  },
  
  skeletonTableHeader: {
    height: '40px',
    backgroundColor: '#f8fafc',
    borderBottom: '1px solid #e2e8f0'
  },
  
  skeletonTableRow: {
    display: 'flex',
    padding: '0.85rem 1rem',
    borderBottom: '1px solid #f1f5f9',
    gap: '1rem'
  },
  
  skeletonTableCell: {
    flex: 1,
    height: '14px',
    borderRadius: '6px',
    background: 'linear-gradient(90deg,#f1f5f9 25%,#e2e8f0 50%,#f1f5f9 75%)',
    backgroundSize: '200% 100%',
    animation: 'skeleton 1.4s ease infinite'
  }
};

// Add animations to document
if (typeof document !== 'undefined') {
  const styleSheet = document.createElement('style');
  styleSheet.textContent = `
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    @keyframes skeleton {
      0% { background-position: 200% 0; }
      100% { background-position: -200% 0; }
    }
  `;
  document.head.appendChild(styleSheet);
}

export default LoadingOverlay;