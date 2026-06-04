// components/DesktopStatsGrid.jsx
import React from 'react';
import { TrendingUp, FileText, Users, Clock, RefreshCw, CheckCircle, Award, Ban } from 'lucide-react';
import { StatCard } from '../SharedComponents';
import { fmtCurrency, formatLargeCurrency } from '../../utils/formatters';

const DesktopStatsGrid = React.memo(({
  totalRevenue,
  quotationsCount,
  customersCount,
  selectedCurrency,
  statusCounts,
  loading
}) => {
  return (
    <>
      {/* Main Stats Row */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: '1rem',
        marginBottom: '1rem'
      }}>
        <StatCard
          label="Total Revenue"
          value={formatLargeCurrency(totalRevenue, selectedCurrency)}
          accent="#2563c4"
          iconBg="#e6f0fb"
          iconColor="#2563c4"
          Icon={TrendingUp}
          loading={loading}
          sub={`All quotations combined in ${selectedCurrency}`}
        />
        <StatCard
          label="Quotations"
          value={quotationsCount}
          accent="#6d28d9"
          iconBg="#efe9fb"
          iconColor="#6d28d9"
          Icon={FileText}
          loading={loading}
          sub="Total submitted"
        />
        <StatCard
          label="Customers"
          value={customersCount}
          accent="#0f7a52"
          iconBg="#e3f5ee"
          iconColor="#0f7a52"
          Icon={Users}
          loading={false}
        />
      </div>

      {/* Status Stats Row */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(5, 1fr)',
        gap: '1rem',
        marginBottom: '1.5rem'
      }}>
        <StatCard
          label="Pending"
          value={statusCounts?.pending || 0}
          accent="#b45309"
          iconBg="#fff7e6"
          iconColor="#b45309"
          Icon={Clock}
          loading={loading}
          sub="Awaiting ops review"
        />
        <StatCard
          label="In Review"
          value={statusCounts?.in_review || 0}
          accent="#1d63c4"
          iconBg="#e6f0fb"
          iconColor="#1d63c4"
          Icon={RefreshCw}
          loading={loading}
          sub="Forwarded to admin"
        />
        <StatCard
          label="Approved"
          value={statusCounts?.approved || 0}
          accent="#0f7a52"
          iconBg="#e3f5ee"
          iconColor="#0f7a52"
          Icon={CheckCircle}
          loading={loading}
          sub="Final approval given"
        />
        <StatCard
          label="Awarded"
          value={statusCounts?.awarded || 0}
          accent="#6d28d9"
          iconBg="#efe9fb"
          iconColor="#6d28d9"
          Icon={Award}
          loading={loading}
          sub="PO received"
        />
        <StatCard
          label="Returned"
          value={statusCounts?.returned || 0}
          accent="#be185d"
          iconBg="#fdeaf0"
          iconColor="#be185d"
          Icon={Ban}
          loading={loading}
          sub="Ops or admin rejected"
        />
      </div>
    </>
  );
});

DesktopStatsGrid.displayName = 'DesktopStatsGrid';
export default DesktopStatsGrid;