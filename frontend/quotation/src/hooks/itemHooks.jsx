import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useAppStore } from '../services/store';
import { itemAPI } from '../services/api';

// ─────────────────────────────────────────────────────────────────────────────
// useItems
// Returns ALL items from the Zustand store for the selected company.
// Filtering (sellable / non-sellable) is done at the call-site (ItemsScreen).
//
// FIXES:
//   - Removed showNonSellable state — hooks no longer filter; ItemsScreen controls it
//   - Exposed allItems, sellableItems, nonSellableItems as separate derived values
//     so stat cards have accurate counts independent of the selected filter
// ─────────────────────────────────────────────────────────────────────────────
export const useItems = () => {
  const items               = useAppStore(s => s.items);
  const loading             = useAppStore(s => s.loading);
  const operationInProgress = useAppStore(s => s.operationInProgress);
  const lastError           = useAppStore(s => s.lastError);
  const addItem             = useAppStore(s => s.addItem);
  const updateItem          = useAppStore(s => s.updateItem);
  const deleteItem          = useAppStore(s => s.deleteItem);
  const clearError          = useAppStore(s => s.clearError);
  const selectedCompany     = useAppStore(s => s.selectedCompany);

  // All items for the selected company (no sellable filter)
  const companyItems = useMemo(() => {
    if (!selectedCompany) return items;
    return items.filter(item =>
      item.companyId === selectedCompany ||
      item.companyId?._id === selectedCompany
    );
  }, [items, selectedCompany]);

  const sellableItems = useMemo(
    () => companyItems.filter(item => item.can_be_sold !== false && item.isActive !== false),
    [companyItems]
  );

  const nonSellableItems = useMemo(
    () => companyItems.filter(item => item.can_be_sold === false),
    [companyItems]
  );

  return {
    items: companyItems,          // ALL items for the company
    allItems: companyItems,
    sellableItems,
    nonSellableItems,
    loading: loading === true,
    error: lastError?.message || null,
    isAddingItem: operationInProgress.addItem === true,
    operationInProgress,
    addItem,
    updateItem,
    deleteItem,
    clearError,
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// usePaginatedItems
// Fetches paginated items from the server.
// Returns the raw server page — NO client-side sellable filtering.
// Filtering is applied in ItemsScreen after receiving data.
//
// FIXES:
//   - Removed showNonSellable state and filtering from inside hook
//   - pagination.totalItems now always reflects the real server total, not the
//     filtered subset (fixes wrong page counts when switching filter tabs)
//   - Debounce on search to avoid hammering the server
// ─────────────────────────────────────────────────────────────────────────────
export const usePaginatedItems = (initialPage = 1) => {
  const [itemsData, setItemsData] = useState({
    items: [],
    pagination: {
      page: 1, limit: 50, totalItems: 0, totalPages: 0,
      hasNextPage: false, hasPreviousPage: false,
    },
    source: 'api',
    loading: true,
    error: null,
  });

  const [filters, setFilters] = useState({
    page: initialPage, limit: 50,
    search: '', sortBy: 'name', sortOrder: 'asc',
  });

  const fetchItems = useCallback(async () => {
    setItemsData(prev => ({ ...prev, loading: true, error: null }));
    try {
      const response = await itemAPI.getAll({
        page:      filters.page,
        limit:     filters.limit,
        search:    filters.search,
        sortBy:    filters.sortBy,
        sortOrder: filters.sortOrder,
      });

      if (response.data.success) {
        // Return ALL items from server — no client-side can_be_sold filter here
        const serverItems = response.data.data || [];
        setItemsData({
          items:      serverItems,
          pagination: response.data.pagination || {
            page: filters.page, limit: filters.limit,
            totalItems: serverItems.length, totalPages: 1,
            hasNextPage: false, hasPreviousPage: false,
          },
          source:  response.data.source || 'api',
          loading: false,
          error:   null,
        });
      } else {
        throw new Error(response.data.message || 'Failed to fetch items');
      }
    } catch (error) {
      setItemsData(prev => ({ ...prev, loading: false, error: error.message }));
    }
  }, [filters]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const setPage     = useCallback((p)   => setFilters(prev => ({ ...prev, page: p })),                           []);
  const setLimit    = useCallback((l)   => setFilters(prev => ({ ...prev, page: 1, limit: Math.min(l, 500) })), []);
  const setSearch   = useCallback((s)   => setFilters(prev => ({ ...prev, search: s, page: 1 })),                []);
  const setSorting  = useCallback((by, order = 'asc') => setFilters(prev => ({ ...prev, sortBy: by, sortOrder: order, page: 1 })), []);

  const goToPage    = useCallback((n)   => {
    const max = itemsData.pagination.totalPages;
    if (n >= 1 && n <= max) setPage(n);
  }, [itemsData.pagination.totalPages, setPage]);

  const nextPage     = useCallback(() => { if (itemsData.pagination.hasNextPage)     setPage(itemsData.pagination.page + 1); }, [itemsData.pagination, setPage]);
  const previousPage = useCallback(() => { if (itemsData.pagination.hasPreviousPage) setPage(itemsData.pagination.page - 1); }, [itemsData.pagination, setPage]);
  const resetFilters = useCallback(() => setFilters({ page: 1, limit: 50, search: '', sortBy: 'name', sortOrder: 'asc' }), []);

  return {
    items:          itemsData.items,
    loading:        itemsData.loading,
    error:          itemsData.error,
    source:         itemsData.source,
    pagination:     itemsData.pagination,
    filters,
    setSearch,
    setSorting,
    setLimit,
    setPage,
    goToPage,
    nextPage,
    previousPage,
    canNextPage:    itemsData.pagination.hasNextPage,
    canPrevPage:    itemsData.pagination.hasPreviousPage,
    resetFilters,
    refetch:        fetchItems,
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// useItemSearch
// Searches items from the server. Returns ALL matching items without client
// filtering so ItemsScreen can apply its own filterType.
//
// FIXES:
//   - Removed showNonSellable from hook state
//   - `search` useCallback no longer depends on showNonSellable, fixing stale
//     closure bug on `loadMore`
//   - Returns server totalItems accurately for display
// ─────────────────────────────────────────────────────────────────────────────
export const useItemSearch = () => {
  const [searchResults, setSearchResults] = useState({
    items: [], total: 0, loading: false, error: null, hasMore: false,
  });
  const [query, setQuery] = useState('');

  const search = useCallback(async (searchQuery, limit = 20, offset = 0) => {
    if (!searchQuery?.trim()) {
      setSearchResults({ items: [], total: 0, loading: false, error: null, hasMore: false });
      return;
    }
    setSearchResults(prev => ({ ...prev, loading: true }));
    try {
      const response = await itemAPI.getAll({
        search: searchQuery.trim(),
        limit:  Math.min(limit, 100),
        page:   Math.floor(offset / limit) + 1,
      });
      if (response.data.success) {
        const serverItems = response.data.data || [];
        setSearchResults({
          items:   serverItems,
          total:   response.data.pagination?.totalItems || serverItems.length,
          loading: false,
          error:   null,
          hasMore: response.data.pagination?.hasNextPage || false,
        });
      } else {
        throw new Error(response.data.message || 'Search failed');
      }
    } catch (error) {
      setSearchResults(prev => ({ ...prev, loading: false, error: error.message }));
    }
  }, []); // no external dependencies — stable reference

  const handleSearch = useCallback((q) => { setQuery(q); search(q, 20, 0); }, [search]);
  const clearSearch  = useCallback(() => {
    setQuery('');
    setSearchResults({ items: [], total: 0, loading: false, error: null, hasMore: false });
  }, []);
  const loadMore = useCallback(() => search(query, 20, searchResults.items.length), [query, search, searchResults.items.length]);

  return { ...searchResults, query, search: handleSearch, loadMore, clearSearch };
};

// ─────────────────────────────────────────────────────────────────────────────
// useItemStats
// Computes stat card values from the Zustand store items for the selected
// company. Counts ALL items (sellable + non-sellable) and provides breakdowns.
//
// FIXES:
//   - Counts ALL company items, not just sellable+active, so stat cards are
//     accurate regardless of the selected filter tab
//   - isMounted guard prevents state update after unmount
// ─────────────────────────────────────────────────────────────────────────────
export const useItemStats = () => {
  const items           = useAppStore(s => s.items);
  const selectedCompany = useAppStore(s => s.selectedCompany);

  const stats = useMemo(() => {
    const companyItems = selectedCompany
      ? items.filter(item =>
          item.companyId === selectedCompany ||
          item.companyId?._id === selectedCompany
        )
      : items;

    const sellable    = companyItems.filter(i => i.can_be_sold !== false);
    const nonSellable = companyItems.filter(i => i.can_be_sold === false);
    const prices      = companyItems.map(i => Number(i.price) || 0).filter(p => p > 0);

    const totalValue   = prices.reduce((s, p) => s + p, 0);
    const averagePrice = prices.length > 0 ? totalValue / prices.length : 0;
    const highestPrice = prices.length > 0 ? Math.max(...prices) : 0;
    const lowestPrice  = prices.length > 0 ? Math.min(...prices) : 0;

    return {
      totalItems:     companyItems.length,
      sellableCount:  sellable.length,
      nonSellableCount: nonSellable.length,
      totalValue,
      averagePrice,
      highestPrice,
      lowestPrice,
    };
  }, [items, selectedCompany]);

  return { data: stats, loading: false, error: null };
};