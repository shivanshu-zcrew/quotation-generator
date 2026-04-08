import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Search, ChevronDown, ChevronUp, X, Loader2 } from 'lucide-react';

const SearchableSelect = ({ 
  options = [], 
  value, 
  onChange, 
  placeholder = "Select item...",
  onLoadMore,
  hasMore = false,
  loading = false,
  searchTerm: externalSearchTerm = '',
  onSearchChange
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [internalSearchTerm, setInternalSearchTerm] = useState('');
  const [displayedOptions, setDisplayedOptions] = useState([]);
  const [page, setPage] = useState(1);
  const dropdownRef = useRef(null);
  const searchInputRef = useRef(null);
  const scrollContainerRef = useRef(null);
  const observerRef = useRef(null);

  // Use external search term if provided, otherwise internal
  const searchTerm = onSearchChange ? externalSearchTerm : internalSearchTerm;

  // Find selected option label
  const selectedOption = options.find(opt => opt.value === value);
  const selectedLabel = selectedOption ? selectedOption.label : '';

  // Update displayed options when options change
  useEffect(() => {
    setDisplayedOptions(options);
  }, [options]);

  // Setup intersection observer for infinite scroll
  const lastElementRef = useCallback((node) => {
    if (loading) return;
    if (observerRef.current) observerRef.current.disconnect();
    
    observerRef.current = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && hasMore && !loading) {
        console.log('📜 Loading more items...');
        onLoadMore?.();
      }
    }, { threshold: 0.1, rootMargin: '100px' });
    
    if (node) observerRef.current.observe(node);
  }, [loading, hasMore, onLoadMore]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
        setInternalSearchTerm('');
        setPage(1);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      setTimeout(() => searchInputRef.current.focus(), 100);
    }
  }, [isOpen]);

  const handleSearchChange = (e) => {
    const value = e.target.value;
    if (onSearchChange) {
      onSearchChange(value);
    } else {
      setInternalSearchTerm(value);
    }
    setPage(1);
  };

  const handleSelect = (option) => {
    onChange(option.value);
    setIsOpen(false);
    if (!onSearchChange) {
      setInternalSearchTerm('');
    }
  };

  const clearSelection = (e) => {
    e.stopPropagation();
    onChange('');
  };

  return (
    <div ref={dropdownRef} style={{ position: 'relative', width: '100%', marginBottom: '0.5rem' }}>
      <div
        onClick={() => setIsOpen(!isOpen)}
        style={{
          border: '1px solid #d1d5db',
          borderRadius: '0.375rem',
          padding: '0.5rem 0.75rem',
          fontSize: '0.875rem',
          backgroundColor: 'white',
          cursor: 'pointer',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          minHeight: '38px',
          transition: 'all 0.2s'
        }}
        onMouseEnter={(e) => e.currentTarget.style.borderColor = '#9ca3af'}
        onMouseLeave={(e) => e.currentTarget.style.borderColor = '#d1d5db'}
      >
        <span style={{ color: selectedLabel ? '#000' : '#9ca3af' }}>
          {selectedLabel || placeholder}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          {value && (
            <X
              size={14}
              onClick={clearSelection}
              style={{ cursor: 'pointer', color: '#6b7280' }}
            />
          )}
          {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </div>
      </div>

      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            marginTop: '4px',
            backgroundColor: 'white',
            border: '1px solid #e5e7eb',
            borderRadius: '0.5rem',
            boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
            zIndex: 1000,
            maxHeight: '400px',
            display: 'flex',
            flexDirection: 'column'
          }}
        >
          {/* Search Input */}
          <div style={{ padding: '12px', borderBottom: '1px solid #e5e7eb' }}>
            <div style={{ position: 'relative' }}>
              <Search
                size={16}
                style={{
                  position: 'absolute',
                  left: '10px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: '#9ca3af'
                }}
              />
              <input
                ref={searchInputRef}
                type="text"
                value={searchTerm}
                onChange={handleSearchChange}
                placeholder="Search items by name, SKU..."
                style={{
                  width: '100%',
                  padding: '8px 12px 8px 36px',
                  border: '1px solid #d1d5db',
                  borderRadius: '0.375rem',
                  fontSize: '0.875rem',
                  outline: 'none',
                  transition: 'all 0.2s'
                }}
                onFocus={(e) => e.currentTarget.style.borderColor = '#3b82f6'}
                onBlur={(e) => e.currentTarget.style.borderColor = '#d1d5db'}
              />
            </div>
          </div>

          {/* Options List with Infinite Scroll */}
          <div
            ref={scrollContainerRef}
            style={{
              overflowY: 'auto',
              flex: 1,
              minHeight: '100px'
            }}
          >
            {loading && displayedOptions.length === 0 ? (
              <div style={{ padding: '40px 20px', textAlign: 'center' }}>
                <Loader2 size={32} style={{ animation: 'spin 1s linear infinite', margin: '0 auto', color: '#3b82f6' }} />
                <p style={{ marginTop: '12px', color: '#6b7280', fontSize: '0.875rem' }}>Loading items...</p>
              </div>
            ) : displayedOptions.length === 0 ? (
              <div style={{ padding: '40px 20px', textAlign: 'center' }}>
                <p style={{ color: '#6b7280', fontSize: '0.875rem' }}>
                  {searchTerm ? `No items matching "${searchTerm}"` : 'No items available'}
                </p>
              </div>
            ) : (
              <>
                {displayedOptions.map((option, index) => {
                  // Attach ref to the last element for intersection observer
                  const isLastElement = index === displayedOptions.length - 1;
                  return (
                    <div
                      key={option.value}
                      ref={isLastElement ? lastElementRef : null}
                      onClick={() => handleSelect(option)}
                      style={{
                        padding: '10px 12px',
                        cursor: 'pointer',
                        fontSize: '0.875rem',
                        borderBottom: '1px solid #f3f4f6',
                        backgroundColor: value === option.value ? '#eff6ff' : 'white',
                        transition: 'all 0.15s',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                      }}
                      onMouseEnter={(e) => {
                        if (value !== option.value) {
                          e.currentTarget.style.backgroundColor = '#f9fafb';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (value !== option.value) {
                          e.currentTarget.style.backgroundColor = 'white';
                        }
                      }}
                    >
                      <span style={{ fontWeight: value === option.value ? '600' : '400' }}>
                        {option.label}
                      </span>
                      {option.sku && (
                        <span style={{ fontSize: '0.7rem', color: '#9ca3af', marginLeft: '8px' }}>
                          SKU: {option.sku}
                        </span>
                      )}
                    </div>
                  );
                })}
                
                {/* Loading indicator at bottom */}
                {loading && displayedOptions.length > 0 && (
                  <div style={{ 
                    padding: '16px', 
                    textAlign: 'center', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center', 
                    gap: '8px',
                    color: '#6b7280',
                    fontSize: '0.8125rem'
                  }}>
                    <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
                    Loading more items...
                  </div>
                )}
              </>
            )}
          </div>
          
          {/* Footer with count */}
          {displayedOptions.length > 0 && !loading && (
            <div style={{ 
              padding: '8px 12px', 
              borderTop: '1px solid #e5e7eb', 
              fontSize: '0.7rem', 
              color: '#6b7280',
              textAlign: 'center',
              background: '#f9fafb',
              borderRadius: '0 0 0.5rem 0.5rem'
            }}>
              {displayedOptions.length} item{displayedOptions.length !== 1 ? 's' : ''} • 
              {hasMore ? ' Scroll for more' : ' All items loaded'}
            </div>
          )}
        </div>
      )}
      
      {/* Add spin animation */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default SearchableSelect;