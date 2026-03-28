// components/InfiniteItemSelector.jsx
import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { Search, X, Package, Check, Loader2, RefreshCw } from 'lucide-react';
import { itemAPI } from '../services/api';
import { fmtCurrency } from '../utils/formatters';

const InfiniteItemSelector = ({ 
  isOpen, 
  onClose, 
  onSelect, 
  selectedItems = [],
  selectedCurrency = 'AED',
  onSyncComplete
}) => {
  // State
  const [items, setItems] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedIds, setSelectedIds] = useState(new Set(selectedItems.map(i => i.itemId)));
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [searchInputValue, setSearchInputValue] = useState('');
  
  // Refs
  const loaderRef = useRef();
  const searchTimeoutRef = useRef();
  const abortControllerRef = useRef();

  // Reset selectedIds when selectedItems prop changes
  useEffect(() => {
    setSelectedIds(new Set(selectedItems.map(i => i.itemId)));
  }, [selectedItems]);

  // Auto-load items when modal opens
  useEffect(() => {
    if (isOpen) {
      // Reset all state when modal opens
      setPage(1);
      setItems([]);
      setHasMore(true);
      setSearchTerm('');
      setSearchInputValue('');
      setTotalItems(0);
      
      // Load first page
      fetchItems(1, false, '');
    }
  }, [isOpen]);

  // Fetch items with pagination
  const fetchItems = useCallback(async (pageNum = 1, append = false, searchQuery = '', isRefresh = false) => {
    // Cancel previous request if exists
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    
    // Create new abort controller
    abortControllerRef.current = new AbortController();
    
    setLoading(true);
    
    try {
      const params = {
        page: pageNum,
        limit: 50,
        search: searchQuery,
        sortBy: 'name',
        sortOrder: 'asc'
      };
      
      // Don't force refresh unless explicitly requested
      const response = await itemAPI.getAll(params, {
        signal: abortControllerRef.current.signal
      });
      
      if (response.data.success) {
        const newItems = response.data.data || [];
        const pagination = response.data.pagination;
        
        setTotalItems(pagination.totalItems || 0);
        setHasMore(pagination.hasNextPage || false);
        
        if (append) {
          setItems(prev => [...prev, ...newItems]);
        } else {
          setItems(newItems);
        }
      }
    } catch (error) {
      if (error.name === 'AbortError') {
        // Request cancelled, ignore
        return;
      }
      console.error('Error fetching items:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  // Handle search with debounce
  const handleSearch = useCallback((value) => {
    setSearchInputValue(value);
    
    // Clear previous timeout
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    
    // Debounce search - wait 500ms after user stops typing
    searchTimeoutRef.current = setTimeout(() => {
      const trimmedValue = value.trim();
      setSearchTerm(trimmedValue);
      setPage(1);
      setItems([]);
      setHasMore(true);
      
      // Cancel any ongoing request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      
      // Fetch with new search term
      fetchItems(1, false, trimmedValue);
    }, 500);
  }, [fetchItems]);

  // Clear search
  const handleClearSearch = useCallback(() => {
    setSearchInputValue('');
    setSearchTerm('');
    setPage(1);
    setItems([]);
    setHasMore(true);
    fetchItems(1, false, '');
  }, [fetchItems]);

  // Setup intersection observer for infinite scroll
  useEffect(() => {
    if (!hasMore || loading) return;
    
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loading) {
          const nextPage = page + 1;
          setPage(nextPage);
          fetchItems(nextPage, true, searchTerm);
        }
      },
      { threshold: 0.1, rootMargin: '100px' }
    );
    
    if (loaderRef.current) {
      observer.observe(loaderRef.current);
    }
    
    return () => observer.disconnect();
  }, [hasMore, loading, page, searchTerm, fetchItems]);

  // Handle item selection
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

  // Handle confirm selection
  const handleConfirm = useCallback(() => {
    const newItems = Array.from(selectedIds).map(itemId => {
      const existingItem = selectedItems.find(i => i.itemId === itemId);
      if (existingItem) return existingItem;

      const item = items.find(i => i._id === itemId);
      return {
        id: Date.now() + Math.random(),
        itemId: itemId,
        quantity: 1,
        unitPrice: item?.price || 0
      };
    });

    onSelect(newItems);
    onClose();
  }, [selectedIds, selectedItems, items, onSelect, onClose]);

  // Handle manual sync from Zoho (refresh button)
  const handleManualSync = useCallback(async () => {
    if (isSyncing) return;
    
    setIsSyncing(true);
    
    try {
      const response = await itemAPI.syncItems();
      
      if (response.data.success) {
        // Poll for completion
        const pollInterval = setInterval(async () => {
          try {
            const statusRes = await itemAPI.getSyncStatus();
            if (!statusRes.data.status.isSyncing) {
              clearInterval(pollInterval);
              setIsSyncing(false);
              
              // Refresh items list with force refresh
              setPage(1);
              setItems([]);
              setHasMore(true);
              setSearchTerm('');
              setSearchInputValue('');
              
              // Force refresh from API
              const refreshResponse = await itemAPI.getAll({ 
                page: 1, 
                limit: 50,
                forceRefresh: 'true'
              });
              
              if (refreshResponse.data.success) {
                setItems(refreshResponse.data.data || []);
                setTotalItems(refreshResponse.data.pagination?.totalItems || 0);
                setHasMore(refreshResponse.data.pagination?.hasNextPage || false);
              }
              
              if (onSyncComplete) {
                onSyncComplete(statusRes.data.status.lastSyncResult);
              }
            }
          } catch (error) {
            clearInterval(pollInterval);
            setIsSyncing(false);
          }
        }, 2000);
        
        // Timeout after 60 seconds
        setTimeout(() => {
          clearInterval(pollInterval);
          if (isSyncing) setIsSyncing(false);
        }, 60000);
      }
    } catch (error) {
      console.error('Sync error:', error);
      setIsSyncing(false);
    }
  }, [isSyncing, onSyncComplete]);

  if (!isOpen) return null;

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={styles.header}>
          <div>
            <h2 style={styles.title}>Select Items</h2>
            <p style={styles.subtitle}>
              Search and select items to add to your quotation
            </p>
          </div>
          <button onClick={onClose} style={styles.closeBtn}>
            <X size={20} />
          </button>
        </div>

        {/* Search Bar */}
        <div style={styles.searchContainer}>
          <div style={styles.searchWrapper}>
            <Search size={16} style={styles.searchIcon} />
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
          
          <div style={styles.statsBar}>
            <span style={styles.statsText}>
              {totalItems > 0 
                ? `Showing ${items.length} of ${totalItems} items` 
                : loading ? 'Loading...' : 'No items found'}
            </span>
            <button
              onClick={handleManualSync}
              disabled={isSyncing}
              style={styles.syncBtn}
              title="Sync latest items from Zoho"
            >
              <RefreshCw size={14} style={{ animation: isSyncing ? 'spin 1s linear infinite' : 'none' }} />
              {isSyncing ? 'Syncing...' : 'Refresh'}
            </button>
          </div>
        </div>

        {/* Items Grid with Infinite Scroll */}
        <div style={styles.itemsContainer}>
          {loading && items.length === 0 ? (
            <div style={styles.loadingState}>
              <Loader2 size={40} style={{ animation: 'spin 1s linear infinite', color: '#6366f1' }} />
              <p>Loading items...</p>
            </div>
          ) : (
            <>
              <div style={styles.itemsGrid}>
                {items.map((item) => {
                  const isSelected = selectedIds.has(item._id);
                  return (
                    <div
                      key={item._id}
                      onClick={() => handleToggle(item._id)}
                      style={{
                        ...styles.itemCard,
                        ...(isSelected ? styles.itemCardSelected : {}),
                      }}
                    >
                      <div style={styles.checkboxContainer}>
                        <div
                          style={{
                            ...styles.checkbox,
                            ...(isSelected ? styles.checkboxSelected : {}),
                          }}
                        >
                          {isSelected && <Check size={14} color="white" />}
                        </div>
                      </div>

                      <div style={styles.itemContent}>
                        <h3 style={styles.itemName}>{item.name}</h3>
                        {item.sku && (
                          <p style={styles.itemSku}>SKU: {item.sku}</p>
                        )}
                        {item.description && (
                          <p style={styles.itemDesc}>
                            {item.description.substring(0, 60)}
                            {item.description.length > 60 ? '...' : ''}
                          </p>
                        )}
                        <p style={styles.itemPrice}>
                          {fmtCurrency(item.price, selectedCurrency)}
                        </p>
                      </div>

                      {isSelected && (
                        <div style={styles.selectedBadge}>✓</div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Infinite scroll loader */}
              <div ref={loaderRef} style={styles.loaderContainer}>
                {loading && items.length > 0 && (
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

              {/* Empty states */}
              {!loading && items.length === 0 && !searchTerm && (
                <div style={styles.emptyState}>
                  <Package size={48} />
                  <p>No items found in your inventory</p>
                  <button onClick={handleManualSync} style={styles.emptySyncBtn}>
                    <RefreshCw size={16} /> Sync from Zoho
                  </button>
                </div>
              )}
              
              {!loading && items.length === 0 && searchTerm && (
                <div style={styles.emptyState}>
                  <Search size={48} />
                  <p>No items match "{searchTerm}"</p>
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
              style={{
                ...styles.confirmBtn,
                ...(selectedIds.size === 0 ? styles.confirmBtnDisabled : {}),
              }}
            >
              Add Selected Items ({selectedIds.size})
            </button>
          </div>
        </div>

        <style>
          {`
            @keyframes spin {
              from { transform: rotate(0deg); }
              to { transform: rotate(360deg); }
            }
          `}
        </style>
      </div>
    </div>
  );
};

// Styles remain the same as before...
const styles = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(15, 23, 42, 0.45)',
    backdropFilter: 'blur(4px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    padding: '1rem',
  },
  modal: {
    background: 'white',
    borderRadius: '20px',
    width: '100%',
    maxWidth: '800px',
    height: '85vh',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 24px 60px rgba(0,0,0,.18)',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: '1.5rem 1.75rem',
    borderBottom: '1px solid #f1f5f9',
  },
  title: {
    margin: 0,
    fontSize: '1.25rem',
    fontWeight: '800',
    color: '#0f172a',
  },
  subtitle: {
    margin: '.25rem 0 0',
    color: '#64748b',
    fontSize: '.875rem',
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: '#94a3b8',
    padding: '0.25rem',
  },
  searchContainer: {
    padding: '1.25rem 1.75rem',
    borderBottom: '1px solid #f1f5f9',
    background: '#fafbff',
  },
  searchWrapper: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
  },
  searchIcon: {
    position: 'absolute',
    left: '0.75rem',
    color: '#94a3b8',
  },
  searchInput: {
    width: '100%',
    padding: '0.65rem 1rem 0.65rem 2.6rem',
    border: '1.5px solid #e2e8f0',
    borderRadius: '12px',
    fontSize: '0.875rem',
    fontFamily: 'inherit',
    outline: 'none',
    transition: 'all 0.2s',
  },
  clearBtn: {
    position: 'absolute',
    right: '0.75rem',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: '#94a3b8',
    padding: '0.25rem',
  },
  statsBar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: '0.75rem',
    fontSize: '0.75rem',
  },
  statsText: {
    color: '#64748b',
  },
  syncBtn: {
    background: '#f1f5f9',
    border: '1px solid #e2e8f0',
    borderRadius: '6px',
    padding: '4px 8px',
    fontSize: '0.7rem',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    color: '#475569',
  },
  itemsContainer: {
    flex: 1,
    overflowY: 'auto',
    padding: '1.25rem 1.75rem',
  },
  itemsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
    gap: '1rem',
  },
  itemCard: {
    position: 'relative',
    background: 'white',
    border: '1.5px solid #e2e8f0',
    borderRadius: '12px',
    padding: '1rem',
    cursor: 'pointer',
    transition: 'all 0.2s',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
  },
  itemCardSelected: {
    background: '#eff1ff',
    borderColor: '#c7d2fe',
    boxShadow: '0 4px 12px rgba(99, 102, 241, 0.15)',
  },
  checkboxContainer: {
    display: 'flex',
    justifyContent: 'flex-start',
  },
  checkbox: {
    width: '20px',
    height: '20px',
    border: '2px solid #e2e8f0',
    borderRadius: '6px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.2s',
  },
  checkboxSelected: {
    background: '#6366f1',
    borderColor: '#6366f1',
  },
  itemContent: {
    flex: 1,
  },
  itemName: {
    margin: 0,
    fontWeight: '700',
    color: '#0f172a',
    fontSize: '0.9rem',
  },
  itemSku: {
    margin: '0.25rem 0',
    color: '#94a3b8',
    fontSize: '0.75rem',
  },
  itemDesc: {
    margin: '0.25rem 0 0',
    color: '#64748b',
    fontSize: '0.8rem',
  },
  itemPrice: {
    margin: '0.5rem 0 0',
    color: '#059669',
    fontWeight: '700',
    fontSize: '0.875rem',
  },
  selectedBadge: {
    position: 'absolute',
    top: '0.5rem',
    right: '0.5rem',
    width: '24px',
    height: '24px',
    background: '#6366f1',
    color: 'white',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '0.75rem',
    fontWeight: '700',
  },
  loaderContainer: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    padding: '1rem',
  },
  loadingSpinner: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    color: '#64748b',
    fontSize: '0.875rem',
  },
  loadingState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '1rem',
    padding: '3rem',
    color: '#64748b',
  },
  endMessage: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    color: '#94a3b8',
    fontSize: '0.875rem',
  },
  emptyState: {
    textAlign: 'center',
    padding: '3rem',
    color: '#94a3b8',
  },
  emptySyncBtn: {
    marginTop: '1rem',
    padding: '0.5rem 1rem',
    background: '#6366f1',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
  },
  footer: {
    padding: '1.25rem 1.75rem',
    borderTop: '1px solid #f1f5f9',
    background: '#fafbff',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  selectedCount: {
    color: '#64748b',
    fontSize: '0.875rem',
    fontWeight: '500',
  },
  actions: {
    display: 'flex',
    gap: '0.75rem',
  },
  cancelBtn: {
    background: 'white',
    color: '#475569',
    border: '1.5px solid #e2e8f0',
    borderRadius: '10px',
    padding: '0.65rem 1.25rem',
    fontSize: '0.875rem',
    fontWeight: '600',
    cursor: 'pointer',
  },
  confirmBtn: {
    background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
    color: 'white',
    border: 'none',
    borderRadius: '10px',
    padding: '0.65rem 1.25rem',
    fontSize: '0.875rem',
    fontWeight: '600',
    cursor: 'pointer',
    boxShadow: '0 4px 12px rgba(99, 102, 241, 0.35)',
  },
  confirmBtnDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed',
  },
};

export default InfiniteItemSelector;