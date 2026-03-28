import React, { useState, useCallback } from 'react';
import { Search, X, Loader } from 'lucide-react';

/**
 * Reusable Search Component
 * @param {Object} props - Component props
 * @param {string} props.value - Search input value
 * @param {Function} props.onChange - Callback on input change
 * @param {Function} props.onClear - Callback when clearing search
 * @param {boolean} props.loading - Loading state
 * @param {string} props.placeholder - Input placeholder
 * @param {string} props.size - 'sm' | 'md' | 'lg'
 */
export const SearchBar = ({
  value = '',
  onChange = () => {},
  onClear = () => {},
  loading = false,
  placeholder = 'Search...',
  size = 'md',
  debounceMs = 300,
}) => {
  const [internalValue, setInternalValue] = useState(value);
  const [debounceTimer, setDebounceTimer] = useState(null);

  const handleChange = useCallback(
    (e) => {
      const newValue = e.target.value;
      setInternalValue(newValue);

      // Clear existing timer
      if (debounceTimer) clearTimeout(debounceTimer);

      // Set new timer for debounced callback
      const timer = setTimeout(() => {
        onChange(newValue);
      }, debounceMs);

      setDebounceTimer(timer);
    },
    [onChange, debounceMs, debounceTimer]
  );

  const handleClear = useCallback(() => {
    setInternalValue('');
    if (debounceTimer) clearTimeout(debounceTimer);
    onClear();
  }, [onClear, debounceTimer]);

  const sizes = {
    sm: { container: 'h-8', input: 'text-xs pl-7', icon: 'w-3 h-3' },
    md: { container: 'h-10', input: 'text-sm pl-9', icon: 'w-4 h-4' },
    lg: { container: 'h-12', input: 'text-base pl-11', icon: 'w-5 h-5' },
  };

  const sizeClass = sizes[size] || sizes.md;

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        maxWidth: '500px',
      }}
    >
      {/* Search Icon */}
      <Search
        size={16}
        style={{
          position: 'absolute',
          left: '0.75rem',
          top: '50%',
          transform: 'translateY(-50%)',
          color: '#94a3b8',
          pointerEvents: 'none',
        }}
      />

      {/* Input */}
      <input
        type="text"
        value={internalValue}
        onChange={handleChange}
        placeholder={placeholder}
        disabled={loading}
        style={{
          width: '100%',
          padding: '0.65rem 1rem 0.65rem 2.6rem',
          paddingRight: internalValue ? '2.6rem' : '1rem',
          border: '1.5px solid #e2e8f0',
          borderRadius: '12px',
          fontSize: '0.875rem',
          fontFamily: 'inherit',
          color: '#1f2937',
          background: loading ? '#f8fafc' : 'white',
          outline: 'none',
          transition: 'all 0.2s',
          opacity: loading ? 0.7 : 1,
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

      {/* Loading Spinner */}
      {loading && (
        <Loader
          size={16}
          style={{
            position: 'absolute',
            right: '0.75rem',
            top: '50%',
            transform: 'translateY(-50%)',
            color: '#6366f1',
            animation: 'spin 1s linear infinite',
          }}
        />
      )}

      {/* Clear Button */}
      {internalValue && !loading && (
        <button
          onClick={handleClear}
          style={{
            position: 'absolute',
            right: '0.75rem',
            top: '50%',
            transform: 'translateY(-50%)',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: '#94a3b8',
            padding: '0.25rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'color 0.2s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = '#64748b';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = '#94a3b8';
          }}
        >
          <X size={16} />
        </button>
      )}

      <style>{`
        @keyframes spin {
          from { transform: translateY(-50%) rotate(0deg); }
          to { transform: translateY(-50%) rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

/**
 * Advanced Search with Filters
 */
export const AdvancedSearch = ({
  searchValue = '',
  onSearchChange = () => {},
  sortBy = 'name',
  onSortChange = () => {},
  sortOrder = 'asc',
  onSortOrderChange = () => {},
  filters = [],
  onFilterChange = () => {},
  loading = false,
}) => {
  return (
    <div
      style={{
        display: 'flex',
        gap: '1rem',
        alignItems: 'center',
        flexWrap: 'wrap',
        padding: '1rem',
        background: 'white',
        borderRadius: '12px',
        boxShadow: '0 1px 3px rgba(0,0,0,.06)',
      }}
    >
      {/* Search */}
      <div style={{ flex: 1, minWidth: '200px' }}>
        <SearchBar
          value={searchValue}
          onChange={onSearchChange}
          placeholder="Search..."
          loading={loading}
        />
      </div>

      {/* Sort By */}
      <select
        value={sortBy}
        onChange={(e) => onSortChange(e.target.value)}
        disabled={loading}
        style={{
          padding: '0.65rem 1rem',
          border: '1.5px solid #e2e8f0',
          borderRadius: '12px',
          background: 'white',
          color: '#1f2937',
          fontSize: '0.875rem',
          fontFamily: 'inherit',
          cursor: loading ? 'not-allowed' : 'pointer',
          outline: 'none',
          transition: 'all 0.2s',
          opacity: loading ? 0.7 : 1,
        }}
        onFocus={(e) => {
          e.currentTarget.style.borderColor = '#6366f1';
        }}
        onBlur={(e) => {
          e.currentTarget.style.borderColor = '#e2e8f0';
        }}
      >
        <option value="">Sort By...</option>
        {filters.map(({ value, label }) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>

      {/* Sort Order */}
      <select
        value={sortOrder}
        onChange={(e) => onSortOrderChange(e.target.value)}
        disabled={loading}
        style={{
          padding: '0.65rem 1rem',
          border: '1.5px solid #e2e8f0',
          borderRadius: '12px',
          background: 'white',
          color: '#1f2937',
          fontSize: '0.875rem',
          fontFamily: 'inherit',
          cursor: loading ? 'not-allowed' : 'pointer',
          outline: 'none',
          transition: 'all 0.2s',
          opacity: loading ? 0.7 : 1,
        }}
      >
        <option value="asc">Ascending</option>
        <option value="desc">Descending</option>
      </select>
    </div>
  );
};

export default SearchBar;