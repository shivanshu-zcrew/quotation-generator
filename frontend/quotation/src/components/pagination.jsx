import React from 'react';
import { ChevronLeft, ChevronRight, MoreHorizontal } from 'lucide-react';

/**
 * Reusable Pagination Component
 * @param {Object} props - Component props
 * @param {number} props.currentPage - Current page number
 * @param {number} props.totalPages - Total number of pages
 * @param {boolean} props.hasNextPage - Can go to next page
 * @param {boolean} props.hasPreviousPage - Can go to previous page
 * @param {Function} props.onPageChange - Callback when page changes
 * @param {boolean} props.loading - Loading state
 * @param {string} props.variant - 'simple' or 'full' (default: 'full')
 */
export const Pagination = ({
  currentPage = 1,
  totalPages = 1,
  hasNextPage = false,
  hasPreviousPage = false,
  onPageChange = () => {},
  loading = false,
  variant = 'full',
  size = 'md',
}) => {
  const sizes = {
    sm: { container: 'gap-0.5', button: 'p-1.5 text-xs' },
    md: { container: 'gap-1', button: 'p-2 text-sm' },
    lg: { container: 'gap-2', button: 'p-3 text-base' },
  };

  const sizeClass = sizes[size] || sizes.md;

  if (totalPages <= 1) return null;

  if (variant === 'simple') {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '1rem',
        }}
      >
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={!hasPreviousPage || loading}
          style={{
            padding: '0.5rem 1rem',
            border: '1px solid #e2e8f0',
            background: 'white',
            borderRadius: '8px',
            cursor: loading || !hasPreviousPage ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            opacity: loading || !hasPreviousPage ? 0.5 : 1,
            fontSize: '0.875rem',
            fontWeight: '600',
            transition: 'all 0.2s',
          }}
          onMouseEnter={(e) => {
            if (hasPreviousPage && !loading) {
              e.currentTarget.style.background = '#f1f5f9';
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'white';
          }}
        >
          <ChevronLeft size={16} /> Previous
        </button>

        <span
          style={{
            color: '#64748b',
            fontSize: '0.875rem',
            fontWeight: '500',
            minWidth: '100px',
            textAlign: 'center',
          }}
        >
          Page {currentPage} of {totalPages}
        </span>

        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={!hasNextPage || loading}
          style={{
            padding: '0.5rem 1rem',
            border: '1px solid #e2e8f0',
            background: 'white',
            borderRadius: '8px',
            cursor: loading || !hasNextPage ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            opacity: loading || !hasNextPage ? 0.5 : 1,
            fontSize: '0.875rem',
            fontWeight: '600',
            transition: 'all 0.2s',
          }}
          onMouseEnter={(e) => {
            if (hasNextPage && !loading) {
              e.currentTarget.style.background = '#f1f5f9';
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'white';
          }}
        >
          Next <ChevronRight size={16} />
        </button>
      </div>
    );
  }

  // Full variant with page numbers
  const maxButtons = 5;
  const halfWindow = Math.floor(maxButtons / 2);
  let startPage = Math.max(1, currentPage - halfWindow);
  let endPage = Math.min(totalPages, startPage + maxButtons - 1);

  if (endPage - startPage < maxButtons - 1) {
    startPage = Math.max(1, endPage - maxButtons + 1);
  }

  const pageButtons = [];

  // Previous button
  pageButtons.push(
    <button
      key="prev"
      onClick={() => onPageChange(currentPage - 1)}
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
      onMouseEnter={(e) => {
        if (hasPreviousPage && !loading) {
          e.currentTarget.style.background = '#f1f5f9';
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'white';
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
          transition: 'all 0.2s',
        }}
      >
        1
      </button>
    );

    if (startPage > 2) {
      pageButtons.push(
        <span key="dots-start" style={{ color: '#94a3b8', padding: '0.5rem 0.25rem' }}>
          <MoreHorizontal size={16} />
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
          border: i === currentPage ? '1px solid #6366f1' : '1px solid #e2e8f0',
          background: i === currentPage ? '#6366f1' : 'white',
          color: i === currentPage ? 'white' : '#0f172a',
          borderRadius: '8px',
          fontSize: '0.875rem',
          fontWeight: '600',
          cursor: loading ? 'not-allowed' : 'pointer',
          opacity: loading ? 0.5 : 1,
          transition: 'all 0.2s',
        }}
        onMouseEnter={(e) => {
          if (i !== currentPage && !loading) {
            e.currentTarget.style.background = '#f1f5f9';
          }
        }}
        onMouseLeave={(e) => {
          if (i !== currentPage) {
            e.currentTarget.style.background = 'white';
          }
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
          <MoreHorizontal size={16} />
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
          transition: 'all 0.2s',
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
      onClick={() => onPageChange(currentPage + 1)}
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
        transition: 'all 0.2s',
      }}
      onMouseEnter={(e) => {
        if (hasNextPage && !loading) {
          e.currentTarget.style.background = '#f1f5f9';
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'white';
      }}
    >
      <ChevronRight size={16} />
    </button>
  );

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        gap: '0.5rem',
        flexWrap: 'wrap',
        padding: '1rem',
      }}
    >
      {pageButtons}
    </div>
  );
};

export default Pagination;