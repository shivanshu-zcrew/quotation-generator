// components/CustomerSelector.jsx (Fully Responsive with Tailwind-like inline styles)
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
  Building2,
  Phone,
  Mail,
} from 'lucide-react';

import useCustomerStore from '../services/customerStore';

// ============================================================
// HELPER: Get VAT Type Display
// ============================================================
const getVatTypeDisplay = (customer) => {
  const taxTreatment = customer?.taxTreatment || customer?.customerTaxTreatment || '';
  
  const vatTypeMap = {
    'vat_registered': { 
      label: 'VAT Registered', 
      labelShort: 'VAT Reg',
      color: '#059669', 
      bg: '#d1fae5', 
      icon: '✓',
    },
    'non_vat_registered': { 
      label: 'Non-VAT Registered', 
      labelShort: 'Non-VAT',
      color: '#d97706', 
      bg: '#fed7aa', 
      icon: '○',
    },
    'gcc_vat_registered': { 
      label: 'GCC VAT Registered', 
      labelShort: 'GCC VAT',
      color: '#2563eb', 
      bg: '#dbeafe', 
      icon: '◉',
    },
    'gcc_non_vat_registered': { 
      label: 'GCC Non-VAT Registered', 
      labelShort: 'GCC Non-VAT',
      color: '#7c3aed', 
      bg: '#ede9fe', 
      icon: '◌',
    },
  };
  
  return vatTypeMap[taxTreatment] || { 
    label: 'Not Set', 
    labelShort: 'Not Set',
    color: '#6b7280', 
    bg: '#f3f4f6', 
    icon: '?',
  };
};

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
  const [windowWidth, setWindowWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1200);

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
    const handleResize = () => {
      setWindowWidth(window.innerWidth);
    };
    
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const isMobile = windowWidth < 640;
  const isTablet = windowWidth >= 640 && windowWidth < 768;
  const isSmallMobile = windowWidth < 480;

  // =========================
  // Display Customers
  // =========================
  const displayCustomers = useMemo(() => {
    let list;

    const term = searchTerm.toLowerCase().trim();

    if (term.length >= 2) {
      list = isSearching ? [] : searchResults;
    } else if (term.length > 0) {
      list = customers.filter(
        (customer) =>
          customer.name?.toLowerCase().includes(term) ||
          customer.email?.toLowerCase().includes(term) ||
          customer.phone?.includes(term)
      );
    } else {
      list = customers;
    }

    return list.filter((c) => c.isActive !== false);
  }, [customers, searchTerm, isSearching, searchResults]);

  // =========================
  // Selected Customer
  // =========================
  const selectedCustomer = useMemo(() => {
    return customers.find((c) => c._id === value) || null;
  }, [customers, value]);

  const selectedVatType = useMemo(() => {
    if (!selectedCustomer) return null;
    return getVatTypeDisplay(selectedCustomer);
  }, [selectedCustomer]);

  // =========================
  // Open / Close Dropdown
  // =========================
  const openDropdown = useCallback(() => {
    setIsOpen(true);
    // Prevent body scroll on mobile when dropdown is open
    if (isMobile) {
      document.body.style.overflow = 'hidden';
    }
  }, [isMobile]);

  const closeDropdown = useCallback(() => {
    setIsOpen(false);
    // Restore body scroll
    if (isMobile) {
      document.body.style.overflow = '';
    }
  }, [isMobile]);

  // =========================
  // Focus Input
  // =========================
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
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
  // Cleanup Timeout & Body Scroll
  // =========================
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      if (isMobile) {
        document.body.style.overflow = '';
      }
    };
  }, [isMobile]);

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
      if (dropdownRef.current && !dropdownRef.current.contains(e.target) && !isMobile) {
        closeDropdown();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [closeDropdown, isMobile]);

  // =========================
  // Auto Load Customers
  // =========================
  useEffect(() => {
    if (autoLoad && companyId && !isLoaded && !isLoading) {
      loadAllCustomers(companyId);
    }
  }, [autoLoad, companyId, isLoaded, isLoading, loadAllCustomers]);

  // =========================
  // Inject Global Styles
  // =========================
  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      @keyframes cs-spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }
    `;
    document.head.appendChild(style);
    return () => document.head.removeChild(style);
  }, []);

  // ============================================================
  // RESPONSIVE STYLES
  // ============================================================
  
  // Trigger Button Styles
  const getTriggerStyles = () => ({
    container: {
      width: '100%',
      minHeight: isSmallMobile ? '42px' : isMobile ? '44px' : '48px',
      border: '1.5px solid #e2e8f0',
      borderRadius: isSmallMobile ? '10px' : isMobile ? '12px' : '14px',
      background: '#fafbff',
      padding: isSmallMobile ? '0 10px' : isMobile ? '0 12px' : '0 16px',
      display: 'flex',
      alignItems: 'center',
      gap: isSmallMobile ? '8px' : isMobile ? '10px' : '12px',
      cursor: 'pointer',
      transition: 'all 0.2s ease',
      boxSizing: 'border-box',
    },
    avatar: {
      width: isSmallMobile ? '28px' : isMobile ? '32px' : '36px',
      height: isSmallMobile ? '28px' : isMobile ? '32px' : '36px',
      borderRadius: isSmallMobile ? '8px' : isMobile ? '10px' : '12px',
      background: selectedVatType?.bg || 'linear-gradient(135deg, #0f172a, #1e293b)',
      color: selectedVatType?.color || 'white',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontWeight: 700,
      fontSize: isSmallMobile ? '0.7rem' : isMobile ? '0.75rem' : '0.85rem',
      flexShrink: 0,
    },
    infoContainer: {
      flex: 1,
      minWidth: 0,
    },
    name: {
      fontWeight: 600,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
      fontSize: isSmallMobile ? '0.8rem' : isMobile ? '0.85rem' : '0.9rem',
      color: '#0f172a',
    },
    badgeContainer: {
      display: 'flex',
      alignItems: 'center',
      gap: '4px',
      flexWrap: 'wrap',
      marginTop: '2px',
    },
    badge: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '3px',
      padding: isSmallMobile ? '2px 6px' : '3px 8px',
      borderRadius: '20px',
      fontSize: isSmallMobile ? '0.55rem' : isMobile ? '0.6rem' : '0.65rem',
      fontWeight: 600,
      whiteSpace: 'nowrap',
    },
    clearButton: {
      border: 'none',
      background: 'transparent',
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: isSmallMobile ? '6px' : '8px',
      borderRadius: '6px',
      flexShrink: 0,
    },
    placeholderText: {
      color: '#94a3b8',
      flex: 1,
      fontSize: isSmallMobile ? '0.8rem' : isMobile ? '0.85rem' : '0.9rem',
    },
    chevron: {
      transition: 'transform 0.2s ease',
      flexShrink: 0,
      color: '#64748b',
    },
  });

  // Dropdown Styles
  const getDropdownStyles = () => ({
    container: {
      position: isMobile ? 'fixed' : 'absolute',
      top: isMobile ? 'auto' : 'calc(100% + 8px)',
      bottom: isMobile ? '0' : 'auto',
      left: isMobile ? '0' : '0',
      right: isMobile ? '0' : '0',
      background: 'white',
      border: isMobile ? 'none' : '1px solid #e2e8f0',
      borderRadius: isMobile ? '20px 20px 0 0' : '12px',
      boxShadow: isMobile 
        ? '0 -4px 20px rgba(0,0,0,0.15)'
        : '0 4px 20px rgba(0,0,0,0.1)',
      overflow: 'hidden',
      zIndex: 1000,
      maxHeight: isMobile ? '80vh' : '400px',
      display: 'flex',
      flexDirection: 'column',
    },
    searchContainer: {
      padding: isSmallMobile ? '12px' : isMobile ? '14px' : '16px',
      borderBottom: '1px solid #f1f5f9',
      background: 'white',
      position: 'sticky',
      top: 0,
      zIndex: 2,
    },
    searchWrapper: {
      position: 'relative',
    },
    searchIcon: {
      position: 'absolute',
      left: isSmallMobile ? '10px' : '12px',
      top: '50%',
      transform: 'translateY(-50%)',
      color: '#94a3b8',
      pointerEvents: 'none',
    },
    searchInput: {
      width: '100%',
      padding: isSmallMobile ? '10px 10px 10px 36px' : isMobile ? '12px 12px 12px 40px' : '10px 12px 10px 42px',
      border: '1px solid #e2e8f0',
      borderRadius: isSmallMobile ? '10px' : '12px',
      fontSize: isSmallMobile ? '0.85rem' : '0.9rem',
      outline: 'none',
      boxSizing: 'border-box',
      backgroundColor: '#f8fafc',
    },
    clearSearchButton: {
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
      borderRadius: '4px',
    },
    resultsContainer: {
      flex: 1,
      overflowY: 'auto',
      WebkitOverflowScrolling: 'touch',
    },
    loadingState: {
      padding: isMobile ? '40px 20px' : '60px',
      textAlign: 'center',
    },
    emptyState: {
      padding: isMobile ? '40px 20px' : '60px',
      textAlign: 'center',
    },
    closeButtonContainer: {
      padding: isSmallMobile ? '12px' : '16px',
      borderTop: '1px solid #f1f5f9',
      background: 'white',
    },
    closeButton: {
      width: '100%',
      padding: isSmallMobile ? '12px' : '14px',
      background: '#f1f5f9',
      border: 'none',
      borderRadius: isSmallMobile ? '10px' : '12px',
      fontSize: isSmallMobile ? '0.85rem' : '0.9rem',
      fontWeight: 600,
      color: '#475569',
      cursor: 'pointer',
    },
  });

  // Customer Item Styles
  const getCustomerItemStyles = (isSelected = false) => ({
    container: {
      padding: isSmallMobile ? '12px' : isMobile ? '14px' : '12px 16px',
      display: 'flex',
      alignItems: 'center',
      gap: isSmallMobile ? '10px' : isMobile ? '12px' : '14px',
      cursor: 'pointer',
      borderBottom: '1px solid #f8fafc',
      backgroundColor: isSelected ? '#f0fdf4' : 'white',
      transition: 'background 0.2s',
    },
    avatar: {
      width: isSmallMobile ? '36px' : isMobile ? '40px' : '44px',
      height: isSmallMobile ? '36px' : isMobile ? '40px' : '44px',
      borderRadius: isSmallMobile ? '10px' : '12px',
      background: 'linear-gradient(135deg, #0f172a, #1e293b)',
      color: 'white',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontWeight: 700,
      fontSize: isSmallMobile ? '0.8rem' : isMobile ? '0.85rem' : '0.9rem',
      flexShrink: 0,
    },
    infoContainer: {
      flex: 1,
      minWidth: 0,
    },
    name: {
      fontWeight: 600,
      fontSize: isSmallMobile ? '0.85rem' : isMobile ? '0.9rem' : '0.95rem',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
      marginBottom: '4px',
      color: '#0f172a',
    },
    badgeContainer: {
      display: 'flex',
      alignItems: 'center',
      gap: '4px',
      flexWrap: 'wrap',
      marginBottom: '4px',
    },
    badge: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '3px',
      padding: '2px 6px',
      borderRadius: '20px',
      fontSize: isSmallMobile ? '0.55rem' : '0.6rem',
      fontWeight: 600,
      whiteSpace: 'nowrap',
    },
    contactInfo: {
      display: 'flex',
      flexDirection: isMobile ? 'column' : 'row',
      gap: isMobile ? '4px' : '8px',
      alignItems: isMobile ? 'flex-start' : 'center',
    },
    email: {
      display: 'flex',
      alignItems: 'center',
      gap: '3px',
      fontSize: isSmallMobile ? '0.6rem' : '0.65rem',
      color: '#64748b',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
      maxWidth: isMobile ? '180px' : '250px',
    },
    phone: {
      display: 'flex',
      alignItems: 'center',
      gap: '3px',
      fontSize: isSmallMobile ? '0.6rem' : '0.65rem',
      color: '#64748b',
    },
  });

  const triggerStyles = getTriggerStyles();
  const dropdownStyles = getDropdownStyles();

  return (
    <div
      ref={dropdownRef}
      style={{
        position: 'relative',
        width: '100%',
      }}
    >
      {/* ========================= */}
      {/* Trigger Button */}
      {/* ========================= */}
      <div onClick={openDropdown} style={triggerStyles.container}>
        {selectedCustomer ? (
          <>
            <div style={triggerStyles.avatar}>
              {selectedCustomer.name?.substring(0, 2).toUpperCase()}
            </div>

            <div style={triggerStyles.infoContainer}>
              <div style={triggerStyles.name}>
                {selectedCustomer.name}
              </div>
              
              
            </div>

            <button
              type="button"
              onClick={handleClear}
              style={triggerStyles.clearButton}
              onMouseEnter={(e) => e.currentTarget.style.background = '#fef2f2'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
            >
              <X size={isSmallMobile ? 14 : 16} color="#ef4444" />
            </button>
          </>
        ) : (
          <>
            <Search size={isSmallMobile ? 16 : 18} color="#94a3b8" />
            <span style={triggerStyles.placeholderText}>
              {placeholder}
            </span>
          </>
        )}

        <ChevronDown
          size={isSmallMobile ? 16 : 18}
          style={{
            ...triggerStyles.chevron,
            transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
          }}
        />
      </div>

      {/* ========================= */}
      {/* Dropdown */}
      {/* ========================= */}
      {isOpen && (
        <div style={dropdownStyles.container}>
          {/* Search Input */}
          <div style={dropdownStyles.searchContainer}>
            <div style={dropdownStyles.searchWrapper}>
              <Search size={isSmallMobile ? 14 : 16} style={dropdownStyles.searchIcon} />
              <input
                ref={inputRef}
                type="text"
                value={searchTerm}
                placeholder="Search by name, email or phone..."
                onClick={(e) => e.stopPropagation()}
                onChange={handleSearchChange}
                style={dropdownStyles.searchInput}
              />
              {searchTerm && (
                <button
                  onClick={() => {
                    setSearchTerm('');
                    clearSearch();
                  }}
                  style={dropdownStyles.clearSearchButton}
                >
                  <X size={isSmallMobile ? 12 : 14} color="#94a3b8" />
                </button>
              )}
            </div>
          </div>

          {/* Results */}
          <div style={dropdownStyles.resultsContainer}>
            {isSearching ? (
              <div style={dropdownStyles.loadingState}>
                <Loader2
                  size={isMobile ? 32 : 40}
                  style={{
                    animation: 'cs-spin 1s linear infinite',
                    margin: '0 auto',
                    color: '#0f172a',
                  }}
                />
                <p style={{ marginTop: '12px', color: '#64748b', fontSize: '0.875rem' }}>
                  Searching...
                </p>
              </div>
            ) : displayCustomers.length > 0 ? (
              displayCustomers.map((customer) => {
                const customerVatType = getVatTypeDisplay(customer);
                const isSelected = value === customer._id;
                const itemStyles = getCustomerItemStyles(isSelected);
                
                return (
                  <div
                    key={customer._id}
                    onClick={() => handleSelect(customer)}
                    style={itemStyles.container}
                  >
                    <div style={itemStyles.avatar}>
                      {customer.name?.substring(0, 2).toUpperCase()}
                    </div>

                    <div style={itemStyles.infoContainer}>
                      <div style={itemStyles.name}>
                        {customer.name}
                      </div>

                      {customerVatType && (
                        <div style={itemStyles.badgeContainer}>
                          <span style={{
                            ...itemStyles.badge,
                            backgroundColor: customerVatType.bg,
                            color: customerVatType.color,
                          }}>
                            <span>{customerVatType.icon}</span>
                            <span>{isMobile ? customerVatType.labelShort : customerVatType.label}</span>
                          </span>
                        </div>
                      )}

                      <div style={itemStyles.contactInfo}>
                        {customer.email && (
                          <div style={itemStyles.email}>
                            <Mail size={isSmallMobile ? 10 : 12} />
                            <span>{customer.email}</span>
                          </div>
                        )}
                        {customer.phone && (
                          <div style={itemStyles.phone}>
                            <Phone size={isSmallMobile ? 10 : 12} />
                            <span>{customer.phone}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {isSelected && (
                      <CheckCircle
                        size={isSmallMobile ? 16 : 18}
                        color="#10b981"
                        style={{ flexShrink: 0 }}
                      />
                    )}
                  </div>
                );
              })
            ) : (
              <div style={dropdownStyles.emptyState}>
                <Users size={isMobile ? 40 : 48} color="#cbd5e1" style={{ margin: '0 auto' }} />
                <p style={{ marginTop: '12px', color: '#64748b', fontSize: '0.875rem' }}>
                  {searchTerm ? `No results for "${searchTerm}"` : 'No customers found'}
                </p>
                {companyId && !searchTerm && (
                  <button
                    onClick={handleSync}
                    style={{
                      marginTop: '16px',
                      padding: isMobile ? '10px 20px' : '12px 24px',
                      background: '#0f172a',
                      color: 'white',
                      border: 'none',
                      borderRadius: '10px',
                      fontSize: '0.8rem',
                      fontWeight: 500,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '8px',
                    }}
                  >
                    <Loader2 size={14} style={{ animation: 'cs-spin 1s linear infinite' }} />
                    Sync from Zoho
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Mobile Close Button */}
          {isMobile && (
            <div style={dropdownStyles.closeButtonContainer}>
              <button onClick={closeDropdown} style={dropdownStyles.closeButton}>
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