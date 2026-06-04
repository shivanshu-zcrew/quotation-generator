// components/AdminDesktopStatsGrid.jsx
import React from 'react';
import { TrendingUp, FileText, Users, Clock, RefreshCw, CheckCircle, Award, Ban, Shield } from 'lucide-react';
import { StatCard } from './SharedComponents';
import { formatLargeCurrency } from '../utils/formatters';
 
const AdminDesktopStatsGrid = React.memo(({
  totalRevenue,
  quotationsCount,
  customersCount,
  selectedCurrency,
  statusCounts,
  loading,
  // Additional props for admin stats
  actionRequired,
  approved,
  awarded,
  rejected,
  totalAwardedValue,
  conversionRate,
  conversionDetails
}) => {
  return (
    <>
      {/* Main Stats Row - 4 cards for admin */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: '1rem',
        marginBottom: '1rem'
      }}>
        <StatCard
          label="Total Quotations"
          value={quotationsCount?.toLocaleString() || '0'}
          accent="#6366f1"
          iconBg="#eff1ff"
          iconColor="#6366f1"
          Icon={FileText}
          loading={loading}
          sub="All time"
        />
        <StatCard
          label="Action Required"
          value={actionRequired?.toLocaleString() || statusCounts?.ops_approved?.toLocaleString() || '0'}
          accent="#3b82f6"
          iconBg="#dbeafe"
          iconColor="#3b82f6"
          Icon={Shield}
          loading={loading}
          sub="Awaiting your approval"
        />
        <StatCard
          label="Approved"
          value={approved?.toLocaleString() || statusCounts?.approved?.toLocaleString() || '0'}
          accent="#10b981"
          iconBg="#d1fae5"
          iconColor="#10b981"
          Icon={CheckCircle}
          loading={loading}
          sub="quotations approved"
        />
        <StatCard
          label="Awarded Value"
          value={formatLargeCurrency(totalAwardedValue || totalRevenue, selectedCurrency)}
          accent="#059669"
          iconBg="#d1fae5"
          iconColor="#059669"
          Icon={Award}
          loading={loading}
          sub={`${awarded?.toLocaleString() || statusCounts?.awarded?.toLocaleString() || '0'} deals won`}
        />
      </div>

      {/* Secondary Stats Row - 3 cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: '1rem',
        marginBottom: '1.5rem'
      }}>
        <StatCard
          label="Conversion Rate"
          value={conversionDetails ? `${conversionDetails}%` : (conversionRate ? `${conversionRate}%` : '0%')}
          accent="#f59e0b"
          iconBg="#fef3c7"
          iconColor="#f59e0b"
          Icon={TrendingUp}
          loading={loading}
          sub="Approved → Awarded"
        />
        <StatCard
          label="Rejected by Admin"
          value={rejected?.toLocaleString() || statusCounts?.rejected?.toLocaleString() || '0'}
          accent="#ec4899"
          iconBg="#fce7f3"
          iconColor="#ec4899"
          Icon={Ban}
          loading={loading}
          sub="Rejected quotations"
        />
        <StatCard
          label="Total Customers"
          value={customersCount?.toLocaleString() || '0'}
          accent="#8b5cf6"
          iconBg="#ede9fe"
          iconColor="#8b5cf6"
          Icon={Users}
          loading={loading}
          sub="Active customers"
        />
      </div>
    </>
  );
});

AdminDesktopStatsGrid.displayName = 'AdminDesktopStatsGrid';
export default AdminDesktopStatsGrid;