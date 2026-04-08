// hooks/customHooks.js
import { useState, useCallback, useEffect, useMemo } from 'react';
import { useAppStore } from '../services/store';
import { itemAPI } from '../services/api';
import useItemStore from '../services/itemStore';
import useCustomerStore from '../services/customerStore';

// ============================================================================
// ITEMS HOOKS - Now using useItemStore
// ============================================================================

// useItems - Returns ALL items from useItemStore for the selected company
export const useItems = () => {
  const { 
    items, 
    isLoading, 
    error, 
    totalCount, 
    isLoaded,
    loadAllItems,
    resetItems,
    refreshItems
  } = useItemStore();
  
  const selectedCompany = useAppStore(s => s.selectedCompany);
  const addItem = useAppStore(s => s.addItem);
  const updateItem = useAppStore(s => s.updateItem);
  const deleteItem = useAppStore(s => s.deleteItem);
  const operationInProgress = useAppStore(s => s.operationInProgress);

  // Filter items by company (items from store should already be filtered)
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
    items: companyItems,
    allItems: companyItems,
    sellableItems,
    nonSellableItems,
    loading: isLoading,
    error: error,
    totalCount: totalCount,
    isLoaded: isLoaded,
    isAddingItem: operationInProgress.addItem === true,
    operationInProgress,
    addItem,
    updateItem,
    deleteItem,
    loadAllItems,
    resetItems,
    refreshItems,
    clearError: () => useItemStore.getState().setError(null),
  };
};

// usePaginatedItems - Now using useItemStore with pagination
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

  const setPage     = useCallback((p)   => setFilters(prev => ({ ...prev, page: p })), []);
  const setLimit    = useCallback((l)   => setFilters(prev => ({ ...prev, page: 1, limit: Math.min(l, 500) })), []);
  const setSearch   = useCallback((s)   => setFilters(prev => ({ ...prev, search: s, page: 1 })), []);
  const setSorting  = useCallback((by, order = 'asc') => setFilters(prev => ({ ...prev, sortBy: by, sortOrder: order, page: 1 })), []);

  const goToPage    = useCallback((n) => {
    const max = itemsData.pagination.totalPages;
    if (n >= 1 && n <= max) setPage(n);
  }, [itemsData.pagination.totalPages, setPage]);

  const nextPage     = useCallback(() => { if (itemsData.pagination.hasNextPage) setPage(itemsData.pagination.page + 1); }, [itemsData.pagination, setPage]);
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

// useItemSearch - Now using useItemStore
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
  }, []);

  const handleSearch = useCallback((q) => { setQuery(q); search(q, 20, 0); }, [search]);
  const clearSearch  = useCallback(() => {
    setQuery('');
    setSearchResults({ items: [], total: 0, loading: false, error: null, hasMore: false });
  }, []);
  const loadMore = useCallback(() => search(query, 20, searchResults.items.length), [query, search, searchResults.items.length]);

  return { ...searchResults, query, search: handleSearch, loadMore, clearSearch };
};

// useItemStats - Now using useItemStore
export const useItemStats = () => {
  const { items, isLoading } = useItemStore();
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

  return { data: stats, loading: isLoading, error: null };
};

// ============================================================================
// CUSTOMER HOOKS - Using useCustomerStore
// ============================================================================

// useCustomers - Now using useCustomerStore
export const useCustomers = () => {
  const {
    customers,
    isLoading,
    error,
    totalCount,
    isLoaded,
    loadAllCustomers,
    refreshCustomers,
    getCustomerById,
    syncCustomers,
    isSyncing,
    addCustomer,
    updateCustomer,
    deleteCustomer,
    clearError,
    resetCustomers
  } = useCustomerStore();

  const selectedCompany = useAppStore(s => s.selectedCompany);

  return {
    customers,
    loading: isLoading,
    error,
    totalCount,
    isLoaded,
    isSyncing,
    loadAllCustomers: () => loadAllCustomers(selectedCompany),
    refreshCustomers: () => refreshCustomers(selectedCompany),
    getCustomerById,
    syncCustomers: () => syncCustomers(selectedCompany),
    addCustomer,
    updateCustomer,
    deleteCustomer,
    clearError,
    resetCustomers,
  };
};

// ============================================================================
// ITEMS LIST HOOK - For QuotationScreen
// ============================================================================

export const useItemsList = () => {
  const { items, isLoading, isLoaded, loadAllItems, resetItems } = useItemStore();
  const { selectedCompany } = useAppStore(s => ({ selectedCompany: s.selectedCompany }));
  const [companyItems, setCompanyItems] = useState([]);
  
  // Reset and reload when company changes
  useEffect(() => {
    if (selectedCompany) {
      console.log('🔄 useItemsList: Company changed to:', selectedCompany);
      
      // Reset store to clear old items
      resetItems();
      
      // Clear local state
      setCompanyItems([]);
      
      // Load new company items
      loadAllItems(selectedCompany, true); // Force refresh
    }
  }, [selectedCompany, resetItems, loadAllItems]);
  
  // Update local items when store items change
  useEffect(() => {
    if (items && items.length > 0) {
      // Filter items by current company to be safe
      const filtered = items.filter(item =>
        item.companyId === selectedCompany ||
        item.companyId?._id === selectedCompany
      );
      console.log(`📦 useItemsList: ${filtered.length} items for company ${selectedCompany}`);
      setCompanyItems(filtered);
    } else if (!isLoading && selectedCompany) {
      setCompanyItems([]);
    }
  }, [items, selectedCompany, isLoading]);
  
  // Initial load if needed
  useEffect(() => {
    if (selectedCompany && !isLoaded && !isLoading) {
      console.log('📚 useItemsList: Initial load for company:', selectedCompany);
      loadAllItems(selectedCompany);
    }
  }, [selectedCompany, isLoaded, isLoading, loadAllItems]);
  
  return companyItems;
};

// ============================================================================
// QUOTATIONS HOOK
// ============================================================================

export const useQuotations = () => {
  const store = useAppStore();
  
  return {
    quotations: store.quotations || [],
    addQuotation: store.addQuotation,
    updateQuotation: store.updateQuotation,
    deleteQuotation: store.deleteQuotation,
    getQuotation: store.getQuotation,
    isLoading: store.loading,
    error: store.error
  };
};