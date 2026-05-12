// screens/ItemsScreen.jsx - UPDATED with Sync Progress Modal
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  ArrowLeft, Search, RefreshCw, ChevronLeft, ChevronRight,
  Package, AlertCircle, CheckCircle, Loader2, Tag, Grid, List, X, Box, Wrench, DownloadCloud
} from 'lucide-react';
import { useAppStore } from '../services/store';
 import { itemAPI } from '../services/api';
import useItemStore from '../services/itemStore';

const PRIMARY = '#0f172a';

const fmtCurrency = (n) => `AED ${(Number(n) || 0).toFixed(2)}`;

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
    <div style={{ position:'fixed', bottom:24, right:24, zIndex:1000, animation:'slideInRight 0.3s ease' }}>
      <div style={{ display:'flex', alignItems:'center', gap:12, background:bg, color:'white', padding:'14px 20px', borderRadius:16, boxShadow:'0 10px 25px -5px rgba(0,0,0,0.15)' }}>
        {type === 'success' ? <CheckCircle size={20}/> : <AlertCircle size={20}/>}
        <span style={{ fontWeight:500, fontSize:'0.875rem' }}>{message}</span>
        <button onClick={onClose} style={{ background:'rgba(255,255,255,0.2)', border:'none', borderRadius:8, padding:4, cursor:'pointer', display:'flex' }}>
          <X size={14}/>
        </button>
      </div>
    </div>
  );
}

// StatCard Component
function StatCard({ label, value, icon: Icon, color, subtitle }) {
  return (
    <div style={{ background:'white', borderRadius:20, padding:'1.25rem', boxShadow:'0 1px 3px rgba(0,0,0,0.05)' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'0.75rem' }}>
        <div style={{ width:44, height:44, borderRadius:14, background:`${color}15`, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <Icon size={22} color={color}/>
        </div>
      </div>
      <p style={{ margin:0, color:'#64748b', fontSize:'0.72rem', fontWeight:600 }}>{label}</p>
      <p style={{ margin:'0.25rem 0 0', color:PRIMARY, fontSize:'1.75rem', fontWeight:800 }}>{value}</p>
      {subtitle && <p style={{ margin:'0.25rem 0 0', color:'#94a3b8', fontSize:'0.7rem' }}>{subtitle}</p>}
    </div>
  );
}

// DropdownFilter Component
function DropdownFilter({ label, value, options, onChange }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        padding:'0.6rem 2rem 0.6rem 1rem',
        border:'1.5px solid #e2e8f0',
        borderRadius:12,
        fontSize:'0.8rem',
        background:'white',
        cursor:'pointer',
        outline:'none',
        appearance: 'none',
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'right 0.7rem center',
      }}
    >
      {options.map(opt => (
        <option key={opt.value} value={opt.value}>{opt.label} {opt.count !== undefined ? `(${opt.count})` : ''}</option>
      ))}
    </select>
  );
}

