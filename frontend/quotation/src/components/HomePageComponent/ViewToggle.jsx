// components/ViewToggle.jsx
import React from 'react';
import { LayoutGrid, List } from 'lucide-react';

const ViewToggle = React.memo(({ view, onViewChange, isMobile }) => {
  if (isMobile) return null;

  return (
    <div style={{
      display: 'flex',
      gap: '0.25rem',
      backgroundColor: '#f1f5f9',
      borderRadius: '8px',
      padding: '0.25rem'
    }}>
      <button
        onClick={() => onViewChange('table')}
        style={{
          padding: '0.4rem 0.75rem',
          borderRadius: '6px',
          border: 'none',
          background: view === 'table' ? 'white' : 'transparent',
          color: view === 'table' ? '#0f172a' : '#64748b',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '0.35rem',
          fontSize: '0.75rem',
          fontWeight: 600,
          fontFamily: 'inherit',
          boxShadow: view === 'table' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none'
        }}
      >
        <List size={14} />
        Table
      </button>
      <button
        onClick={() => onViewChange('card')}
        style={{
          padding: '0.4rem 0.75rem',
          borderRadius: '6px',
          border: 'none',
          background: view === 'card' ? 'white' : 'transparent',
          color: view === 'card' ? '#0f172a' : '#64748b',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '0.35rem',
          fontSize: '0.75rem',
          fontWeight: 600,
          fontFamily: 'inherit',
          boxShadow: view === 'card' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none'
        }}
      >
        <LayoutGrid size={14} />
        Cards
      </button>
    </div>
  );
});

ViewToggle.displayName = 'ViewToggle';
export default ViewToggle;