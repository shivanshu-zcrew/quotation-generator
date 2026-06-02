import React, { useState, useRef , useMemo, useCallback, useEffect } from 'react';
import { 
  Plus, Edit2, Trash2, ArrowLeft, Search, RefreshCw, AlertCircle, ChevronDown, 
  CheckCircle, Users, Building2, Tag, User, X,  
  Mail, Phone, MapPin, Shield, ChevronLeft, ChevronRight, Download,  
  Filter,  Loader, Star,
  Briefcase,
  CreditCard,
  ChevronUp
} from 'lucide-react';
import { useCustomers, usePaginatedCustomers, useCustomerSearch, useCustomerStats, useZohoSync } from '../hooks/customerHooks';
import { customerAPI } from '../services/api';
import { motion, AnimatePresence } from 'framer-motion';
import { useCompanyCurrency } from '../components/CompanyCurrencySelector';
import { useAppStore } from '../services/store';
import CommonSelect from '../components/CommonSelect';
import ConfirmModal from '../components/ConfirmModal';
import { COUNTRY_CODES } from '../utils/constants';
import SyncProgressModal from './SyncProgressModal';
import CustomerModal from '../components/CustomerModel';

const PRIMARY_COLOR = '#000';
const ANIMATION_DURATION = 0.2;

// Animation variants
const fadeInUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -20 }
};

const staggerContainer = {
  animate: { transition: { staggerChildren: 0.05 } }
};


// Toast Component
const Toast = ({ message, type = 'success', onClose }) => {
  useEffect(() => { const timer = setTimeout(onClose, 4000); return () => clearTimeout(timer); }, [onClose]);
  return (
    <div style={{ position: 'fixed', bottom: '24px', right: '24px', zIndex: 1000, animation: 'slideInRight 0.3s ease' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: type === 'success' ? 'linear-gradient(135deg, #10b981, #059669)' : type === 'error' ? 'linear-gradient(135deg, #ef4444, #dc2626)' : 'linear-gradient(135deg, #3b82f6, #2563eb)', color: 'white', padding: '14px 20px', borderRadius: '16px', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)' }}>
        {type === 'success' ? <CheckCircle size={20} /> : <AlertCircle size={20} />}
        <span style={{ fontWeight: '500', fontSize: '0.875rem' }}>{message}</span>
        <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: '8px', padding: '4px', cursor: 'pointer' }}><X size={14} /></button>
      </div>
    </div>
  );
};

// StatCard Component
const StatCard = ({ label, value, icon: Icon, color, loading, trend, trendValue }) => (
  <motion.div
    initial={{ opacity: 0, scale: 0.95 }}
    animate={{ opacity: 1, scale: 1 }}
    whileHover={{ y: -4, transition: { duration: 0.2 } }}
    style={{
      background: 'white',
      borderRadius: '20px',
      padding: '1.25rem',
      boxShadow: '0 1px 3px rgba(0,0,0,0.05), 0 1px 2px rgba(0,0,0,0.1)',
      border: '1px solid rgba(226, 232, 240, 0.6)',
      transition: 'all 0.2s ease'
    }}
  >
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
      <div style={{
        width: '40px',
        height: '40px',
        borderRadius: '12px',
        background: `${color}10`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        <Icon size={20} color={color} />
      </div>
      {trend && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          padding: '4px 8px',
          borderRadius: '20px',
          background: trend > 0 ? '#10b98110' : '#ef444410',
          color: trend > 0 ? '#10b981' : '#ef4444',
          fontSize: '0.7rem',
          fontWeight: '600'
        }}>
          {trend > 0 ? '↑' : '↓'} {Math.abs(trend)}%
        </div>
      )}
    </div>
    <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: '500', marginBottom: '0.25rem' }}>
      {label}
    </div>
    <div style={{ fontSize: '1.75rem', fontWeight: '800', color: '#1e293b' }}>
      {loading ? (
        <div style={{ width: '40px', height: '28px', background: '#e2e8f0', borderRadius: '8px', animation: 'pulse 1.5s ease-in-out infinite' }} />
      ) : (
        value?.toLocaleString() || 0
      )}
    </div>
  </motion.div>
);
 
 

const PaginationControls = ({ pagination, onPageChange, loading, isMobile = false }) => {
  if (!pagination || pagination.totalPages <= 1) return null;
  
  const { page, totalPages, totalItems, limit } = pagination;
  
  // Adjust number of buttons based on screen size
  const maxButtons = isMobile ? 3 : 5;
  let startPage = Math.max(1, page - Math.floor(maxButtons / 2));
  let endPage = Math.min(totalPages, startPage + maxButtons - 1);
  if (endPage - startPage < maxButtons - 1) startPage = Math.max(1, endPage - maxButtons + 1);
  
  const startItem = (page - 1) * limit + 1;
  const endItem = Math.min(page * limit, totalItems);
  
  // Button size based on screen
  const buttonSize = isMobile ? 28 : 32;
  const iconSize = isMobile ? 12 : 14;
  
  return (
    <div style={{ 
      display: 'flex', 
      flexDirection: isMobile ? 'column' : 'row',
      alignItems: 'center', 
      justifyContent: 'space-between',
      gap: isMobile ? '0.75rem' : '0',
      padding: isMobile ? '0.75rem 1rem' : '1rem 1.5rem',
      borderTop: '1px solid #f1f5f9',
      background: '#fafafa'
    }}>
      {/* Info text - centered on mobile */}
      {/* <div style={{ 
        fontSize: isMobile ? '0.7rem' : '0.75rem', 
        color: '#64748b',
        textAlign: 'center'
      }}>
        {isMobile ? (
          `${startItem}-${endItem} of ${totalItems}`
        ) : (
          `Showing ${startItem} to ${endItem} of ${totalItems} customers`
        )}
      </div> */}
      
      {/* Pagination buttons */}
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        gap: isMobile ? '0.35rem' : '0.5rem',
        flexWrap: 'wrap',
        justifyContent: 'center'
      }}>
        {/* Previous button */}
        <button 
          onClick={() => onPageChange(page - 1)} 
          disabled={page === 1 || loading} 
          style={{ 
            width: `${buttonSize}px`, 
            height: `${buttonSize}px`, 
            borderRadius: '8px', 
            border: '1px solid #e2e8f0', 
            background: 'white', 
            cursor: page === 1 || loading ? 'not-allowed' : 'pointer', 
            opacity: page === 1 || loading ? 0.5 : 1,
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            transition: 'all 0.2s ease'
          }}
          onMouseEnter={(e) => {
            if (page !== 1 && !loading) {
              e.currentTarget.style.background = '#f8fafc';
              e.currentTarget.style.borderColor = PRIMARY_COLOR;
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'white';
            e.currentTarget.style.borderColor = '#e2e8f0';
          }}
        >
          <ChevronLeft size={iconSize} />
        </button>
        
        {/* Page numbers */}
        {Array.from({ length: endPage - startPage + 1 }, (_, i) => startPage + i).map(num => (
          <button 
            key={num} 
            onClick={() => onPageChange(num)} 
            disabled={loading} 
            style={{ 
              minWidth: `${buttonSize}px`, 
              height: `${buttonSize}px`, 
              borderRadius: '8px', 
              border: num === page ? 'none' : '1px solid #e2e8f0', 
              background: num === page ? PRIMARY_COLOR : 'white', 
              color: num === page ? 'white' : '#475569', 
              fontWeight: num === page ? '600' : '500',
              fontSize: isMobile ? '0.75rem' : '0.875rem',
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s ease'
            }}
            onMouseEnter={(e) => {
              if (num !== page && !loading) {
                e.currentTarget.style.background = '#f8fafc';
                e.currentTarget.style.borderColor = PRIMARY_COLOR;
              }
            }}
            onMouseLeave={(e) => {
              if (num !== page && !loading) {
                e.currentTarget.style.background = 'white';
                e.currentTarget.style.borderColor = '#e2e8f0';
              }
            }}
          >
            {num}
          </button>
        ))}
        
        {/* Next button */}
        <button 
          onClick={() => onPageChange(page + 1)} 
          disabled={page === totalPages || loading} 
          style={{ 
            width: `${buttonSize}px`, 
            height: `${buttonSize}px`, 
            borderRadius: '8px', 
            border: '1px solid #e2e8f0', 
            background: 'white', 
            cursor: page === totalPages || loading ? 'not-allowed' : 'pointer', 
            opacity: page === totalPages || loading ? 0.5 : 1,
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            transition: 'all 0.2s ease'
          }}
          onMouseEnter={(e) => {
            if (page !== totalPages && !loading) {
              e.currentTarget.style.background = '#f8fafc';
              e.currentTarget.style.borderColor = PRIMARY_COLOR;
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'white';
            e.currentTarget.style.borderColor = '#e2e8f0';
          }}
        >
          <ChevronRight size={iconSize} />
        </button>
      </div>
    </div>
  );
};

  

