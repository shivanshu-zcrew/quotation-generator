// components/CustomerSelector.jsx (Responsive Version)
import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from 'react';

import {
  Search,
  X,
  Users,
  Loader2,
  ChevronDown,
  CheckCircle,
} from 'lucide-react';

import useCustomerStore from '../services/customerStore';

const CustomerSelector = ({
  value,
  onChange,
  placeholder = 'Search or select a customer',
  companyId,
  onSyncComplete,
  autoLoad = true,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  const dropdownRef = useRef(null);
  const inputRef = useRef(null);
  const timeoutRef = useRef(null);

  const {
    customers,
    isLoading,
    isLoaded,
    loadAllCustomers,
    searchCustomers,
    clearSearch,
    syncCustomers,
    isSearching,
    searchResults,
  } = useCustomerStore();

  // =========================
  // Responsive Detection
  // =========================
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // =========================
  // Display Customers
  // =========================
  const displayCustomers = useMemo(() => {
    if (isSearching && searchResults.length > 0) {
      return searchResults;
    }

    if (searchTerm.trim().length > 0) {
      const term = searchTerm.toLowerCase().trim();

      return customers.filter(
        (customer) =>
          customer.name?.toLowerCase().includes(term) ||
          customer.email?.toLowerCase().includes(term) ||
          customer.phone?.includes(term)
      );
    }

    return customers;
  }, [customers, searchTerm, isSearching, searchResults]);

  // =========================
  // Selected Customer
  // =========================
  const selectedCustomer = useMemo(() => {
    return customers.find((c) => c._id === value) || null;
  }, [customers, value]);

  // =========================
  // Open / Close Dropdown
  // =========================
  const openDropdown = useCallback(() => {
    setIsOpen(true);
  }, []);

  const closeDropdown = useCallback(() => {
    setIsOpen(false);
  }, []);

  // =========================
  // Focus Input
  // =========================
  useEffect(() => {
    if (isOpen) {
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    }
  }, [isOpen]);

  // =========================
  // Debounced Search
  // =========================
  const handleSearchChange = useCallback(
    (e) => {
      const value = e.target.value;

      setSearchTerm(value);

      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      timeoutRef.current = setTimeout(() => {
        const trimmed = value.trim();

        if (trimmed.length >= 2) {
          searchCustomers(trimmed, companyId);
        } else {
          clearSearch();
        }
      }, 400);
    },
    [companyId, searchCustomers, clearSearch]
  );

  // =========================
  // Cleanup Timeout
  // =========================
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  // =========================
  // Select Customer
  // =========================
  const handleSelect = useCallback(
    (customer) => {
      onChange(customer._id, customer);

      setSearchTerm('');
      clearSearch();
      closeDropdown();
    },
    [onChange, clearSearch, closeDropdown]
  );

  // =========================
  // Clear Customer
  // =========================
  const handleClear = useCallback(
    (e) => {
      e.stopPropagation();

      onChange(null, null);

      setSearchTerm('');
      clearSearch();
      closeDropdown();
    },
    [onChange, clearSearch, closeDropdown]
  );

  // =========================
  // Sync Customers
  // =========================
  const handleSync = useCallback(async () => {
    if (!companyId) return;

    const result = await syncCustomers(companyId);

    onSyncComplete?.(result);
  }, [companyId, syncCustomers, onSyncComplete]);

  // =========================
  // Outside Click
  // =========================
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target)
      ) {
        closeDropdown();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);

    return () => {
      document.removeEventListener(
        'mousedown',
        handleClickOutside
      );
    };
  }, [closeDropdown]);

  // =========================
  // Auto Load Customers
  // =========================
  useEffect(() => {
    if (
      autoLoad &&
      companyId &&
      !isLoaded &&
      !isLoading
    ) {
      loadAllCustomers(companyId);
    }
  }, [
    autoLoad,
    companyId,
    isLoaded,
    isLoading,
    loadAllCustomers,
  ]);

  // =========================
  // Animation Styles
  // =========================
  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      @keyframes cs-spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }
      
      @keyframes cs-dropdownSlide {
        from {
          opacity: 0;
          transform: translateY(-10px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }
      
      @media (max-width: 768px) {
        .customer-dropdown {
          position: fixed !important;
          top: auto !important;
          bottom: 0 !important;
          left: 0 !important;
          right: 0 !important;
          border-radius: 20px 20px 0 0 !important;
          max-height: 80vh !important;
          animation: cs-slideUp 0.3s ease !important;
        }
        
        @keyframes cs-slideUp {
          from {
            transform: translateY(100%);
          }
          to {
            transform: translateY(0);
          }
        }
      }
    `;
    document.head.appendChild(style);
    return () => document.head.removeChild(style);
  }, []);

  // Responsive styles
  const triggerStyle = {
    height: isMobile ? '44px' : '48px',
    border: '1.5px solid #e2e8f0',
    borderRadius: isMobile ? '12px' : '14px',
    background: '#fafbff',
    padding: isMobile ? '0 0.875rem' : '0 1rem',
    display: 'flex',
    alignItems: 'center',
    gap: isMobile ? '10px' : '12px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  };

  const avatarStyle = {
    width: isMobile ? '30px' : '34px',
    height: isMobile ? '30px' : '34px',
    borderRadius: isMobile ? '8px' : '10px',
    background: 'linear-gradient(135deg, #0f172a, #1e293b)',
    color: 'white',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 700,
    fontSize: isMobile ? '0.7rem' : '0.8rem',
    flexShrink: 0,
  };

  const dropdownStyle = {
    position: isMobile ? 'fixed' : 'absolute',
    top: isMobile ? 'auto' : 'calc(100% + 6px)',
    bottom: isMobile ? '0' : 'auto',
    left: isMobile ? '0' : '0',
    right: isMobile ? '0' : '0',
    background: 'white',
    border: isMobile ? 'none' : '1px solid #e2e8f0',
    borderRadius: isMobile ? '20px 20px 0 0' : '14px',
    boxShadow: isMobile 
      ? '0 -5px 25px -5px rgba(0,0,0,0.15)'
      : '0 10px 25px -5px rgba(0,0,0,0.15)',
    overflow: 'hidden',
    zIndex: 1000,
    maxHeight: isMobile ? '80vh' : 'auto',
    animation: isMobile ? 'cs-slideUp 0.3s ease' : 'cs-dropdownSlide 0.2s ease',
  };

  const searchContainerStyle = {
    padding: isMobile ? '12px' : '12px 16px',
    borderBottom: '1px solid #f1f5f9',
    background: 'white',
    position: isMobile ? 'sticky' : 'relative',
    top: 0,
    zIndex: 1,
  };

  const searchInputStyle = {
    width: '100%',
    padding: isMobile ? '10px 12px 10px 38px' : '10px 12px 10px 40px',
    border: '1px solid #e2e8f0',
    borderRadius: isMobile ? '10px' : '12px',
    fontSize: isMobile ? '0.875rem' : '0.9rem',
    outline: 'none',
    boxSizing: 'border-box',
    transition: 'border-color 0.2s',
  };

  const resultsContainerStyle = {
    maxHeight: isMobile ? 'calc(80vh - 80px)' : '340px',
    overflowY: 'auto',
    WebkitOverflowScrolling: 'touch',
  };

  const customerItemStyle = {
    padding: isMobile ? '12px' : '12px 16px',
    display: 'flex',
    alignItems: 'center',
    gap: isMobile ? '10px' : '12px',
    cursor: 'pointer',
    borderBottom: '1px solid #f8fafc',
    transition: 'background 0.2s',
  };

  return (
    <div
      ref={dropdownRef}
      style={{
        position: 'relative',
        width: '100%',
      }}
    >
      {/* ========================= */}
      {/* Trigger */}
      {/* ========================= */}
      <div
        onClick={openDropdown}
        style={triggerStyle}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = '#0f172a';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = '#e2e8f0';
        }}
      >
        {selectedCustomer ? (
          <>
            <div style={avatarStyle}>
              {selectedCustomer.name
                ?.substring(0, 2)
                .toUpperCase()}
            </div>

            <div
              style={{
                flex: 1,
                minWidth: 0,
              }}
            >
              <div
                style={{
                  fontWeight: 600,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  fontSize: isMobile ? '0.875rem' : '0.9rem',
                }}
              >
                {selectedCustomer.name}
              </div>

              {selectedCustomer.email && !isMobile && (
                <div
                  style={{
                    fontSize: '0.75rem',
                    color: '#64748b',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {selectedCustomer.email}
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={handleClear}
              style={{
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: isMobile ? '6px' : '4px',
                borderRadius: '6px',
                transition: 'background 0.2s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#fef2f2';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
              }}
            >
              <X size={isMobile ? 14 : 16} color="#ef4444" />
            </button>
          </>
        ) : (
          <>
            <Search size={isMobile ? 16 : 18} color="#94a3b8" />

            <span
              style={{
                color: '#94a3b8',
                flex: 1,
                fontSize: isMobile ? '0.875rem' : '0.9rem',
              }}
            >
              {isMobile && placeholder.length > 30 
                ? placeholder.substring(0, 30) + '...' 
                : placeholder}
            </span>
          </>
        )}

        <ChevronDown
          size={isMobile ? 16 : 18}
          style={{
            transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s ease',
            flexShrink: 0,
            color: '#64748b',
          }}
        />
      </div>

      {/* ========================= */}
      {/* Dropdown */}
      {/* ========================= */}
      {isOpen && (
        <div
          className="customer-dropdown"
          style={dropdownStyle}
        >
          {/* ========================= */}
          {/* Search */}
          {/* ========================= */}
          <div style={searchContainerStyle}>
            <div
              style={{
                position: 'relative',
              }}
            >
              <Search
                size={isMobile ? 14 : 16}
                style={{
                  position: 'absolute',
                  left: isMobile ? '10px' : '12px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: '#94a3b8',
                  pointerEvents: 'none',
                }}
              />

              <input
                ref={inputRef}
                type="text"
                value={searchTerm}
                placeholder={
                  isMobile 
                    ? "Search customers..." 
                    : "Search by name, email or phone..."
                }
                onClick={(e) => e.stopPropagation()}
                onChange={handleSearchChange}
                style={searchInputStyle}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = '#0f172a';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = '#e2e8f0';
                }}
              />

              {searchTerm && (
                <button
                  onClick={() => {
                    setSearchTerm('');
                    clearSearch();
                  }}
                  style={{
                    position: 'absolute',
                    right: '10px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '4px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: '6px',
                  }}
                >
                  <X size={isMobile ? 12 : 14} color="#94a3b8" />
                </button>
              )}
            </div>
          </div>

          {/* ========================= */}
          {/* Results */}
          {/* ========================= */}
          <div style={resultsContainerStyle}>
            {isSearching ? (
              <div
                style={{
                  padding: isMobile ? '2rem 1rem' : '2rem',
                  textAlign: 'center',
                }}
              >
                <Loader2
                  size={isMobile ? 20 : 24}
                  style={{
                    animation: 'cs-spin 1s linear infinite',
                    margin: '0 auto',
                    color: '#0f172a',
                  }}
                />

                <p
                  style={{
                    marginTop: '0.75rem',
                    color: '#64748b',
                    fontSize: isMobile ? '0.875rem' : '0.9rem',
                  }}
                >
                  Searching...
                </p>
              </div>
            ) : displayCustomers.length > 0 ? (
              displayCustomers.map((customer, index) => (
                <div
                  key={customer._id}
                  onClick={() => handleSelect(customer)}
                  style={{
                    ...customerItemStyle,
                    background: value === customer._id ? '#f0fdf4' : 'white',
                  }}
                  onMouseEnter={(e) => {
                    if (value !== customer._id) {
                      e.currentTarget.style.background = '#f8fafc';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (value !== customer._id) {
                      e.currentTarget.style.background = 'white';
                    }
                  }}
                >
                  <div style={avatarStyle}>
                    {customer.name
                      ?.substring(0, 2)
                      .toUpperCase()}
                  </div>

                  <div
                    style={{
                      flex: 1,
                      minWidth: 0,
                    }}
                  >
                    <div
                      style={{
                        fontWeight: 600,
                        fontSize: isMobile ? '0.875rem' : '0.9rem',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {customer.name}
                    </div>

                    {customer.email && (
                      <div
                        style={{
                          fontSize: isMobile ? '0.7rem' : '0.8rem',
                          color: '#64748b',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {customer.email}
                      </div>
                    )}

                    {isMobile && customer.phone && !customer.email && (
                      <div
                        style={{
                          fontSize: '0.7rem',
                          color: '#64748b',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {customer.phone}
                      </div>
                    )}
                  </div>

                  {value === customer._id && (
                    <CheckCircle
                      size={isMobile ? 16 : 20}
                      color="#10b981"
                      style={{ flexShrink: 0 }}
                    />
                  )}
                </div>
              ))
            ) : (
              <div
                style={{
                  padding: isMobile ? '2rem 1rem' : '2.5rem',
                  textAlign: 'center',
                }}
              >
                <Users 
                  size={isMobile ? 36 : 48} 
                  color="#cbd5e1"
                  style={{ margin: '0 auto' }}
                />

                <p
                  style={{
                    marginTop: '0.75rem',
                    color: '#64748b',
                    fontSize: isMobile ? '0.875rem' : '0.9rem',
                  }}
                >
                  {searchTerm
                    ? `No results for "${searchTerm}"`
                    : 'No customers found'}
                </p>

                {companyId && !searchTerm && (
                  <button
                    onClick={handleSync}
                    style={{
                      marginTop: '1rem',
                      padding: '0.5rem 1rem',
                      background: '#0f172a',
                      color: 'white',
                      border: 'none',
                      borderRadius: '10px',
                      fontSize: isMobile ? '0.75rem' : '0.8rem',
                      fontWeight: 500,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                    }}
                  >
                    <Loader2 size={14} style={{ animation: 'cs-spin 1s linear infinite' }} />
                    Sync from Zoho
                  </button>
                )}
              </div>
            )}
          </div>

          {/* ========================= */}
          {/* Mobile Close Button */}
          {/* ========================= */}
          {isMobile && (
            <div
              style={{
                padding: '12px 16px',
                borderTop: '1px solid #f1f5f9',
                background: 'white',
              }}
            >
              <button
                onClick={closeDropdown}
                style={{
                  width: '100%',
                  padding: '12px',
                  background: '#f1f5f9',
                  border: 'none',
                  borderRadius: '12px',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  color: '#64748b',
                  cursor: 'pointer',
                }}
              >
                Close
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default CustomerSelector;