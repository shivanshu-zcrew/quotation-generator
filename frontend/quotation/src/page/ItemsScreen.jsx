import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  ArrowLeft, Search, RefreshCw, ChevronLeft, ChevronRight,
  Package, AlertCircle, CheckCircle, Loader2, DollarSign,
  Tag, Grid, List, X,
} from 'lucide-react';
import { itemAPI } from '../services/api';
import { useAppStore } from '../services/store';

const PRIMARY = '#0f172a';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
const fmtCurrency = (n) => `AED ${(Number(n) || 0).toFixed(2)}`;

// ─────────────────────────────────────────────────────────────────────────────
// Toast Component
// ─────────────────────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────────────────────
// StatCard Component
// ─────────────────────────────────────────────────────────────────────────────
function StatCard({ label, value, icon: Icon, color, subtitle }) {
  return (
    <div
      style={{ background:'white', borderRadius:20, padding:'1.25rem', boxShadow:'0 1px 3px rgba(0,0,0,0.05)', transition:'transform 0.2s,box-shadow 0.2s', cursor:'default' }}
      onMouseEnter={e => { e.currentTarget.style.transform='translateY(-2px)'; e.currentTarget.style.boxShadow='0 10px 25px -5px rgba(0,0,0,0.1)'; }}
      onMouseLeave={e => { e.currentTarget.style.transform='translateY(0)'; e.currentTarget.style.boxShadow='0 1px 3px rgba(0,0,0,0.05)'; }}
    >
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'0.75rem' }}>
        <div style={{ width:44, height:44, borderRadius:14, background:`${color}15`, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <Icon size={22} color={color}/>
        </div>
      </div>
      <p style={{ margin:0, color:'#64748b', fontSize:'0.72rem', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.5px' }}>{label}</p>
      <p style={{ margin:'0.25rem 0 0', color:PRIMARY, fontSize:'1.75rem', fontWeight:800, lineHeight:1 }}>{value}</p>
      {subtitle && <p style={{ margin:'0.25rem 0 0', color:'#94a3b8', fontSize:'0.7rem' }}>{subtitle}</p>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// FilterTabs Component
// ─────────────────────────────────────────────────────────────────────────────
function FilterTabs({ active, onChange, counts }) {
  const tabs = [
    { key:'all',         label:'All Items',      count: counts.all },
    { key:'sellable',    label:'Sellable',       count: counts.sellable },
    { key:'nonSellable', label:'Non-Sellable',   count: counts.nonSellable },
  ];
  return (
    <div style={{ display:'flex', gap:'0.25rem', background:'#f1f5f9', padding:'0.25rem', borderRadius:12 }}>
      {tabs.map(tab => (
        <button
          key={tab.key}
          onClick={() => onChange(tab.key)}
          style={{
            padding:'0.45rem 0.9rem', borderRadius:10,
            background: active === tab.key ? 'white' : 'transparent',
            border:'none', cursor:'pointer',
            fontWeight: active === tab.key ? 700 : 500,
            fontSize:'0.8rem',
            color: active === tab.key ? PRIMARY : '#64748b',
            boxShadow: active === tab.key ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
            transition:'all 0.15s',
          }}
        >
          {tab.label}
          <span style={{
            marginLeft:6, padding:'1px 7px', borderRadius:20,
            background: active === tab.key ? `${PRIMARY}15` : '#e2e8f0',
            fontSize:'0.7rem', fontWeight:700, color: active === tab.key ? PRIMARY : '#64748b',
          }}>
            {tab.count}
          </span>
        </button>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PaginationControls Component
// ─────────────────────────────────────────────────────────────────────────────
function PaginationControls({ currentPage, totalPages, onPageChange, loading }) {
  if (totalPages <= 1) return null;
  
  const max = 5;
  let start = Math.max(1, currentPage - Math.floor(max / 2));
  let end = Math.min(totalPages, start + max - 1);
  if (end - start < max - 1) start = Math.max(1, end - max + 1);

  const btnBase = { height:36, borderRadius:10, border:'1px solid #e2e8f0', background:'white', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', transition:'all 0.15s' };
  const disabledStyle = { opacity:0.4, cursor:'not-allowed' };

  return (
    <div style={{ display:'flex', alignItems:'center', gap:'0.4rem' }}>
      <button onClick={() => onPageChange(currentPage - 1)} disabled={currentPage === 1 || loading}
        style={{ ...btnBase, width:36, ...(currentPage === 1 || loading ? disabledStyle : {}) }}>
        <ChevronLeft size={16}/>
      </button>
      
      {Array.from({ length: end - start + 1 }, (_, i) => start + i).map(pageNum => (
        <button key={pageNum} onClick={() => onPageChange(pageNum)} disabled={loading}
          style={{ ...btnBase, minWidth:36, padding:'0 8px', background: pageNum === currentPage ? PRIMARY : 'white', color: pageNum === currentPage ? 'white' : '#475569', fontWeight: pageNum === currentPage ? 700 : 500 }}>
          {pageNum}
        </button>
      ))}
      
      <button onClick={() => onPageChange(currentPage + 1)} disabled={currentPage === totalPages || loading}
        style={{ ...btnBase, width:36, ...(currentPage === totalPages || loading ? disabledStyle : {}) }}>
        <ChevronRight size={16}/>
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ItemCard Component
// ─────────────────────────────────────────────────────────────────────────────
function ItemCard({ item }) {
  const sellable = item.can_be_sold !== false;
  return (
    <div
      style={{ border:'1px solid #f1f5f9', borderRadius:20, overflow:'hidden', background:'white', transition:'all 0.25s ease', opacity: sellable ? 1 : 0.75 }}
      onMouseEnter={e => { e.currentTarget.style.transform='translateY(-3px)'; e.currentTarget.style.boxShadow='0 16px 24px -8px rgba(0,0,0,0.12)'; }}
      onMouseLeave={e => { e.currentTarget.style.transform='translateY(0)'; e.currentTarget.style.boxShadow='none'; }}
    >
      <div style={{ padding:'1.25rem' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'0.5rem' }}>
          <div style={{ width:40, height:40, borderRadius:12, background:`${PRIMARY}10`, display:'flex', alignItems:'center', justifyContent:'center' }}>
            <Package size={20} color={PRIMARY}/>
          </div>
          <div style={{ display:'flex', gap:'0.4rem', flexWrap:'wrap', justifyContent:'flex-end' }}>
            <span style={{ padding:'2px 8px', borderRadius:20, fontSize:'0.6rem', fontWeight:700, background: sellable ? '#d1fae5' : '#fef3c7', color: sellable ? '#065f46' : '#92400e' }}>
              {sellable ? 'Sellable' : 'Non-Sellable'}
            </span>
            <span style={{ padding:'2px 8px', borderRadius:20, fontSize:'0.6rem', fontWeight:700, background: item.isActive !== false ? '#dbeafe' : '#fee2e2', color: item.isActive !== false ? '#1e40af' : '#991b1b' }}>
              {item.status || 'active'}
            </span>
          </div>
        </div>
        <h3 style={{ margin:'0.75rem 0 0.25rem', fontSize:'0.95rem', fontWeight:700, color:PRIMARY }}>{item.name || 'Unnamed'}</h3>
        {item.sku && (
          <p style={{ margin:'0 0 0.5rem', color:'#64748b', fontSize:'0.72rem', display:'flex', alignItems:'center', gap:4 }}>
            <Tag size={10}/> {item.sku}
          </p>
        )}
        {item.description && (
          <p style={{ margin:'0 0 0.75rem', color:'#94a3b8', fontSize:'0.7rem', lineHeight:1.4 }}>
            {item.description.length > 80 ? item.description.slice(0, 80) + '…' : item.description}
          </p>
        )}
        <p style={{ margin:'0.5rem 0 0', fontSize:'1.05rem', fontWeight:700, color:'#059669', display:'flex', alignItems:'center', gap:4 }}>
           {fmtCurrency(item.price)}
        </p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ItemsScreen Component
// ─────────────────────────────────────────────────────────────────────────────
export default function ItemsScreen({ onBack }) {
  // State for all items fetched from API
  const [allItems, setAllItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // UI State
  const [filterType, setFilterType] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('name');
  const [sortOrder, setSortOrder] = useState('asc');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(50);
  const [viewMode, setViewMode] = useState('card');
  const [toast, setToast] = useState(null);
  const [isSyncing, setIsSyncing] = useState(false);
  
  const isSyncingRef = useRef(false);
  const selectedCompany = useAppStore((state) => state.selectedCompany);
  const fetchAllItemsForStats = useAppStore((state) => state.fetchAllItemsForStats);
  
  // Fetch ALL items on mount and when company changes
  const fetchAllItems = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = {
        limit: 10000, // Get ALL items
        page: 1,
      };
      if (selectedCompany) {
        params.companyId = selectedCompany;
      }
      
      const response = await itemAPI.getAll(params);
      let itemsArray = [];
      
      if (response.data.success) {
        itemsArray = response.data.data || [];
      } else if (Array.isArray(response.data)) {
        itemsArray = response.data;
      } else if (response.data.data && Array.isArray(response.data.data)) {
        itemsArray = response.data.data;
      }
      
      setAllItems(itemsArray);
    } catch (err) {
      setError(err.message || 'Failed to fetch items');
      console.error('Error fetching items:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedCompany]);
  
  // Initial fetch
  useEffect(() => {
    fetchAllItems();
  }, [fetchAllItems]);
  
  // Reset to page 1 when filter or search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [filterType, searchQuery, sortBy, sortOrder]);
  
  // Filter and sort items
  const processedItems = useMemo(() => {
    let result = [...allItems];
    
    // Apply sellable filter
    if (filterType === 'sellable') {
      result = result.filter(item => item.can_be_sold !== false);
    } else if (filterType === 'nonSellable') {
      result = result.filter(item => item.can_be_sold === false);
    }
    
    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(item => 
        item.name?.toLowerCase().includes(query) ||
        item.sku?.toLowerCase().includes(query) ||
        item.description?.toLowerCase().includes(query)
      );
    }
    
    // Apply sorting
    result.sort((a, b) => {
      let aVal = a[sortBy] || '';
      let bVal = b[sortBy] || '';
      
      if (sortBy === 'price') {
        aVal = Number(aVal) || 0;
        bVal = Number(bVal) || 0;
      } else {
        aVal = String(aVal).toLowerCase();
        bVal = String(bVal).toLowerCase();
      }
      
      if (aVal < bVal) return sortOrder === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });
    
    return result;
  }, [allItems, filterType, searchQuery, sortBy, sortOrder]);
  
  // Calculate statistics from filtered items
  const stats = useMemo(() => {
    const sellable = allItems.filter(item => item.can_be_sold !== false);
    const nonSellable = allItems.filter(item => item.can_be_sold === false);
    const prices = allItems.map(item => Number(item.price) || 0).filter(p => p > 0);
    const avgPrice = prices.length > 0 
      ? prices.reduce((a, b) => a + b, 0) / prices.length 
      : 0;
    
    return {
      total: allItems.length,
      sellable: sellable.length,
      nonSellable: nonSellable.length,
      avgPrice: avgPrice,
    };
  }, [allItems]);
  
  // Pagination - calculate current page items
  const paginatedItems = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return processedItems.slice(startIndex, endIndex);
  }, [processedItems, currentPage, itemsPerPage]);
  
  const totalPages = Math.ceil(processedItems.length / itemsPerPage);
  
  // Handle search with debounce
  const debounceTimerRef = useRef(null);
  const handleSearch = useCallback((value) => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      setSearchQuery(value);
    }, 500);
  }, []);
  
  // Handle filter change
  const handleFilterChange = (newFilter) => {
    setFilterType(newFilter);
  };
  
  // Handle sort change
  const handleSortChange = (field) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('asc');
    }
  };
  
  // Handle page change
  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setCurrentPage(newPage);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };
  
  // Handle items per page change
  const handleItemsPerPageChange = (newLimit) => {
    setItemsPerPage(parseInt(newLimit, 10));
    setCurrentPage(1);
  };
  
  // Handle sync
  const handleSync = useCallback(async () => {
    if (isSyncingRef.current) {
      setToast({ message: 'Sync already in progress…', type: 'info' });
      return;
    }
    
    isSyncingRef.current = true;
    setIsSyncing(true);
    setToast({ message: 'Syncing items from Zoho…', type: 'info' });

    let pollHandle;
    let timeoutHandle;

    try {
      const response = await itemAPI.syncItems();
      if (!response.data.success) throw new Error(response.data.message || 'Sync failed');

      const cleanup = () => {
        if (pollHandle) clearInterval(pollHandle);
        if (timeoutHandle) clearTimeout(timeoutHandle);
      };

      timeoutHandle = setTimeout(() => {
        cleanup();
        if (isSyncingRef.current) {
          isSyncingRef.current = false;
          setIsSyncing(false);
          setToast({ message: '❌ Sync timeout after 60 s', type: 'error' });
        }
      }, 60_000);

      pollHandle = setInterval(async () => {
        try {
          const statusRes = await itemAPI.getSyncStatus();
          if (!statusRes.data.status.isSyncing) {
            cleanup();
            isSyncingRef.current = false;
            setIsSyncing(false);

            const result = statusRes.data.status.lastSyncResult;
            if (result?.success) {
              setToast({ message: `✅ Sync complete! ${result.created || 0} new, ${result.updated || 0} updated`, type: 'success' });
              // Refresh items
              await fetchAllItems();
              if (fetchAllItemsForStats) fetchAllItemsForStats();
            } else {
              setToast({ message: `❌ Sync failed: ${result?.error || 'Unknown error'}`, type: 'error' });
            }
          }
        } catch (pollErr) {
          cleanup();
          isSyncingRef.current = false;
          setIsSyncing(false);
          setToast({ message: `❌ Poll error: ${pollErr.message}`, type: 'error' });
        }
      }, 2000);
    } catch (err) {
      isSyncingRef.current = false;
      setIsSyncing(false);
      setToast({ message: `❌ Sync failed: ${err.message}`, type: 'error' });
    }
  }, [fetchAllItems, fetchAllItemsForStats]);
  
  // CSS animations
  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      @keyframes slideInRight { from{transform:translateX(100%);opacity:0} to{transform:translateX(0);opacity:1} }
      @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
    `;
    document.head.appendChild(style);
    return () => document.head.removeChild(style);
  }, []);
  
  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);
  
  return (
    <div style={{ minHeight:'100vh', background:'linear-gradient(135deg,#f0f4ff 0%,#e8edf5 100%)', fontFamily:'system-ui,-apple-system,sans-serif' }}>
      <div style={{ maxWidth:1400, margin:'0 auto', padding:'2rem 1.5rem' }}>
        
        {/* Header */}
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'2rem', flexWrap:'wrap', gap:'1rem' }}>
          <div>
            <h1 style={{ margin:0, fontSize:'2rem', fontWeight:800, background:`linear-gradient(135deg,${PRIMARY},#1e293b)`, WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}>
              Inventory Items
            </h1>
            <p style={{ margin:'0.25rem 0 0', color:'#64748b', fontSize:'0.875rem' }}>
              Product catalogue — {stats.total.toLocaleString()} total items
            </p>
          </div>
          <div style={{ display:'flex', gap:'0.75rem' }}>
            <button
              onClick={handleSync}
              disabled={isSyncing}
              style={{ 
                background: isSyncing ? '#9ca3af' : `linear-gradient(135deg,${PRIMARY},#1e293b)`,
                border:'none', borderRadius:14, padding:'0.7rem 1.4rem',
                cursor: isSyncing ? 'not-allowed' : 'pointer',
                display:'flex', alignItems:'center', gap:'0.5rem',
                color:'white', fontWeight:600, fontSize:'0.8rem',
                boxShadow: isSyncing ? 'none' : `0 4px 12px ${PRIMARY}30`,
                transition:'all 0.2s'
              }}
            >
              {isSyncing ? <Loader2 size={15} style={{ animation:'spin 1s linear infinite' }}/> : <RefreshCw size={15}/>}
              {isSyncing ? 'Syncing…' : 'Sync from Zoho'}
            </button>
            <button
              onClick={onBack}
              style={{ background:'white', border:'1px solid #e2e8f0', borderRadius:14, padding:'0.7rem 1.4rem', cursor:'pointer', display:'flex', alignItems:'center', gap:'0.5rem', fontWeight:500, fontSize:'0.8rem', transition:'all 0.2s' }}
              onMouseEnter={e => e.currentTarget.style.background='#f8fafc'}
              onMouseLeave={e => e.currentTarget.style.background='white'}
            >
              <ArrowLeft size={15}/> Back
            </button>
          </div>
        </div>
        
        {/* Stat Cards */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))', gap:'1rem', marginBottom:'2rem' }}>
          <StatCard label="Total Items" value={stats.total.toLocaleString()} icon={Package} color="#6366f1" subtitle="All items in catalogue"/>
          <StatCard label="Sellable" value={stats.sellable.toLocaleString()} icon={Tag} color="#10b981" subtitle="Can be quoted & sold"/>
          <StatCard label="Non-Sellable" value={stats.nonSellable.toLocaleString()} icon={Package} color="#f59e0b" subtitle="Internal / purchase only"/>
           
        </div>
        
        {/* Main Panel */}
        <div style={{ background:'white', borderRadius:24, boxShadow:'0 4px 6px -1px rgba(0,0,0,0.05)', overflow:'hidden' }}>
          
          {/* Toolbar */}
          <div style={{ padding:'1.25rem 1.5rem', borderBottom:'1px solid #f1f5f9' }}>
            <div style={{ display:'flex', gap:'0.75rem', alignItems:'center', flexWrap:'wrap' }}>
              
              {/* Search */}
              <div style={{ position:'relative', flex:1, minWidth:250 }}>
                <Search size={15} style={{ position:'absolute', left:'0.9rem', top:'50%', transform:'translateY(-50%)', color:'#94a3b8' }}/>
                <input
                  type="text"
                  placeholder="Search items by name, SKU or description…"
                  onChange={e => handleSearch(e.target.value)}
                  style={{ width:'100%', padding:'0.7rem 1rem 0.7rem 2.25rem', border:'1.5px solid #e2e8f0', borderRadius:14, fontSize:'0.875rem', outline:'none', boxSizing:'border-box' }}
                  onFocus={e => { e.currentTarget.style.borderColor = PRIMARY; e.currentTarget.style.boxShadow = `0 0 0 3px ${PRIMARY}15`; }}
                  onBlur={e => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.boxShadow = 'none'; }}
                />
              </div>
              
              {/* View Toggle */}
              <div style={{ display:'flex', gap:'0.25rem', background:'#f1f5f9', padding:'0.25rem', borderRadius:12 }}>
                {['card','table'].map(v => (
                  <button key={v} onClick={() => setViewMode(v)} style={{ padding:'0.4rem 0.9rem', borderRadius:10, background: viewMode===v ? 'white' : 'transparent', border:'none', cursor:'pointer', fontWeight:500, fontSize:'0.78rem', display:'flex', alignItems:'center', gap:'0.25rem', boxShadow: viewMode===v ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', color: viewMode===v ? PRIMARY : '#64748b' }}>
                    {v === 'card' ? <><Grid size={13}/> Cards</> : <><List size={13}/> Table</>}
                  </button>
                ))}
              </div>
              
              {/* Filter Tabs */}
              <FilterTabs
                active={filterType}
                onChange={handleFilterChange}
                counts={{ 
                  all: stats.total, 
                  sellable: stats.sellable, 
                  nonSellable: stats.nonSellable 
                }}
              />
              
              {/* Sort */}
              <select value={sortBy} onChange={e => handleSortChange(e.target.value)}
                style={{ padding:'0.6rem 0.9rem', border:'1.5px solid #e2e8f0', borderRadius:14, fontSize:'0.78rem', background:'white', cursor:'pointer', outline:'none' }}>
                <option value="name">Sort: Name</option>
                <option value="price">Sort: Price</option>
                <option value="sku">Sort: SKU</option>
                <option value="status">Sort: Status</option>
              </select>
              
              {/* Items Per Page */}
              <select value={itemsPerPage} onChange={e => handleItemsPerPageChange(e.target.value)}
                style={{ padding:'0.6rem 0.9rem', border:'1.5px solid #e2e8f0', borderRadius:14, fontSize:'0.78rem', background:'white', cursor:'pointer', outline:'none' }}>
                <option value="10">10 / page</option>
                <option value="25">25 / page</option>
                <option value="50">50 / page</option>
                <option value="100">100 / page</option>
              </select>
            </div>
          </div>
          
          {/* Content */}
          {loading ? (
            <div style={{ textAlign:'center', padding:'5rem' }}>
              <div style={{ width:48, height:48, border:'3px solid #e2e8f0', borderTopColor:PRIMARY, borderRadius:'50%', margin:'0 auto 1rem', animation:'spin 0.9s linear infinite' }}/>
              <p style={{ color:'#64748b' }}>Loading items…</p>
            </div>
          ) : error ? (
            <div style={{ textAlign:'center', padding:'5rem' }}>
              <AlertCircle size={48} style={{ color:'#ef4444', margin:'0 auto 1rem', display:'block' }}/>
              <p style={{ color:'#dc2626' }}>Error: {error}</p>
            </div>
          ) : paginatedItems.length === 0 ? (
            <div style={{ textAlign:'center', padding:'5rem' }}>
              <Package size={64} style={{ color:'#cbd5e1', margin:'0 auto 1rem', display:'block' }}/>
              <p style={{ color:'#64748b', fontWeight:500, marginBottom:'1rem' }}>
                {searchQuery
                  ? `No items match "${searchQuery}"${filterType !== 'all' ? ` with ${filterType} filter` : ''}`
                  : filterType === 'all' ? 'No items found in catalogue'
                  : filterType === 'sellable' ? 'No sellable items found'
                  : 'No non-sellable items found'}
              </p>
              {!searchQuery && filterType === 'all' && (
                <button onClick={handleSync} disabled={isSyncing}
                  style={{ padding:'0.75rem 1.5rem', background:`linear-gradient(135deg,${PRIMARY},#1e293b)`, color:'white', border:'none', borderRadius:14, cursor:'pointer', display:'inline-flex', alignItems:'center', gap:'0.5rem', fontWeight:600 }}>
                  <RefreshCw size={15}/> {isSyncing ? 'Syncing…' : 'Sync from Zoho'}
                </button>
              )}
            </div>
          ) : viewMode === 'card' ? (
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))', gap:'1.25rem', padding:'1.5rem' }}>
              {paginatedItems.map(item => <ItemCard key={item._id} item={item}/>)}
            </div>
          ) : (
            /* Table View */
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse' }}>
                <thead>
                  <tr style={{ background:'#f8fafc', borderBottom:'1px solid #e2e8f0' }}>
                    <th style={{ padding:'0.875rem 1rem', textAlign:'left', color:'#64748b', fontSize:'0.72rem', fontWeight:700 }}>Item</th>
                    <th style={{ padding:'0.875rem 1rem', textAlign:'left', color:'#64748b', fontSize:'0.72rem', fontWeight:700 }}>SKU</th>
                    <th style={{ padding:'0.875rem 1rem', textAlign:'left', color:'#64748b', fontSize:'0.72rem', fontWeight:700 }}>Price</th>
                    <th style={{ padding:'0.875rem 1rem', textAlign:'left', color:'#64748b', fontSize:'0.72rem', fontWeight:700 }}>Status</th>
                    <th style={{ padding:'0.875rem 1rem', textAlign:'left', color:'#64748b', fontSize:'0.72rem', fontWeight:700 }}>Sellable</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedItems.map(item => (
                    <tr key={item._id}
                      style={{ borderBottom:'1px solid #f1f5f9', opacity: item.can_be_sold !== false ? 1 : 0.7 }}
                      onMouseEnter={e => e.currentTarget.style.background='#f8fafc'}
                      onMouseLeave={e => e.currentTarget.style.background='transparent'}
                    >
                      <td style={{ padding:'0.875rem 1rem' }}>
                        <div style={{ fontWeight:700, color:PRIMARY, fontSize:'0.875rem' }}>{item.name}</div>
                        {item.description && (
                          <div style={{ fontSize:'0.7rem', color:'#94a3b8', marginTop:2 }}>
                            {item.description.length > 70 ? item.description.slice(0,70)+'…' : item.description}
                          </div>
                        )}
                      </td>
                      <td style={{ padding:'0.875rem 1rem', color:'#64748b', fontSize:'0.82rem' }}>{item.sku || '—'}</td>
                      <td style={{ padding:'0.875rem 1rem', color:'#059669', fontWeight:700, fontSize:'0.82rem', whiteSpace:'nowrap' }}>
                        {fmtCurrency(item.price)}
                      </td>
                      <td style={{ padding:'0.875rem 1rem' }}>
                        <span style={{ padding:'2px 10px', borderRadius:20, fontSize:'0.68rem', fontWeight:700, background: item.isActive !== false ? '#d1fae5' : '#fee2e2', color: item.isActive !== false ? '#065f46' : '#991b1b' }}>
                          {item.status || 'active'}
                        </span>
                      </td>
                      <td style={{ padding:'0.875rem 1rem' }}>
                        <span style={{ padding:'2px 10px', borderRadius:20, fontSize:'0.68rem', fontWeight:700, background: item.can_be_sold !== false ? '#d1fae5' : '#fef3c7', color: item.can_be_sold !== false ? '#065f46' : '#92400e' }}>
                          {item.can_be_sold !== false ? 'Yes' : 'No'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          
          {/* Pagination Footer */}
          {totalPages > 1 && (
            <div style={{ padding:'0.875rem 1.5rem', borderTop:'1px solid #f1f5f9', background:'#fafbff', display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:'1rem' }}>
              <span style={{ fontSize:'0.78rem', color:'#64748b' }}>
                Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, processedItems.length)} of {processedItems.length.toLocaleString()} items
                {filterType !== 'all' && (
                  <span style={{ color:'#6366f1', marginLeft:4 }}>
                    (filtered: {filterType})
                  </span>
                )}
                {searchQuery && (
                  <span style={{ color:'#6366f1', marginLeft:4 }}>
                    (search: "{searchQuery}")
                  </span>
                )}
              </span>
              <PaginationControls 
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={handlePageChange}
                loading={loading}
              />
            </div>
          )}
        </div>
      </div>
      
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)}/>}
    </div>
  );
}