// CustomerCard Component
const CustomerCard = ({ customer, onEdit, onDelete, deletingId }) => {
  const isVatRegistered = customer.taxTreatment === 'vat_registered' || customer.taxTreatment === 'gcc_vat_registered';
  const [isHovered, setIsHovered] = useState(false);
  
  return (
    <motion.div
      variants={fadeInUp}
      initial="initial"
      animate="animate"
      exit="exit"
      whileHover={{ y: -4 }}
      onHoverStart={() => setIsHovered(true)}
      onHoverEnd={() => setIsHovered(false)}
      style={{
        background: 'white',
        borderRadius: '20px',
        padding: 'clamp(1rem, 4vw, 1.25rem)',
        boxShadow: isHovered 
          ? '0 20px 25px -12px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.02)'
          : '0 1px 3px rgba(0,0,0,0.05), 0 1px 2px rgba(0,0,0,0.1)',
        border: `1px solid ${isHovered ? `${PRIMARY_COLOR}20` : '#e2e8f0'}`,
        transition: 'all 0.2s ease',
        position: 'relative',
        overflow: 'hidden',
        width: '100%',
        boxSizing: 'border-box'
      }}
    >
      {/* Status Badge - Responsive */}
      <div style={{
        position: 'absolute',
        top: 0,
        right: 0,
        padding: '0.25rem 0.75rem',
        background: customer.isActive ? '#10b981' : '#ef4444',
        color: 'white',
        fontSize: '0.65rem',
        fontWeight: '600',
        borderRadius: '0 20px 0 12px',
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        zIndex: 1
      }}>
        <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'white', opacity: 0.8 }} />
        <span style={{ whiteSpace: 'nowrap' }}>{customer.isActive ? 'Active' : 'Inactive'}</span>
      </div>

      {/* Header - Responsive */}
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        gap: '12px', 
        marginBottom: '1rem',
        flexWrap: 'wrap'
      }}>
        <div style={{
          width: '48px',
          height: '48px',
          borderRadius: '16px',
          background: `linear-gradient(135deg, ${PRIMARY_COLOR}15, ${PRIMARY_COLOR}05)`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0
        }}>
          <Users size={24} color={PRIMARY_COLOR} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 style={{ 
            margin: 0, 
            fontSize: 'clamp(0.9rem, 4vw, 1rem)', 
            fontWeight: '700', 
            color: '#1e293b',
            wordBreak: 'break-word',
            overflowWrap: 'break-word',
            lineHeight: 1.3
          }}>
            {customer.name}
          </h3>
          {customer.companyName && (
            <p style={{ 
              margin: '0.25rem 0 0', 
              fontSize: '0.7rem', 
              color: '#64748b',
              wordBreak: 'break-word'
            }}>
              {customer.companyName}
            </p>
          )}
        </div>
      </div>

      {/* Contact Info - Responsive */}
      <div style={{ marginBottom: '1rem' }}>
        {customer.email && (
          <div style={{ 
            display: 'flex', 
            alignItems: 'flex-start', 
            gap: '8px', 
            marginBottom: '0.5rem', 
            fontSize: '0.8rem', 
            color: '#475569'
          }}>
            <Mail size={14} color="#94a3b8" style={{ flexShrink: 0, marginTop: '2px' }} />
            <span style={{ 
              flex: 1, 
              wordBreak: 'break-all',
              overflowWrap: 'break-word'
            }}>
              {customer.email}
            </span>
          </div>
        )}
        {customer.phone && (
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '8px', 
            fontSize: '0.8rem', 
            color: '#475569',
            flexWrap: 'wrap'
          }}>
            <Phone size={14} color="#94a3b8" style={{ flexShrink: 0 }} />
            <span style={{ wordBreak: 'break-word' }}>{customer.phone}</span>
          </div>
        )}
      </div>

      {/* Tax & Location - Responsive */}
      <div style={{ 
        display: 'flex', 
        flexWrap: 'wrap', 
        gap: '8px', 
        marginBottom: '1rem',
        padding: '0.75rem',
        background: '#f8fafc',
        borderRadius: '12px'
      }}>
        <span style={{
          padding: '0.25rem 0.5rem',
          borderRadius: '8px',
          fontSize: '0.7rem',
          fontWeight: '600',
          background: isVatRegistered ? '#d1fae5' : '#f1f5f9',
          color: isVatRegistered ? '#065f46' : '#475569',
          whiteSpace: 'nowrap'
        }}>
          {isVatRegistered ? 'VAT Registered' : 'Non-VAT'}
        </span>
        {customer.placeOfSupply && (
          <span style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            padding: '0.25rem 0.5rem',
            borderRadius: '8px',
            fontSize: '0.7rem',
            background: '#e0e7ff',
            color: '#4338ca',
            whiteSpace: 'nowrap'
          }}>
            <MapPin size={10} />
            {customer.placeOfSupply}
          </span>
        )}
        {customer.defaultCurrency?.code && (
          <span style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            padding: '0.25rem 0.5rem',
            borderRadius: '8px',
            fontSize: '0.7rem',
            background: '#fef3c7',
            color: '#92400e',
            whiteSpace: 'nowrap'
          }}>
            <CreditCard size={10} />
            {customer.defaultCurrency.code}
          </span>
        )}
      </div>

      {/* Actions - Responsive buttons */}
      <div style={{ 
        display: 'flex', 
        gap: '8px', 
        justifyContent: 'flex-end', 
        borderTop: '1px solid #e2e8f0', 
        paddingTop: '0.75rem',
        flexWrap: 'wrap'
      }}>
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => onEdit(customer)}
          style={{
            padding: '0.5rem 1rem',
            borderRadius: '10px',
            border: '1px solid #e2e8f0',
            background: 'white',
            cursor: 'pointer',
            fontSize: '0.75rem',
            fontWeight: '500',
            color: '#475569',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            flex: '1 0 auto',
            justifyContent: 'center'
          }}
        >
          <Edit2 size={12} /> Edit
        </motion.button>
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => onDelete(customer)}
          disabled={deletingId === customer._id}
          style={{
            padding: '0.5rem 1rem',
            borderRadius: '10px',
            border: '1px solid #fee2e2',
            background: '#fef2f2',
            cursor: deletingId === customer._id ? 'not-allowed' : 'pointer',
            fontSize: '0.75rem',
            fontWeight: '500',
            color: '#dc2626',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            flex: '1 0 auto',
            justifyContent: 'center'
          }}
        >
          {deletingId === customer._id ? (
            <div style={{ width: '12px', height: '12px', border: '2px solid #dc2626', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} />
          ) : (
            <Trash2 size={12} />
          )}
          Delete
        </motion.button>
      </div>
    </motion.div>
  );
};