// SyncProgressModal Component
function SyncProgressModal({ isOpen, onClose, progress, onCancel }) {
  if (!isOpen) return null;
  
  const percentComplete = progress.total > 0 
    ? (progress.fetched / progress.total) * 100 
    : 0;
  
  const getIcon = () => {
    if (progress.stage === 'completed') return <CheckCircle size={32} color="#10b981" />;
    if (progress.stage === 'error') return <XCircle size={32} color="#ef4444" />;
    return <Loader2 size={32} color="#6366f1" style={{ animation: 'spin 1s linear infinite' }} />;
  };
  
  const getTitle = () => {
    if (progress.stage === 'completed') return 'Sync Complete';
    if (progress.stage === 'error') return 'Sync Failed';
    return 'Syncing from Zoho';
  };
  
  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }} onClick={onClose}>
      <div style={{
        backgroundColor: 'white', borderRadius: '24px', padding: '2rem',
        maxWidth: '480px', width: '90%', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)',
      }} onClick={(e) => e.stopPropagation()}>
        
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <div style={{
            width: '64px', height: '64px', borderRadius: '32px',
            background: progress.stage === 'completed' ? '#d1fae5' : progress.stage === 'error' ? '#fee2e2' : '#eef2ff',
            display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem',
          }}>
            {getIcon()}
          </div>
          <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0f172a', marginBottom: '0.25rem' }}>
            {getTitle()}
          </h3>
          <p style={{ fontSize: '0.875rem', color: '#64748b' }}>
            {progress.message || 'Please wait...'}
          </p>
        </div>
        
        {progress.stage !== 'completed' && progress.stage !== 'error' && progress.total > 0 && (
          <div style={{ marginBottom: '1.5rem' }}>
            <div style={{ height: '8px', backgroundColor: '#e2e8f0', borderRadius: '4px', overflow: 'hidden', marginBottom: '1rem' }}>
              <div style={{ width: `${percentComplete}%`, height: '100%', backgroundColor: '#6366f1', borderRadius: '4px', transition: 'width 0.3s ease' }} />
            </div>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#64748b', marginBottom: '0.5rem' }}>
              <span>📦 {progress.fetched?.toLocaleString() || 0} of {progress.total?.toLocaleString() || 0} items</span>
              <span>{Math.round(percentComplete)}%</span>
            </div>
            
            {progress.page > 0 && progress.totalPages > 0 && (
              <div style={{ fontSize: '0.7rem', color: '#94a3b8', textAlign: 'center', marginTop: '0.25rem' }}>
                Page {progress.page} of {progress.totalPages}
              </div>
            )}
            
            {progress.estimatedRemaining && (
              <div style={{ fontSize: '0.7rem', color: '#94a3b8', textAlign: 'center', marginTop: '0.5rem' }}>
                ⏱️ Estimated remaining: {progress.estimatedRemaining}
              </div>
            )}
          </div>
        )}
        
        {progress.stage === 'completed' && progress.created !== undefined && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', marginBottom: '1.5rem', padding: '0.75rem', backgroundColor: '#f0fdf4', borderRadius: '12px' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#10b981' }}>{progress.created || 0}</div>
              <div style={{ fontSize: '0.7rem', color: '#64748b' }}>New</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#3b82f6' }}>{progress.updated || 0}</div>
              <div style={{ fontSize: '0.7rem', color: '#64748b' }}>Updated</div>
            </div>
            <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#ef4444' }}>{progress.deleted || 0}</div>
      <div style={{ fontSize: '0.7rem', color: '#64748b' }}>Deleted</div>
    </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#f59e0b' }}>{progress.total || 0}</div>
              <div style={{ fontSize: '0.7rem', color: '#64748b' }}>Total</div>
            </div>
          </div>
        )}
        
        {progress.stage === 'error' && (
          <div style={{ padding: '0.75rem', backgroundColor: '#fef2f2', borderRadius: '12px', marginBottom: '1.5rem', fontSize: '0.875rem', color: '#dc2626', textAlign: 'center' }}>
            {progress.error || 'An error occurred during sync'}
          </div>
        )}
        
        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
          {(progress.stage === 'completed' || progress.stage === 'error') && (
            <button onClick={onClose} style={{ padding: '0.6rem 1.5rem', backgroundColor: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '12px', fontWeight: 600, fontSize: '0.875rem', cursor: 'pointer' }}>
              Close
            </button>
          )}
          
          {progress.stage !== 'completed' && progress.stage !== 'error' && onCancel && (
            <button onClick={onCancel} style={{ padding: '0.6rem 1.5rem', backgroundColor: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: '12px', fontWeight: 600, fontSize: '0.875rem', cursor: 'pointer' }}>
              Cancel Sync
            </button>
          )}
        </div>
      </div>
      
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

