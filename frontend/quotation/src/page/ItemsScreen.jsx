// screens/ItemsScreen.jsx - FULLY RESPONSIVE VERSION
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  ArrowLeft, Search, RefreshCw, ChevronLeft, ChevronRight,
  Package, AlertCircle, CheckCircle, Loader2, Tag, Grid, List, X, Box, Wrench, DownloadCloud, Filter, ChevronDown, ChevronUp
} from 'lucide-react';
import { useAppStore } from '../services/store';
import { itemAPI } from '../services/api';
import useItemStore from '../services/itemStore';
import SyncProgressModal from './SyncProgressModal';
import { motion, AnimatePresence } from 'framer-motion';

const PRIMARY = '#0f172a';

const fmtCurrency = (n) => `AED ${(Number(n) || 0).toFixed(2)}`;

// Custom hook for responsive design
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

// Toast Component
function Toast({ message, type = 'success', onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 4000);
    return () => clearTimeout(t);
  }, [onClose]);

  const bg = type === 'success'
    ? 'linear-gradient(135deg,#10b981,#059669)'
    : type === 'error'
    ? 'linear-gradient(135deg,#ef4444,#dc2626)'
    : 'linear-gradient(135deg,#3b82f6,#2563eb)';

  return (
    <motion.div
      initial={{ opacity: 0, x: 100 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 100 }}
      style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 1000 }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: bg, color: 'white', padding: '14px 20px', borderRadius: 16, boxShadow: '0 10px 25px -5px rgba(0,0,0,0.15)' }}>
        {type === 'success' ? <CheckCircle size={20} /> : <AlertCircle size={20} />}
        <span style={{ fontWeight: 500, fontSize: '0.875rem' }}>{message}</span>
        <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: 8, padding: 4, cursor: 'pointer', display: 'flex' }}>
          <X size={14} />
        </button>
      </div>
    </motion.div>
  );
}

// StatCard Component - Responsive
function StatCard({ label, value, icon: Icon, color, subtitle, isMobile }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      whileHover={{ y: -2 }}
      style={{ 
        background: 'white', 
        borderRadius: isMobile ? '12px' : '20px', 
        padding: isMobile ? '0.75rem' : '1.25rem', 
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)' 
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
        <div style={{ 
          width: isMobile ? 36 : 44, 
          height: isMobile ? 36 : 44, 
          borderRadius: isMobile ? 10 : 14, 
          background: `${color}15`, 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center' 
        }}>
          <Icon size={isMobile ? 18 : 22} color={color} />
        </div>
      </div>
      <p style={{ margin: 0, color: '#64748b', fontSize: isMobile ? '0.65rem' : '0.72rem', fontWeight: 600 }}>{label}</p>
      <p style={{ margin: '0.25rem 0 0', color: PRIMARY, fontSize: isMobile ? '1.25rem' : '1.75rem', fontWeight: 800 }}>{value}</p>
      {subtitle && <p style={{ margin: '0.25rem 0 0', color: '#94a3b8', fontSize: '0.65rem' }}>{subtitle}</p>}
    </motion.div>
  );
}

