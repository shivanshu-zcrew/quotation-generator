// screens/ItemsScreen.jsx
import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { Plus, Edit2, Trash2, ArrowLeft, Search, RefreshCw, ChevronLeft, ChevronRight, Package, AlertCircle, CheckCircle, Loader2 } from 'lucide-react';
import { usePaginatedItems, useItemSearch, useItemStats } from '../hooks/itemHooks';
import { itemAPI } from '../services/api';

// ─────────────────────────────────────────────────────────────
// Toast Notification Component
// ─────────────────────────────────────────────────────────────
const Toast = ({ message, type = 'success', onClose }) => {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div style={{
      position: 'fixed',
      bottom: '24px',
      right: '24px',
      background: type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#3b82f6',
      color: 'white',
      padding: '12px 20px',
      borderRadius: '12px',
      boxShadow: '0 10px 25px rgba(0,0,0,0.1)',
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      zIndex: 1000,
      animation: 'slideIn 0.3s ease'
    }}>
      {type === 'success' ? <CheckCircle size={20} /> : <AlertCircle size={20} />}
      <span style={{ fontWeight: '500' }}>{message}</span>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// Pagination Controls Component
// ─────────────────────────────────────────────────────────────
const PaginationControls = ({ pagination, onPageChange, loading }) => {
  if (!pagination || pagination.totalPages <= 1) return null;

  const { page, totalPages, hasNextPage, hasPreviousPage } = pagination;

  const maxButtons = 5;
  const halfWindow = Math.floor(maxButtons / 2);
  let startPage = Math.max(1, page - halfWindow);
  let endPage = Math.min(totalPages, startPage + maxButtons - 1);

  if (endPage - startPage < maxButtons - 1) {
    startPage = Math.max(1, endPage - maxButtons + 1);
  }

  const pageButtons = [];

  // Previous button
  pageButtons.push(
    <button
      key="prev"
      onClick={() => onPageChange(page - 1)}
      disabled={!hasPreviousPage || loading}
      style={{
        padding: '0.5rem 0.75rem',
        border: '1px solid #e2e8f0',
        background: 'white',
        borderRadius: '8px',
        cursor: loading || !hasPreviousPage ? 'not-allowed' : 'pointer',
        display: 'flex',
        alignItems: 'center',
        opacity: loading || !hasPreviousPage ? 0.5 : 1,
        transition: 'all 0.2s',
      }}
    >
      <ChevronLeft size={16} />
    </button>
  );

  // Page numbers
  if (startPage > 1) {
    pageButtons.push(
      <button
        key="page-1"
        onClick={() => onPageChange(1)}
        disabled={loading}
        style={{
          padding: '0.5rem 0.75rem',
          border: '1px solid #e2e8f0',
          background: 'white',
          borderRadius: '8px',
          fontSize: '0.875rem',
          fontWeight: '500',
          cursor: loading ? 'not-allowed' : 'pointer',
        }}
      >
        1
      </button>
    );

    if (startPage > 2) {
      pageButtons.push(
        <span key="dots-start" style={{ color: '#94a3b8', padding: '0.5rem 0.25rem' }}>
          ...
        </span>
      );
    }
  }

  for (let i = startPage; i <= endPage; i++) {
    pageButtons.push(
      <button
        key={`page-${i}`}
        onClick={() => onPageChange(i)}
        disabled={loading}
        style={{
          padding: '0.5rem 0.75rem',
          border: i === page ? '1px solid #6366f1' : '1px solid #e2e8f0',
          background: i === page ? '#6366f1' : 'white',
          color: i === page ? 'white' : '#0f172a',
          borderRadius: '8px',
          fontSize: '0.875rem',
          fontWeight: '600',
          cursor: loading ? 'not-allowed' : 'pointer',
          opacity: loading ? 0.5 : 1,
        }}
      >
        {i}
      </button>
    );
  }

  if (endPage < totalPages) {
    if (endPage < totalPages - 1) {
      pageButtons.push(
        <span key="dots-end" style={{ color: '#94a3b8', padding: '0.5rem 0.25rem' }}>
          ...
        </span>
      );
    }

    pageButtons.push(
      <button
        key={`page-${totalPages}`}
        onClick={() => onPageChange(totalPages)}
        disabled={loading}
        style={{
          padding: '0.5rem 0.75rem',
          border: '1px solid #e2e8f0',
          background: 'white',
          borderRadius: '8px',
          fontSize: '0.875rem',
          fontWeight: '500',
          cursor: loading ? 'not-allowed' : 'pointer',
        }}
      >
        {totalPages}
      </button>
    );
  }

  // Next button
  pageButtons.push(
    <button
      key="next"
      onClick={() => onPageChange(page + 1)}
      disabled={!hasNextPage || loading}
      style={{
        padding: '0.5rem 0.75rem',
        border: '1px solid #e2e8f0',
        background: 'white',
        borderRadius: '8px',
        cursor: loading || !hasNextPage ? 'not-allowed' : 'pointer',
        display: 'flex',
        alignItems: 'center',
        opacity: loading || !hasNextPage ? 0.5 : 1,
      }}
    >
      <ChevronRight size={16} />
    </button>
  );

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      gap: '0.5rem',
      flexWrap: 'wrap',
      padding: '1rem',
    }}>
      {pageButtons}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// Item Card Component
