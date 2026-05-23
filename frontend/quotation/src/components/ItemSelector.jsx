// components/ItemSelector.jsx
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Search, X, Package, Check, Loader2, RefreshCw, Grid, List, Tag, DollarSign, AlertCircle, Box, Wrench } from 'lucide-react';
import { itemAPI } from '../services/api';
import { fmtCurrency } from '../utils/formatters';

const PRIMARY_COLOR = '#0f172a';

// ─────────────────────────────────────────────────────────────────
// Toast Component
// ─────────────────────────────────────────────────────────────────
const Toast = ({ message, type = 'success', onClose }) => {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);

  const getGradient = () => {
    switch (type) {
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

// ─────────────────────────────────────────────────────────────────
// Responsive Hook
// ─────────────────────────────────────────────────────────────────
const useMediaQuery = (query) => {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(query).matches : false
  );
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia(query);
    const handler = (e) => setMatches(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [query]);
  return matches;
};

// ─────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────
const InfiniteItemSelector = ({
  isOpen, onClose, onSelect, selectedItems = [],
  selectedCurrency = 'AED', onSyncComplete, companyId
}) => {
  const isMobile = useMediaQuery('(max-width: 768px)');

  // ─── State ───────────────────────────────────────────────────
  const [items, setItems] = useState([]);
  const [allLoadedItems, setAllLoadedItems] = useState(new Map());
  const [searchTerm, setSearchTerm] = useState('');
  const [searchInputValue, setSearchInputValue] = useState('');
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [viewMode, setViewMode] = useState('grid');
  const [toast, setToast] = useState(null);
  const [initialLoadDone, setInitialLoadDone] = useState(false);
  const [productType, setProductType] = useState('all');
  const [filterCounts, setFilterCounts] = useState({ goods: 0, service: 0 });
  const [searchError, setSearchError] = useState(null);
  const [noResults, setNoResults] = useState(false);

  // ─── Refs ────────────────────────────────────────────────────
  const loaderRef = useRef();
  const searchTimeoutRef = useRef();
  const abortControllerRef = useRef();
  const pollIntervalRef = useRef();
  const isMountedRef = useRef(true);
  const isFetchingRef = useRef(false);

  // ─── Cleanup ─────────────────────────────────────────────────
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      if (abortControllerRef.current) abortControllerRef.current.abort();
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    if (isOpen) {
      const initialSelectedIds = new Set(selectedItems.map(item => item.itemId));
      setSelectedIds(initialSelectedIds);
      setAllLoadedItems(new Map());
      resetAndFetch();
    }
  }, [isOpen, companyId]);

  // ─── Reset and Fetch ─────────────────────────────────────────
  const resetAndFetch = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    isFetchingRef.current = false;
    setItems([]);
    setCurrentPage(1);
    setHasMore(true);
    setSearchTerm('');
    setSearchInputValue('');
    setTotalItems(0);
    setInitialLoadDone(false);
    setProductType('all');
    setSearchError(null);
    setNoResults(false);
    setLoading(true);
    fetchItems(1, false, '', 'all');
  };

  // ─── Fetch Items ─────────────────────────────────────────────
  const fetchItems = useCallback(async (pageNum = 1, append = false, searchQuery = '', typeFilter = null) => {
    if (isFetchingRef.current) return;

    if (!append && loading) return;
    if (append && loadingMore) return;

    if (!append) setLoading(true);
    else setLoadingMore(true);

    isFetchingRef.current = true;
    setSearchError(null);

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    abortControllerRef.current = new AbortController();

    try {
      const params = {
        page: pageNum,
        limit: 50,
        sortBy: 'name',
        sortOrder: 'asc'
      };

      if (searchQuery && searchQuery.trim()) {
        params.search = searchQuery.trim();
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

      if (response?.data?.success) {
        let newItems = response.data.data || [];
        const pagination = response.data.pagination;

        // Filter sellable items
        newItems = newItems.filter(item => item.can_be_sold !== false);

        const hasNextPage = pagination?.hasNextPage || false;

        // Count items by type
        const goodsCount = newItems.filter(item => item.product_type === 'goods').length;
        const serviceCount = newItems.filter(item => item.product_type === 'service').length;

        setFilterCounts({ goods: goodsCount, service: serviceCount });

        // Update all loaded items map
        setAllLoadedItems(prev => {
          const newMap = new Map(prev);
          newItems.forEach(item => {
            newMap.set(item._id, item);
          });
          return newMap;
        });

        // Append or replace items
        if (append) {
          setItems(prev => {
            const existingIds = new Set(prev.map(item => item._id));
            const uniqueNewItems = newItems.filter(item => !existingIds.has(item._id));
            return [...prev, ...uniqueNewItems];
          });
        } else {
          setItems(newItems);
        }

        // Update state
        setHasMore(hasNextPage);
        setTotalItems(pagination?.totalItems || 0);
        setCurrentPage(pageNum);
        setNoResults(newItems.length === 0 && pageNum === 1);

        if (!append) {
          setInitialLoadDone(true);
        }
      } else {
        setSearchError('Failed to load items');
        setNoResults(true);
      }
    } catch (error) {
      if (error.name !== 'AbortError' && isMountedRef.current) {
        console.error('Error fetching items:', error);
        if (!searchQuery) {
          setSearchError('Error loading items. Please try again.');
        } else {
          setNoResults(true);
        }
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
        setLoadingMore(false);
        isFetchingRef.current = false;
      }
    }
  }, [companyId, productType, loading, loadingMore]);

  // ─── Handle Toggle ───────────────────────────────────────────
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

  // ─── Handle Confirm ──────────────────────────────────────────
  const handleConfirm = useCallback(() => {
    const existingItemsMap = new Map();
    selectedItems.forEach(item => {
      existingItemsMap.set(item.itemId, item);
    });

    const finalSelectedItems = [...selectedItems];
    const processedItemIds = new Set();

    selectedIds.forEach(itemId => {
      if (!existingItemsMap.has(itemId) && !processedItemIds.has(itemId)) {
        let item = items.find(i => i._id === itemId);

        if (!item) {
          item = allLoadedItems.get(itemId);
        }

        if (item) {
          finalSelectedItems.push({
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
          });
          processedItemIds.add(itemId);
        }
      }
    });

    const itemsToKeep = [];
    finalSelectedItems.forEach(item => {
      if (selectedIds.has(item.itemId)) {
        itemsToKeep.push(item);
      }
    });

    onSelect(itemsToKeep);
    onClose();
  }, [selectedIds, selectedItems, items, allLoadedItems, onSelect, onClose]);

  // ─── Handle Product Type Change ──────────────────────────────
  const handleProductTypeChange = useCallback((type) => {
    if (type === productType) return;

    setProductType(type);
    setCurrentPage(1);
    setItems([]);
    setHasMore(true);
    setInitialLoadDone(false);
    setSearchError(null);
    setNoResults(false);
    isFetchingRef.current = false;
    setLoading(true);

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    fetchItems(1, false, searchTerm, type);
  }, [fetchItems, searchTerm, productType]);

  // ─── Handle Search ───────────────────────────────────────────
  const handleSearch = useCallback((value) => {
    setSearchInputValue(value);
    setSearchError(null);

    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);

    // Immediate debounce
    searchTimeoutRef.current = setTimeout(() => {
      const trimmedValue = value.trim();
      setSearchTerm(trimmedValue);
      setCurrentPage(1);
      setItems([]);
      setHasMore(true);
      setInitialLoadDone(false);
      setNoResults(false);
      isFetchingRef.current = false;
      setLoading(true);

      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      fetchItems(1, false, trimmedValue, productType);
    }, 300); // Reduced from 500ms to 300ms for faster search
  }, [fetchItems, productType]);

  // ─── Handle Clear Search ────────────────────────────────────
  const handleClearSearch = useCallback(() => {
    setSearchInputValue('');
    setSearchTerm('');
    setCurrentPage(1);
    setItems([]);
    setHasMore(true);
    setInitialLoadDone(false);
    setSearchError(null);
    setNoResults(false);
    isFetchingRef.current = false;
    setLoading(true);

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    fetchItems(1, false, '', productType);
  }, [fetchItems, productType]);

  // ─── Load More Items ────────────────────────────────────────
  const loadMoreItems = useCallback(() => {
    if (!hasMore || loadingMore || loading || !initialLoadDone || isFetchingRef.current) return;
    const nextPage = currentPage + 1;
    fetchItems(nextPage, true, searchTerm, productType);
  }, [hasMore, loadingMore, loading, initialLoadDone, currentPage, searchTerm, productType, fetchItems]);

  // ─── Infinite Scroll ────────────────────────────────────────
  useEffect(() => {
    if (!loaderRef.current || !hasMore || loadingMore || loading || !initialLoadDone) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingMore && !loading && initialLoadDone && !isFetchingRef.current) {
          loadMoreItems();
        }
      },
      { threshold: 0.1, rootMargin: '200px' }
    );

    const currentLoader = loaderRef.current;
    observer.observe(currentLoader);
    return () => observer.unobserve(currentLoader);
  }, [hasMore, loadingMore, loading, initialLoadDone, loadMoreItems]);

  // ─── Handle Manual Sync ────────────────────────────────────
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

  // ─── Styles ─────────────────────────────────────────────────
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

  // ─── Responsive Styles ──────────────────────────────────────
  const responsiveStyles = {
    modal: {
      width: isMobile ? '95%' : '90%',
      maxWidth: isMobile ? '100%' : '900px',
      height: isMobile ? '95vh' : '80vh',
      borderRadius: isMobile ? '16px' : '24px',
    },
    title: {
      fontSize: isMobile ? '1.25rem' : '1.5rem',
    },
    searchInput: {
      padding: isMobile ? '8px 36px' : '10px 40px',
      fontSize: isMobile ? '0.813rem' : '0.875rem',
    },
    itemsGrid: {
      gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(280px, 1fr))',
    }
  };

  return (
    <>
      <div style={{ ...styles.overlay }}>
        <div style={{ ...styles.modal, ...responsiveStyles.modal }} onClick={(e) => e.stopPropagation()}>
          {/* Header */}
          <div style={styles.header}>
            <div>
              <h2 style={{ ...styles.title, ...responsiveStyles.title }}>Select Items</h2>
              <p style={styles.subtitle}>Search and select items to add</p>
            </div>
            <button onClick={onClose} style={styles.closeBtn}>
              <X size={isMobile ? 18 : 20} />
            </button>
          </div>

          {/* Search */}
          <div style={styles.searchContainer}>
            <div style={styles.searchWrapper}>
              <Search size={isMobile ? 16 : 18} style={styles.searchIcon} />
              <input
                type="text"
                placeholder={isMobile ? "Search..." : "Search by name, SKU..."}
                value={searchInputValue}
                onChange={(e) => handleSearch(e.target.value)}
                style={{ ...styles.searchInput, ...responsiveStyles.searchInput }}
                autoFocus
              />
              {searchInputValue && (
                <button onClick={handleClearSearch} style={styles.clearBtn}>
                  <X size={isMobile ? 14 : 16} />
                </button>
              )}
            </div>

            {/* Filter Buttons */}
            <div style={styles.filterContainer}>
              <button
                onClick={() => handleProductTypeChange('all')}
                style={{ ...styles.filterBtn, ...(productType === 'all' ? styles.filterBtnActive : {}) }}
              >
                <Package size={isMobile ? 12 : 14} /> {isMobile ? 'All' : 'All Types'}
              </button>
              <button
                onClick={() => handleProductTypeChange('goods')}
                style={{ ...styles.filterBtn, ...(productType === 'goods' ? styles.filterBtnActive : {}) }}
              >
                <Box size={isMobile ? 12 : 14} /> Goods
              </button>
              <button
                onClick={() => handleProductTypeChange('service')}
                style={{ ...styles.filterBtn, ...(productType === 'service' ? styles.filterBtnActive : {}) }}
              >
                <Wrench size={isMobile ? 12 : 14} /> Services
              </button>
            </div>

            {/* Stats Bar */}
            <div style={styles.statsBar}>
              <div style={styles.statsLeft}>
                <span style={styles.statsText}>
                  {loading && items.length === 0 ? 'Loading...' : `Showing ${items.length} items`}
                </span>
              </div>
              <div style={styles.statsRight}>
                <div style={styles.viewToggle}>
                  <button
                    onClick={() => setViewMode('grid')}
                    style={{ ...styles.viewBtn, ...(viewMode === 'grid' ? styles.viewBtnActive : {}) }}
                  >
                    <Grid size={isMobile ? 12 : 14} />
                  </button>
                  <button
                    onClick={() => setViewMode('list')}
                    style={{ ...styles.viewBtn, ...(viewMode === 'list' ? styles.viewBtnActive : {}) }}
                  >
                    <List size={isMobile ? 12 : 14} />
                  </button>
                </div>
                <button
                  onClick={handleManualSync}
                  disabled={isSyncing}
                  style={styles.syncBtn}
                >
                  <RefreshCw size={isMobile ? 12 : 14} style={{ animation: isSyncing ? 'spin 1s linear infinite' : 'none' }} />
                  {isSyncing ? 'Sync...' : 'Refresh'}
                </button>
              </div>
            </div>

            {/* Error Message */}
            {searchError && (
              <div style={{
                padding: '10px 12px',
                background: '#fef2f2',
                border: '1px solid #fca5a5',
                borderRadius: '8px',
                color: '#991b1b',
                fontSize: '0.8rem',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <AlertCircle size={14} />
                {searchError}
              </div>
            )}
          </div>

          {/* Items Container */}
          <div style={styles.itemsContainer}>
            {loading && items.length === 0 ? (
              <div style={styles.loadingState}>
                <Loader2 size={isMobile ? 32 : 48} style={{ animation: 'spin 1s linear infinite', color: PRIMARY_COLOR }} />
                <p style={{ color: '#64748b' }}>Loading items...</p>
              </div>
            ) : noResults && !searchError ? (
              <div style={styles.emptyState}>
                <Search size={isMobile ? 48 : 64} style={{ color: '#cbd5e1', marginBottom: '1rem' }} />
                <p style={{ color: '#64748b', fontWeight: '500' }}>
                  {searchTerm ? `No items match "${searchTerm}"` : 'No sellable items found'}
                </p>
                {searchTerm && (
                  <button onClick={handleClearSearch} style={styles.emptySyncBtn}>
                    Clear Search
                  </button>
                )}
              </div>
            ) : (
              <>
                <div style={{ ...styles.itemsGrid, ...responsiveStyles.itemsGrid }}>
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
                          {isGoods ? <Box size={isMobile ? 16 : 20} color={PRIMARY_COLOR} /> : <Wrench size={isMobile ? 16 : 20} color={PRIMARY_COLOR} />}
                        </div>
                        <div style={styles.itemContent}>
                          <h3 style={styles.itemName}>{item.name}</h3>
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: '4px',
                            padding: '2px 8px', borderRadius: '12px', fontSize: isMobile ? '0.55rem' : '0.6rem',
                            fontWeight: 600, background: itemTypeBg, color: itemTypeColor, marginBottom: '6px'
                          }}>
                            {isGoods ? 'Goods' : 'Service'}
                          </span>
                          {item.sku && <p style={styles.itemSku}>SKU: {item.sku}</p>}
                          {item.description && <p style={styles.itemDesc}>{item.description.substring(0, 60)}...</p>}
                          <p style={styles.itemPrice}>{fmtCurrency(item.price, selectedCurrency)}</p>
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
                            <h3 style={styles.listItemName}>{item.name}</h3>
                            {item.sku && <span style={styles.listItemSku}>SKU: {item.sku}</span>}
                          </div>
                          <p style={styles.listItemPrice}>{fmtCurrency(item.price, selectedCurrency)}</p>
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
                      <span>Loading more...</span>
                    </div>
                  )}
                  {!hasMore && items.length > 0 && (
                    <div style={styles.endMessage}>
                      <Package size={16} />
                      <span>End of list</span>
                    </div>
                  )}
                </div>
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
                Add ({selectedIds.size})
              </button>
            </div>
          </div>
        </div>
      </div>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </>
  );
};

