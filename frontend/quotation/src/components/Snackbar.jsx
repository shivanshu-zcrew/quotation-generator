// components/Snackbar.jsx
import React, { useEffect, useRef } from 'react';

// Reading time scales with message length rather than a flat 3s — a one-line
// success toast and a long validation error shouldn't get the same window.
// Errors get a higher floor since they're more likely to need to be read and
// acted on, not just glanced at.
const MS_PER_CHAR = 50;
const MIN_DURATION = { error: 4000, success: 3000, info: 3000 };

function computeDuration(message, type) {
  const floor = MIN_DURATION[type] ?? MIN_DURATION.info;
  return Math.max(floor, (message?.length || 0) * MS_PER_CHAR);
}

export default function Snackbar({ message, type = 'error', onClose, duration }) {
  const effectiveDuration = duration ?? computeDuration(message, type);

  const timerRef = useRef(null);
  const remainingRef = useRef(effectiveDuration);
  const startedAtRef = useRef(null);

  const clearTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const startTimer = (ms) => {
    startedAtRef.current = Date.now();
    timerRef.current = setTimeout(onClose, ms);
  };

  useEffect(() => {
    startTimer(remainingRef.current);
    return clearTimer;
    // Only ever runs once per mounted toast — hover pause/resume below
    // manages the timer directly rather than re-running this effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reading a message shouldn't be a race against the clock — pause the
  // countdown while the pointer is over the toast, and pick up wherever it
  // left off (not a full reset) once it leaves.
  const handleMouseEnter = () => {
    clearTimer();
    if (startedAtRef.current != null) {
      const elapsed = Date.now() - startedAtRef.current;
      remainingRef.current = Math.max(0, remainingRef.current - elapsed);
    }
  };

  const handleMouseLeave = () => {
    startTimer(remainingRef.current);
  };

  const bgColor = type === 'error' ? '#ef4444' : type === 'success' ? '#10b981' : '#3b82f6';

  return (
    <div
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      style={{
        position: 'fixed',
        bottom: '20px',
        right: '20px',
        maxWidth: '420px',
        backgroundColor: bgColor,
        color: 'white',
        padding: '12px 20px',
        borderRadius: '8px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'flex-start',
        gap: '10px',
        animation: 'slideIn 0.3s ease-out'
      }}
    >
      <span style={{ wordBreak: 'break-word' }}>{message}</span>
      <button
        onClick={onClose}
        style={{
          background: 'none',
          border: 'none',
          color: 'white',
          cursor: 'pointer',
          fontSize: '18px',
          padding: '0 5px',
          flexShrink: 0,
        }}
      >
        ×
      </button>
      <style>{`
        @keyframes slideIn {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
}