// Mobile Stats Card - Compact like HomeScreen
const MobileStatsCard = ({ stats, loading }) => {
  const [expanded, setExpanded] = useState(false);

  const statusItems = [
    { label: 'Total Customers', value: stats?.totalCustomers, icon: Users, color: '#6366f1', bg: '#e0e7ff' },
    { label: 'VAT Registered', value: stats?.vatRegistered, icon: Building2, color: '#10b981', bg: '#d1fae5' },
    { label: 'Non-VAT', value: stats?.nonVatRegistered, icon: Tag, color: '#f59e0b', bg: '#fef3c7' },
    { label: 'Active', value: stats?.activeCustomers, icon: User, color: '#8b5cf6', bg: '#ede9fe' },
  ];

  return (
    <div style={{
      background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
      borderRadius: '16px',
      padding: '1rem',
      marginBottom: '1rem',
      boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
    }}>
      {/* Main stats row - 3 items */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem' }}>
        <div style={{ flex: 1, textAlign: 'center' }}>
          <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginBottom: '0.25rem' }}>
            <Users size={12} style={{ display: 'inline', marginRight: '0.25rem' }} />
            Total
          </div>
          <div style={{ fontSize: '1rem', fontWeight: 700, color: 'white' }}>
            {loading ? '...' : (stats?.totalCustomers?.toLocaleString() || 0)}
          </div>
        </div>
        
        <div style={{ width: '1px', height: '35px', background: '#334155' }} />
        
        <div style={{ flex: 1, textAlign: 'center' }}>
          <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginBottom: '0.25rem' }}>
            <Building2 size={12} style={{ display: 'inline', marginRight: '0.25rem' }} />
            VAT
          </div>
          <div style={{ fontSize: '1rem', fontWeight: 700, color: 'white' }}>
            {loading ? '...' : (stats?.vatRegistered?.toLocaleString() || 0)}
          </div>
        </div>
        
        <div style={{ width: '1px', height: '35px', background: '#334155' }} />
        
        <div style={{ flex: 1, textAlign: 'center' }}>
          <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginBottom: '0.25rem' }}>
            <Tag size={12} style={{ display: 'inline', marginRight: '0.25rem' }} />
            Non-VAT
          </div>
          <div style={{ fontSize: '1rem', fontWeight: 700, color: 'white' }}>
            {loading ? '...' : (stats?.nonVatRegistered?.toLocaleString() || 0)}
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

       {expanded && (
        <div style={{
          marginTop: '1rem',
          paddingTop: '1rem',
          borderTop: '1px solid #334155'
        }}>
          <div style={{
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
              backgroundColor: '#ede9fe',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <User size={14} color="#8b5cf6" />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '0.65rem', color: '#94a3b8' }}>Active Customers</div>
              <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'white' }}>
                {loading ? '...' : (stats?.activeCustomers?.toLocaleString() || 0)}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
 
