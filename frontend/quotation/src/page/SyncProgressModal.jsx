import React from 'react';
import { CheckCircle, AlertCircle, Loader2, XCircle, AlertTriangle } from 'lucide-react';

// Cool-neutral + vivid-status tokens (matches the rest of the app)
const T = {
  surface: '#ffffff',
  ink: '#1b1d1e',
  inkSoft: '#646a6e',
  inkFaint: '#9aa0a4',
  line: '#e8eaec',
  lineSoft: '#f0f1f3',
  accent: '#2563c4', accentSoft: '#e6f0fb',
  red: '#c1352b', redSoft: '#fdeceb', redLine: '#f8d6d2',
  green: '#0f7a52', greenSoft: '#e3f5ee',
  amber: '#b45309', amberSoft: '#fff7e6', amberLine: '#fde9c8',
  blue: '#1d63c4', blueSoft: '#e6f0fb',
  shadow: '0 24px 64px rgba(20,22,24,0.22)',
};

const SyncProgressModal = ({ isOpen, onClose, progress, onCancel }) => {
  if (!isOpen || !progress) return null;

  const stage = progress.stage;
  const isCompleted = stage === 'completed';
  const isFailed = stage === 'error';
  const isCancelled = stage === 'cancelled';
  const isCancelling = stage === 'cancelling';
  const isRunning = !isCompleted && !isFailed && !isCancelled;

  const percentComplete = progress.total > 0
    ? Math.min(100, (progress.fetched / progress.total) * 100)
    : 0;

  const failedRecords = Array.isArray(progress.failedRecords) ? progress.failedRecords : [];

  const getIcon = () => {
    if (isCompleted) return <CheckCircle size={44} color={T.green} />;
    if (isFailed) return <XCircle size={44} color={T.red} />;
    if (isCancelled) return <AlertCircle size={44} color={T.amber} />;
    return <Loader2 size={44} color={T.accent} style={{ animation: 'spin 1s linear infinite' }} />;
  };

  const getIconBackground = () => {
    if (isCompleted) return T.greenSoft;
    if (isFailed) return T.redSoft;
    if (isCancelled) return T.amberSoft;
    return T.accentSoft;
  };

  const getTitle = () => {
    if (isCompleted) return 'Sync Complete';
    if (isFailed) return 'Sync Failed';
    if (isCancelled) return 'Sync Cancelled';
    if (isCancelling) return 'Cancelling…';
    return 'Syncing from Zoho';
  };

  const getMessage = () => {
    if (isCancelling) return progress.message || 'Finishing the current batch, then stopping…';
    if (isCancelled) return progress.message || 'Sync was cancelled by user';
    return progress.message || 'Please wait…';
  };

  // Clicking the backdrop: never silently cancel a running sync — just ignore
  // while running; allow close only in a terminal state.
  const handleBackdropClick = (e) => {
    if (e.target !== e.currentTarget) return;
    if (!isRunning) onClose();
  };

  return (
    <>
      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes modalFadeIn { from { opacity: 0; transform: scale(0.97); } to { opacity: 1; transform: scale(1); } }
        .sync-modal-animate { animation: modalFadeIn 0.18s ease-out; }
      `}</style>

      <div
        style={{
          position: 'fixed', inset: 0,
          backgroundColor: 'rgba(20,22,24,0.45)',
          backdropFilter: 'blur(3px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1000,
        }}
        onClick={handleBackdropClick}
      >
        <div
          className="sync-modal-animate"
          style={{
            backgroundColor: T.surface,
            borderRadius: '16px',
            padding: '2rem',
            maxWidth: '480px',
            width: '90%',
            boxShadow: T.shadow,
            border: `1px solid ${T.line}`,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header with Icon */}
          <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
            <div style={{ width: '72px', height: '72px', borderRadius: '50%', background: getIconBackground(), display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem' }}>
              {getIcon()}
            </div>
            <h3 style={{ fontSize: '1.35rem', fontWeight: 700, color: T.ink, marginBottom: '0.4rem', letterSpacing: '-0.01em' }}>
              {getTitle()}
            </h3>
            <p style={{ fontSize: '0.875rem', color: T.inkSoft, margin: 0, lineHeight: 1.45 }}>
              {getMessage()}
            </p>
          </div>

          {/* Progress Bar (running or cancelling) */}
          {(isRunning || isCancelling) && progress.total > 0 && (
            <div style={{ marginBottom: '1.5rem' }}>
              <div style={{ height: '8px', backgroundColor: T.lineSoft, borderRadius: '999px', overflow: 'hidden', marginBottom: '0.6rem' }}>
                <div style={{ width: `${percentComplete}%`, height: '100%', backgroundColor: isCancelling ? T.amber : T.accent, borderRadius: '999px', transition: 'width 0.3s ease' }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: T.inkSoft }}>
                <span>{progress.fetched?.toLocaleString() || 0} of {progress.total?.toLocaleString() || 0} customers</span>
                <span>{Math.round(percentComplete)}%</span>
              </div>
              {progress.estimatedRemaining && (
                <div style={{ fontSize: '0.7rem', color: T.inkFaint, textAlign: 'center', marginTop: '0.5rem' }}>
                  Estimated remaining: {progress.estimatedRemaining}
                </div>
              )}
            </div>
          )}

          {/* Indeterminate hint when running with no total yet */}
          {isRunning && !(progress.total > 0) && (
            <div style={{ marginBottom: '1.5rem' }}>
              <div style={{ height: '8px', backgroundColor: T.lineSoft, borderRadius: '999px', overflow: 'hidden', position: 'relative' }}>
                <div style={{ position: 'absolute', width: '40%', height: '100%', backgroundColor: T.accent, borderRadius: '999px', animation: 'spin 1.2s linear infinite', left: '-40%' }} />
              </div>
            </div>
          )}

          {/* Stats for completed sync */}
          {isCompleted && progress.created !== undefined && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: '0.75rem', marginBottom: '1.25rem', padding: '1rem', backgroundColor: T.greenSoft, borderRadius: '12px', flexWrap: 'wrap' }}>
              <Stat value={progress.created} label="New" color={T.green} />
              <Stat value={progress.updated} label="Updated" color={T.blue} />
              <Stat value={progress.unchanged} label="Unchanged" color={T.inkSoft} />
              {progress.errors > 0 && <Stat value={progress.errors} label="Errors" color={T.red} />}
            </div>
          )}

          {/* Partial-failure warning on a completed sync */}
          {isCompleted && progress.errors > 0 && (
            <div style={{ padding: '0.7rem 0.875rem', backgroundColor: T.amberSoft, border: `1px solid ${T.amberLine}`, borderRadius: '10px', marginBottom: '1.25rem', display: 'flex', gap: '0.5rem', alignItems: 'flex-start', fontSize: '0.8rem', color: T.amber }}>
              <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>{progress.errors} record{progress.errors > 1 ? 's' : ''} could not be synced. The rest completed successfully.</span>
            </div>
          )}

          {/* Failed records detail */}
          {failedRecords.length > 0 && (
            <div style={{ marginBottom: '1.25rem', maxHeight: 140, overflowY: 'auto', border: `1px solid ${T.line}`, borderRadius: '10px' }}>
              {failedRecords.slice(0, 20).map((f, i) => (
                <div key={i} style={{ padding: '0.5rem 0.75rem', borderBottom: i < Math.min(failedRecords.length, 20) - 1 ? `1px solid ${T.lineSoft}` : 'none', fontSize: '0.74rem' }}>
                  <div style={{ fontWeight: 600, color: T.ink }}>{f.name || f.zohoId || 'Unknown'}</div>
                  {f.error && <div style={{ color: T.red, marginTop: 1 }}>{f.error}</div>}
                </div>
              ))}
            </div>
          )}

          {/* Error message */}
          {isFailed && (
            <div style={{ padding: '0.75rem 0.875rem', backgroundColor: T.redSoft, border: `1px solid ${T.redLine}`, borderRadius: '10px', marginBottom: '1.25rem', fontSize: '0.85rem', color: T.red, textAlign: 'center' }}>
              {progress.error || progress.message || 'An error occurred during sync'}
            </div>
          )}

          {/* Cancelled message */}
          {isCancelled && (
            <div style={{ padding: '0.75rem 0.875rem', backgroundColor: T.amberSoft, border: `1px solid ${T.amberLine}`, borderRadius: '10px', marginBottom: '1.25rem', fontSize: '0.85rem', color: T.amber, textAlign: 'center' }}>
              {progress.message || 'Sync was cancelled'}
            </div>
          )}

          {/* Buttons */}
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
            {isRunning && onCancel && (
              <button
                onClick={onCancel}
                style={{ padding: '0.65rem 1.6rem', backgroundColor: T.surface, color: T.red, border: `1px solid ${T.redLine}`, borderRadius: '10px', fontWeight: 600, fontSize: '0.875rem', cursor: 'pointer', transition: 'all 0.15s' }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = T.redSoft; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = T.surface; }}
              >
                Cancel Sync
              </button>
            )}

            {isCancelling && (
              <button disabled style={{ padding: '0.65rem 1.6rem', backgroundColor: T.lineSoft, color: T.inkFaint, border: 'none', borderRadius: '10px', fontWeight: 600, fontSize: '0.875rem', cursor: 'not-allowed' }}>
                Cancelling…
              </button>
            )}

            {(isCompleted || isFailed || isCancelled) && (
              <button
                onClick={onClose}
                style={{ padding: '0.65rem 2rem', backgroundColor: T.accent, color: 'white', border: 'none', borderRadius: '10px', fontWeight: 600, fontSize: '0.875rem', cursor: 'pointer', transition: 'all 0.15s' }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = T.accentInk || '#1d63c4'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = T.accent; e.currentTarget.style.transform = 'translateY(0)'; }}
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

const Stat = ({ value, label, color }) => (
  <div style={{ textAlign: 'center', minWidth: 56 }}>
    <div style={{ fontSize: '1.4rem', fontWeight: 700, color }}>{value || 0}</div>
    <div style={{ fontSize: '0.68rem', color: '#646a6e' }}>{label}</div>
  </div>
);

export default SyncProgressModal;