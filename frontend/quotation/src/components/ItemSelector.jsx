// components/ItemSelector.jsx
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Search, X, Package, Check, Loader2, RefreshCw, Grid, List, Tag, DollarSign, AlertCircle, Box, Wrench } from 'lucide-react';
import { itemAPI } from '../services/api';
import { fmtCurrency } from '../utils/formatters';

const PRIMARY_COLOR = '#0f172a';

const Toast = ({ message, type = 'success', onClose }) => {
  useEffect(() => { 
    const timer = setTimeout(onClose, 3000); 
    return () => clearTimeout(timer); 
  }, [onClose]);
  
  const getGradient = () => {
    switch(type) {
      case 'success': return 'linear-gradient(135deg, #10b981, #059669)';
      case 'error': return 'linear-gradient(135deg, #ef4444, #dc2626)';
      case 'info': return 'linear-gradient(135deg, #3b82f6, #2563eb)';
      default: return 'linear-gradient(135deg, #3b82f6, #2563eb)';
    }
  };
  
  return (
    <div style={{ 
      position: 'fixed', bottom: '24px', right: '24px', zIndex: 1100, animation: 'slideInRight 0.3s ease'
    }}>
      <div style={{ 
        display: 'flex', alignItems: 'center', gap: '12px', background: getGradient(),
        color: 'white', padding: '12px 20px', borderRadius: '16px', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)'
      }}>
        {type === 'success' && <Check size={20} />}
        {type === 'error' && <AlertCircle size={20} />}
        {type === 'info' && <RefreshCw size={20} style={{ animation: 'spin 1s linear infinite' }} />}
        <span style={{ fontWeight: '500', fontSize: '0.875rem' }}>{message}</span>
        <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: '8px', padding: '4px', cursor: 'pointer' }}>
          <X size={14} />
        </button>
      </div>
    </div>
  );
};

