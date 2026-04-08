// components/CompactStatsCard.jsx
import React, { useState } from 'react';
import { TrendingUp, FileText, Users, ChevronDown, ChevronUp, Clock, RefreshCw, CheckCircle, Award, Ban } from 'lucide-react';
import { fmtCurrency } from '../../utils/formatters';

const CompactStatsCard = React.memo(({ 
  totalRevenue, 
  quotationsCount, 
  customersCount, 
  selectedCurrency, 
  statusCounts, 
  loading 
}) => {
  const [expanded, setExpanded] = useState(false);

  const statusItems = [
    { label: 'Pending', value: statusCounts?.pending || 0, icon: Clock, color: '#f59e0b', bg: '#fef3c7' },
    { label: 'In Review', value: statusCounts?.in_review || 0, icon: RefreshCw, color: '#3b82f6', bg: '#dbeafe' },
    { label: 'Approved', value: statusCounts?.approved || 0, icon: CheckCircle, color: '#10b981', bg: '#d1fae5' },
    { label: 'Awarded', value: statusCounts?.awarded || 0, icon: Award, color: '#059669', bg: '#d1fae5' },
    { label: 'Returned', value: statusCounts?.returned || 0, icon: Ban, color: '#ec4899', bg: '#fce7f3' },
  ];

  return (
    <div style={{
      background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
      borderRadius: '16px',
      padding: '1rem',
      marginBottom: '1rem',
      boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
    }}>
      {/* Main stats row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem' }}>
        <div style={{ flex: 1, textAlign: 'center' }}>
          <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginBottom: '0.25rem' }}>
            <TrendingUp size={12} style={{ display: 'inline', marginRight: '0.25rem' }} />
            Revenue
          </div>
          <div style={{ fontSize: '1rem', fontWeight: 700, color: 'white' }}>
            {loading ? '...' : fmtCurrency(totalRevenue, selectedCurrency)}
          </div>
        </div>
        
        <div style={{ width: '1px', height: '35px', background: '#334155' }} />
        
        <div style={{ flex: 1, textAlign: 'center' }}>
          <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginBottom: '0.25rem' }}>
            <FileText size={12} style={{ display: 'inline', marginRight: '0.25rem' }} />
            Quotes
          </div>
          <div style={{ fontSize: '1rem', fontWeight: 700, color: 'white' }}>
            {loading ? '...' : quotationsCount}
          </div>
        </div>
        
        <div style={{ width: '1px', height: '35px', background: '#334155' }} />
        
        <div style={{ flex: 1, textAlign: 'center' }}>
          <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginBottom: '0.25rem' }}>
            <Users size={12} style={{ display: 'inline', marginRight: '0.25rem' }} />
            Customers
          </div>
          <div style={{ fontSize: '1rem', fontWeight: 700, color: 'white' }}>
            {loading ? '...' : customersCount}
          </div>
        </div>
        
        <button
          onClick={() => setExpanded(!expanded)}
          style={{
            background: 'rgba(255,255,255,0.1)',
            border: 'none',
            borderRadius: '8px',
            padding: '0.3rem',
            cursor: 'pointer',
            color: '#94a3b8',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
      </div>

      {/* Expanded status breakdown */}
      {expanded && (
        <div style={{
          marginTop: '1rem',
          paddingTop: '1rem',
          borderTop: '1px solid #334155',
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: '0.5rem'
        }}>
          {statusItems.map((item) => (
            <div key={item.label} style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.5rem',
              backgroundColor: 'rgba(255,255,255,0.05)',
              borderRadius: '8px'
            }}>
              <div style={{
                width: '28px',
                height: '28px',
                borderRadius: '6px',
                backgroundColor: item.bg,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <item.icon size={14} color={item.color} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '0.65rem', color: '#94a3b8' }}>{item.label}</div>
                <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'white' }}>{item.value}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
});

CompactStatsCard.displayName = 'CompactStatsCard';
export default CompactStatsCard;