import React from 'react';
import { RefreshCw } from 'lucide-react';
import { useVersionCheck } from '../hooks/useVersionCheck';

// Deliberately not dismissible without reloading: this exists specifically
// so a tab left open across a deploy doesn't keep silently generating
// quotes/PDFs with stale client-side logic (see useVersionCheck.js) — a
// quiet "x" would defeat the one thing this is for.
export default function UpdateAvailableBanner() {
  const updateAvailable = useVersionCheck();
  if (!updateAvailable) return null;

  return (
    <div style={S.bar}>
      <RefreshCw size={16} />
      <span>A new version of this app is available. Reload to get the latest fixes.</span>
      <button style={S.button} onClick={() => window.location.reload()}>
        Reload now
      </button>
    </div>
  );
}

const S = {
  bar: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10000,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.75rem',
    padding: '0.6rem 1rem',
    backgroundColor: '#0C405A',
    color: 'white',
    fontSize: '0.875rem',
    fontWeight: 500,
  },
  button: {
    background: 'white',
    color: '#0C405A',
    border: 'none',
    borderRadius: '6px',
    padding: '0.3rem 0.75rem',
    fontSize: '0.8rem',
    fontWeight: 600,
    cursor: 'pointer',
  },
};
