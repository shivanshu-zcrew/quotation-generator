// components/DesktopStatsGrid.jsx
import React from 'react';
import { TrendingUp, FileText, Users, Clock, RefreshCw, CheckCircle, Award, Ban } from 'lucide-react';
import { StatCard } from '../SharedComponents';
import { fmtCurrency } from '../../utils/formatters';

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
          value={fmtCurrency(totalRevenue, selectedCurrency)} 
          accent="#6366f1" 
          iconBg="#eff1ff" 
          iconColor="#6366f1" 
          Icon={TrendingUp} 
          loading={loading} 
          sub={`All quotations combined in ${selectedCurrency}`}
        />
        <StatCard 
          label="Quotations" 
          value={quotationsCount} 
          accent="#8b5cf6" 
          iconBg="#f5f3ff" 
          iconColor="#8b5cf6" 
          Icon={FileText} 
          loading={loading} 
          sub="Total submitted"
        />
        <StatCard 
          label="Customers" 
          value={customersCount} 
          accent="#059669" 
          iconBg="#ecfdf5" 
          iconColor="#059669" 
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
          accent="#f59e0b" 
          iconBg="#fef3c7" 
          iconColor="#d97706" 
          Icon={Clock} 
          loading={loading} 
          sub="Awaiting ops review"
        />
        <StatCard 
          label="In Review" 
          value={statusCounts?.in_review || 0} 
          accent="#3b82f6" 
          iconBg="#dbeafe" 
          iconColor="#3b82f6" 
          Icon={RefreshCw} 
          loading={loading} 
          sub="Forwarded to admin"
        />
        <StatCard 
          label="Approved" 
          value={statusCounts?.approved || 0} 
          accent="#10b981" 
          iconBg="#d1fae5" 
          iconColor="#10b981" 
          Icon={CheckCircle} 
          loading={loading} 
          sub="Final approval given"
        />
        <StatCard 
          label="Awarded" 
          value={statusCounts?.awarded || 0} 
          accent="#059669" 
          iconBg="#d1fae5" 
          iconColor="#059669" 
          Icon={Award} 
          loading={loading} 
          sub="PO received"
        />
        <StatCard 
          label="Returned" 
          value={statusCounts?.returned || 0} 
          accent="#ec4899" 
          iconBg="#fce7f3" 
          iconColor="#ec4899" 
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