// ItemCard Component
function ItemCard({ item }) {
  const sellable = item.can_be_sold !== false;
  const isActive = item.isActive === true;
  const productType = item.product_type === 'goods' ? 'Goods' : 'Service';
  const productTypeColor = item.product_type === 'goods' ? '#10b981' : '#3b82f6';
  const productTypeBg = item.product_type === 'goods' ? '#d1fae5' : '#dbeafe';
  
  return (
    <div style={{ border:'1px solid #f1f5f9', borderRadius:20, background:'white', padding:'1.25rem' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'0.5rem' }}>
        <div style={{ width:40, height:40, borderRadius:12, background:`${PRIMARY}10`, display:'flex', alignItems:'center', justifyContent:'center' }}>
          {item.product_type === 'goods' ? <Box size={20} color={PRIMARY}/> : <Wrench size={20} color={PRIMARY}/>}
        </div>
        <div style={{ display:'flex', gap:'0.4rem', flexWrap:'wrap' }}>
          <span style={{ padding:'2px 8px', borderRadius:20, fontSize:'0.6rem', fontWeight:700, background: productTypeBg, color: productTypeColor }}>
            {productType}
          </span>
          <span style={{ padding:'2px 8px', borderRadius:20, fontSize:'0.6rem', fontWeight:700, background: sellable ? '#d1fae5' : '#fef3c7', color: sellable ? '#065f46' : '#92400e' }}>
            {sellable ? 'Sellable' : 'Non-Sellable'}
          </span>
          <span style={{ padding:'2px 8px', borderRadius:20, fontSize:'0.6rem', fontWeight:700, background: isActive ? '#dbeafe' : '#fee2e2', color: isActive ? '#1e40af' : '#991b1b' }}>
            {isActive ? 'Active' : 'Inactive'}
          </span>
        </div>
      </div>
      <h3 style={{ margin:'0.75rem 0 0.25rem', fontSize:'0.95rem', fontWeight:700, color:PRIMARY }}>{item.name || 'Unnamed'}</h3>
      {item.sku && <p style={{ margin:'0 0 0.5rem', color:'#64748b', fontSize:'0.72rem', display:'flex', alignItems:'center', gap:4 }}><Tag size={10}/> {item.sku}</p>}
      {item.description && <p style={{ margin:'0 0 0.75rem', color:'#94a3b8', fontSize:'0.7rem' }}>{item.description.length > 80 ? item.description.slice(0,80)+'…' : item.description}</p>}
      <p style={{ margin:'0.5rem 0 0', fontSize:'1.05rem', fontWeight:700, color:'#059669' }}>{fmtCurrency(item.price)}</p>
    </div>
  );
}