const InfiniteItemSelector = ({ 
  isOpen, onClose, onSelect, selectedItems = [],
  selectedCurrency = 'AED', onSyncComplete, companyId 
}) => {
  const [items, setItems] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [searchInputValue, setSearchInputValue] = useState('');
  const [viewMode, setViewMode] = useState('grid');
  const [toast, setToast] = useState(null);
  const [initialLoadDone, setInitialLoadDone] = useState(false);
  
  // Product type filter
  const [productType, setProductType] = useState('all');
  const [filterCounts, setFilterCounts] = useState({ goods: 0, service: 0 });
  
  const loaderRef = useRef();
  const searchTimeoutRef = useRef();
  const abortControllerRef = useRef();
  const pollIntervalRef = useRef();
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      if (abortControllerRef.current) abortControllerRef.current.abort();
    };
  }, []);

  // Reset when modal opens
  useEffect(() => {
    if (isOpen) {
      resetAndFetch();
    }
  }, [isOpen, companyId]);

  const resetAndFetch = () => {
    setItems([]);
    setCurrentPage(1);
    setHasMore(true);
    setSearchTerm('');
    setSearchInputValue('');
    setTotalItems(0);
    setInitialLoadDone(false);
    setProductType('all');
    setLoading(true);
    fetchItems(1, false, '', 'all');
  };

  const fetchItems = useCallback(async (pageNum = 1, append = false, searchQuery = '', typeFilter = null) => {
    if ((loading || loadingMore) && !append) return;
    
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    
    abortControllerRef.current = new AbortController();
    
    if (!append) {
      setLoading(true);
    } else {
      setLoadingMore(true);
    }
    
    try {
      const params = {
        page: pageNum,
        limit: 50,
        sortBy: 'name',
        sortOrder: 'asc'
      };
      
      if (searchQuery) {
        params.search = searchQuery;
      }
      
      const currentFilter = typeFilter !== null ? typeFilter : productType;
      if (currentFilter && currentFilter !== 'all') {
        params.product_type = currentFilter;
      }
      
      if (companyId) {
        params.companyId = companyId;
      }
      
      const response = await itemAPI.getAll(params, { signal: abortControllerRef.current.signal });
      
      if (!isMountedRef.current) return;
      
      if (response.data.success) {
        let newItems = response.data.data || [];
        const pagination = response.data.pagination;
        
        newItems = newItems.filter(item => item.can_be_sold !== false);
        
        const hasNextPage = pagination?.hasNextPage || false;
        
        const goodsCount = newItems.filter(item => item.product_type === 'goods').length;
        const serviceCount = newItems.filter(item => item.product_type === 'service').length;
        
        setFilterCounts({ goods: goodsCount, service: serviceCount });
        
        if (append) {
          setItems(prev => [...prev, ...newItems]);
        } else {
          setItems(newItems);
        }
        setHasMore(hasNextPage);
        setTotalItems(pagination?.totalItems || 0);
        setCurrentPage(pageNum);
        
        if (!append) {
          setInitialLoadDone(true);
        }
      }
    } catch (error) {
      if (error.name !== 'AbortError') {
        console.error('Error fetching items:', error);
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, [companyId, productType, loading, loadingMore]);

  const handleProductTypeChange = useCallback((type) => {
    setProductType(type);
    setCurrentPage(1);
    setItems([]);
    setHasMore(true);
    setInitialLoadDone(false);
    setLoading(true);
    
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    
    fetchItems(1, false, searchTerm, type);
  }, [fetchItems, searchTerm]);

  const handleSearch = useCallback((value) => {
    setSearchInputValue(value);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    
    searchTimeoutRef.current = setTimeout(() => {
      const trimmedValue = value.trim();
      setSearchTerm(trimmedValue);
      setCurrentPage(1);
      setItems([]);
      setHasMore(true);
      setInitialLoadDone(false);
      setLoading(true);
      
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      
      fetchItems(1, false, trimmedValue, productType);
    }, 500);
  }, [fetchItems, productType]);

  const handleClearSearch = useCallback(() => {
    setSearchInputValue('');
    setSearchTerm('');
    setCurrentPage(1);
    setItems([]);
    setHasMore(true);
    setInitialLoadDone(false);
    setLoading(true);
    
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    
    fetchItems(1, false, '', productType);
  }, [fetchItems, productType]);

  const loadMoreItems = useCallback(() => {
    if (!hasMore || loadingMore || loading || !initialLoadDone) return;
    const nextPage = currentPage + 1;
    fetchItems(nextPage, true, searchTerm, productType);
  }, [hasMore, loadingMore, loading, initialLoadDone, currentPage, searchTerm, productType, fetchItems]);

  useEffect(() => {
    if (!loaderRef.current || !hasMore || loadingMore || loading || !initialLoadDone) return;
    
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingMore && !loading && initialLoadDone) {
          loadMoreItems();
        }
      },
      { threshold: 0.1, rootMargin: '200px' }
    );
    
    observer.observe(loaderRef.current);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, loading, initialLoadDone, loadMoreItems]);

  const handleToggle = useCallback((itemId) => {
    setSelectedIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(itemId)) {
        newSet.delete(itemId);
      } else {
        newSet.add(itemId);
      }
      return newSet;
    });
  }, []);

  const handleConfirm = useCallback(() => {
    const newItems = Array.from(selectedIds).map(itemId => {
      const existing = selectedItems.find(i => i.itemId === itemId);
      if (existing) return existing;
      
      const item = items.find(i => i._id === itemId);
      if (!item) return null;
      
      return {
        id: `item-${Date.now()}-${Math.random()}-${itemId}`,
        itemId: item._id,
        zohoId: item.zohoId,
        name: item.name,
        description: item.description || '',
        sku: item.sku || '',
        unit: item.unit || '',
        price: item.price || 0,
        unitPrice: item.price || 0,
        quantity: 1,
        product_type: item.product_type || 'goods',
        tax_percentage: item.tax_percentage || 0,
        status: item.status || 'active',
        imagePaths: item.imagePaths || [],
        fullItemData: {
          _id: item._id,
          zohoId: item.zohoId,
          name: item.name,
          description: item.description,
          sku: item.sku,
          unit: item.unit,
          price: item.price,
          product_type: item.product_type,
          tax_percentage: item.tax_percentage,
          status: item.status,
          can_be_sold: true
        }
      };
    }).filter(item => item !== null);
    
    onSelect(newItems);
    onClose();
  }, [selectedIds, selectedItems, items, onSelect, onClose]);
  
  const handleManualSync = useCallback(async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    setToast({ message: 'Syncing items from Zoho...', type: 'info' });
    
    try {
      const response = await itemAPI.syncItems();
      if (response.data.success) {
        if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = setInterval(async () => {
          try {
            const statusRes = await itemAPI.getSyncStatus();
            if (!statusRes.data.status.isSyncing) {
              clearInterval(pollIntervalRef.current);
              setIsSyncing(false);
              resetAndFetch();
              
              const result = statusRes.data.status.lastSyncResult;
              setToast({ 
                message: `✅ Sync complete! ${result?.created || 0} new, ${result?.updated || 0} updated`, 
                type: 'success' 
              });
              onSyncComplete?.(result);
            }
          } catch (error) {
            clearInterval(pollIntervalRef.current);
            setIsSyncing(false);
            setToast({ message: '❌ Sync failed', type: 'error' });
          }
        }, 2000);
      } else {
        setIsSyncing(false);
        setToast({ message: '❌ Sync failed to start', type: 'error' });
      }
    } catch (error) {
      setIsSyncing(false);
      setToast({ message: '❌ Sync failed', type: 'error' });
    }
  }, [isSyncing, onSyncComplete]);

  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      @keyframes slideInRight { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
      @keyframes fadeIn { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
    `;
    document.head.appendChild(style);
    return () => document.head.removeChild(style);
  }, []);

  if (!isOpen) return null;

  return (
    <>
      <div style={styles.overlay} onClick={onClose}>
        <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
          {/* Header */}
          <div style={styles.header}>
            <div>
              <h2 style={styles.title}>Select Items</h2>
              <p style={styles.subtitle}>Search and select items to add to your quotation</p>
            </div>
            <button onClick={onClose} style={styles.closeBtn}>
              <X size={20} />
            </button>
          </div>

          {/* Search Section */}
          <div style={styles.searchContainer}>
            <div style={styles.searchWrapper}>
              <Search size={18} style={styles.searchIcon} />
              <input 
                type="text" 
                placeholder="Search by name, SKU, or description..."
                value={searchInputValue} 
                onChange={(e) => handleSearch(e.target.value)}
                style={styles.searchInput} 
                autoFocus 
              />
              {searchInputValue && (
                <button onClick={handleClearSearch} style={styles.clearBtn}>
                  <X size={16} />
                </button>
              )}
            </div>
            
            {/* Product Type Filter Buttons */}
            <div style={styles.filterContainer}>
              <button
                onClick={() => handleProductTypeChange('all')}
                style={{ ...styles.filterBtn, ...(productType === 'all' ? styles.filterBtnActive : {}) }}
              >
                <Package size={14} /> All Types
              </button>
              <button
                onClick={() => handleProductTypeChange('goods')}
                style={{ ...styles.filterBtn, ...(productType === 'goods' ? styles.filterBtnActive : {}) }}
              >
                <Box size={14} /> Goods  
              </button>
              <button
                onClick={() => handleProductTypeChange('service')}
                style={{ ...styles.filterBtn, ...(productType === 'service' ? styles.filterBtnActive : {}) }}
              >
                <Wrench size={14} /> Services  
              </button>
            </div>
            
            <div style={styles.statsBar}>
              <div style={styles.statsLeft}>
                <span style={styles.statsText}>
                  {totalItems > 0 
                    ? `Showing ${items.length} items` 
                    : loading ? 'Loading...' : 'No sellable items found'}
                </span>
              </div>
              <div style={styles.statsRight}>
                <div style={styles.viewToggle}>
                  <button 
                    onClick={() => setViewMode('grid')}
                    style={{ ...styles.viewBtn, ...(viewMode === 'grid' ? styles.viewBtnActive : {}) }}
                  >
                    <Grid size={14} /> Grid
                  </button>
                  <button 
                    onClick={() => setViewMode('list')}
                    style={{ ...styles.viewBtn, ...(viewMode === 'list' ? styles.viewBtnActive : {}) }}
                  >
                    <List size={14} /> List
                  </button>
                </div>
                <button 
                  onClick={handleManualSync} 
                  disabled={isSyncing} 
                  style={styles.syncBtn}
                >
                  <RefreshCw size={14} style={{ animation: isSyncing ? 'spin 1s linear infinite' : 'none' }} />
                  {isSyncing ? 'Syncing...' : 'Refresh'}
                </button>
              </div>
            </div>
          </div>

          {/* Items Container */}
          <div style={styles.itemsContainer}>
            {loading && items.length === 0 ? (
              <div style={styles.loadingState}>
                <Loader2 size={48} style={{ animation: 'spin 1s linear infinite', color: PRIMARY_COLOR }} />
                <p style={{ color: '#64748b' }}>Loading sellable items...</p>
              </div>
            ) : (
              <>
                <div style={viewMode === 'grid' ? styles.itemsGrid : styles.itemsList}>
                  {items.map((item) => {
                    const isSelected = selectedIds.has(item._id);
                    const isGoods = item.product_type === 'goods';
                    const itemTypeColor = isGoods ? '#10b981' : '#3b82f6';
                    const itemTypeBg = isGoods ? '#d1fae5' : '#dbeafe';
                    
                    return viewMode === 'grid' ? (
                      <div 
                        key={item._id} 
                        onClick={() => handleToggle(item._id)}
                        style={{ ...styles.itemCard, ...(isSelected ? styles.itemCardSelected : {}) }}
                      >
                        <div style={styles.checkboxContainer}>
                          <div style={{ ...styles.checkbox, ...(isSelected ? styles.checkboxSelected : {}) }}>
                            {isSelected && <Check size={12} color="white" />}
                          </div>
                        </div>
                        <div style={styles.itemIcon}>
                          {isGoods ? <Box size={20} color={PRIMARY_COLOR} /> : <Wrench size={20} color={PRIMARY_COLOR} />}
                        </div>
                        <div style={styles.itemContent}>
                          <h3 style={styles.itemName}>{item.name}</h3>
                          <span style={{ 
                            display: 'inline-flex', alignItems: 'center', gap: '4px',
                            padding: '2px 8px', borderRadius: '12px', fontSize: '0.6rem', 
                            fontWeight: 600, background: itemTypeBg, color: itemTypeColor, marginBottom: '6px'
                          }}>
                            {isGoods ? <Box size={10} /> : <Wrench size={10} />}
                            {isGoods ? 'Goods' : 'Service'}
                          </span>
                          {item.sku && (
                            <p style={styles.itemSku}>
                              <Tag size={10} /> SKU: {item.sku}
                            </p>
                          )}
                          {item.description && (
                            <p style={styles.itemDesc}>
                              {item.description.substring(0, 60)}{item.description.length > 60 ? '...' : ''}
                            </p>
                          )}
                          <p style={styles.itemPrice}>
                            <DollarSign size={12} /> {fmtCurrency(item.price, selectedCurrency)}
                          </p>
                        </div>
                        {isSelected && <div style={styles.selectedBadge}>✓</div>}
                      </div>
                    ) : (
                      <div 
                        key={item._id} 
                        onClick={() => handleToggle(item._id)}
                        style={{ ...styles.listItem, ...(isSelected ? styles.listItemSelected : {}) }}
                      >
                        <div style={styles.listItemCheckbox}>
                          <div style={{ ...styles.checkbox, ...(isSelected ? styles.checkboxSelected : {}) }}>
                            {isSelected && <Check size={12} color="white" />}
                          </div>
                        </div>
                        <div style={styles.listItemContent}>
                          <div style={styles.listItemMain}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                              <h3 style={styles.listItemName}>{item.name}</h3>
                              <span style={{ 
                                padding: '2px 8px', borderRadius: '12px', fontSize: '0.6rem', 
                                fontWeight: 600, background: itemTypeBg, color: itemTypeColor
                              }}>
                                {isGoods ? 'Goods' : 'Service'}
                              </span>
                            </div>
                            {item.sku && (
                              <span style={styles.listItemSku}>SKU: {item.sku}</span>
                            )}
                          </div>
                          <p style={styles.listItemPrice}>
                            {fmtCurrency(item.price, selectedCurrency)}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
                
                {/* Loader for infinite scroll */}
                <div ref={loaderRef} style={styles.loaderContainer}>
                  {loadingMore && (
                    <div style={styles.loadingSpinner}>
                      <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} />
                      <span>Loading more items...</span>
                    </div>
                  )}
                  {!hasMore && items.length > 0 && !loadingMore && (
                    <div style={styles.endMessage}>
                      <Package size={16} />
                      <span>End of list ({items.length} items)</span>
                    </div>
                  )}
                  {hasMore && !loadingMore && items.length > 0 && !loading && (
                    <div style={styles.scrollHint}>
                      <span>Scroll for more items...</span>
                    </div>
                  )}
                </div>
                
                {!loading && items.length === 0 && !searchTerm && (
                  <div style={styles.emptyState}>
                    <Package size={64} style={{ color: '#cbd5e1', marginBottom: '1rem' }} />
                    <p style={{ color: '#64748b', fontWeight: '500' }}>No sellable items found in your inventory</p>
                    <button onClick={handleManualSync} style={styles.emptySyncBtn}>
                      <RefreshCw size={16} /> Sync from Zoho
                    </button>
                  </div>
                )}
                
                {!loading && items.length === 0 && searchTerm && (
                  <div style={styles.emptyState}>
                    <Search size={64} style={{ color: '#cbd5e1', marginBottom: '1rem' }} />
                    <p style={{ color: '#64748b', fontWeight: '500' }}>No sellable items match "{searchTerm}"</p>
                    <button onClick={handleClearSearch} style={styles.emptySyncBtn}>
                      Clear Search
                    </button>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Footer */}
          <div style={styles.footer}>
            <div style={styles.selectedCount}>
              {selectedIds.size} item{selectedIds.size !== 1 ? 's' : ''} selected
            </div>
            <div style={styles.actions}>
              <button onClick={onClose} style={styles.cancelBtn}>
                Cancel
              </button>
              <button 
                onClick={handleConfirm} 
                disabled={selectedIds.size === 0}
                style={{ ...styles.confirmBtn, ...(selectedIds.size === 0 ? styles.confirmBtnDisabled : {}) }}
              >
                Add Selected ({selectedIds.size})
              </button>
            </div>
          </div>
        </div>
      </div>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </>
  );
};

const styles = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(15, 23, 42, 0.6)',
    backdropFilter: 'blur(8px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    padding: '1rem',
    animation: 'fadeIn 0.2s ease'
  },
  modal: {
    background: 'white',
    borderRadius: '28px',
    width: '100%',
    maxWidth: '900px',
    height: '85vh',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
    animation: 'fadeIn 0.3s ease'
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: '1.5rem 1.75rem',
    borderBottom: '1px solid #f1f5f9',
    background: 'linear-gradient(135deg, #fff, #fafbff)',
    borderRadius: '28px 28px 0 0'
  },
  title: {
    margin: 0,
    fontSize: '1.5rem',
    fontWeight: '800',
    color: PRIMARY_COLOR
  },
  subtitle: {
    margin: '0.25rem 0 0',
    color: '#64748b',
    fontSize: '0.875rem'
  },
  closeBtn: {
    background: '#f1f5f9',
    border: 'none',
    borderRadius: '12px',
    cursor: 'pointer',
    color: '#64748b',
    padding: '0.5rem',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.2s'
  },
  searchContainer: {
    padding: '1.25rem 1.75rem',
    borderBottom: '1px solid #f1f5f9',
    background: '#fafbff'
  },
  searchWrapper: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center'
  },
  searchIcon: {
    position: 'absolute',
    left: '1rem',
    color: '#94a3b8'
  },
  searchInput: {
    width: '100%',
    padding: '0.75rem 1rem 0.75rem 2.75rem',
    border: '1.5px solid #e2e8f0',
    borderRadius: '14px',
    fontSize: '0.875rem',
    fontFamily: 'inherit',
    outline: 'none',
    transition: 'all 0.2s',
    background: 'white'
  },
  clearBtn: {
    position: 'absolute',
    right: '0.75rem',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: '#94a3b8',
    padding: '0.25rem',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  filterContainer: {
    display: 'flex',
    gap: '0.5rem',
    marginTop: '0.75rem',
    marginBottom: '0.75rem',
    flexWrap: 'wrap'
  },
  filterBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: '0.4rem 0.9rem',
    borderRadius: '20px',
    border: '1.5px solid #e2e8f0',
    background: 'white',
    fontSize: '0.75rem',
    fontWeight: '500',
    cursor: 'pointer',
    color: '#475569',
    transition: 'all 0.2s'
  },
  filterBtnActive: {
    background: PRIMARY_COLOR,
    borderColor: PRIMARY_COLOR,
    color: 'white'
  },
  statsBar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: '0.5rem'
  },
  statsLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '1rem'
  },
  statsText: {
    color: '#64748b',
    fontSize: '0.75rem',
    fontWeight: '500'
  },
  statsRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem'
  },
  viewToggle: {
    display: 'flex',
    gap: '0.25rem',
    background: '#f1f5f9',
    padding: '0.25rem',
    borderRadius: '10px'
  },
  viewBtn: {
    padding: '0.35rem 0.75rem',
    borderRadius: '8px',
    border: 'none',
    background: 'transparent',
    fontSize: '0.7rem',
    fontWeight: '600',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    color: '#64748b',
    transition: 'all 0.2s'
  },
  viewBtnActive: {
    background: 'white',
    color: PRIMARY_COLOR,
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
  },
  syncBtn: {
    background: 'white',
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    padding: '0.35rem 0.75rem',
    fontSize: '0.7rem',
    fontWeight: '500',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    color: '#475569',
    transition: 'all 0.2s'
  },
  itemsContainer: {
    flex: 1,
    overflowY: 'auto',
    padding: '1.5rem'
  },
  itemsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
    gap: '1rem'
  },
  itemsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem'
  },
  itemCard: {
    position: 'relative',
    background: 'white',
    border: '1.5px solid #f1f5f9',
    borderRadius: '16px',
    padding: '1rem',
    cursor: 'pointer',
    transition: 'all 0.2s'
  },
  itemCardSelected: {
    background: '#eff1ff',
    borderColor: '#c7d2fe',
    boxShadow: '0 4px 12px rgba(99,102,241,0.15)'
  },
  checkboxContainer: {
    display: 'flex',
    justifyContent: 'flex-start',
    marginBottom: '0.75rem'
  },
  checkbox: {
    width: '20px',
    height: '20px',
    border: '2px solid #e2e8f0',
    borderRadius: '6px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'white',
    transition: 'all 0.2s'
  },
  checkboxSelected: {
    background: '#6366f1',
    borderColor: '#6366f1'
  },
  itemIcon: {
    width: '40px',
    height: '40px',
    borderRadius: '12px',
    background: `${PRIMARY_COLOR}10`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: '0.75rem'
  },
  itemContent: {
    flex: 1
  },
  itemName: {
    margin: 0,
    fontWeight: '700',
    color: PRIMARY_COLOR,
    fontSize: '0.9rem',
    marginBottom: '0.25rem'
  },
  itemSku: {
    margin: 0,
    color: '#94a3b8',
    fontSize: '0.7rem',
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    marginBottom: '0.25rem'
  },
  itemDesc: {
    margin: 0,
    color: '#64748b',
    fontSize: '0.75rem',
    lineHeight: '1.4',
    marginBottom: '0.5rem'
  },
  itemPrice: {
    margin: 0,
    color: '#059669',
    fontWeight: '700',
    fontSize: '0.875rem',
    display: 'flex',
    alignItems: 'center',
    gap: '2px'
  },
  selectedBadge: {
    position: 'absolute',
    top: '0.75rem',
    right: '0.75rem',
    width: '24px',
    height: '24px',
    background: '#6366f1',
    color: 'white',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '0.75rem',
    fontWeight: '700'
  },
  listItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '1rem',
    padding: '0.875rem',
    border: '1.5px solid #f1f5f9',
    borderRadius: '12px',
    cursor: 'pointer',
    transition: 'all 0.2s',
    background: 'white'
  },
  listItemSelected: {
    background: '#eff1ff',
    borderColor: '#c7d2fe'
  },
  listItemCheckbox: {
    flexShrink: 0
  },
  listItemContent: {
    flex: 1,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  listItemMain: {
    flex: 1
  },
  listItemName: {
    margin: 0,
    fontWeight: '600',
    color: PRIMARY_COLOR,
    fontSize: '0.875rem'
  },
  listItemSku: {
    marginLeft: '0.5rem',
    color: '#94a3b8',
    fontSize: '0.7rem'
  },
  listItemPrice: {
    margin: 0,
    color: '#059669',
    fontWeight: '700',
    fontSize: '0.875rem',
    flexShrink: 0
  },
  loaderContainer: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    padding: '1rem',
    marginTop: '0.5rem'
  },
  loadingSpinner: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    color: '#64748b',
    fontSize: '0.875rem'
  },
  scrollHint: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    padding: '0.5rem',
    color: '#94a3b8',
    fontSize: '0.75rem'
  },
  loadingState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '1rem',
    padding: '3rem',
    color: '#64748b'
  },
  endMessage: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    color: '#94a3b8',
    fontSize: '0.875rem'
  },
  emptyState: {
    textAlign: 'center',
    padding: '3rem',
    color: '#94a3b8'
  },
  emptySyncBtn: {
    marginTop: '1rem',
    padding: '0.6rem 1.25rem',
    background: `linear-gradient(135deg, ${PRIMARY_COLOR}, #1e293b)`,
    color: 'white',
    border: 'none',
    borderRadius: '12px',
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '0.875rem',
    fontWeight: '500',
    transition: 'all 0.2s'
  },
  footer: {
    padding: '1.25rem 1.75rem',
    borderTop: '1px solid #f1f5f9',
    background: '#fafbff',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderRadius: '0 0 28px 28px'
  },
  selectedCount: {
    color: '#64748b',
    fontSize: '0.875rem',
    fontWeight: '500'
  },
  actions: {
    display: 'flex',
    gap: '0.75rem'
  },
  cancelBtn: {
    background: 'white',
    color: '#475569',
    border: '1.5px solid #e2e8f0',
    borderRadius: '12px',
    padding: '0.65rem 1.25rem',
    fontSize: '0.875rem',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s'
  },
  confirmBtn: {
    background: `linear-gradient(135deg, ${PRIMARY_COLOR}, #1e293b)`,
    color: 'white',
    border: 'none',
    borderRadius: '12px',
    padding: '0.65rem 1.25rem',
    fontSize: '0.875rem',
    fontWeight: '600',
    cursor: 'pointer',
    boxShadow: `0 4px 12px ${PRIMARY_COLOR}30`,
    transition: 'all 0.2s'
  },
  confirmBtnDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed'
  }
};

export default InfiniteItemSelector;