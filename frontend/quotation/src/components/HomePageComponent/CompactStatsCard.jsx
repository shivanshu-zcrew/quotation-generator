// components/CompactStatsCard.jsx
import React, { useState } from 'react';
import { TrendingUp, FileText, Users, ChevronDown, ChevronUp, Clock, CheckCircle, Award, Ban, Shield } from 'lucide-react';
import { formatLargeCurrency } from '../../utils/formatters';

const CompactStatsCard = React.memo(({ 
  totalRevenue,        // Awarded Value
  quotationsCount,     // Total Quotations
  customersCount,      // Total Customers
  selectedCurrency,
  loading,
  // Additional stats for dropdown
  actionRequired,
  approved,
  awarded,
  rejected,
  conversionRate,
  awardedValue
}) => {
  const [expanded, setExpanded] = useState(false);

  // Helper function to format large numbers
  const formatLargeNumber = (num) => {
    if (num === null || num === undefined || isNaN(num)) return '0';
    if (num === 0) return '0';
    
    const absNum = Math.abs(num);
    
    if (absNum >= 1_000_000_000) {
      return (absNum / 1_000_000_000).toFixed(1) + 'B';
    }
    if (absNum >= 1_000_000) {
      return (absNum / 1_000_000).toFixed(1) + 'M';
    }
    if (absNum >= 1_000) {
      return (absNum / 1_000).toFixed(1) + 'K';
    }
    
    return num.toString();
  };

  // Format currency
  const formatCurrency = (num, currency) => {
    if (num === null || num === undefined || isNaN(num)) return `0 ${currency}`;
    if (num === 0) return `0 ${currency}`;
    
    const absNum = Math.abs(num);
    
    if (absNum >= 1_000_000_000) {
      return `${(absNum / 1_000_000_000).toFixed(1)}B ${currency}`;
    }
    if (absNum >= 1_000_000) {
      return `${(absNum / 1_000_000).toFixed(1)}M ${currency}`;
    }
    if (absNum >= 1_000) {
      return `${(absNum / 1_000).toFixed(1)}K ${currency}`;
    }
    
    return `${num.toLocaleString()} ${currency}`;
  };

  // Stats for dropdown (matches desktop row 1 card 2-3 + row 2)
  const dropdownStats = [
    { label: 'Action Required', value: formatLargeNumber(actionRequired), fullValue: actionRequired?.toLocaleString(), icon: Shield, color: '#3b82f6', bg: '#dbeafe' },
    { label: 'Approved', value: formatLargeNumber(approved), fullValue: approved?.toLocaleString(), icon: CheckCircle, color: '#10b981', bg: '#d1fae5' },
    { label: 'Conversion Rate', value: `${conversionRate || 0}%`, icon: TrendingUp, color: '#f59e0b', bg: '#fef3c7' },
    { label: 'Rejected by Admin', value: formatLargeNumber(rejected), fullValue: rejected?.toLocaleString(), icon: Ban, color: '#ec4899', bg: '#fce7f3' },
  ];

  return (
    <div style={{
      background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
      borderRadius: '16px',
      padding: '1rem',
      marginBottom: '1rem',
      boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
    }}>
      {/* Main stats row - 3 main stats */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem' }}>
        {/* Awarded Value */}
        <div style={{ flex: 1, textAlign: 'center' }}>
          <div style={{ fontSize: '0.65rem', fontWeight: 500, color: '#94a3b8', marginBottom: '0.25rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            <Award size={11} style={{ display: 'inline', marginRight: '0.25rem' }} />
            Awarded Value
          </div>
          <div style={{ fontSize: '1rem', fontWeight: 700, color: 'white' }}>
            {loading ? '...' : formatCurrency(awardedValue || totalRevenue, selectedCurrency)}
          </div>
        </div>
        
        <div style={{ width: '1px', height: '35px', background: '#334155' }} />
        
        {/* Total Quotations */}
        <div style={{ flex: 1, textAlign: 'center' }}>
          <div style={{ fontSize: '0.65rem', fontWeight: 500, color: '#94a3b8', marginBottom: '0.25rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            <FileText size={11} style={{ display: 'inline', marginRight: '0.25rem' }} />
            Total Quotations
          </div>
          <div style={{ fontSize: '1rem', fontWeight: 700, color: 'white' }}>
            {loading ? '...' : formatLargeNumber(quotationsCount)}
          </div>
        </div>
        
        <div style={{ width: '1px', height: '35px', background: '#334155' }} />
        
        {/* Total Customers */}
        <div style={{ flex: 1, textAlign: 'center' }}>
          <div style={{ fontSize: '0.65rem', fontWeight: 500, color: '#94a3b8', marginBottom: '0.25rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            <Users size={11} style={{ display: 'inline', marginRight: '0.25rem' }} />
            Total Customers
          </div>
          <div style={{ fontSize: '1rem', fontWeight: 700, color: 'white' }}>
            {loading ? '...' : formatLargeNumber(customersCount)}
          </div>
        </div>
        
        {/* Expand/Collapse Button */}
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
            justifyContent: 'center',
            transition: 'all 0.2s'
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.2)'}
          onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
        >
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
      </div>

      {/* Expanded dropdown with additional stats */}
      {expanded && (
        <div style={{
          marginTop: '1rem',
          paddingTop: '1rem',
          borderTop: '1px solid #334155'
        }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: '0.5rem'
          }}>
            {dropdownStats.map((item, idx) => (
              <div key={idx} style={{
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
        </div>
      )}
    </div>
  );
});

CompactStatsCard.displayName = 'CompactStatsCard';
export default CompactStatsCard;