// PaginationControls Component
function PaginationControls({ currentPage, totalPages, onPageChange }) {
  if (totalPages <= 1) return null;
  
  const max = 5;
  let start = Math.max(1, currentPage - Math.floor(max / 2));
  let end = Math.min(totalPages, start + max - 1);
  if (end - start < max - 1) start = Math.max(1, end - max + 1);

  const btnBase = { height:36, borderRadius:10, border:'1px solid #e2e8f0', background:'white', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' };

  return (
    <div style={{ display:'flex', alignItems:'center', gap:'0.4rem' }}>
      <button onClick={() => onPageChange(currentPage - 1)} disabled={currentPage === 1} style={{ ...btnBase, width:36, opacity: currentPage === 1 ? 0.4 : 1 }}>
        <ChevronLeft size={16}/>
      </button>
      {Array.from({ length: end - start + 1 }, (_, i) => start + i).map(pageNum => (
        <button key={pageNum} onClick={() => onPageChange(pageNum)} style={{ ...btnBase, minWidth:36, padding:'0 8px', background: pageNum === currentPage ? PRIMARY : 'white', color: pageNum === currentPage ? 'white' : '#475569', fontWeight: pageNum === currentPage ? 700 : 500 }}>
          {pageNum}
        </button>
      ))}
      <button onClick={() => onPageChange(currentPage + 1)} disabled={currentPage === totalPages} style={{ ...btnBase, width:36, opacity: currentPage === totalPages ? 0.4 : 1 }}>
        <ChevronRight size={16}/>
      </button>
    </div>
  );
}

// Main ItemsScreen Component
export default function ItemsScreen({ onBack }) {
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
  const [itemsPerPage, setItemsPerPage] = useState(50);
  const [toast, setToast] = useState(null);
  const [searchInput, setSearchInput] = useState('');
  
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
  
  // Load items when company changes
  useEffect(() => {
    if (selectedCompany) {
      console.log('🔄 Loading items for company:', selectedCompany);
      loadAllItems(selectedCompany);
    }
  }, [selectedCompany, loadAllItems]);
  
  useEffect(() => {
    console.log('🔄 Items version changed to:', itemsVersion);
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
  
      // ==================== AUTO REFRESH LOGIC ====================
      if (progress.stage === 'completed') {
        console.log("🎉 Sync completed! Auto-refreshing UI...");
  
        // Clear polling
        if (progressPollInterval.current) {
          clearInterval(progressPollInterval.current);
          progressPollInterval.current = null;
        }
  
        // Auto Refresh - Force reload from backend
        if (selectedCompany) {
          await refreshItems(selectedCompany);   // This should update the list
        }
  
        // Optional: Also refresh the main app store if needed
        const appStore = useAppStore.getState();
        if (appStore.refetchQuotations) appStore.refetchQuotations();
  
        setToast({ 
          message: `Sync completed successfully! ${progress.total || 0} items processed.`, 
          type: 'success' 
        });
  
        // Auto close modal after success
        setTimeout(() => {
          setSyncProgress({ open: false, progress: {}, isSyncing: false });
        }, 1500);
      } 
      // ==================== ERROR HANDLING ====================
      else if (progress.stage === 'error') {
        if (progressPollInterval.current) {
          clearInterval(progressPollInterval.current);
          progressPollInterval.current = null;
        }
        setToast({ 
          message: progress.error || 'Sync failed', 
          type: 'error' 
        });
      }
    } catch (error) {
      console.error('Progress check failed:', error);
    }
  }, [selectedCompany, refreshItems]);
  
  // Handle sync button click
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
        // Start polling for progress
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
  
  // Cleanup intervals on unmount
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
  
  const handleResetFilters = () => { resetFilters(); setSearchInput(''); };
  
  if (isLoading && items.length === 0) {
    return (
      <div style={{ minHeight:'100vh', background:'#f0f9ff', display:'flex', alignItems:'center', justifyContent:'center' }}>
        <div><div style={{ width:48, height:48, border:'3px solid #e2e8f0', borderTopColor:PRIMARY, borderRadius:'50%', animation:'spin 1s linear infinite', margin:'0 auto' }}/><p style={{ marginTop:'1rem', color:'#64748b' }}>Loading items...</p></div>
      </div>
    );
  }
  
  return (
    <div key={renderKey} style={{ minHeight:'100vh', background:'linear-gradient(135deg,#f0f4ff 0%,#e8edf5 100%)', fontFamily:'system-ui' }}>
      <div style={{ maxWidth:1400, margin:'0 auto', padding:'2rem 1.5rem' }}>
        
        {/* Header */}
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'2rem', flexWrap:'wrap', gap:'1rem' }}>
          <div>
            <h1 style={{ margin:0, fontSize:'2rem', fontWeight:800, background:`linear-gradient(135deg,${PRIMARY},#1e293b)`, WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}>Inventory Items</h1>
            <p style={{ margin:'0.25rem 0 0', color:'#64748b' }}>Product catalogue — {stats.total.toLocaleString()} total items</p>
          </div>
          <div style={{ display:'flex', gap:'0.75rem' }}>
            <button
              onClick={handleSync}
              disabled={isSyncing}
              style={{ 
                background: isSyncing ? '#9ca3af' : `linear-gradient(135deg, ${PRIMARY}, #1e293b)`,
                border:'none', borderRadius:14, padding:'0.7rem 1.4rem',
                cursor: isSyncing ? 'not-allowed' : 'pointer',
                display:'flex', alignItems:'center', gap:'0.5rem',
                color:'white', fontWeight:600, fontSize:'0.8rem',
                boxShadow: isSyncing ? 'none' : `0 4px 12px ${PRIMARY}30`,
              }}
            >
              {isSyncing ? <Loader2 size={15} style={{ animation:'spin 1s linear infinite' }}/> : <DownloadCloud size={15}/>}
              {isSyncing ? 'Syncing...' : 'Sync from Zoho'}
            </button>
            
            <button onClick={handleRefresh} disabled={isLoading} style={{ background:'white', border:'1px solid #e2e8f0', borderRadius:14, padding:'0.7rem 1.4rem', cursor:'pointer', display:'flex', alignItems:'center', gap:'0.5rem', fontWeight:600 }}>
              <RefreshCw size={15} style={isLoading ? { animation:'spin 1s linear infinite' } : {}}/>{isLoading ? 'Loading…' : 'Refresh'}
            </button>
            
            <button onClick={onBack} style={{ background:'white', border:'1px solid #e2e8f0', borderRadius:14, padding:'0.7rem 1.4rem', cursor:'pointer', display:'flex', alignItems:'center', gap:'0.5rem', fontWeight:500 }}>
              <ArrowLeft size={15}/> Back
            </button>
          </div>
        </div>
        
        {/* Stats Cards */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))', gap:'1rem', marginBottom:'2rem' }}>
          <StatCard label="Total Items" value={stats.total.toLocaleString()} icon={Package} color="#6366f1"/>
          <StatCard label="Goods" value={stats.goods.toLocaleString()} icon={Box} color="#10b981"/>
          <StatCard label="Services" value={stats.services.toLocaleString()} icon={Wrench} color="#3b82f6"/>
          <StatCard label="Sellable" value={stats.sellable.toLocaleString()} icon={Tag} color="#10b981"/>
          <StatCard label="Active" value={stats.active.toLocaleString()} icon={CheckCircle} color="#3b82f6"/>
        </div>
        
        {/* Main Panel */}
        <div style={{ background:'white', borderRadius:24, overflow:'hidden' }}>
          
          {/* Toolbar */}
          <div style={{ padding:'1.25rem 1.5rem', borderBottom:'1px solid #f1f5f9' }}>
            <div style={{ display:'flex', gap:'0.75rem', alignItems:'center', flexWrap:'wrap' }}>
              
              {/* Search */}
              <div style={{ position:'relative', flex:1, minWidth:200 }}>
                <Search size={15} style={{ position:'absolute', left:'0.9rem', top:'50%', transform:'translateY(-50%)', color:'#94a3b8' }}/>
                <input type="text" placeholder="Search items..." value={searchInput} onChange={e => handleSearch(e.target.value)} style={{ width:'100%', padding:'0.7rem 1rem 0.7rem 2.25rem', border:'1.5px solid #e2e8f0', borderRadius:14, fontSize:'0.875rem', outline:'none' }}/>
              </div>
              
              {/* View Toggle */}
              <div style={{ display:'flex', gap:'0.25rem', background:'#f1f5f9', padding:'0.25rem', borderRadius:12 }}>
                <button onClick={() => setViewMode('card')} style={{ padding:'0.4rem 0.9rem', borderRadius:10, background: viewMode==='card' ? 'white' : 'transparent', border:'none', cursor:'pointer', fontWeight:500 }}>Cards</button>
                <button onClick={() => setViewMode('table')} style={{ padding:'0.4rem 0.9rem', borderRadius:10, background: viewMode==='table' ? 'white' : 'transparent', border:'none', cursor:'pointer', fontWeight:500 }}>Table</button>
              </div>
              
              {/* Filters */}
              <DropdownFilter
                value={filters.productType}
                options={[
                  { value: 'all', label: 'All Types', count: stats.total },
                  { value: 'goods', label: 'Goods', count: stats.goods },
                  { value: 'service', label: 'Services', count: stats.services }
                ]}
                onChange={setProductTypeFilter}
              />
              
              <DropdownFilter
                value={filters.sellable}
                options={[
                  { value: 'all', label: 'All', count: stats.total },
                  { value: 'sellable', label: 'Sellable', count: stats.sellable },
                  { value: 'nonSellable', label: 'Non-Sellable', count: stats.nonSellable }
                ]}
                onChange={setSellableFilter}
              />
              
              <DropdownFilter
                value={filters.status}
                options={[
                  { value: 'all', label: 'All', count: stats.total },
                  { value: 'active', label: 'Active', count: stats.active },
                  { value: 'inactive', label: 'Inactive', count: stats.inactive }
                ]}
                onChange={setStatusFilter}
              />
              
              {/* Sort */}
              <select value={sortBy} onChange={e => setSortBy(e.target.value)} style={{ padding:'0.6rem 2rem 0.6rem 1rem', border:'1.5px solid #e2e8f0', borderRadius:12 }}>
                <option value="name">Sort: Name</option>
                <option value="price">Sort: Price</option>
                <option value="sku">Sort: SKU</option>
              </select>
              
              {/* Items Per Page */}
              <select value={itemsPerPage} onChange={e => setItemsPerPage(parseInt(e.target.value))} style={{ padding:'0.6rem 2rem 0.6rem 1rem', border:'1.5px solid #e2e8f0', borderRadius:12 }}>
                <option value="10">10 / page</option>
                <option value="25">25 / page</option>
                <option value="50">50 / page</option>
                <option value="100">100 / page</option>
              </select>
              
              {/* Clear Filters */}
              {(filters.productType !== 'all' || filters.sellable !== 'all' || filters.status !== 'all' || filters.search) && (
                <button onClick={handleResetFilters} style={{ padding:'0.4rem 1rem', borderRadius:10, background:'#fee2e2', border:'none', cursor:'pointer', fontSize:'0.75rem', color:'#dc2626', display:'flex', alignItems:'center', gap:'0.3rem' }}>
                  <X size={13}/> Clear
                </button>
              )}
            </div>
          </div>
          
          {/* Debug Info */}
          <div style={{ padding:'0.5rem 1.5rem', background:'#f0fdf4', borderBottom:'1px solid #d1fae5', fontSize:'0.75rem', color:'#065f46' }}>
            📦 Loaded: {items.length} items | Filtered: {filteredItems.length} items | Showing: {paginatedItems.length} items
          </div>
          
          {/* Content */}
          {error ? (
            <div style={{ textAlign:'center', padding:'5rem' }}><AlertCircle size={48} style={{ color:'#ef4444', margin:'0 auto 1rem' }}/><p style={{ color:'#dc2626' }}>Error: {error}</p></div>
          ) : paginatedItems.length === 0 ? (
            <div style={{ textAlign:'center', padding:'5rem' }}><Package size={64} style={{ color:'#cbd5e1', margin:'0 auto 1rem' }}/><p style={{ color:'#64748b' }}>No items found</p></div>
          ) : viewMode === 'card' ? (
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))', gap:'1.25rem', padding:'1.5rem' }}>
              {paginatedItems.map(item => <ItemCard key={item._id} item={item}/>)}
            </div>
          ) : (
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse' }}>
                <thead><tr style={{ background:'#f8fafc' }}>
                  <th style={{ padding:'0.875rem 1rem', textAlign:'left' }}>Item</th>
                  <th style={{ padding:'0.875rem 1rem', textAlign:'left' }}>Type</th>
                  <th style={{ padding:'0.875rem 1rem', textAlign:'left' }}>SKU</th>
                  <th style={{ padding:'0.875rem 1rem', textAlign:'right' }}>Price</th>
                  <th style={{ padding:'0.875rem 1rem', textAlign:'center' }}>Status</th>
                  <th style={{ padding:'0.875rem 1rem', textAlign:'center' }}>Sellable</th>
                </tr></thead>
                <tbody>
                  {paginatedItems.map(item => (
                    <tr key={item._id} style={{ borderBottom:'1px solid #f1f5f9' }}>
                      <td style={{ padding:'0.875rem 1rem' }}><div style={{ fontWeight:700 }}>{item.name}</div>{item.description && <div style={{ fontSize:'0.7rem', color:'#94a3b8' }}>{item.description.slice(0,60)}…</div>}</td>
                      <td style={{ padding:'0.875rem 1rem' }}><span style={{ padding:'2px 10px', borderRadius:20, fontSize:'0.68rem', fontWeight:700, background: item.product_type === 'goods' ? '#d1fae5' : '#dbeafe', color: item.product_type === 'goods' ? '#065f46' : '#1e40af' }}>{item.product_type === 'goods' ? 'Goods' : 'Service'}</span></td>
                      <td style={{ padding:'0.875rem 1rem', color:'#64748b' }}>{item.sku || '—'}</td>
                      <td style={{ padding:'0.875rem 1rem', textAlign:'right', color:'#059669', fontWeight:700 }}>{fmtCurrency(item.price)}</td>
                      <td style={{ padding:'0.875rem 1rem', textAlign:'center' }}><span style={{ padding:'2px 10px', borderRadius:20, fontSize:'0.68rem', fontWeight:700, background: item.isActive ? '#d1fae5' : '#fee2e2', color: item.isActive ? '#065f46' : '#991b1b' }}>{item.isActive ? 'Active' : 'Inactive'}</span></td>
                      <td style={{ padding:'0.875rem 1rem', textAlign:'center' }}><span style={{ padding:'2px 10px', borderRadius:20, fontSize:'0.68rem', fontWeight:700, background: item.can_be_sold !== false ? '#d1fae5' : '#fef3c7', color: item.can_be_sold !== false ? '#065f46' : '#92400e' }}>{item.can_be_sold !== false ? 'Yes' : 'No'}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          
          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{ padding:'0.875rem 1.5rem', borderTop:'1px solid #f1f5f9', background:'#fafbff', display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap' }}>
              <span style={{ fontSize:'0.78rem', color:'#64748b' }}>Showing {((currentPage-1)*itemsPerPage)+1} to {Math.min(currentPage*itemsPerPage, sortedItems.length)} of {sortedItems.length}</span>
              <PaginationControls currentPage={currentPage} totalPages={totalPages} onPageChange={handlePageChange} />
            </div>
          )}
        </div>
      </div>
      
      {/* Sync Progress Modal */}
      <SyncProgressModal
        isOpen={syncProgress.open}
        progress={syncProgress.progress}
        onClose={() => setSyncProgress({ open: false, progress: {}, isSyncing: false })}
        onCancel={handleCancelSync}
      />
      
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)}/>}
    </div>
  );
}