// Mobile Filter Drawer
function MobileFilterDrawer({ isOpen, onClose, filters, stats, onFilterChange, onReset, sortBy, onSortChange, itemsPerPage, onItemsPerPageChange }) {
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
        <div style={{ padding: '1.25rem', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: '1.125rem', fontWeight: '600' }}>Filters</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
            <X size={20} />
          </button>
        </div>
        
        <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem' }}>
          {/* Product Type Filter */}
          <div style={{ marginBottom: '1.25rem' }}>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '600', marginBottom: '0.5rem', color: '#64748b' }}>Product Type</label>
            <select
              value={filters.productType}
              onChange={(e) => onFilterChange('productType', e.target.value)}
              style={{ width: '100%', padding: '0.6rem 1rem', borderRadius: '10px', border: '1.5px solid #e2e8f0', fontSize: '0.8rem' }}
            >
              <option value="all">All Types ({stats.total})</option>
              <option value="goods">Goods ({stats.goods})</option>
              <option value="service">Services ({stats.services})</option>
            </select>
          </div>
          
          {/* Sellable Filter */}
          <div style={{ marginBottom: '1.25rem' }}>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '600', marginBottom: '0.5rem', color: '#64748b' }}>Sellable</label>
            <select
              value={filters.sellable}
              onChange={(e) => onFilterChange('sellable', e.target.value)}
              style={{ width: '100%', padding: '0.6rem 1rem', borderRadius: '10px', border: '1.5px solid #e2e8f0', fontSize: '0.8rem' }}
            >
              <option value="all">All ({stats.total})</option>
              <option value="sellable">Sellable ({stats.sellable})</option>
              <option value="nonSellable">Non-Sellable ({stats.nonSellable})</option>
            </select>
          </div>
          
          {/* Status Filter */}
          <div style={{ marginBottom: '1.25rem' }}>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '600', marginBottom: '0.5rem', color: '#64748b' }}>Status</label>
            <select
              value={filters.status}
              onChange={(e) => onFilterChange('status', e.target.value)}
              style={{ width: '100%', padding: '0.6rem 1rem', borderRadius: '10px', border: '1.5px solid #e2e8f0', fontSize: '0.8rem' }}
            >
              <option value="all">All ({stats.total})</option>
              <option value="active">Active ({stats.active})</option>
              <option value="inactive">Inactive ({stats.inactive})</option>
            </select>
          </div>
          
          {/* Sort By */}
          <div style={{ marginBottom: '1.25rem' }}>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '600', marginBottom: '0.5rem', color: '#64748b' }}>Sort By</label>
            <select
              value={sortBy}
              onChange={(e) => onSortChange(e.target.value)}
              style={{ width: '100%', padding: '0.6rem 1rem', borderRadius: '10px', border: '1.5px solid #e2e8f0', fontSize: '0.8rem' }}
            >
              <option value="name">Name</option>
              <option value="price">Price</option>
              <option value="sku">SKU</option>
            </select>
          </div>
          
          {/* Items Per Page */}
          <div style={{ marginBottom: '1.25rem' }}>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '600', marginBottom: '0.5rem', color: '#64748b' }}>Items Per Page</label>
            <select
              value={itemsPerPage}
              onChange={(e) => onItemsPerPageChange(parseInt(e.target.value))}
              style={{ width: '100%', padding: '0.6rem 1rem', borderRadius: '10px', border: '1.5px solid #e2e8f0', fontSize: '0.8rem' }}
            >
              <option value="10">10 / page</option>
              <option value="25">25 / page</option>
              <option value="50">50 / page</option>
              <option value="100">100 / page</option>
            </select>
          </div>
        </div>
        
        <div style={{ padding: '1rem', borderTop: '1px solid #e2e8f0', display: 'flex', gap: '0.75rem' }}>
          <button
            onClick={onReset}
            style={{
              flex: 1,
              padding: '0.75rem',
              borderRadius: '10px',
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
              borderRadius: '10px',
              background: PRIMARY,
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
}

// PaginationControls Component - Responsive
function PaginationControls({ currentPage, totalPages, onPageChange, isMobile }) {
  if (totalPages <= 1) return null;
  
  if (isMobile) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          style={{
            padding: '0.5rem 1rem',
            borderRadius: 10,
            border: '1px solid #e2e8f0',
            background: 'white',
            cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
            opacity: currentPage === 1 ? 0.5 : 1,
            fontSize: '0.75rem',
            fontWeight: 500
          }}
        >
          Prev
        </button>
        <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
          {currentPage} / {totalPages}
        </span>
        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          style={{
            padding: '0.5rem 1rem',
            borderRadius: 10,
            border: '1px solid #e2e8f0',
            background: 'white',
            cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
            opacity: currentPage === totalPages ? 0.5 : 1,
            fontSize: '0.75rem',
            fontWeight: 500
          }}
        >
          Next
        </button>
      </div>
    );
  }
  
  const max = 5;
  let start = Math.max(1, currentPage - Math.floor(max / 2));
  let end = Math.min(totalPages, start + max - 1);
  if (end - start < max - 1) start = Math.max(1, end - max + 1);

  const btnBase = { height: 36, borderRadius: 10, border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
      <button onClick={() => onPageChange(currentPage - 1)} disabled={currentPage === 1} style={{ ...btnBase, width: 36, opacity: currentPage === 1 ? 0.4 : 1 }}>
        <ChevronLeft size={16} />
      </button>
      {Array.from({ length: end - start + 1 }, (_, i) => start + i).map(pageNum => (
        <button
          key={pageNum}
          onClick={() => onPageChange(pageNum)}
          style={{ ...btnBase, minWidth: 36, padding: '0 8px', background: pageNum === currentPage ? PRIMARY : 'white', color: pageNum === currentPage ? 'white' : '#475569', fontWeight: pageNum === currentPage ? 700 : 500 }}
        >
          {pageNum}
        </button>
      ))}
      <button onClick={() => onPageChange(currentPage + 1)} disabled={currentPage === totalPages} style={{ ...btnBase, width: 36, opacity: currentPage === totalPages ? 0.4 : 1 }}>
        <ChevronRight size={16} />
      </button>
    </div>
  );
}

