import React, { useCallback, useMemo } from 'react';
import { useAppStore } from '../services/store';
import { itemAPI } from '../services/api';  // ✅ ADD THIS IMPORT

/**
 * Enhanced hook for items management with pagination, search, and sorting
 * @returns {Object} Items state and actions
 */
export const useItems = () => {
  const appStore = useAppStore();

  // State selectors
  const items = appStore((state) => state.items);
  const loading = appStore((state) => state.loading);
  const operationInProgress = appStore((state) => state.operationInProgress);
  const lastError = appStore((state) => state.lastError);

  // Actions
  const addItem = appStore((state) => state.addItem);
  const updateItem = appStore((state) => state.updateItem);
  const deleteItem = appStore((state) => state.deleteItem);

  // Computed state
  const isAddingItem = operationInProgress.addItem === true;
  const isLoading = loading === true;

  // Error handling
  const error = lastError?.message || null;

  return {
    items,
    loading: isLoading,
    error,
    isAddingItem,
    operationInProgress,
    addItem,
    updateItem,
    deleteItem,
    clearError: appStore((state) => state.clearError),
  };
};

/**
 * Enhanced hook for paginated items with API integration
 */
export const usePaginatedItems = (initialPage = 1) => {
  const [itemsData, setItemsData] = React.useState({
    items: [],
    pagination: {
      page: 1,
      limit: 50,
      totalItems: 0,
      totalPages: 0,
      hasNextPage: false,
      hasPreviousPage: false,
    },
    source: 'api',
    loading: true,
    error: null,
  });

  const [filters, setFilters] = React.useState({
    page: initialPage,
    limit: 50,
    search: '',
    sortBy: 'name',
    sortOrder: 'asc',
  });

  /**
   * Fetch items with current filters
   */
  const fetchItems = useCallback(async () => {
    setItemsData((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const params = {
        page: filters.page,
        limit: filters.limit,
        search: filters.search,
        sortBy: filters.sortBy,
        sortOrder: filters.sortOrder,
      };

      // ✅ Use itemAPI from api.js (uses Axios with proper baseURL)
      const response = await itemAPI.getAll(params);

      if (response.data.success) {
        setItemsData({
          items: response.data.data || [],
          pagination: response.data.pagination || {},
          source: response.data.source || 'api',
          loading: false,
          error: null,
        });
      } else {
        throw new Error(response.data.message || 'Failed to fetch items');
      }
    } catch (error) {
      console.error('❌ Error fetching items:', error);
      setItemsData((prev) => ({
        ...prev,
        loading: false,
        error: error.message,
      }));
    }
  }, [filters]);

  // Auto-fetch when filters change
  React.useEffect(() => {
    fetchItems();
  }, [filters, fetchItems]);

  /**
   * Update pagination
   */
  const setPage = useCallback((newPage) => {
    setFilters((prev) => ({ ...prev, page: newPage }));
  }, []);

  const setLimit = useCallback((newLimit) => {
    setFilters((prev) => ({ ...prev, page: 1, limit: Math.min(newLimit, 500) }));
  }, []);

  /**
   * Update search
   */
  const setSearch = useCallback((searchTerm) => {
    setFilters((prev) => ({ ...prev, search: searchTerm, page: 1 }));
  }, []);

  /**
   * Update sorting
   */
  const setSorting = useCallback((sortBy, sortOrder = 'asc') => {
    setFilters((prev) => ({ ...prev, sortBy, sortOrder, page: 1 }));
  }, []);

  /**
   * Navigate to specific page
   */
  const goToPage = useCallback((pageNum) => {
    const { totalPages } = itemsData.pagination;
    if (pageNum >= 1 && pageNum <= totalPages) {
      setPage(pageNum);
    }
  }, [itemsData.pagination, setPage]);

  /**
   * Go to next page
   */
  const nextPage = useCallback(() => {
    if (itemsData.pagination.hasNextPage) {
      setPage(itemsData.pagination.page + 1);
    }
  }, [itemsData.pagination, setPage]);

  /**
   * Go to previous page
   */
  const previousPage = useCallback(() => {
    if (itemsData.pagination.hasPreviousPage) {
      setPage(itemsData.pagination.page - 1);
    }
  }, [itemsData.pagination, setPage]);

  /**
   * Reset filters
   */
  const resetFilters = useCallback(() => {
    setFilters({
      page: 1,
      limit: 50,
      search: '',
      sortBy: 'name',
      sortOrder: 'asc',
    });
  }, []);

  return {
    // State
    items: itemsData.items,
    loading: itemsData.loading,
    error: itemsData.error,
    source: itemsData.source,
    pagination: itemsData.pagination,

    // Filters
    filters,
    setSearch,
    setSorting,
    setLimit,

    // Navigation
    setPage,
    goToPage,
    nextPage,
    previousPage,
    canNextPage: itemsData.pagination.hasNextPage,
    canPrevPage: itemsData.pagination.hasPreviousPage,

    // Management
    resetFilters,
    refetch: fetchItems,
  };
};

/**
 * Enhanced hook for item search
 */
export const useItemSearch = () => {
  const [searchResults, setSearchResults] = React.useState({
    items: [],
    total: 0,
    loading: false,
    error: null,
    hasMore: false,
  });

  const [searchParams, setSearchParams] = React.useState({
    query: '',
    limit: 20,
    offset: 0,
  });

  /**
   * Search items
   */
  const search = useCallback(async (query, limit = 20, offset = 0) => {
    if (!query || query.trim().length === 0) {
      setSearchResults({
        items: [],
        total: 0,
        loading: false,
        error: null,
        hasMore: false,
      });
      return;
    }

    setSearchResults((prev) => ({ ...prev, loading: true }));

    try {
      // ✅ Use itemAPI instead of fetch
      const response = await itemAPI.getAll({
        search: query.trim(),
        limit: Math.min(limit, 100),
        page: Math.floor(offset / limit) + 1,
      });

      if (response.data.success) {
        setSearchResults({
          items: response.data.data || [],
          total: response.data.pagination?.totalItems || 0,
          loading: false,
          error: null,
          hasMore: response.data.pagination?.hasNextPage || false,
        });
      } else {
        throw new Error(response.data.message || 'Search failed');
      }
    } catch (error) {
      console.error('❌ Search error:', error);
      setSearchResults((prev) => ({
        ...prev,
        loading: false,
        error: error.message,
      }));
    }
  }, []);

  /**
   * Handle search input
   */
  const handleSearch = useCallback((query) => {
    setSearchParams({ query, limit: 20, offset: 0 });
    search(query, 20, 0);
  }, [search]);

  /**
   * Load more results
   */
  const loadMore = useCallback(() => {
    const newOffset = searchParams.offset + searchParams.limit;
    setSearchParams((prev) => ({ ...prev, offset: newOffset }));
    search(searchParams.query, searchParams.limit, newOffset);
  }, [searchParams, search]);

  /**
   * Clear search
   */
  const clearSearch = useCallback(() => {
    setSearchParams({ query: '', limit: 20, offset: 0 });
    setSearchResults({
      items: [],
      total: 0,
      loading: false,
      error: null,
      hasMore: false,
    });
  }, []);

  return {
    // Results
    items: searchResults.items,
    total: searchResults.total,
    loading: searchResults.loading,
    error: searchResults.error,
    hasMore: searchResults.hasMore,

    // Management
    search: handleSearch,
    loadMore,
    clearSearch,
    query: searchParams.query,
  };
};

/**
 * Enhanced hook for item statistics
 */
export const useItemStats = () => {
  const [stats, setStats] = React.useState({
    data: null,
    loading: false,
    error: null,
    source: 'api',
  });

  const isMounted = React.useRef(true);

  /**
   * Fetch statistics
   */
  const fetchStats = useCallback(async () => {
    if (!isMounted.current) return;
    
    setStats((prev) => ({ ...prev, loading: true, error: null }));

    try {
      // ✅ Use itemAPI instead of fetch
      const response = await itemAPI.getAll({ limit: 1 });
      
      if (response.data.success) {
        setStats({
          data: {
            totalItems: response.data.pagination?.totalItems || 0,
            averagePrice: 0,
            highestPrice: 0,
          },
          loading: false,
          error: null,
          source: 'api',
        });
      } else {
        throw new Error(response.data.message || 'Failed to fetch stats');
      }
    } catch (error) {
      console.error('❌ Stats error:', error.message);
      if (isMounted.current) {
        setStats((prev) => ({
          ...prev,
          loading: false,
          error: error.message,
        }));
      }
    }
  }, []);

  React.useEffect(() => {
    isMounted.current = true;
    fetchStats();
    
    return () => {
      isMounted.current = false;
    };
  }, []);

  return {
    ...stats,
    refetch: fetchStats,
  };
};