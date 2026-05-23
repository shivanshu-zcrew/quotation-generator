import React from 'react';
import { CheckCircle, AlertCircle, Loader2, XCircle } from 'lucide-react';

const PRIMARY_COLOR = '#0f172a';

const SyncProgressModal = ({ isOpen, onClose, progress, onCancel }) => {
  if (!isOpen || !progress) return null;

  const isCompleted = progress.stage === 'completed';
  const isFailed = progress.stage === 'error';
  const isCancelled = progress.stage === 'cancelled';
  const isRunning = !isCompleted && !isFailed && !isCancelled;

  const percentComplete = progress.total > 0 
    ? (progress.fetched / progress.total) * 100 
    : 0;

  const getIcon = () => {
    if (isCompleted) return <CheckCircle size={48} color="#10b981" />;
    if (isFailed) return <XCircle size={48} color="#ef4444" />;
    if (isCancelled) return <AlertCircle size={48} color="#f59e0b" />;
    return <Loader2 size={48} color="#6366f1" style={{ animation: 'spin 1s linear infinite' }} />;
  };

  const getIconBackground = () => {
    if (isCompleted) return '#d1fae5';
    if (isFailed) return '#fee2e2';
    if (isCancelled) return '#fef3c7';
    return '#eef2ff';
  };

  const getTitle = () => {
    if (isCompleted) return 'Sync Complete';
    if (isFailed) return 'Sync Failed';
    if (isCancelled) return 'Sync Cancelled';
    return 'Syncing from Zoho';
  };

  const getMessage = () => {
    if (isCancelled) return progress.message || 'Sync was cancelled by user';
    return progress.message || 'Please wait...';
  };

  const handleCloseClick = (e) => {
    if (e.target === e.currentTarget) {
      if (isRunning && onCancel) {
        onCancel();
      } else {
        onClose();
      }
    }
  };

  const handleCancelClick = () => {
    if (onCancel) {
      onCancel();
    }
  };

  return (
    <>
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes modalFadeIn {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
        .modal-animate {
          animation: modalFadeIn 0.2s ease-out;
        }
      `}</style>

      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.6)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
        }}
        onClick={handleCloseClick}
      >
        <div
          className="modal-animate"
          style={{
            backgroundColor: 'white',
            borderRadius: '28px',
            padding: '2rem',
            maxWidth: '500px',
            width: '90%',
            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header with Icon */}
          <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
            <div
              style={{
                width: '80px',
                height: '80px',
                borderRadius: '40px',
                background: getIconBackground(),
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 1rem',
              }}
            >
              {getIcon()}
            </div>
            <h3 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#0f172a', marginBottom: '0.5rem' }}>
              {getTitle()}
            </h3>
            <p style={{ fontSize: '0.875rem', color: '#64748b', marginBottom: 0 }}>
              {getMessage()}
            </p>
          </div>

          {/* Progress Bar (only when running) */}
          {isRunning && progress.total > 0 && (
            <div style={{ marginBottom: '1.5rem' }}>
              <div
                style={{
                  height: '8px',
                  backgroundColor: '#e2e8f0',
                  borderRadius: '4px',
                  overflow: 'hidden',
                  marginBottom: '0.75rem',
                }}
              >
                <div
                  style={{
                    width: `${percentComplete}%`,
                    height: '100%',
                    backgroundColor: '#6366f1',
                    borderRadius: '4px',
                    transition: 'width 0.3s ease',
                  }}
                />
              </div>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: '0.75rem',
                  color: '#64748b',
                  marginBottom: '0.5rem',
                }}
              >
                <span>
                  👥 {progress.fetched?.toLocaleString() || 0} of {progress.total?.toLocaleString() || 0} customers
                </span>
                <span>{Math.round(percentComplete)}%</span>
              </div>

              {progress.page > 0 && progress.totalPages > 0 && (
                <div style={{ fontSize: '0.7rem', color: '#94a3b8', textAlign: 'center', marginTop: '0.25rem' }}>
                  Page {progress.page} of {progress.totalPages}
                </div>
              )}

              {progress.batch && progress.totalBatches && (
                <div style={{ fontSize: '0.7rem', color: '#94a3b8', textAlign: 'center', marginTop: '0.25rem' }}>
                  Batch {progress.batch} of {progress.totalBatches}
                </div>
              )}

              {progress.estimatedRemaining && (
                <div style={{ fontSize: '0.7rem', color: '#94a3b8', textAlign: 'center', marginTop: '0.5rem' }}>
                  ⏱️ Estimated remaining: {progress.estimatedRemaining}
                </div>
              )}
            </div>
          )}

          {/* Stats for completed sync */}
          {isCompleted && progress.created !== undefined && (
            <div
              style={{
                display: 'flex',
                justifyContent: 'center',
                gap: '1rem',
                marginBottom: '1.5rem',
                padding: '1rem',
                backgroundColor: '#f0fdf4',
                borderRadius: '16px',
                flexWrap: 'wrap',
              }}
            >
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#10b981' }}>
                  {progress.created || 0}
                </div>
                <div style={{ fontSize: '0.7rem', color: '#64748b' }}>New</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#3b82f6' }}>
                  {progress.updated || 0}
                </div>
                <div style={{ fontSize: '0.7rem', color: '#64748b' }}>Updated</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#f59e0b' }}>
                  {progress.unchanged || 0}
                </div>
                <div style={{ fontSize: '0.7rem', color: '#64748b' }}>Unchanged</div>
              </div>
              {progress.deleted !== undefined && (
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#ef4444' }}>
                    {progress.deleted || 0}
                  </div>
                  <div style={{ fontSize: '0.7rem', color: '#64748b' }}>Deleted</div>
                </div>
              )}
              {progress.errors > 0 && (
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#ef4444' }}>
                    {progress.errors || 0}
                  </div>
                  <div style={{ fontSize: '0.7rem', color: '#64748b' }}>Errors</div>
                </div>
              )}
            </div>
          )}

          {/* Error message */}
          {isFailed && (
            <div
              style={{
                padding: '0.75rem',
                backgroundColor: '#fef2f2',
                borderRadius: '12px',
                marginBottom: '1.5rem',
                fontSize: '0.875rem',
                color: '#dc2626',
                textAlign: 'center',
              }}
            >
              {progress.error || progress.message || 'An error occurred during sync'}
            </div>
          )}

          {/* Cancelled message */}
          {isCancelled && (
            <div
              style={{
                padding: '0.75rem',
                backgroundColor: '#fef3c7',
                borderRadius: '12px',
                marginBottom: '1.5rem',
                fontSize: '0.875rem',
                color: '#92400e',
                textAlign: 'center',
              }}
            >
              {progress.message || 'Sync was cancelled'}
            </div>
          )}

          {/* Duration info */}
          {/* {progress.duration && (
            <div style={{ textAlign: 'center', marginBottom: '1.5rem', fontSize: '0.7rem', color: '#94a3b8' }}>
              Duration: {progress.duration}
            </div>
          )} */}

          {/* Buttons */}
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
            {(isCompleted || isFailed || isCancelled) && (
              <button
                onClick={onClose}
                style={{
                  padding: '0.7rem 2rem',
                  backgroundColor: PRIMARY_COLOR,
                  color: 'white',
                  border: 'none',
                  borderRadius: '14px',
                  fontWeight: 600,
                  fontSize: '0.875rem',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#1e293b';
                  e.currentTarget.style.transform = 'translateY(-1px)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = PRIMARY_COLOR;
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                Close
              </button>
            )}

             
          </div>
        </div>
      </div>
    </>
  );
};

export default SyncProgressModal;