// ItemCard Component - Responsive
function ItemCard({ item, isMobile }) {
  const sellable = item.can_be_sold !== false;
  const isActive = item.isActive === true;
  const productType = item.product_type === 'goods' ? 'Goods' : 'Service';
  const productTypeColor = item.product_type === 'goods' ? '#10b981' : '#3b82f6';
  const productTypeBg = item.product_type === 'goods' ? '#d1fae5' : '#dbeafe';
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -2 }}
      style={{ border: '1px solid #f1f5f9', borderRadius: isMobile ? '12px' : '20px', background: 'white', padding: isMobile ? '1rem' : '1.25rem' }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
        <div style={{ width: isMobile ? 32 : 40, height: isMobile ? 32 : 40, borderRadius: isMobile ? 10 : 12, background: `${PRIMARY}10`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {item.product_type === 'goods' ? <Box size={isMobile ? 16 : 20} color={PRIMARY} /> : <Wrench size={isMobile ? 16 : 20} color={PRIMARY} />}
        </div>
        <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
          <span style={{ padding: '2px 6px', borderRadius: 12, fontSize: '0.55rem', fontWeight: 700, background: productTypeBg, color: productTypeColor }}>
            {productType}
          </span>
          <span style={{ padding: '2px 6px', borderRadius: 12, fontSize: '0.55rem', fontWeight: 700, background: sellable ? '#d1fae5' : '#fef3c7', color: sellable ? '#065f46' : '#92400e' }}>
            {sellable ? 'Sellable' : 'Non-Sellable'}
          </span>
          <span style={{ padding: '2px 6px', borderRadius: 12, fontSize: '0.55rem', fontWeight: 700, background: isActive ? '#dbeafe' : '#fee2e2', color: isActive ? '#1e40af' : '#991b1b' }}>
            {isActive ? 'Active' : 'Inactive'}
          </span>
        </div>
      </div>
      <h3 style={{ margin: '0.5rem 0 0.25rem', fontSize: isMobile ? '0.85rem' : '0.95rem', fontWeight: 700, color: PRIMARY }}>{item.name || 'Unnamed'}</h3>
      {item.sku && <p style={{ margin: '0 0 0.5rem', color: '#64748b', fontSize: '0.65rem', display: 'flex', alignItems: 'center', gap: 4 }}><Tag size={10} /> {item.sku}</p>}
      {item.description && <p style={{ margin: '0 0 0.75rem', color: '#94a3b8', fontSize: '0.65rem' }}>{item.description.length > 60 ? item.description.slice(0, 60) + '…' : item.description}</p>}
      <p style={{ margin: '0.5rem 0 0', fontSize: isMobile ? '0.9rem' : '1.05rem', fontWeight: 700, color: '#059669' }}>{fmtCurrency(item.price)}</p>
    </motion.div>
  );
}

// Main ItemsScreen Component
export default function ItemsScreen({ onBack }) {
  const isMobile = useMediaQuery('(max-width: 768px)');
  const isTablet = useMediaQuery('(min-width: 769px) and (max-width: 1024px)');
  
  const selectedCompany = useAppStore((state) => state.selectedCompany);
  const { 
    items, isLoading, isSyncing, error, filters, 
    setProductTypeFilter, setSellableFilter, setStatusFilter, 
    setSearchFilter, loadAllItems, refreshItems, syncItems, 
    getStats, resetFilters 
  } = useItemStore();
  
  // Local UI State
  const [viewMode, setViewMode] = useState('card');
  const [sortBy, setSortBy] = useState('name');
  const [sortOrder, setSortOrder] = useState('asc');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(isMobile ? 10 : 50);
  const [toast, setToast] = useState(null);
  const [searchInput, setSearchInput] = useState('');
  const [showFilterDrawer, setShowFilterDrawer] = useState(false);
  
  const itemsVersion = useItemStore((state) => state.itemsVersion);
  const [renderKey, setRenderKey] = useState(0);

  // Sync Progress State
  const [syncProgress, setSyncProgress] = useState({
    open: false,
    progress: { stage: 'idle', fetched: 0, total: 0 },
    isSyncing: false
  });
  
  const debounceTimerRef = useRef(null);
  const progressPollInterval = useRef(null);
  
  // Update items per page based on screen size
  useEffect(() => {
    setItemsPerPage(isMobile ? 10 : 50);
  }, [isMobile]);
  
  // Load items when company changes
  useEffect(() => {
    if (selectedCompany) {
      loadAllItems(selectedCompany);
    }
  }, [selectedCompany, loadAllItems]);
  
  useEffect(() => {
    setRenderKey(prev => prev + 1);
  }, [itemsVersion]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [filters, sortBy, sortOrder]);
   
  const checkSyncProgress = useCallback(async () => {
    try {
      const response = await itemAPI.getSyncProgress();
      if (!response.data.success) return;
  
      const { isSyncing, progress } = response.data;
  
      setSyncProgress({
        open: isSyncing || progress.stage === 'completed' || progress.stage === 'error',
        progress: progress,
        isSyncing: isSyncing
      });
  
      if (progress.stage === 'completed') {
        if (progressPollInterval.current) {
          clearInterval(progressPollInterval.current);
          progressPollInterval.current = null;
        }
        if (selectedCompany) {
          await refreshItems(selectedCompany);
        }
        setToast({ message: `Sync completed! ${progress.total || 0} items processed.`, type: 'success' });
        setTimeout(() => {
          setSyncProgress({ open: false, progress: {}, isSyncing: false });
        }, 1500);
      } else if (progress.stage === 'error') {
        if (progressPollInterval.current) {
          clearInterval(progressPollInterval.current);
          progressPollInterval.current = null;
        }
        setToast({ message: progress.error || 'Sync failed', type: 'error' });
      }
    } catch (error) {
      console.error('Progress check failed:', error);
    }
  }, [selectedCompany, refreshItems]);
  
  const handleSync = async () => {
    if (!selectedCompany) {
      setToast({ message: "Please select a company first", type: "error" });
      return;
    }
  
    setSyncProgress({ 
      open: true, 
      progress: { stage: 'starting', message: 'Starting sync from Zoho...', fetched: 0, total: 0 }, 
      isSyncing: true 
    });
  
    try {
      const response = await syncItems(selectedCompany);
      if (response.success) {
        if (progressPollInterval.current) clearInterval(progressPollInterval.current);
        progressPollInterval.current = setInterval(checkSyncProgress, 1000);
      } else {
        setToast({ message: response.error || "Failed to start sync", type: "error" });
        setSyncProgress({ open: false, progress: {}, isSyncing: false });
      }
    } catch (error) {
      setToast({ message: "Failed to start sync", type: "error" });
      setSyncProgress({ open: false, progress: {}, isSyncing: false });
    }
  };
  
  const handleCancelSync = () => {
    if (progressPollInterval.current) {
      clearInterval(progressPollInterval.current);
      progressPollInterval.current = null;
    }
    setSyncProgress({ open: false, progress: {}, isSyncing: false });
    setToast({ message: 'Sync cancelled', type: 'info' });
  };
  
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      if (progressPollInterval.current) clearInterval(progressPollInterval.current);
    };
  }, []);
  
  const stats = useMemo(() => getStats(), [getStats, items]);
  
  const filteredItems = useMemo(() => {
    let result = [...items];
    
    if (filters.productType !== 'all') {
      result = result.filter(item => item.product_type === filters.productType);
    }
    if (filters.status === 'active') {
      result = result.filter(item => item.isActive === true);
    } else if (filters.status === 'inactive') {
      result = result.filter(item => item.isActive !== true);
    }
    if (filters.sellable === 'sellable') {
      result = result.filter(item => item.can_be_sold !== false);
    } else if (filters.sellable === 'nonSellable') {
      result = result.filter(item => item.can_be_sold === false);
    }
    if (filters.search) {
      const term = filters.search.toLowerCase();
      result = result.filter(item => (item.name || '').toLowerCase().includes(term) || (item.sku || '').toLowerCase().includes(term));
    }
    
    return result;
  }, [items, filters]);
  
  const sortedItems = useMemo(() => {
    const result = [...filteredItems];
    result.sort((a, b) => {
      let aVal = a[sortBy] || '', bVal = b[sortBy] || '';
      if (sortBy === 'price') { aVal = Number(aVal) || 0; bVal = Number(bVal) || 0; }
      else { aVal = String(aVal).toLowerCase(); bVal = String(bVal).toLowerCase(); }
      if (aVal < bVal) return sortOrder === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });
    return result;
  }, [filteredItems, sortBy, sortOrder]);
  
  const paginatedItems = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return sortedItems.slice(start, start + itemsPerPage);
  }, [sortedItems, currentPage, itemsPerPage]);
  
  const totalPages = Math.ceil(sortedItems.length / itemsPerPage);
  
  const handleSearch = useCallback((value) => {
    setSearchInput(value);
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => setSearchFilter(value), 500);
  }, [setSearchFilter]);
  
  const handlePageChange = (page) => { setCurrentPage(page); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  
  const handleRefresh = async () => {
    if (selectedCompany) {
      setToast({ message: 'Refreshing items...', type: 'info' });
      await refreshItems(selectedCompany);
      setToast({ message: 'Items refreshed!', type: 'success' });
    }
  };
  
  const handleResetFilters = () => { 
    resetFilters(); 
    setSearchInput('');
    setShowFilterDrawer(false);
  };
  
  const handleFilterChange = (key, value) => {
    if (key === 'productType') setProductTypeFilter(value);
    if (key === 'sellable') setSellableFilter(value);
    if (key === 'status') setStatusFilter(value);
  };
  
  if (isLoading && items.length === 0) {
    return (
      <div style={{ minHeight: '100vh', background: '#f0f9ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div>
          <div style={{ width: 48, height: 48, border: '3px solid #e2e8f0', borderTopColor: PRIMARY, borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto' }} />
          <p style={{ marginTop: '1rem', color: '#64748b' }}>Loading items...</p>
        </div>
      </div>
    );
  }
  
  // Responsive styles
  const headerPadding = isMobile ? '1rem' : '2rem 1.5rem';
  const containerPadding = isMobile ? '1rem' : '2rem 1.5rem';
  const titleFont = isMobile ? '1.5rem' : '2rem';
  const statGridColumns = isMobile ? 'repeat(2, 1fr)' : 'repeat(auto-fit, minmax(150px, 1fr))';
  const cardGridColumns = isMobile ? '1fr' : isTablet ? 'repeat(2, 1fr)' : 'repeat(auto-fill, minmax(280px, 1fr))';
  
  return (
    <div key={renderKey} style={{ minHeight: '100vh', background: 'linear-gradient(135deg,#f0f4ff 0%,#e8edf5 100%)', fontFamily: 'system-ui' }}>
      <div style={{ maxWidth: 1400, margin: '0 auto', padding: containerPadding }}>
        
        {/* Header */}
        <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', justifyContent: 'space-between', alignItems: isMobile ? 'flex-start' : 'center', marginBottom: isMobile ? '1.5rem' : '2rem', gap: '1rem' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: titleFont, fontWeight: 800, background: `linear-gradient(135deg,${PRIMARY},#1e293b)`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              Inventory Items
            </h1>
            <p style={{ margin: '0.25rem 0 0', color: '#64748b', fontSize: isMobile ? '0.75rem' : '0.875rem' }}>
              Product catalogue — {stats.total.toLocaleString()} total items
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', width: isMobile ? '100%' : 'auto' }}>
            <button
              onClick={handleSync}
              disabled={isSyncing}
              style={{ 
                background: isSyncing ? '#9ca3af' : `linear-gradient(135deg, ${PRIMARY}, #1e293b)`,
                border: 'none', borderRadius: isMobile ? '10px' : '14px', 
                padding: isMobile ? '0.5rem 1rem' : '0.7rem 1.4rem',
                cursor: isSyncing ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', gap: '0.5rem',
                color: 'white', fontWeight: 600, fontSize: isMobile ? '0.75rem' : '0.8rem',
                flex: isMobile ? 1 : 'auto',
                justifyContent: 'center'
              }}
            >
              {isSyncing ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <DownloadCloud size={14} />}
              {isSyncing ? 'Syncing...' : (isMobile ? 'Sync' : 'Sync from Zoho')}
            </button>
            
            <button onClick={handleRefresh} disabled={isLoading} style={{ 
              background: 'white', border: '1px solid #e2e8f0', borderRadius: isMobile ? '10px' : '14px', 
              padding: isMobile ? '0.5rem 1rem' : '0.7rem 1.4rem', cursor: 'pointer', 
              display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600, fontSize: isMobile ? '0.75rem' : '0.8rem',
              flex: isMobile ? 1 : 'auto',
              justifyContent: 'center'
            }}>
              <RefreshCw size={14} style={isLoading ? { animation: 'spin 1s linear infinite' } : {}} />
              {isLoading ? 'Loading…' : (isMobile ? 'Refresh' : 'Refresh')}
            </button>
            
            <button onClick={onBack} style={{ 
              background: 'white', border: '1px solid #e2e8f0', borderRadius: isMobile ? '10px' : '14px', 
              padding: isMobile ? '0.5rem 1rem' : '0.7rem 1.4rem', cursor: 'pointer', 
              display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 500, fontSize: isMobile ? '0.75rem' : '0.8rem',
              flex: isMobile ? 1 : 'auto',
              justifyContent: 'center'
            }}>
              <ArrowLeft size={14} /> Back
            </button>
          </div>
        </div>
        
        {/* Stats Cards - Responsive Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: statGridColumns, gap: '0.75rem', marginBottom: '1.5rem' }}>
          <StatCard label="Total Items" value={stats.total.toLocaleString()} icon={Package} color="#6366f1" isMobile={isMobile} />
          <StatCard label="Goods" value={stats.goods.toLocaleString()} icon={Box} color="#10b981" isMobile={isMobile} />
          <StatCard label="Services" value={stats.services.toLocaleString()} icon={Wrench} color="#3b82f6" isMobile={isMobile} />
          <StatCard label="Sellable" value={stats.sellable.toLocaleString()} icon={Tag} color="#10b981" isMobile={isMobile} />
          {!isMobile && <StatCard label="Active" value={stats.active.toLocaleString()} icon={CheckCircle} color="#3b82f6" isMobile={isMobile} />}
        </div>
        
        {/* Main Panel */}
        <div style={{ background: 'white', borderRadius: isMobile ? '16px' : '24px', overflow: 'hidden' }}>
          
          {/* Toolbar - Responsive */}
          <div style={{ padding: isMobile ? '1rem' : '1.25rem 1.5rem', borderBottom: '1px solid #f1f5f9' }}>
            {/* Search Bar - Full width on mobile */}
            <div style={{ position: 'relative', marginBottom: isMobile ? '1rem' : '0' }}>
              <Search size={14} style={{ position: 'absolute', left: '0.9rem', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
              <input 
                type="text" 
                placeholder="Search items..." 
                value={searchInput} 
                onChange={e => handleSearch(e.target.value)} 
                style={{ 
                  width: '100%', 
                  padding: isMobile ? '0.6rem 0.8rem 0.6rem 2.25rem' : '0.7rem 1rem 0.7rem 2.25rem', 
                  border: '1.5px solid #e2e8f0', 
                  borderRadius: isMobile ? '10px' : '14px', 
                  fontSize: isMobile ? '0.8rem' : '0.875rem', 
                  outline: 'none' 
                }}
              />
            </div>
            
            {/* Filters Row */}
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
              {isMobile ? (
                <>
                  {/* View Toggle */}
                  <div style={{ display: 'flex', gap: '0.25rem', background: '#f1f5f9', padding: '0.25rem', borderRadius: 10 }}>
                    <button onClick={() => setViewMode('card')} style={{ padding: '0.35rem 0.8rem', borderRadius: 8, background: viewMode === 'card' ? 'white' : 'transparent', border: 'none', cursor: 'pointer', fontWeight: 500, fontSize: '0.7rem' }}>
                      Cards
                    </button>
                    <button onClick={() => setViewMode('table')} style={{ padding: '0.35rem 0.8rem', borderRadius: 8, background: viewMode === 'table' ? 'white' : 'transparent', border: 'none', cursor: 'pointer', fontWeight: 500, fontSize: '0.7rem' }}>
                      Table
                    </button>
                  </div>
                  
                  {/* Filter Button */}
                  <button
                    onClick={() => setShowFilterDrawer(true)}
                    style={{
                      background: '#f9fafb',
                      border: '1.5px solid #e2e8f0',
                      borderRadius: 10,
                      padding: '0.5rem 1rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      cursor: 'pointer',
                      fontSize: '0.75rem',
                      fontWeight: 500
                    }}
                  >
                    <Filter size={14} />
                    Filters
                  </button>
                  
                  {/* Clear Filters Button */}
                  {(filters.productType !== 'all' || filters.sellable !== 'all' || filters.status !== 'all' || filters.search) && (
                    <button onClick={handleResetFilters} style={{ padding: '0.4rem 0.8rem', borderRadius: 8, background: '#fee2e2', border: 'none', cursor: 'pointer', fontSize: '0.7rem', color: '#dc2626', display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                      <X size={12} /> Clear
                    </button>
                  )}
                </>
              ) : (
                <>
                  {/* View Toggle */}
                  <div style={{ display: 'flex', gap: '0.25rem', background: '#f1f5f9', padding: '0.25rem', borderRadius: 12 }}>
                    <button onClick={() => setViewMode('card')} style={{ padding: '0.4rem 0.9rem', borderRadius: 10, background: viewMode === 'card' ? 'white' : 'transparent', border: 'none', cursor: 'pointer', fontWeight: 500 }}>Cards</button>
                    <button onClick={() => setViewMode('table')} style={{ padding: '0.4rem 0.9rem', borderRadius: 10, background: viewMode === 'table' ? 'white' : 'transparent', border: 'none', cursor: 'pointer', fontWeight: 500 }}>Table</button>
                  </div>
                  
                  {/* Filters */}
                  <select
                    value={filters.productType}
                    onChange={(e) => setProductTypeFilter(e.target.value)}
                    style={{ padding: '0.6rem 2rem 0.6rem 1rem', border: '1.5px solid #e2e8f0', borderRadius: 12, fontSize: '0.8rem', background: 'white' }}
                  >
                    <option value="all">All Types ({stats.total})</option>
                    <option value="goods">Goods ({stats.goods})</option>
                    <option value="service">Services ({stats.services})</option>
                  </select>
                  
                  <select
                    value={filters.sellable}
                    onChange={(e) => setSellableFilter(e.target.value)}
                    style={{ padding: '0.6rem 2rem 0.6rem 1rem', border: '1.5px solid #e2e8f0', borderRadius: 12, fontSize: '0.8rem', background: 'white' }}
                  >
                    <option value="all">All Sellable ({stats.total})</option>
                    <option value="sellable">Sellable ({stats.sellable})</option>
                    <option value="nonSellable">Non-Sellable ({stats.nonSellable})</option>
                  </select>
                  
                  <select
                    value={filters.status}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    style={{ padding: '0.6rem 2rem 0.6rem 1rem', border: '1.5px solid #e2e8f0', borderRadius: 12, fontSize: '0.8rem', background: 'white' }}
                  >
                    <option value="all">All Status ({stats.total})</option>
                    <option value="active">Active ({stats.active})</option>
                    <option value="inactive">Inactive ({stats.inactive})</option>
                  </select>
                  
                  {/* Sort */}
                  <select value={sortBy} onChange={e => setSortBy(e.target.value)} style={{ padding: '0.6rem 2rem 0.6rem 1rem', border: '1.5px solid #e2e8f0', borderRadius: 12 }}>
                    <option value="name">Sort: Name</option>
                    <option value="price">Sort: Price</option>
                    <option value="sku">Sort: SKU</option>
                  </select>
                  
                  {/* Items Per Page */}
                  <select value={itemsPerPage} onChange={e => setItemsPerPage(parseInt(e.target.value))} style={{ padding: '0.6rem 2rem 0.6rem 1rem', border: '1.5px solid #e2e8f0', borderRadius: 12 }}>
                    <option value="10">10 / page</option>
                    <option value="25">25 / page</option>
                    <option value="50">50 / page</option>
                    <option value="100">100 / page</option>
                  </select>
                  
                  {/* Clear Filters */}
                  {(filters.productType !== 'all' || filters.sellable !== 'all' || filters.status !== 'all' || filters.search) && (
                    <button onClick={handleResetFilters} style={{ padding: '0.4rem 1rem', borderRadius: 10, background: '#fee2e2', border: 'none', cursor: 'pointer', fontSize: '0.75rem', color: '#dc2626', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                      <X size={13} /> Clear
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
          
          {/* Debug Info - Hidden on mobile */}
          {!isMobile && (
            <div style={{ padding: '0.5rem 1.5rem', background: '#f0fdf4', borderBottom: '1px solid #d1fae5', fontSize: '0.75rem', color: '#065f46' }}>
              📦 Loaded: {items.length} items | Filtered: {filteredItems.length} items | Showing: {paginatedItems.length} items
            </div>
          )}
          
          {/* Content */}
          {error ? (
            <div style={{ textAlign: 'center', padding: isMobile ? '3rem' : '5rem' }}>
              <AlertCircle size={48} style={{ color: '#ef4444', margin: '0 auto 1rem' }} />
              <p style={{ color: '#dc2626', fontSize: isMobile ? '0.8rem' : '0.875rem' }}>Error: {error}</p>
            </div>
          ) : paginatedItems.length === 0 ? (
            <div style={{ textAlign: 'center', padding: isMobile ? '3rem' : '5rem' }}>
              <Package size={isMobile ? 48 : 64} style={{ color: '#cbd5e1', margin: '0 auto 1rem' }} />
              <p style={{ color: '#64748b', fontSize: isMobile ? '0.8rem' : '0.875rem' }}>No items found</p>
            </div>
          ) : viewMode === 'card' ? (
            <div style={{ display: 'grid', gridTemplateColumns: cardGridColumns, gap: isMobile ? '0.75rem' : '1.25rem', padding: isMobile ? '1rem' : '1.5rem' }}>
              {paginatedItems.map(item => <ItemCard key={item._id} item={item} isMobile={isMobile} />)}
            </div>
          ) : (
            <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: isMobile ? '500px' : 'auto' }}>
                <thead>
                  <tr style={{ background: '#f8fafc' }}>
                    <th style={{ padding: isMobile ? '0.75rem 0.75rem' : '0.875rem 1rem', textAlign: 'left', fontSize: isMobile ? '0.7rem' : '0.75rem' }}>Item</th>
                    {!isMobile && <th style={{ padding: '0.875rem 1rem', textAlign: 'left' }}>Type</th>}
                    <th style={{ padding: isMobile ? '0.75rem 0.75rem' : '0.875rem 1rem', textAlign: 'left', fontSize: isMobile ? '0.7rem' : '0.75rem' }}>SKU</th>
                    <th style={{ padding: isMobile ? '0.75rem 0.75rem' : '0.875rem 1rem', textAlign: 'right', fontSize: isMobile ? '0.7rem' : '0.75rem' }}>Price</th>
                    {!isMobile && <th style={{ padding: '0.875rem 1rem', textAlign: 'center' }}>Status</th>}
                    {!isMobile && <th style={{ padding: '0.875rem 1rem', textAlign: 'center' }}>Sellable</th>}
                  </tr>
                </thead>
                <tbody>
                  {paginatedItems.map(item => (
                    <tr key={item._id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: isMobile ? '0.75rem 0.75rem' : '0.875rem 1rem' }}>
                        <div style={{ fontWeight: 700, fontSize: isMobile ? '0.8rem' : '0.875rem' }}>{item.name}</div>
                        {item.description && !isMobile && <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>{item.description.slice(0, 60)}…</div>}
                      </td>
                      {!isMobile && (
                        <td style={{ padding: '0.875rem 1rem' }}>
                          <span style={{ padding: '2px 10px', borderRadius: 20, fontSize: '0.68rem', fontWeight: 700, background: item.product_type === 'goods' ? '#d1fae5' : '#dbeafe', color: item.product_type === 'goods' ? '#065f46' : '#1e40af' }}>
                            {item.product_type === 'goods' ? 'Goods' : 'Service'}
                          </span>
                        </td>
                      )}
                      <td style={{ padding: isMobile ? '0.75rem 0.75rem' : '0.875rem 1rem', color: '#64748b', fontSize: isMobile ? '0.7rem' : '0.8rem' }}>{item.sku || '—'}</td>
                      <td style={{ padding: isMobile ? '0.75rem 0.75rem' : '0.875rem 1rem', textAlign: 'right', color: '#059669', fontWeight: 700, fontSize: isMobile ? '0.8rem' : '0.875rem' }}>{fmtCurrency(item.price)}</td>
                      {!isMobile && (
                        <td style={{ padding: '0.875rem 1rem', textAlign: 'center' }}>
                          <span style={{ padding: '2px 10px', borderRadius: 20, fontSize: '0.68rem', fontWeight: 700, background: item.isActive ? '#d1fae5' : '#fee2e2', color: item.isActive ? '#065f46' : '#991b1b' }}>
                            {item.isActive ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                      )}
                      {!isMobile && (
                        <td style={{ padding: '0.875rem 1rem', textAlign: 'center' }}>
                          <span style={{ padding: '2px 10px', borderRadius: 20, fontSize: '0.68rem', fontWeight: 700, background: item.can_be_sold !== false ? '#d1fae5' : '#fef3c7', color: item.can_be_sold !== false ? '#065f46' : '#92400e' }}>
                            {item.can_be_sold !== false ? 'Yes' : 'No'}
                          </span>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          
          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{ 
              padding: isMobile ? '0.75rem 1rem' : '0.875rem 1.5rem', 
              borderTop: '1px solid #f1f5f9', 
              background: '#fafbff', 
              display: 'flex', 
              flexDirection: isMobile ? 'column' : 'row',
              justifyContent: 'space-between', 
              alignItems: 'center', 
              gap: isMobile ? '0.75rem' : '0',
              flexWrap: 'wrap' 
            }}>
              <span style={{ fontSize: isMobile ? '0.7rem' : '0.78rem', color: '#64748b' }}>
                Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, sortedItems.length)} of {sortedItems.length}
              </span>
              <PaginationControls currentPage={currentPage} totalPages={totalPages} onPageChange={handlePageChange} isMobile={isMobile} />
            </div>
          )}
        </div>
      </div>
      
      {/* Mobile Filter Drawer */}
      <MobileFilterDrawer
        isOpen={showFilterDrawer}
        onClose={() => setShowFilterDrawer(false)}
        filters={filters}
        stats={stats}
        onFilterChange={handleFilterChange}
        onReset={handleResetFilters}
        sortBy={sortBy}
        onSortChange={setSortBy}
        itemsPerPage={itemsPerPage}
        onItemsPerPageChange={setItemsPerPage}
      />
      
      <SyncProgressModal
        isOpen={syncProgress.open}
        progress={syncProgress.progress}
        onClose={() => setSyncProgress({ open: false, progress: {}, isSyncing: false })}
        onCancel={handleCancelSync}
      />
      
      <AnimatePresence>
        {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      </AnimatePresence>
      
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideInRight {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}