// Mobile Filter Drawer Component
const FilterDrawer = ({ isOpen, onClose, filters, onFilterChange, onReset, currentPagination, onLimitChange, sortOption, onSortChange, viewMode, onViewChange }) => {
  if (!isOpen) return null;
  
  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          zIndex: 999,
          animation: 'fadeIn 0.2s ease-out'
        }}
      />
      <div
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: '85%',
          maxWidth: '320px',
          background: 'white',
          zIndex: 1000,
          boxShadow: '-4px 0 20px rgba(0,0,0,0.1)',
          display: 'flex',
          flexDirection: 'column',
          animation: 'slideInRight 0.3s ease-out'
        }}
      >
        <div style={{ 
          padding: '1.25rem', 
          borderBottom: '1px solid #e2e8f0', 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center' 
        }}>
          <h3 style={{ margin: 0, fontSize: '1.125rem', fontWeight: '600' }}>Filters</h3>
          <button 
            onClick={onClose} 
            style={{ 
              background: 'none', 
              border: 'none', 
              cursor: 'pointer',
              padding: '4px',
              borderRadius: '8px'
            }}
          >
            <X size={20} />
          </button>
        </div>
        
        <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem' }}>
          {/* Status Filter */}
          <div style={{ marginBottom: '1.25rem' }}>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '600', marginBottom: '0.5rem', color: '#64748b' }}>
              Status
            </label>
            <CommonSelect
              value={filters.status || 'all'}
              onChange={(value) => onFilterChange('status', value)}
              options={[
                { value: 'all', label: 'All Status' },
                { value: 'active', label: 'Active' },
                { value: 'inactive', label: 'Inactive' }
              ]}
              size="md"
            />
          </div>
          
          {/* Tax Status Filter */}
          <div style={{ marginBottom: '1.25rem' }}>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '600', marginBottom: '0.5rem', color: '#64748b' }}>
              Tax Status
            </label>
            <CommonSelect
              value={filters.taxStatus || 'all'}
              onChange={(value) => onFilterChange('taxStatus', value)}
              options={[
                { value: 'all', label: 'All Tax' },
                { value: 'vat_registered', label: 'VAT Registered' },
                { value: 'non_vat_registered', label: 'Non-VAT' },
                { value: 'gcc_vat_registered', label: 'GCC VAT' },
                { value: 'gcc_non_vat_registered', label: 'GCC Non-VAT' }
              ]}
              size="md"
            />
          </div>
          
          {/* Place of Supply Filter */}
          <div style={{ marginBottom: '1.25rem' }}>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '600', marginBottom: '0.5rem', color: '#64748b' }}>
              Place of Supply
            </label>
            <CommonSelect
              value={filters.placeOfSupply || 'all'}
              onChange={(value) => onFilterChange('placeOfSupply', value)}
              options={[
                { value: 'all', label: 'All Places' },
                { value: 'Dubai', label: 'Dubai' },
                { value: 'Abu Dhabi', label: 'Abu Dhabi' },
                { value: 'Sharjah', label: 'Sharjah' },
                { value: 'Saudi Arabia', label: 'Saudi Arabia' },
                { value: 'Kuwait', label: 'Kuwait' },
                { value: 'Qatar', label: 'Qatar' }
              ]}
              size="md"
            />
          </div>
          
          {/* Items per page */}
          <div style={{ marginBottom: '1.25rem' }}>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '600', marginBottom: '0.5rem', color: '#64748b' }}>
              Items per page
            </label>
            <CommonSelect
              value={currentPagination?.limit || 10}
              onChange={(value) => onLimitChange(value)}
              options={[
                { value: '10', label: '10 / page' },
                { value: '25', label: '25 / page' },
                { value: '50', label: '50 / page' },
                { value: '100', label: '100 / page' }
              ]}
              size="md"
            />
          </div>
          
          {/* Sort By */}
          <div style={{ marginBottom: '1.25rem' }}>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '600', marginBottom: '0.5rem', color: '#64748b' }}>
              Sort By
            </label>
            <CommonSelect
              value={sortOption}
              onChange={(value) => onSortChange(value)}
              options={[
                { value: 'newest', label: 'Newest First' },
                { value: 'oldest', label: 'Oldest First' },
                { value: 'az', label: 'A to Z' },
                { value: 'za', label: 'Z to A' }
              ]}
              size="md"
            />
          </div>
          
          {/* View Mode */}
          <div style={{ marginBottom: '1.25rem' }}>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '600', marginBottom: '0.5rem', color: '#64748b' }}>
              View Mode
            </label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {['card', 'table'].map(v => (
                <button
                  key={v}
                  onClick={() => onViewChange(v)}
                  style={{
                    flex: 1,
                    padding: '0.5rem',
                    borderRadius: '8px',
                    border: '1px solid #e2e8f0',
                    background: viewMode === v ? PRIMARY_COLOR : 'white',
                    color: viewMode === v ? 'white' : '#64748b',
                    cursor: 'pointer',
                    fontWeight: '500',
                    fontSize: '0.75rem'
                  }}
                >
                  {v === 'card' ? 'Cards' : 'Table'}
                </button>
              ))}
            </div>
          </div>
        </div>
        
        <div style={{ padding: '1rem', borderTop: '1px solid #e2e8f0', display: 'flex', gap: '0.75rem' }}>
          <button
            onClick={onReset}
            style={{
              flex: 1,
              padding: '0.75rem',
              borderRadius: '12px',
              border: '1px solid #e2e8f0',
              background: 'white',
              cursor: 'pointer',
              fontWeight: '500',
              fontSize: '0.875rem'
            }}
          >
            Reset All
          </button>
          <button
            onClick={onClose}
            style={{
              flex: 1,
              padding: '0.75rem',
              borderRadius: '12px',
              background: PRIMARY_COLOR,
              color: 'white',
              border: 'none',
              cursor: 'pointer',
              fontWeight: '500',
              fontSize: '0.875rem'
            }}
          >
            Apply
          </button>
        </div>
      </div>
    </>
  );
};

 const Toolbar = ({
  searchValue,
  onSearchChange,
  filters,
  onFilterChange,
  onResetFilters,
  currentPagination,
  onLimitChange,
  sortOption,
  onSortChange,
  viewMode,
  onViewChange,
  onAddClick,
  isMobile = false
}) => {
  const [showFilterDrawer, setShowFilterDrawer] = useState(false);

  return (
    <>
      <div style={{
        padding: 'clamp(12px, 3vw, 16px) clamp(16px, 4vw, 20px)',
        background: '#ffffff',
        borderBottom: '1px solid #e5e7eb'
      }}>
        {/* Search Bar - Full width on top */}
        <div style={{ position: 'relative', marginBottom: '1rem' }}>
          <Search size={16} style={{
            position: 'absolute',
            left: '12px',
            top: '50%',
            transform: 'translateY(-50%)',
            color: '#9ca3af',
            pointerEvents: 'none'
          }} />
          <input
            type="text"
            placeholder="Search by name, email or phone..."
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            style={{
              width: '100%',
              padding: isMobile ? '0.6rem 0.6rem 0.6rem 2.2rem' : '0.7rem 0.7rem 0.7rem 2.5rem',
              borderRadius: '12px',
              border: '1px solid #e5e7eb',
              fontSize: isMobile ? '0.85rem' : '0.9rem',
              background: '#f9fafb',
              outline: 'none',
              transition: 'all 0.2s ease'
            }}
            onFocus={(e) => {
              e.target.style.borderColor = PRIMARY_COLOR;
              e.target.style.background = 'white';
            }}
            onBlur={(e) => {
              e.target.style.borderColor = '#e5e7eb';
              e.target.style.background = '#f9fafb';
            }}
          />
        </div>

        {/* Filters Row - Below search */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          flexWrap: 'wrap'
        }}>
          {/* Left side - Filters */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            flexWrap: 'wrap',
            flex: isMobile ? '1' : 'auto'
          }}>
            {isMobile ? (
              <button
                onClick={() => setShowFilterDrawer(true)}
                style={{
                  background: '#f9fafb',
                  border: '1px solid #e5e7eb',
                  borderRadius: '10px',
                  padding: '0.5rem 1rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  cursor: 'pointer'
                }}
              >
                <Filter size={14} />
                <span style={{ fontSize: '0.8rem', fontWeight: '500' }}>Filters</span>
              </button>
            ) : (
              <>
                <CommonSelect
                  value={filters.status || 'all'}
                  onChange={(value) => onFilterChange('status', value)}
                  options={[
                    { value: 'all', label: 'All Status' },
                    { value: 'active', label: 'Active' },
                    { value: 'inactive', label: 'Inactive' }
                  ]}
                  size="md"
                />

                <CommonSelect
                  value={filters.taxStatus || 'all'}
                  onChange={(value) => onFilterChange('taxStatus', value)}
                  options={[
                    { value: 'all', label: 'All Tax' },
                    { value: 'vat_registered', label: 'VAT Registered' },
                    { value: 'non_vat_registered', label: 'Non-VAT' },
                    { value: 'gcc_vat_registered', label: 'GCC VAT' },
                    { value: 'gcc_non_vat_registered', label: 'GCC Non-VAT' }
                  ]}
                  size="md"
                />

                <CommonSelect
                  value={filters.placeOfSupply || 'all'}
                  onChange={(value) => onFilterChange('placeOfSupply', value)}
                  options={[
                    { value: 'all', label: 'All Places' },
                    { value: 'Dubai', label: 'Dubai' },
                    { value: 'Abu Dhabi', label: 'Abu Dhabi' },
                    { value: 'Sharjah', label: 'Sharjah' },
                    { value: 'Saudi Arabia', label: 'Saudi Arabia' },
                    { value: 'Kuwait', label: 'Kuwait' },
                    { value: 'Qatar', label: 'Qatar' }
                  ]}
                  size="md"
                />

                <CommonSelect
                  value={currentPagination?.limit || 10}
                  onChange={(value) => onLimitChange(value)}
                  options={[
                    { value: '10', label: '10 / page' },
                    { value: '25', label: '25 / page' },
                    { value: '50', label: '50 / page' },
                    { value: '100', label: '100 / page' }
                  ]}
                  size="md"
                />

                <CommonSelect
                  value={sortOption}
                  onChange={(value) => onSortChange(value)}
                  options={[
                    { value: 'newest', label: 'Newest First' },
                    { value: 'oldest', label: 'Oldest First' },
                    { value: 'az', label: 'A to Z' },
                    { value: 'za', label: 'Z to A' }
                  ]}
                  size="md"
                />

                {/* View Toggle */}
                <div style={{
                  display: 'flex',
                  background: '#f1f5f9',
                  borderRadius: '12px',
                  padding: '3px',
                  gap: '2px'
                }}>
                  {['card', 'table'].map(v => (
                    <button
                      key={v}
                      onClick={() => onViewChange(v)}
                      style={{
                        padding: '6px 14px',
                        borderRadius: '9px',
                        border: 'none',
                        fontSize: '0.75rem',
                        fontWeight: '500',
                        background: viewMode === v ? '#fff' : 'transparent',
                        boxShadow: viewMode === v ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                        cursor: 'pointer',
                        color: viewMode === v ? PRIMARY_COLOR : '#64748b',
                        transition: 'all 0.2s'
                      }}
                    >
                      {v === 'card' ? 'Cards' : 'Table'}
                    </button>
                  ))}
                </div>

                {/* Reset Filters Button */}
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={onResetFilters}
                  style={{
                    background: '#f1f5f9',
                    color: '#64748b',
                    border: 'none',
                    borderRadius: '10px',
                    padding: '0.5rem 1rem',
                    fontSize: '0.75rem',
                    fontWeight: '500',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <X size={14} />
                  Reset
                </motion.button>
              </>
            )}
          </div>

          {/* Right side - Add Customer Button */}
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={onAddClick}
            style={{
              background: `linear-gradient(135deg, ${PRIMARY_COLOR}, #1e293b)`,
              color: '#fff',
              border: 'none',
              borderRadius: '10px',
              padding: isMobile ? '0.5rem 1rem' : '0.6rem 1.2rem',
              fontSize: isMobile ? '0.8rem' : '0.85rem',
              fontWeight: '600',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <Plus size={isMobile ? 14 : 16} />
            {isMobile ? 'Add' : 'Add Customer'}
          </motion.button>
        </div>
      </div>

      {/* Mobile Filter Drawer */}
      <FilterDrawer
        isOpen={showFilterDrawer}
        onClose={() => setShowFilterDrawer(false)}
        filters={filters}
        onFilterChange={onFilterChange}
        onReset={onResetFilters}
        currentPagination={currentPagination}
        onLimitChange={onLimitChange}
        sortOption={sortOption}
        onSortChange={onSortChange}
        viewMode={viewMode}
        onViewChange={onViewChange}
      />
    </>
  );
};

const useMediaQuery = (query) => {
  const [matches, setMatches] = useState(false);
  
  useEffect(() => {
    const media = window.matchMedia(query);
    if (media.matches !== matches) {
      setMatches(media.matches);
    }
    const listener = (e) => setMatches(e.matches);
    media.addEventListener('change', listener);
    return () => media.removeEventListener('change', listener);
  }, [query]);
  
  return matches;
};

export default function CustomersScreen({ onBack, companyId: propCompanyId }) {
  const { selectedCompany: contextCompanyId } = useCompanyCurrency();
  const effectiveCompanyId = propCompanyId || contextCompanyId;
  
  const isAllCompanies = effectiveCompanyId === 'all' || effectiveCompanyId === 'ALL';

  // Store subscriptions
  const customerFilters = useAppStore((state) => state.customerFilters);
  const setCustomerFilters = useAppStore((state) => state.setCustomerFilters);
  const fetchFilteredCustomers = useAppStore((state) => state.fetchFilteredCustomers);
  const fetchCustomerStats = useAppStore((state) => state.fetchCustomerStats);
  const addCustomerToStore = useAppStore((state) => state.addCustomer);
  const updateCustomerInStore = useAppStore((state) => state.updateCustomer);
  const deleteCustomerFromStore = useAppStore((state) => state.deleteCustomer);
  const customers = useAppStore((state) => state.customers);
  const customersPagination = useAppStore((state) => state.customersPagination);
  const loading = useAppStore((state) => state.loading);
  const customerStats = useAppStore((state) => state.customerStats);
  
  // Local state
  const [isSyncing, setIsSyncing] = useState(false);
  const [progressData, setProgressData] = useState(null);
  const [showProgressModal, setShowProgressModal] = useState(false);
  const [toast, setToast] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [viewMode, setViewMode] = useState('card');
  const [sortOption, setSortOption] = useState('newest');
  const [deleteModal, setDeleteModal] = useState({ open: false, customer: null });
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showFilterDrawer, setShowFilterDrawer] = useState(false);
  const [searchInput, setSearchInput] = useState(customerFilters.search || '');
  
  const isMobile = useMediaQuery('(max-width: 768px)');
  const searchTimer = useRef(null);
  
  const currentCustomers = useMemo(() => customers || [], [customers]);
  const currentLoading = loading;
  const currentPagination = customersPagination;
  
  // Load initial data when company changes
  useEffect(() => {
    if (!effectiveCompanyId) return;
    
    const loadData = async () => {
      let sortBy = 'createdAt';
      let sortOrder = 'desc';
      
      switch(sortOption) {
        case 'newest': sortBy = 'createdAt'; sortOrder = 'desc'; break;
        case 'oldest': sortBy = 'createdAt'; sortOrder = 'asc'; break;
        case 'az': sortBy = 'name'; sortOrder = 'asc'; break;
        case 'za': sortBy = 'name'; sortOrder = 'desc'; break;
      }
      
      // Pass companyId as 'all' if effectiveCompanyId is 'all'
      const filters = { ...customerFilters, sortBy, sortOrder };
      if (effectiveCompanyId === 'all') {
        filters.companyId = 'all';
      }
      
      await Promise.all([
        fetchCustomerStats(filters),
        fetchFilteredCustomers(filters, { page: 1, limit: isMobile ? 10 : 20 })
      ]);
    };
    
    loadData();
  }, [effectiveCompanyId, sortOption]);
  
  // Debounced search
  const handleSearchChange = useCallback((value) => {
    setSearchInput(value);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setCustomerFilters({ ...customerFilters, search: value?.trim() || '' });
    }, 500);
  }, [setCustomerFilters, customerFilters]);
  
  const handleLimitChange = useCallback((newLimit) => {
    fetchFilteredCustomers(customerFilters, { page: 1, limit: parseInt(newLimit, 10) });
  }, [fetchFilteredCustomers, customerFilters]);
  
  const handleOpenModal = useCallback((customer = null) => { 
    if (isAllCompanies) {
      showToast('Please select a specific company to add or edit customers', 'error');
      return;
    }
    setEditingCustomer(customer); 
    setShowModal(true); 
  }, []);
  
  const handleCloseModal = useCallback(() => { 
    setShowModal(false); 
    setEditingCustomer(null); 
    setIsSubmitting(false); 
  }, []);
  
  const handleSortChange = useCallback((option) => {
    setSortOption(option);
  }, []);
  
  const handlePageChange = useCallback((newPage) => {
    fetchFilteredCustomers(customerFilters, { page: newPage });
  }, [fetchFilteredCustomers, customerFilters]);
  
  const handleSubmit = useCallback(async (formData) => {
    setIsSubmitting(true);
    try {
      let result;
      
      if (editingCustomer) {
        result = await updateCustomerInStore(editingCustomer._id, formData);
        if (result?.success) {
          handleCloseModal();
          showToast('✅ Customer updated successfully', 'success');
          await refreshData();
        } else {
          showToast(result?.error || 'Error updating customer', 'error');
        }
      } else {
        result = await addCustomerToStore(formData);
        if (result?.success) {
          handleCloseModal();
          showToast('✅ Customer added successfully', 'success');
          await refreshData();
        } else {
          showToast(result?.error || 'Error adding customer', 'error');
        }
      }
    } catch (error) { 
      showToast(error?.response?.data?.message || error?.message || 'Error saving customer', 'error'); 
    } finally { 
      setIsSubmitting(false); 
    }
  }, [editingCustomer, addCustomerToStore, updateCustomerInStore, handleCloseModal]);
  
  const handleDeleteClick = (customer) => {
    if (isAllCompanies) {
      showToast('Please select a specific company to delete customers', 'error');
      return;
    }
    setDeleteModal({ open: true, customer });
  };
  
  const handleDeleteConfirm = async () => {
    if (!deleteModal.customer) return;
    
    setDeletingId(deleteModal.customer._id);
    try {
      const result = await deleteCustomerFromStore(deleteModal.customer._id);
      if (result?.success) {
        showToast('Customer deleted successfully', 'success');
        await refreshData();
      } else {
        showToast(result?.error || 'Failed to delete customer', 'error');
      }
      setDeleteModal({ open: false, customer: null });
    } catch (error) {
      showToast(error?.message || 'Failed to delete', 'error');
    } finally {
      setDeletingId(null);
    }
  };
  
  const handleDeleteCancel = () => {
    setDeleteModal({ open: false, customer: null });
  };
  
  const handleResetFilters = useCallback(async () => {
    const resetFilters = {
      status: 'all',
      taxStatus: 'all',
      placeOfSupply: 'all',
      hasTRN: 'all',
      search: '',
      minQuotations: null,
      maxQuotations: null,
      minTotalValue: null,
      maxTotalValue: null,
      zohoSyncStatus: 'all'
    };
    setCustomerFilters(resetFilters);
    setSearchInput('');
    setSortOption('newest');
    await fetchFilteredCustomers({ ...resetFilters, sortBy: 'createdAt', sortOrder: 'desc' }, { page: 1 });
    showToast('All filters reset', 'success');
  }, [setCustomerFilters, fetchFilteredCustomers]);
  
  const handleFilterChange = (key, value) => {
    setCustomerFilters({ ...customerFilters, [key]: value });
  };
  
  const handleExportCustomers = useCallback(async (format = 'xlsx') => {
    if (isAllCompanies) {
      showToast('Exporting all companies data - this may take a moment', 'info');
    }
    
    showToast('Preparing export...', 'info');
    try {
      const exportParams = {
        status: customerFilters.status !== 'all' ? customerFilters.status : undefined,
        taxStatus: customerFilters.taxStatus !== 'all' ? customerFilters.taxStatus : undefined,
        placeOfSupply: customerFilters.placeOfSupply !== 'all' ? customerFilters.placeOfSupply : undefined,
        search: customerFilters.search || undefined,
      };
      
      // Add companyId if not 'all'
      if (effectiveCompanyId && effectiveCompanyId !== 'all') {
        exportParams.companyId = effectiveCompanyId;
      }
      
      Object.keys(exportParams).forEach(key => 
        exportParams[key] === undefined && delete exportParams[key]
      );
      
      const response = await customerAPI.exportCustomers(exportParams, format);
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      const fileExtension = format === 'xlsx' ? 'xlsx' : 'csv';
      link.setAttribute('download', `customers_export_${new Date().toISOString().split('T')[0]}.${fileExtension}`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      
      showToast('Customers exported successfully!', 'success');
    } catch (error) {
      console.error('Export failed:', error);
      showToast(error?.response?.data?.message || 'Failed to export customers', 'error');
    }
  }, [customerFilters, effectiveCompanyId]);
  
  const handleSync = useCallback(async (fullSync = false) => {
    if (isAllCompanies) {
      showToast('Please select a specific company to sync customers', 'error');
      return;
    }
    setIsSyncing(true);
    try {
      const response = await customerAPI.syncFromZoho(fullSync, effectiveCompanyId);
      const data = response.data;
      
      if (data.success) {
        setProgressData({
          stage: 'starting',
          message: fullSync ? 'Starting Full Sync from Zoho...' : 'Starting Incremental Sync...',
          fetched: 0,
          total: 0
        });
        setShowProgressModal(true);
        showToast(fullSync ? '🔄 Full sync started...' : '🔄 Incremental sync started...', 'success');
      } else {
        showToast(data.message || 'Failed to start sync', 'error');
      }
    } catch (error) {
      console.error(error);
      showToast('Failed to start sync', 'error');
    } finally {
      setIsSyncing(false);
    }
  }, [effectiveCompanyId]);
  
  const refreshData = useCallback(async () => {
    setIsRefreshing(true);
    let sortBy = 'createdAt';
    let sortOrder = 'desc';
    switch(sortOption) {
      case 'newest': sortBy = 'createdAt'; sortOrder = 'desc'; break;
      case 'oldest': sortBy = 'createdAt'; sortOrder = 'asc'; break;
      case 'az': sortBy = 'name'; sortOrder = 'asc'; break;
      case 'za': sortBy = 'name'; sortOrder = 'desc'; break;
    }
    
    const currentPage = currentPagination?.page || 1;
    const currentLimit = currentPagination?.limit || (isMobile ? 10 : 20);
    
    const filters = { ...customerFilters, sortBy, sortOrder };
    if (effectiveCompanyId === 'all') {
      filters.companyId = 'all';
    }
    
    await Promise.all([
      fetchFilteredCustomers(filters, { page: currentPage, limit: currentLimit }),
      fetchCustomerStats(filters)
    ]);
    
    setIsRefreshing(false);
    showToast('Data refreshed!', 'success');
  }, [fetchFilteredCustomers, fetchCustomerStats, customerFilters, sortOption, currentPagination, effectiveCompanyId, isMobile]);
  
  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };
  
  // Progress Polling
  useEffect(() => {
    let interval;
    
    if (showProgressModal && effectiveCompanyId) {
      interval = setInterval(async () => {
        try {
          const res = await customerAPI.getSyncProgress(effectiveCompanyId);
          const data = res.data;
          
          if (data.success) {
            setProgressData(data.progress);
            
            if (data.progress.stage === 'completed' || data.progress.stage === 'error') {
              clearInterval(interval);
              setTimeout(async () => {
                setShowProgressModal(false);
                setProgressData(null);
                await refreshData();
              }, 1500);
            }
          }
        } catch (err) {
          console.error("Progress polling error:", err);
        }
      }, 1200);
    }
    
    return () => clearInterval(interval);
  }, [showProgressModal, effectiveCompanyId, refreshData]);
  
  // Cleanup timer on unmount
  useEffect(() => {
    return () => clearTimeout(searchTimer.current);
  }, []);
  

  const AllCompaniesWarning = () => {
    if (!isAllCompanies) return null;
    
    return (
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        style={{
          background: 'linear-gradient(135deg, #fef3c7, #fffbeb)',
          borderLeft: `4px solid #f59e0b`,
          borderRadius: '12px',
          padding: '1rem 1.25rem',
          marginBottom: '1.5rem',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          flexWrap: 'wrap'
        }}
      >
        <AlertCircle size={20} color="#f59e0b" />
        <div style={{ flex: 1 }}>
          <p style={{ margin: 0, fontWeight: 600, color: '#92400e', fontSize: '0.875rem' }}>
            View-Only Mode: All Companies Selected
          </p>
          <p style={{ margin: '4px 0 0', color: '#b45309', fontSize: '0.75rem' }}>
            You are currently viewing customers from all companies. To add, edit, or delete customers, please select a specific company from the company selector.
          </p>
        </div>
 
      </motion.div>
    );
  };
  
  // Stats data for display
  const statsData = {
    totalCustomers: customerStats?.totalCustomers || 0,
    vatRegistered: customerStats?.vatRegistered || 0,
    nonVatRegistered: customerStats?.nonVatRegistered || 0,
    activeCustomers: customerStats?.activeCustomers || 0
  };
  
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{ 
        minHeight: '100vh', 
        background: 'linear-gradient(135deg, #f0f4ff 0%, #e8edf5 100%)',
        fontFamily: 'system-ui, -apple-system, sans-serif'
      }}
    >
      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: 'clamp(1rem, 5vw, 2rem) clamp(1rem, 4vw, 1.5rem)' }}>
        
        {/* Header Section */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'flex-start', 
            marginBottom: '2rem', 
            flexWrap: 'wrap', 
            gap: '1.5rem'
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '0.5rem' }}>
              <motion.div
                whileHover={{ rotate: 5, scale: 1.05 }}
                style={{ 
                  width: '52px', 
                  height: '52px', 
                  background: `linear-gradient(135deg, ${PRIMARY_COLOR}15, ${PRIMARY_COLOR}05)`,
                  borderRadius: '18px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: `1px solid ${PRIMARY_COLOR}20`
                }}
              >
                <Users size={26} color={PRIMARY_COLOR} />
              </motion.div>
              <div>
                <h1 style={{ 
                  margin: 0, 
                  fontSize: 'clamp(1.5rem, 5vw, 2rem)', 
                  fontWeight: '800', 
                  background: `linear-gradient(135deg, ${PRIMARY_COLOR}, #1e293b)`, 
                  WebkitBackgroundClip: 'text', 
                  WebkitTextFillColor: 'transparent',
                  letterSpacing: '-0.02em'
                }}>
                  Customers
                </h1>
                <p style={{ 
                  margin: '0.25rem 0 0', 
                  color: '#64748b', 
                  fontSize: '0.875rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}>
                  <span style={{ 
                    display: 'inline-block', 
                    width: '6px', 
                    height: '6px', 
                    background: '#10b981', 
                    borderRadius: '50%',
                    animation: 'pulse 2s infinite'
                  }} />
                  Manage your customer relationships
                </p>
              </div>
            </div>
          </div>
          
          {/* Actions */}
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => handleExportCustomers('xlsx')}
              style={{ 
                background: 'linear-gradient(135deg, #10b981, #059669)', 
                border: 'none', 
                borderRadius: '14px', 
                padding: '0.7rem 1.4rem', 
                cursor: 'pointer', 
                display: 'flex', 
                alignItems: 'center', 
                gap: '0.6rem', 
                color: 'white', 
                fontWeight: '600', 
                fontSize: '0.85rem',
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
              }}
            >
              <Download size={16} />
              <span>Export</span>
            </motion.button>
            
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => handleSync(true)}
              disabled={isSyncing}
              style={{ 
                background: isSyncing ? '#9ca3af' : `linear-gradient(135deg, ${PRIMARY_COLOR}, #1e293b)`, 
                border: 'none', 
                borderRadius: '14px', 
                padding: '0.7rem 1.4rem', 
                cursor: isSyncing ? 'not-allowed' : 'pointer', 
                display: 'flex', 
                alignItems: 'center', 
                gap: '0.6rem', 
                color: 'white', 
                fontWeight: '600', 
                fontSize: '0.85rem',
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
              }}
            >
              <RefreshCw size={16} style={{ animation: isSyncing ? 'spin 1s linear infinite' : 'none' }} />
              <span>{isSyncing ? 'Syncing...' : 'Sync from Zoho'}</span>
            </motion.button>
            
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={onBack}
              style={{ 
                background: 'white', 
                border: '1px solid #e2e8f0', 
                borderRadius: '14px', 
                padding: '0.7rem 1.4rem', 
                cursor: 'pointer', 
                display: 'flex', 
                alignItems: 'center', 
                gap: '0.6rem', 
                fontWeight: '600', 
                fontSize: '0.85rem',
                color: '#475569',
                boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
              }}
            >
              <ArrowLeft size={16} />
              <span>Back</span>
            </motion.button>
          </div>
        </motion.div>
        <AllCompaniesWarning/>
        {/* Stats Cards */}
        {isMobile ? (
          <MobileStatsCard stats={statsData} loading={currentLoading} />
        ) : (
          <motion.div
            variants={staggerContainer}
            initial="initial"
            animate="animate"
            style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(4, 1fr)', 
              gap: '1rem', 
              marginBottom: '2rem' 
            }}
          >
            <StatCard label="Total Customers" value={statsData.totalCustomers} icon={Users} color="#6366f1" loading={currentLoading} />
            <StatCard label="VAT Registered" value={statsData.vatRegistered} icon={Building2} color="#10b981" loading={currentLoading} />
            <StatCard label="Non-VAT Registered" value={statsData.nonVatRegistered} icon={Tag} color="#f59e0b" loading={currentLoading} />
            <StatCard label="Active Customers" value={statsData.activeCustomers} icon={User} color="#8b5cf6" loading={currentLoading} />
          </motion.div>
        )}
        
        {/* Main Content Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          style={{ 
            background: 'white', 
            borderRadius: '24px', 
            boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05), 0 2px 4px -1px rgba(0,0,0,0.03)', 
            overflow: 'hidden' 
          }}
        >
          {/* Toolbar */}
          <Toolbar
            searchValue={searchInput}
            onSearchChange={handleSearchChange}
            filters={customerFilters}
            onFilterChange={handleFilterChange}
            onResetFilters={handleResetFilters}
            currentPagination={currentPagination}
            onLimitChange={handleLimitChange}
            sortOption={sortOption}
            onSortChange={handleSortChange}
            viewMode={viewMode}
            onViewChange={setViewMode}
            onAddClick={() => handleOpenModal()}
            isMobile={isMobile}
          />
          
          {/* Content Area */}
          <AnimatePresence mode="wait">
            {(currentLoading || isRefreshing) && !currentCustomers.length ? (
              <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ textAlign: 'center', padding: '4rem' }}>
                <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }} style={{ display: 'inline-block' }}>
                  <Loader size={48} color={PRIMARY_COLOR} />
                </motion.div>
                <p style={{ color: '#64748b', marginTop: '1rem' }}>Loading customers...</p>
              </motion.div>
            ) : !currentCustomers?.length ? (
              <motion.div key="empty" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} style={{ textAlign: 'center', padding: '4rem' }}>
                <Users size={64} style={{ color: '#cbd5e1', margin: '0 auto 1rem' }} />
                <p style={{ color: '#64748b', fontWeight: '500', marginBottom: '1rem' }}>No customers found</p>
                <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                  <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={() => handleSync(false)} style={{ padding: '0.75rem 1.5rem', background: `linear-gradient(135deg, ${PRIMARY_COLOR}, #1e293b)`, color: 'white', border: 'none', borderRadius: '14px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', fontWeight: '600' }}>
                    <RefreshCw size={16} /> Sync from Zoho
                  </motion.button>
                  <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={() => handleOpenModal()} style={{ padding: '0.75rem 1.5rem', background: 'white', color: PRIMARY_COLOR, border: `1px solid ${PRIMARY_COLOR}`, borderRadius: '14px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', fontWeight: '600' }}>
                    <Plus size={16} /> Add Customer
                  </motion.button>
                </div>
              </motion.div>
            ) : viewMode === 'card' ? (
              <motion.div key="card-view" variants={staggerContainer} initial="initial" animate="animate" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 320px), 1fr))', gap: '1.25rem', padding: '1.5rem', width: '100%' }}>
                {currentCustomers.map((customer) => (
                  <CustomerCard key={customer._id} customer={customer} onEdit={handleOpenModal} onDelete={handleDeleteClick} deletingId={deletingId} />
                ))}
              </motion.div>
            ) : (
              <motion.div key="table-view" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '800px' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                      <th style={{ padding: '1rem', textAlign: 'left', color: '#64748b', fontSize: '0.7rem', fontWeight: '600', textTransform: 'uppercase' }}>Customer</th>
                      <th style={{ padding: '1rem', textAlign: 'left', color: '#64748b', fontSize: '0.7rem', fontWeight: '600', textTransform: 'uppercase' }}>Email</th>
                      <th style={{ padding: '1rem', textAlign: 'left', color: '#64748b', fontSize: '0.7rem', fontWeight: '600', textTransform: 'uppercase' }} className="hide-on-mobile">Phone</th>
                      <th style={{ padding: '1rem', textAlign: 'left', color: '#64748b', fontSize: '0.7rem', fontWeight: '600', textTransform: 'uppercase' }}>Tax Status</th>
                      <th style={{ padding: '1rem', textAlign: 'left', color: '#64748b', fontSize: '0.7rem', fontWeight: '600', textTransform: 'uppercase' }} className="hide-on-mobile">Place</th>
                      <th style={{ padding: '1rem', textAlign: 'left', color: '#64748b', fontSize: '0.7rem', fontWeight: '600', textTransform: 'uppercase' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentCustomers.map((customer) => {
                      const isVatRegistered = customer.taxTreatment === 'vat_registered' || customer.taxTreatment === 'gcc_vat_registered';
                      return (
                        <motion.tr key={customer._id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ borderBottom: '1px solid #f1f5f9', transition: 'background 0.2s' }} whileHover={{ background: '#f8fafc' }}>
                          <td style={{ padding: '1rem' }}>
                            <div style={{ fontWeight: '600', color: PRIMARY_COLOR }}>{customer.name}</div>
                            {customer.companyName && <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>{customer.companyName}</div>}
                          </td>
                          <td style={{ padding: '1rem', color: '#64748b', fontSize: '0.8rem' }}>{customer.email || '—'}</td>
                          <td style={{ padding: '1rem', color: '#64748b', fontSize: '0.8rem' }} className="hide-on-mobile">{customer.phone || '—'}</td>
                          <td style={{ padding: '1rem' }}>
                            <span style={{ padding: '0.25rem 0.75rem', borderRadius: '20px', fontSize: '0.7rem', fontWeight: '600', background: isVatRegistered ? '#d1fae5' : '#f1f5f9', color: isVatRegistered ? '#065f46' : '#475569' }}>
                              {isVatRegistered ? 'VAT' : 'Non-VAT'}
                            </span>
                          </td>
                          <td style={{ padding: '1rem', color: '#64748b', fontSize: '0.8rem' }} className="hide-on-mobile">{customer.placeOfSupply || '—'}</td>
                          <td style={{ padding: '1rem' }}>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                              <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={() => handleOpenModal(customer)} style={{ padding: '6px 10px', borderRadius: '8px', border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer', fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <Edit2 size={12} /> Edit
                              </motion.button>
                              <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={() => handleDeleteClick(customer)} disabled={deletingId === customer._id} style={{ padding: '6px 10px', borderRadius: '8px', border: '1px solid #fee2e2', background: '#fef2f2', color: '#dc2626', cursor: deletingId === customer._id ? 'not-allowed' : 'pointer', fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                {deletingId === customer._id ? <div style={{ width: '12px', height: '12px', border: '2px solid #dc2626', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} /> : <Trash2 size={12} />}
                                Delete
                              </motion.button>
                            </div>
                          </td>
                        </motion.tr>
                      );
                    })}
                  </tbody>
                </table>
              </motion.div>
            )}
          </AnimatePresence>
          
          {/* Pagination */}
          {currentPagination && currentPagination.totalPages > 1 && (
            <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid #e2e8f0' }}>
              <PaginationControls pagination={currentPagination} onPageChange={handlePageChange} loading={currentLoading} isMobile={isMobile} />
            </div>
          )}
        </motion.div>
      </div>
      
      {/* Modals */}
      <SyncProgressModal
        isOpen={showProgressModal}
        progress={progressData}
        onClose={() => { setShowProgressModal(false); setProgressData(null); }}
        onCancel={async () => {
          try {
            await customerAPI.cancelSync(effectiveCompanyId);
            showToast('Cancelling sync...', 'info');
            setTimeout(() => { setShowProgressModal(false); setProgressData(null); }, 2000);
          } catch (err) {
            showToast('Failed to cancel sync', 'error');
          }
        }}
      />
      
      <ConfirmModal
        open={deleteModal.open}
        title="Delete Customer"
        message={`Are you sure you want to delete "${deleteModal.customer?.name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={handleDeleteConfirm}
        onCancel={handleDeleteCancel}
        loading={deletingId === deleteModal.customer?._id}
        danger={true}
      />
      
      <CustomerModal isOpen={showModal} onClose={handleCloseModal} onSubmit={handleSubmit} initialData={editingCustomer} isSubmitting={isSubmitting} />
      
      <AnimatePresence>
        {showFilterDrawer && (
          <FilterDrawer
            isOpen={showFilterDrawer}
            onClose={() => setShowFilterDrawer(false)}
            filters={customerFilters}
            onFilterChange={handleFilterChange}
            onReset={handleResetFilters}
            currentPagination={currentPagination}
            onLimitChange={handleLimitChange}
            sortOption={sortOption}
            onSortChange={handleSortChange}
            viewMode={viewMode}
            onViewChange={setViewMode}
          />
        )}
      </AnimatePresence>
      
      <AnimatePresence>
        {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      </AnimatePresence>
    </motion.div>
  );
}