// ─────────────────────────────────────────────────────────────
const ItemCard = ({ item, onEdit, onDelete, isDeleting }) => {
  return (
    <div
      style={{
        border: '1.5px solid #f1f5f9',
        borderRadius: '12px',
        overflow: 'hidden',
        transition: 'all 0.2s',
        cursor: 'pointer',
        background: 'white',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)';
        e.currentTarget.style.transform = 'translateY(-2px)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = 'none';
        e.currentTarget.style.transform = 'translateY(0)';
      }}
    >
      {/* Image Container */}
      <div style={{ background: '#f8fafc', padding: '1rem', height: '150px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {item?.imagePath ? (
          <img
            src={item.imagePath.startsWith('http') ? item.imagePath : `http://13.232.90.158:5000${item.imagePath}`}
            alt={item?.name || 'Item'}
            style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'cover' }}
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
        ) : (
          <Package size={32} style={{ color: '#cbd5e1' }} />
        )}
      </div>

      {/* Content */}
      <div style={{ padding: '1rem' }}>
        <h3 style={{ margin: 0, fontSize: '.9rem', fontWeight: '700', color: '#0f172a' }}>
          {item?.name || 'Unnamed Item'}
        </h3>
        <p style={{ margin: '0.25rem 0', color: '#64748b', fontSize: '.8rem' }}>
          {item?.sku ? `SKU: ${item.sku}` : 'No SKU'}
        </p>
        <p style={{ margin: '0.5rem 0 0', fontSize: '.9rem', fontWeight: '700', color: '#059669' }}>
          AED {item?.price ? parseFloat(item.price).toFixed(2) : '0.00'}
        </p>
        <p style={{ margin: '0.5rem 0 0', color: '#94a3b8', fontSize: '.75rem' }}>
          Status: <span style={{ color: item?.status === 'active' ? '#059669' : '#dc2626' }}>
            {item?.status || 'active'}
          </span>
        </p>

        {/* Actions */}
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
          <button
            onClick={() => onEdit(item)}
            disabled={isDeleting}
            style={{
              flex: 1,
              padding: '0.5rem',
              background: '#eff1ff',
              color: '#6366f1',
              border: 'none',
              borderRadius: '8px',
              fontSize: '.75rem',
              fontWeight: '600',
              cursor: isDeleting ? 'not-allowed' : 'pointer',
              opacity: isDeleting ? 0.5 : 1,
            }}
          >
            <Edit2 size={14} style={{ display: 'inline', marginRight: '0.25rem' }} /> Edit
          </button>
          <button
            onClick={() => onDelete(item)}
            disabled={isDeleting}
            style={{
              flex: 1,
              padding: '0.5rem',
              background: '#fff1f1',
              color: '#dc2626',
              border: 'none',
              borderRadius: '8px',
              fontSize: '.75rem',
              fontWeight: '600',
              cursor: isDeleting ? 'not-allowed' : 'pointer',
              opacity: isDeleting ? 0.5 : 1,
            }}
          >
            {isDeleting ? '...' : <Trash2 size={14} style={{ display: 'inline', marginRight: '0.25rem' }} />} Delete
          </button>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// Main Items Screen Component