// ─────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────
const styles = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    animation: 'fadeIn 0.2s ease',
  },
  modal: {
    backgroundColor: 'white',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: '24px',
    borderBottom: '1px solid #e2e8f0',
  },
  title: {
    fontWeight: '600',
    color: PRIMARY_COLOR,
    margin: 0,
  },
  subtitle: {
    color: '#64748b',
    marginTop: '4px',
    fontSize: '0.875rem',
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: '8px',
    borderRadius: '8px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#64748b',
  },
  searchContainer: {
    padding: '20px 24px',
    borderBottom: '1px solid #e2e8f0',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  searchWrapper: {
    position: 'relative',
  },
  searchIcon: {
    position: 'absolute',
    left: '12px',
    top: '50%',
    transform: 'translateY(-50%)',
    color: '#94a3b8',
  },
  searchInput: {
    width: '100%',
    border: '1px solid #e2e8f0',
    borderRadius: '12px',
    outline: 'none',
    boxSizing: 'border-box',
  },
  clearBtn: {
    position: 'absolute',
    right: '12px',
    top: '50%',
    transform: 'translateY(-50%)',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: '#94a3b8',
  },
  filterContainer: {
    display: 'flex',
    gap: '8px',
    flexWrap: 'wrap',
  },
  filterBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '6px 12px',
    borderRadius: '8px',
    fontWeight: '500',
    border: '1px solid #e2e8f0',
    background: 'white',
    cursor: 'pointer',
    color: '#64748b',
    fontSize: '0.75rem',
  },
  filterBtnActive: {
    background: PRIMARY_COLOR,
    color: 'white',
    borderColor: PRIMARY_COLOR,
  },
  statsBar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '12px',
  },
  statsLeft: {
    fontSize: '0.75rem',
    color: '#64748b',
  },
  statsText: {},
  statsRight: {
    display: 'flex',
    gap: '8px',
    alignItems: 'center',
  },
  viewToggle: {
    display: 'flex',
    gap: '4px',
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    overflow: 'hidden',
  },
  viewBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    padding: '4px 8px',
    border: 'none',
    background: 'white',
    cursor: 'pointer',
    color: '#64748b',
    fontSize: '0.75rem',
  },
  viewBtnActive: {
    background: PRIMARY_COLOR,
    color: 'white',
  },
  syncBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '4px 12px',
    borderRadius: '8px',
    border: '1px solid #e2e8f0',
    background: 'white',
    cursor: 'pointer',
    color: '#64748b',
    fontSize: '0.75rem',
  },
  itemsContainer: {
    flex: 1,
    overflowY: 'auto',
    padding: '20px 24px',
  },
  itemsGrid: {
    display: 'grid',
    gap: '16px',
  },
  itemCard: {
    position: 'relative',
    border: '1px solid #e2e8f0',
    borderRadius: '12px',
    padding: '16px',
    cursor: 'pointer',
    transition: 'all 0.2s',
    backgroundColor: 'white',
  },
  itemCardSelected: {
    borderColor: PRIMARY_COLOR,
    backgroundColor: '#f8fafc',
  },
  checkboxContainer: {
    position: 'absolute',
    top: '12px',
    right: '12px',
  },
  checkbox: {
    width: '18px',
    height: '18px',
    borderRadius: '4px',
    border: '2px solid #cbd5e1',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxSelected: {
    backgroundColor: PRIMARY_COLOR,
    borderColor: PRIMARY_COLOR,
  },
  itemIcon: {
    marginBottom: '12px',
  },
  itemContent: {
    flex: 1,
  },
  itemName: {
    fontWeight: '600',
    color: PRIMARY_COLOR,
    margin: '0 0 4px 0',
    fontSize: '0.875rem',
  },
  itemSku: {
    color: '#94a3b8',
    margin: '0 0 4px 0',
    fontSize: '0.7rem',
  },
  itemDesc: {
    color: '#64748b',
    margin: '0 0 8px 0',
    fontSize: '0.7rem',
    lineHeight: 1.3,
  },
  itemPrice: {
    fontWeight: '600',
    color: PRIMARY_COLOR,
    margin: 0,
    fontSize: '0.875rem',
  },
  selectedBadge: {
    position: 'absolute',
    bottom: '12px',
    right: '12px',
    width: '24px',
    height: '24px',
    borderRadius: '50%',
    backgroundColor: PRIMARY_COLOR,
    color: 'white',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '12px',
  },
  listItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '12px 16px',
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    cursor: 'pointer',
    backgroundColor: 'white',
    marginBottom: '8px',
  },
  listItemSelected: {
    borderColor: PRIMARY_COLOR,
    backgroundColor: '#f8fafc',
  },
  listItemCheckbox: {
    flexShrink: 0,
  },
  listItemContent: {
    flex: 1,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  listItemMain: {
    flex: 1,
  },
  listItemName: {
    fontWeight: '600',
    color: PRIMARY_COLOR,
    margin: 0,
    fontSize: '0.875rem',
  },
  listItemSku: {
    color: '#94a3b8',
    fontSize: '0.7rem',
  },
  listItemPrice: {
    fontWeight: '600',
    color: PRIMARY_COLOR,
    margin: 0,
    fontSize: '0.875rem',
    flexShrink: 0,
  },
  loaderContainer: {
    display: 'flex',
    justifyContent: 'center',
    padding: '20px',
  },
  loadingSpinner: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    color: '#64748b',
    fontSize: '0.875rem',
  },
  endMessage: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    color: '#94a3b8',
    fontSize: '0.75rem',
    justifyContent: 'center',
  },
  loadingState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    gap: '16px',
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    gap: '16px',
  },
  emptySyncBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 16px',
    borderRadius: '8px',
    border: '1px solid #e2e8f0',
    background: 'white',
    cursor: 'pointer',
    color: PRIMARY_COLOR,
    fontSize: '0.875rem',
  },
  footer: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px 24px',
    borderTop: '1px solid #e2e8f0',
    backgroundColor: 'white',
    flexWrap: 'wrap',
    gap: '12px',
  },
  selectedCount: {
    color: '#64748b',
    fontSize: '0.875rem',
  },
  actions: {
    display: 'flex',
    gap: '12px',
  },
  cancelBtn: {
    padding: '8px 16px',
    borderRadius: '8px',
    border: '1px solid #e2e8f0',
    background: 'white',
    cursor: 'pointer',
    color: '#64748b',
    fontSize: '0.875rem',
    fontWeight: '500',
  },
  confirmBtn: {
    padding: '8px 16px',
    borderRadius: '8px',
    border: 'none',
    background: PRIMARY_COLOR,
    color: 'white',
    cursor: 'pointer',
    fontSize: '0.875rem',
    fontWeight: '500',
  },
  confirmBtnDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed',
  },
};

export default InfiniteItemSelector;