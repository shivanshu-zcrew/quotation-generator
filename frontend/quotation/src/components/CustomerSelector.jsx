// components/CustomerSelector.jsx (Fixed - Shows all customers with scroll)
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Search, X, Users, RefreshCw, Loader2, ChevronDown, ChevronUp, Mail, Phone, AlertCircle, CheckCircle } from 'lucide-react';
import useCustomerStore from '../services/customerStore';

const CustomerSelector = ({ value, onChange, placeholder = "Search or select a customer", companyId, onSyncComplete, autoLoad = false, className = "", style = {} }) => {
  const [search, setSearch] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [visibleCount, setVisibleCount] = useState(50);  
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  
  const dropdownRef = useRef(null);
  const inputRef = useRef(null);
  const searchTimeoutRef = useRef(null);
  const scrollContainerRef = useRef(null);
  const prevCompanyIdRef = useRef(companyId);

  const { 
    customers, 
    isLoading: isCustomersLoading, 
    isLoaded: isCustomersLoaded,
    loadAllCustomers,
    searchCustomers,
    clearSearch,
    syncCustomers,
    isSearching,
    searchResults,
    error: storeError,
    searchQuery,
    totalCount
  } = useCustomerStore();

  const selectedCustomer = useMemo(() => customers.find(c => c._id === value) || null, [customers, value]);

  // Get display customers - show ALL customers when no search, not just first 50
  const displayCustomers = useMemo(() => {
    if (isSearching && searchResults.length > 0) return searchResults;
    if (search.trim()) {
      const term = search.toLowerCase();
      return customers.filter(c => 
        c.name?.toLowerCase().includes(term) ||
        c.email?.toLowerCase().includes(term) ||
        c.phone?.includes(search)
      );
    }
    // Show ALL customers, not just first 50
    return customers;
  }, [customers, search, isSearching, searchResults]);

  // Get visible customers for infinite scroll
  const visibleCustomers = useMemo(() => {
    return displayCustomers.slice(0, visibleCount);
  }, [displayCustomers, visibleCount]);

  const hasMore = visibleCount < displayCustomers.length;

  // Load more when scrolling
  const handleScroll = useCallback(() => {
    if (!scrollContainerRef.current || isLoadingMore || !hasMore) return;
    
    const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
    // Load more when scrolled to bottom (within 100px)
    if (scrollHeight - scrollTop - clientHeight < 100) {
      setIsLoadingMore(true);
      // Load 50 more items
      setTimeout(() => {
        setVisibleCount(prev => Math.min(prev + 50, displayCustomers.length));
        setIsLoadingMore(false);
      }, 100);
    }
  }, [hasMore, isLoadingMore, displayCustomers.length]);

  // Reset visible count when customers change (company change or search)
  useEffect(() => {
    setVisibleCount(50);
  }, [customers, search, companyId]);

  // Attach scroll listener
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (container && isOpen && !isSearching && !search.trim()) {
      container.addEventListener('scroll', handleScroll);
      return () => container.removeEventListener('scroll', handleScroll);
    }
  }, [isOpen, isSearching, search, handleScroll]);

  // Handle company change
  useEffect(() => {
    if (prevCompanyIdRef.current !== companyId) {
      setSearch('');
      setIsOpen(false);
      setVisibleCount(50);
      
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
      
      prevCompanyIdRef.current = companyId;
    }
  }, [companyId]);

  // Auto-load customers
  useEffect(() => {
    if (autoLoad && companyId && !isCustomersLoaded && !isCustomersLoading) {
      loadAllCustomers(companyId);
    }
  }, [autoLoad, companyId, isCustomersLoaded, isCustomersLoading, loadAllCustomers]);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (event) => {
      const isOutside = dropdownRef.current && !dropdownRef.current.contains(event.target);
      if (isOutside) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSearchChange = useCallback((e) => {
    const query = e.target.value;
    setSearch(query);
    setVisibleCount(50); // Reset visible count on new search
    
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    
    if (query.trim().length >= 2) {
      searchTimeoutRef.current = setTimeout(() => {
        searchCustomers(query, companyId);
      }, 300);
    } else if (query.trim().length === 0) {
      clearSearch();
    }
  }, [companyId, searchCustomers, clearSearch]);

  const handleSelectCustomer = useCallback((customer) => {
    setSearch('');
    clearSearch();
    setIsOpen(false);
    setVisibleCount(50);
    onChange(customer._id, customer);
  }, [onChange, clearSearch]);

  const handleClear = useCallback(() => {
    setSearch('');
    clearSearch();
    setVisibleCount(50);
    onChange(null, null);
  }, [onChange, clearSearch]);

  const handleSync = useCallback(async () => {
    if (!companyId) return;
    const result = await syncCustomers(companyId);
    onSyncComplete?.(result);
  }, [companyId, syncCustomers, onSyncComplete]);

  const toggleDropdown = useCallback(() => {
    setIsOpen(!isOpen);
    if (!isOpen) {
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
        }
      }, 50);
    }
  }, [isOpen]);

  const showLoading = isCustomersLoading || (isSearching && search.trim().length >= 2);
  const showShortSearchHint = search.trim().length > 0 && search.trim().length < 2;
  const showNoResults = !showLoading && !showShortSearchHint && visibleCustomers.length === 0 && search.trim().length >= 2;

  return (
    <div className={className} style={{ position: 'relative', width: '100%', ...style }} ref={dropdownRef}>
      <div
        style={{
          display: 'flex', alignItems: 'center', height: 46,
          border: `1.5px solid ${isFocused ? '#0f172a' : '#e2e8f0'}`,
          borderRadius: 14, background: '#fafbff', padding: '0 1rem', gap: '0.75rem',
          cursor: 'pointer', transition: 'all 0.2s ease',
        }}
        onClick={toggleDropdown}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
      >
        {selectedCustomer ? (
          <>
            <div style={{ width: 32, height: 32, borderRadius: 10, background: 'linear-gradient(135deg, #0f172a, #1e293b)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '0.75rem', fontWeight: 700 }}>
              {selectedCustomer.name?.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase() || 'C'}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, color: '#0f172a', fontSize: '0.875rem' }}>{selectedCustomer.name}</div>
              {/* {selectedCustomer.email && <div style={{ fontSize: '0.7rem', color: '#64748b' }}><Mail size={11} /> {selectedCustomer.email}</div>} */}
            </div>
            <button onClick={(e) => { e.stopPropagation(); handleClear(); }} style={{ padding: 4, borderRadius: 6, background: '#fee2e2', border: 'none', cursor: 'pointer' }}>
              <X size={14} color="#dc2626" />
            </button>
          </>
        ) : (
          <>
            <Search size={18} color="#94a3b8" />
            <span style={{ color: '#94a3b8', fontSize: '0.875rem', flex: 1 }}>{placeholder}</span>
          </>
        )}
        {isOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
      </div>

      {isOpen && (
        <div style={{ 
          position: 'absolute', top: '110%', left: 0, right: 0, 
          background: 'white', border: '1px solid #e2e8f0', borderRadius: 14, 
          boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)', 
          maxHeight: 400, overflow: 'hidden', zIndex: 1000 
        }}>
          {/* Search Input */}
          <div style={{ padding: '1rem', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: '0.75rem', background: '#fafbff' }}>
            <Search size={16} color="#94a3b8" />
            <input
              ref={inputRef}
              type="text"
              placeholder="Search customers..."
              value={search}
              onChange={handleSearchChange}
              style={{ flex: 1, border: 'none', outline: 'none', fontSize: '0.875rem', padding: 0 }}
            />
            {search && (
              <button onClick={() => { setSearch(''); clearSearch(); setVisibleCount(50); }} style={{ padding: 4, borderRadius: 6, background: '#f1f5f9', border: 'none', cursor: 'pointer' }}>
                <X size={14} />
              </button>
            )}
          </div>

          {/* Loading State */}
          {showLoading && (
            <div style={{ padding: '1.5rem', textAlign: 'center' }}>
              <Loader2 size={20} color="#6366f1" style={{ animation: 'qs-spin 0.9s linear infinite' }} />
              <div style={{ color: '#94a3b8', fontSize: '0.8rem' }}>
                {isSearching ? 'Searching...' : 'Loading customers...'}
              </div>
            </div>
          )}

          {/* Short Search Hint */}
          {!showLoading && showShortSearchHint && (
            <div style={{ padding: '1.5rem', textAlign: 'center' }}>
              <div style={{ color: '#f59e0b' }}>🔍 Type at least 2 characters</div>
            </div>
          )}

          {/* Results with Infinite Scroll */}
          {!showLoading && !showShortSearchHint && visibleCustomers.length > 0 && (
            <div 
              ref={scrollContainerRef}
              style={{ maxHeight: 300, overflowY: 'auto' }}
              onScroll={handleScroll}
            >
              {visibleCustomers.map(customer => (
                <div 
                  key={customer._id} 
                  onClick={() => handleSelectCustomer(customer)} 
                  style={{ 
                    padding: '1rem', display: 'flex', alignItems: 'center', gap: '0.75rem', 
                    cursor: 'pointer', borderBottom: '1px solid #f8fafc', 
                    background: value === customer._id ? '#eff6ff' : 'transparent' 
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = '#f8fafc'}
                  onMouseLeave={(e) => e.currentTarget.style.background = value === customer._id ? '#eff6ff' : 'transparent'}
                >
                  <div style={{ 
                    width: 40, height: 40, borderRadius: 12, 
                    background: 'linear-gradient(135deg, #0f172a, #1e293b)', 
                    display: 'flex', alignItems: 'center', justifyContent: 'center', 
                    color: 'white', fontWeight: 700 
                  }}>
                    {customer.name?.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase() || 'C'}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, color: '#0f172a' }}>{customer.name}</div>
                    {customer.email && <div style={{ fontSize: '0.7rem', color: '#64748b' }}>{customer.email}</div>}
                  </div>
                  {value === customer._id && <CheckCircle size={20} color="#10b981" />}
                </div>
              ))}
              
              {/* Loading more indicator */}
              {isLoadingMore && (
                <div style={{ padding: '1rem', textAlign: 'center' }}>
                  <Loader2 size={16} color="#6366f1" style={{ animation: 'qs-spin 0.9s linear infinite' }} />
                  <span style={{ marginLeft: '0.5rem', color: '#94a3b8', fontSize: '0.75rem' }}>Loading more...</span>
                </div>
              )}
              
              {/* End of list indicator */}
              {!hasMore && displayCustomers.length > 50 && !isLoadingMore && (
                <div style={{ padding: '1rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.7rem' }}>
                  ✓ All {displayCustomers.length} customers loaded
                </div>
              )}
            </div>
          )}

          {/* No Results */}
          {!showLoading && !showShortSearchHint && visibleCustomers.length === 0 && (
            <div style={{ padding: '2rem', textAlign: 'center' }}>
              <Users size={48} color="#94a3b8" />
              <div style={{ color: '#475569', marginTop: '0.5rem' }}>
                {search.trim().length >= 2 ? `No results for "${search}"` : 'No customers found'}
              </div>
              {!search.trim() && (
                <button 
                  onClick={handleSync} 
                  style={{ marginTop: '1rem', padding: '0.5rem 1rem', background: '#eff6ff', color: '#2563eb', border: 'none', borderRadius: 8, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}
                >
                  <RefreshCw size={12} /> Sync from Zoho
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default CustomerSelector;