// ─────────────────────────────────────────────────────────────
export default function ItemsScreen({ onBack }) {
  // Hooks
  const pagination = usePaginatedItems(1);
  const search = useItemSearch();
  const stats = useItemStats();

  // Local state
  const [mode, setMode] = useState('browse');
  const [toast, setToast] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [isSyncing, setIsSyncing] = useState(false);

  // Computed state
  const currentItems = mode === 'search' ? search.items : pagination.items;
  const currentLoading = mode === 'search' ? search.loading : pagination.loading;
  const currentError = mode === 'search' ? search.error : pagination.error;
  const currentPagination = mode === 'browse' ? pagination.pagination : null;

  // Ensure pagination object exists
  const safePageInfo = useMemo(() => {
    if (!currentPagination) return { page: 1, totalPages: 1, totalItems: 0 };
    return {
      page: currentPagination.page || 1,
      totalPages: currentPagination.totalPages || 1,
      totalItems: currentPagination.totalItems || 0,
      hasNextPage: currentPagination.hasNextPage || false,
      hasPreviousPage: currentPagination.hasPreviousPage || false,
    };
  }, [currentPagination]);

  // Handle sync from Zoho (same logic as InfiniteItemSelector)
  const handleSync = useCallback(async () => {
    if (isSyncing) {
      setToast({ message: 'Sync already in progress...', type: 'info' });
      setTimeout(() => setToast(null), 3000);
      return;
    }

    setIsSyncing(true);
    setToast({ message: 'Syncing items from Zoho...', type: 'info' });

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
              
              const result = statusRes.data.status.lastSyncResult;
              
              if (result?.success) {
                setToast({
                  message: `✅ Sync complete! ${result.created || 0} new, ${result.updated || 0} updated`,
                  type: 'success'
                });
                
                // Refresh the items list
                setTimeout(() => {
                  if (mode === 'browse') {
                    pagination.refetch();
                  } else if (search.query) {
                    search.search(search.query);
                  }
                  // Refresh stats
                  stats.refetch();
                }, 500);
              } else {
                setToast({
                  message: `❌ Sync failed: ${result?.error || 'Unknown error'}`,
                  type: 'error'
                });
              }
            }
          } catch (error) {
            clearInterval(pollInterval);
            setIsSyncing(false);
            setToast({
              message: `❌ Sync failed: ${error.message}`,
              type: 'error'
            });
          }
        }, 2000);
        
        // Timeout after 60 seconds
        setTimeout(() => {
          clearInterval(pollInterval);
          if (isSyncing) {
            setIsSyncing(false);
            setToast({
              message: '❌ Sync timeout after 60 seconds',
              type: 'error'
            });
          }
        }, 60000);
      } else {
        setIsSyncing(false);
        setToast({
          message: `❌ Sync failed: ${response.data.message || 'Unknown error'}`,
          type: 'error'
        });
      }
    } catch (error) {
      console.error('Sync error:', error);
      setIsSyncing(false);
      setToast({
        message: `❌ Sync failed: ${error.message}`,
        type: 'error'
      });
    }
    
    // Auto-hide toast after 3 seconds
    setTimeout(() => setToast(null), 3000);
  }, [isSyncing, pagination, search, mode, stats]);

  // Handle search
  const handleSearch = useCallback((value) => {
    if (!value || value.trim().length === 0) {
      search.clearSearch();
      setMode('browse');
    } else {
      search.search(value);
      setMode('search');
    }
  }, [search]);

  // Handle pagination
  const handlePageChange = useCallback((newPage) => {
    if (newPage >= 1 && newPage <= safePageInfo.totalPages) {
      pagination.setPage(newPage);
    }
  }, [pagination, safePageInfo.totalPages]);

  // Handle sort change
  const handleSortChange = useCallback((field) => {
    const newOrder = pagination.filters.sortOrder === 'asc' ? 'desc' : 'asc';
    pagination.setSorting(field, newOrder);
  }, [pagination]);

  // Handle limit change
  const handleLimitChange = useCallback((newLimit) => {
    pagination.setLimit(parseInt(newLimit, 10));
  }, [pagination]);

  // Add animations
  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
      @keyframes spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }
    `;
    document.head.appendChild(style);
    return () => document.head.removeChild(style);
  }, []);

  return (
    <div style={{ minHeight: '100vh', background: '#f0f4ff', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '2rem 1.5rem' }}>

        {/* Header with Sync Button */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.9rem', fontWeight: '800', color: '#0f172a' }}>Items</h1>
            <p style={{ margin: '0.5rem 0 0', color: '#94a3b8', fontSize: '.875rem' }}>
              Zoho Books Inventory (Read-Only)
            </p>
          </div>
          <div style={{ display: 'flex', gap: '.75rem' }}>
            {/* Sync Button with loading state */}
            <button
              onClick={handleSync}
              disabled={isSyncing}
              style={{
                background: isSyncing ? '#9ca3af' : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                border: 'none',
                borderRadius: '12px',
                padding: '.7rem 1.4rem',
                cursor: isSyncing ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '.5rem',
                opacity: isSyncing ? 0.6 : 1,
                transition: 'all 0.2s',
                color: 'white',
                fontWeight: '600',
                boxShadow: isSyncing ? 'none' : '0 4px 12px rgba(99,102,241,0.35)',
              }}
            >
              {isSyncing ? (
                <Loader2 size={17} style={{ animation: 'spin 1s linear infinite' }} />
              ) : (
                <RefreshCw size={17} />
              )}
              {isSyncing ? 'Syncing...' : 'Sync from Zoho'}
            </button>

     

            {/* Back Button */}
            <button
              onClick={onBack}
              style={{
                background: 'white',
                border: '1px solid #e2e8f0',
                borderRadius: '12px',
                padding: '.7rem 1.4rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '.5rem',
                transition: 'all 0.2s',
              }}
            >
              <ArrowLeft size={17} /> Back
            </button>
          </div>
        </div>

        {/* Stats Cards */}
        {!stats.loading && stats.data && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '1.75rem' }}>
            {[
              { label: 'Total Items', value: stats.data.totalItems || 0 },
              { label: 'Avg. Price', value: `AED ${(stats.data.averagePrice || 0).toFixed(2)}` },
              { label: 'Highest Price', value: `AED ${(stats.data.highestPrice || 0).toFixed(2)}` },
            ].map(({ label, value }) => (
              <div
                key={label}
                style={{
                  background: 'white',
                  borderRadius: '12px',
                  padding: '1.5rem',
                  boxShadow: '0 1px 3px rgba(0,0,0,.06)',
                }}
              >
                <p style={{ margin: 0, color: '#94a3b8', fontSize: '.75rem', fontWeight: '600', marginBottom: '.5rem' }}>
                  {label}
                </p>
                <p style={{ margin: 0, color: '#0f172a', fontSize: '1.5rem', fontWeight: '800' }}>{value}</p>
              </div>
            ))}
          </div>
        )}

        {/* Search & Controls */}
        <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
            <Search size={15} style={{ position: 'absolute', left: '.9rem', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
            <input
              type="text"
              placeholder="Search items by name, SKU..."
              onChange={(e) => handleSearch(e.target.value)}
              style={{
                background: 'white',
                border: '1.5px solid #e2e8f0',
                borderRadius: '12px',
                padding: '.65rem 1rem .65rem 2.6rem',
                fontSize: '.875rem',
                fontFamily: 'inherit',
                outline: 'none',
                width: '100%',
                transition: 'all 0.2s',
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = '#6366f1';
                e.currentTarget.style.boxShadow = '0 0 0 3px rgba(99,102,241,.12)';
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = '#e2e8f0';
                e.currentTarget.style.boxShadow = 'none';
              }}
            />
          </div>

          {mode === 'browse' && (
            <>
              <select
                value={pagination.filters.sortBy}
                onChange={(e) => handleSortChange(e.target.value)}
                style={{
                  background: 'white',
                  border: '1.5px solid #e2e8f0',
                  borderRadius: '12px',
                  padding: '.65rem 1rem',
                  fontSize: '.875rem',
                  fontFamily: 'inherit',
                  cursor: 'pointer',
                  minWidth: '150px',
                  outline: 'none',
                }}
              >
                <option value="name">Sort: Name</option>
                <option value="price">Sort: Price</option>
                <option value="sku">Sort: SKU</option>
                <option value="status">Sort: Status</option>
              </select>

              <select
                value={pagination.filters.limit}
                onChange={(e) => handleLimitChange(e.target.value)}
                style={{
                  background: 'white',
                  border: '1.5px solid #e2e8f0',
                  borderRadius: '12px',
                  padding: '.65rem 1rem',
                  fontSize: '.875rem',
                  fontFamily: 'inherit',
                  cursor: 'pointer',
                  minWidth: '100px',
                  outline: 'none',
                }}
              >
                <option value="10">10/page</option>
                <option value="25">25/page</option>
                <option value="50">50/page</option>
                <option value="100">100/page</option>
              </select>
            </>
          )}
        </div>

        {/* Items Display */}
        {currentLoading ? (
          <div style={{ textAlign: 'center', padding: '4rem' }}>
            <Loader2 size={32} style={{ color: '#cbd5e1', margin: '0 auto 1rem', animation: 'spin 1s linear infinite' }} />
            <p style={{ color: '#475569', margin: 0 }}>Loading items...</p>
          </div>
        ) : currentError ? (
          <div style={{ background: 'white', borderRadius: '12px', padding: '2rem', textAlign: 'center' }}>
            <AlertCircle size={32} style={{ color: '#dc2626', margin: '0 auto 1rem' }} />
            <p style={{ color: '#dc2626', margin: 0, fontWeight: '600' }}>Error: {currentError}</p>
            <p style={{ color: '#94a3b8', margin: '.5rem 0 0', fontSize: '.875rem' }}>Please try refreshing the page.</p>
          </div>
        ) : !currentItems || currentItems.length === 0 ? (
          <div style={{ background: 'white', borderRadius: '12px', padding: '4rem', textAlign: 'center' }}>
            <Package size={48} style={{ color: '#cbd5e1', margin: '0 auto 1rem' }} />
            <p style={{ color: '#475569', margin: 0, fontWeight: '600' }}>
              {search.query ? `No items match "${search.query}"` : 'No items found'}
            </p>
            <button
              onClick={handleSync}
              disabled={isSyncing}
              style={{
                marginTop: '1rem',
                padding: '0.5rem 1rem',
                background: '#6366f1',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '0.875rem',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              {isSyncing ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <RefreshCw size={16} />}
              {isSyncing ? 'Syncing...' : 'Sync from Zoho'}
            </button>
          </div>
        ) : (
          <>
            {/* Items Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1.25rem', marginBottom: '2rem' }}>
              {currentItems.map((item) => (
                <ItemCard
                  key={item._id}
                  item={item}
                  onEdit={() => console.log('Edit:', item._id)}
                  onDelete={() => console.log('Delete:', item._id)}
                  isDeleting={deletingId === item._id}
                />
              ))}
            </div>

            {/* Info & Pagination */}
            <div style={{ background: 'white', borderRadius: '12px', padding: '1.5rem', boxShadow: '0 1px 3px rgba(0,0,0,.06)' }}>
              <p style={{ margin: '0 0 1rem', color: '#0f172a', fontWeight: '600' }}>
                Page {safePageInfo.page} of {safePageInfo.totalPages} | Total: {safePageInfo.totalItems}
              </p>

              {mode === 'browse' && safePageInfo.totalPages > 1 && (
                <PaginationControls
                  pagination={safePageInfo}
                  onPageChange={handlePageChange}
                  loading={currentLoading}
                />
              )}
            </div>
          </>
        )}
      </div>

      {/* Toast */}
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}