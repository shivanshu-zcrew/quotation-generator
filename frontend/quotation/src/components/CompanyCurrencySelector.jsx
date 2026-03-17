// components/CompanyCurrencySelector.jsx
import React, { useState, useEffect, useMemo } from 'react';
import { Building2, DollarSign, ChevronDown, RefreshCw } from 'lucide-react';
import { useAppStore } from '../services/store';

// Currency symbols and flags
const CURRENCY_METADATA = {
  AED: { symbol: 'د.إ', name: 'UAE Dirham', flag: '🇦🇪', decimalPlaces: 2 },
  SAR: { symbol: '﷼', name: 'Saudi Riyal', flag: '🇸🇦', decimalPlaces: 2 },
  QAR: { symbol: '﷼', name: 'Qatari Riyal', flag: '🇶🇦', decimalPlaces: 2 },
  KWD: { symbol: 'د.ك', name: 'Kuwaiti Dinar', flag: '🇰🇼', decimalPlaces: 3 },
  BHD: { symbol: '.د.ب', name: 'Bahraini Dinar', flag: '🇧🇭', decimalPlaces: 3 },
  OMR: { symbol: '﷼', name: 'Omani Rial', flag: '🇴🇲', decimalPlaces: 3 },
  USD: { symbol: '$', name: 'US Dollar', flag: '🇺🇸', decimalPlaces: 2 },
  EUR: { symbol: '€', name: 'Euro', flag: '🇪🇺', decimalPlaces: 2 },
  GBP: { symbol: '£', name: 'British Pound', flag: '🇬🇧', decimalPlaces: 2 }
};

// =============================================================
// Main Selector Component
// =============================================================
export const CompanyCurrencySelector = ({ 
  variant = 'full', // 'full', 'compact', 'minimal'
  showLabels = true,
  disabled = false,
  onCompanyChange,
  onCurrencyChange,
  className = '',
}) => {
  const {
    companies,
    selectedCompany,
    selectedCurrency,
    setSelectedCompany,
    setSelectedCurrency,
    exchangeRates,
    fetchExchangeRates,
    fetchQuotationsForCompany // Add this
  } = useAppStore();

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isChanging, setIsChanging] = useState(false);

  // Get accepted currencies for selected company
  const acceptedCurrencies = useMemo(() => {
    const company = companies?.find(c => c._id === selectedCompany || c.code === selectedCompany);
    return company?.acceptedCurrencies || ['AED'];
  }, [companies, selectedCompany]);

  // Get current company details
  const currentCompany = useMemo(() => {
    return companies?.find(c => c._id === selectedCompany || c.code === selectedCompany);
  }, [companies, selectedCompany]);

  const handleCompanyChange = async (e) => {
    const newCompanyId = e.target.value;
    if (!newCompanyId || isChanging) return;
    
    setIsChanging(true);
    
    try {
      // Find the selected company
      const company = companies?.find(c => c._id === newCompanyId || c.code === newCompanyId);
      
      if (company) {
        // Set company in store (this will trigger quotation refetch automatically)
        setSelectedCompany(company._id);
        
        // Set default currency from company
        if (company.baseCurrency) {
          setSelectedCurrency(company.baseCurrency);
          onCurrencyChange?.(company.baseCurrency);
        }
        
        onCompanyChange?.(company._id);
      }
    } finally {
      setIsChanging(false);
    }
  };

  const handleCurrencyChange = (e) => {
    const newCurrency = e.target.value;
    setSelectedCurrency(newCurrency);
    onCurrencyChange?.(newCurrency);
  };

  const handleRefreshRates = async () => {
    setIsRefreshing(true);
    await fetchExchangeRates(selectedCurrency);
    setIsRefreshing(false);
  };

  const handleManualRefresh = async () => {
    if (selectedCompany) {
      await fetchQuotationsForCompany(selectedCompany);
    }
  };

  // Full version with both dropdowns and labels
  if (variant === 'full') {
    return (
      <div className={`company-currency-selector ${className}`} style={styles.container}>
        {showLabels && <div style={styles.label}>Company & Currency</div>}
        
        <div style={styles.row}>
          {/* Company Dropdown */}
          <div style={styles.selectWrapper}>
            <Building2 size={16} style={styles.icon} />
            <select
              value={selectedCompany || ''}
              onChange={handleCompanyChange}
              disabled={disabled || !companies?.length || isChanging}
              style={styles.select}
            >
              {!companies?.length && <option value="">Loading companies...</option>}
              {companies?.map((company) => (
                <option key={company._id} value={company._id}>
                  {company.logo ? '🏢' : '🏢'} {company.name} ({company.code})
                </option>
              ))}
            </select>
            <ChevronDown size={14} style={styles.chevron} />
          </div>

          {/* Currency Dropdown */}
          <div style={styles.selectWrapper}>
            <DollarSign size={16} style={styles.icon} />
            <select
              value={selectedCurrency}
              onChange={handleCurrencyChange}
              disabled={disabled}
              style={styles.select}
            >
              {acceptedCurrencies.map(code => (
                <option key={code} value={code}>
                  {CURRENCY_METADATA[code]?.flag} {CURRENCY_METADATA[code]?.name} ({CURRENCY_METADATA[code]?.symbol})
                </option>
              ))}
            </select>
            <ChevronDown size={14} style={styles.chevron} />
          </div>

          {/* Action Buttons */}
          <div style={styles.actionGroup}>
            <button
              onClick={handleRefreshRates}
              disabled={isRefreshing}
              style={styles.iconButton}
              title="Refresh exchange rates"
            >
              <RefreshCw size={14} style={isRefreshing ? { animation: 'spin 1s linear infinite' } : {}} />
            </button>
            {/* <button
              onClick={handleManualRefresh}
              disabled={!selectedCompany}
              style={styles.iconButton}
              title="Refresh quotations"
            >
              <RefreshCw size={14} />
            </button> */}
          </div>
        </div>

        {/* Exchange Rate Info */}
        {/* {exchangeRates && (
          <div style={styles.rateInfo}>
            <span>1 {selectedCurrency} = {exchangeRates.rates?.['AED']?.toFixed(4)} AED</span>
            {exchangeRates.source && (
              <span style={{
                ...styles.sourceBadge,
                backgroundColor: exchangeRates.source === 'api' ? '#dcfce7' : 
                               exchangeRates.source === 'cache' ? '#fef3c7' : '#fee2e2',
                color: exchangeRates.source === 'api' ? '#166534' : 
                      exchangeRates.source === 'cache' ? '#92400e' : '#991b1b',
              }}>
                {exchangeRates.source === 'api' ? 'Live' : 
                 exchangeRates.source === 'cache' ? 'Cached' : 'Fallback'}
              </span>
            )}
            {exchangeRates.fetchedAt && (
              <span style={styles.timestamp}>
                Updated: {new Date(exchangeRates.fetchedAt).toLocaleTimeString()}
              </span>
            )}
          </div>
        )} */}

        {/* Company Info */}
        {/* {currentCompany && (
          <div style={styles.companyInfo}>
            <span style={styles.companyDetail}>VAT: {currentCompany.vatNumber}</span>
            <span style={styles.companyDetail}>CR: {currentCompany.crNumber}</span>
          </div>
        )} */}
      </div>
    );
  }

  // Compact version (for headers/navbars)
  if (variant === 'compact') {
    return (
      <div className={`company-currency-selector ${className}`} style={styles.compactContainer}>
        <select
          value={selectedCompany || ''}
          onChange={handleCompanyChange}
          disabled={disabled || !companies?.length || isChanging}
          style={styles.compactSelect}
          title="Select Company"
        >
          {!companies?.length && <option value="">Loading...</option>}
          {companies?.map((company) => (
            <option key={company._id} value={company._id}>
              {company.logo ? '🏢' : '🏢'} {company.code}
            </option>
          ))}
        </select>

        <select
          value={selectedCurrency}
          onChange={handleCurrencyChange}
          disabled={disabled}
          style={styles.compactSelect}
          title="Select Currency"
        >
          {acceptedCurrencies.map(code => (
            <option key={code} value={code}>
              {CURRENCY_METADATA[code]?.flag} {code}
            </option>
          ))}
        </select>

        <button
          onClick={handleRefreshRates}
          disabled={isRefreshing}
          style={styles.compactRefreshBtn}
          title="Refresh rates"
        >
          <RefreshCw size={12} style={isRefreshing ? { animation: 'spin 1s linear infinite' } : {}} />
        </button>
      </div>
    );
  }

  // Minimal version (just company dropdown)
  return (
    <div className={`company-currency-selector ${className}`} style={styles.minimalContainer}>
      <select
        value={selectedCompany || ''}
        onChange={handleCompanyChange}
        disabled={disabled || !companies?.length || isChanging}
        style={styles.minimalSelect}
      >
        {!companies?.length && <option value="">Loading...</option>}
        {companies?.map((company) => (
          <option key={company._id} value={company._id}>
            {company.logo ? '🏢' : '🏢'} {company.name}
          </option>
        ))}
      </select>
    </div>
  );
};

// =============================================================
// Display Component (shows current selection)
// =============================================================
export const CompanyCurrencyDisplay = ({ showRate = true, className = '' }) => {
  const { 
    companies, 
    selectedCompany, 
    selectedCurrency, 
    exchangeRates 
  } = useAppStore();

  const company = useMemo(() => 
    companies?.find(c => c._id === selectedCompany || c.code === selectedCompany), 
    [companies, selectedCompany]
  );

  const currency = CURRENCY_METADATA[selectedCurrency] || CURRENCY_METADATA.AED;

  if (!company) return null;

  return (
    <div className={`company-currency-display ${className}`} style={styles.displayContainer}>
      <div style={styles.displayItem}>
        <Building2 size={14} color="#64748b" />
        <span style={styles.displayText}>
          {company.logo ? '🏢' : '🏢'} {company.code}
        </span>
      </div>
      {/* <div style={styles.displayItem}>
        <DollarSign size={14} color="#64748b" />
        <span style={styles.displayText}>
          {currency.flag} {selectedCurrency} ({currency.symbol})
        </span>
      </div> */}
      {/* {showRate && exchangeRates && (
        <div style={styles.displayItem}>
          <span style={styles.rateText}>
            1 {selectedCurrency} = {exchangeRates.rates?.['AED']?.toFixed(4)} AED
          </span>
          {exchangeRates.source && (
            <span style={{
              ...styles.miniBadge,
              backgroundColor: exchangeRates.source === 'api' ? '#dcfce7' : 
                             exchangeRates.source === 'cache' ? '#fef3c7' : '#fee2e2',
              color: exchangeRates.source === 'api' ? '#166534' : 
                    exchangeRates.source === 'cache' ? '#92400e' : '#991b1b',
            }}>
              {exchangeRates.source === 'api' ? 'Live' : 
               exchangeRates.source === 'cache' ? 'Cached' : 'Fallback'}
            </span>
          )}
        </div>
      )} */}
    </div>
  );
};

// =============================================================
// Hook for using company/currency in components
// =============================================================
export const useCompanyCurrency = () => {
  const {
    companies,
    selectedCompany,
    selectedCurrency,
    setSelectedCompany,
    setSelectedCurrency,
    exchangeRates,
    convertCurrency,
    fetchQuotationsForCompany
  } = useAppStore();

  const company = useMemo(() => 
    companies?.find(c => c._id === selectedCompany || c.code === selectedCompany), 
    [companies, selectedCompany]
  );

  const currency = CURRENCY_METADATA[selectedCurrency] || CURRENCY_METADATA.AED;

  const formatAmount = (amount) => {
    return `${currency.symbol} ${amount.toFixed(currency.decimalPlaces || 2)}`;
  };

  const convertToBase = async (amount) => {
    const result = await convertCurrency(amount, selectedCurrency, company?.baseCurrency || 'AED');
    return result.success ? result.data.result : amount;
  };

  const convertFromBase = async (amount) => {
    const result = await convertCurrency(amount, company?.baseCurrency || 'AED', selectedCurrency);
    return result.success ? result.data.result : amount;
  };

  const acceptedCurrencies = useMemo(() => 
    company?.acceptedCurrencies || ['AED'],
    [company]
  );

  const refreshCompanyData = () => {
    if (selectedCompany) {
      fetchQuotationsForCompany(selectedCompany);
    }
  };

  return {
    // Values
    selectedCompany,
    selectedCurrency,
    company,
    currency,
    exchangeRates,
    acceptedCurrencies,
    companies,
    
    // Actions
    setSelectedCompany,
    setSelectedCurrency,
    
    // Utilities
    formatAmount,
    convertToBase,
    convertFromBase,
    refreshCompanyData,
    
    // Helpers
    isLoaded: !!companies?.length,
    currencySymbol: currency.symbol,
    currencyFlag: currency.flag,
    companyName: company?.name,
    companyCode: company?.code,
    companyVat: company?.vatNumber,
  };
};

// =============================================================
// Styles (Updated)
// =============================================================
const styles = {
  container: {
    marginBottom: '1rem',
  },
  label: {
    fontSize: '0.8rem',
    fontWeight: 600,
    color: '#374151',
    marginBottom: '0.4rem',
  },
  row: {
    display: 'flex',
    gap: '0.5rem',
    alignItems: 'center',
  },
  selectWrapper: {
    position: 'relative',
    flex: 1,
  },
  icon: {
    position: 'absolute',
    left: '10px',
    top: '50%',
    transform: 'translateY(-50%)',
    color: '#94a3b8',
    pointerEvents: 'none',
    zIndex: 1,
  },
  chevron: {
    position: 'absolute',
    right: '10px',
    top: '50%',
    transform: 'translateY(-50%)',
    color: '#94a3b8',
    pointerEvents: 'none',
    zIndex: 1,
  },
  select: {
    width: '100%',
    padding: '0.6rem 2rem 0.6rem 2.2rem',
    border: '1.5px solid #e2e8f0',
    borderRadius: '0.5rem',
    fontSize: '0.875rem',
    backgroundColor: 'white',
    cursor: 'pointer',
    outline: 'none',
    appearance: 'none',
    fontFamily: 'inherit',
    transition: 'border-color 0.15s',
  },
  actionGroup: {
    display: 'flex',
    gap: '0.25rem',
  },
  iconButton: {
    padding: '0.5rem',
    border: '1.5px solid #e2e8f0',
    borderRadius: '0.5rem',
    background: 'white',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#64748b',
    transition: 'all 0.15s',
    ':hover': {
      backgroundColor: '#f8fafc',
      borderColor: '#94a3b8',
    },
    ':disabled': {
      opacity: 0.5,
      cursor: 'not-allowed',
    },
  },
  rateInfo: {
    marginTop: '0.5rem',
    fontSize: '0.75rem',
    color: '#64748b',
    padding: '0.5rem 0.75rem',
    background: '#f8fafc',
    borderRadius: '0.5rem',
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    flexWrap: 'wrap',
  },
  sourceBadge: {
    padding: '2px 8px',
    borderRadius: 999,
    fontSize: '0.7rem',
    fontWeight: 600,
  },
  timestamp: {
    color: '#94a3b8',
    fontSize: '0.7rem',
    marginLeft: 'auto',
  },
  companyInfo: {
    marginTop: '0.25rem',
    fontSize: '0.7rem',
    color: '#94a3b8',
    display: 'flex',
    gap: '1rem',
  },
  companyDetail: {
    padding: '2px 0',
  },
  compactContainer: {
    display: 'flex',
    gap: '0.25rem',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    padding: '0.25rem',
    borderRadius: '0.5rem',
  },
  compactSelect: {
    padding: '0.3rem 1.8rem 0.3rem 0.5rem',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '0.375rem',
    fontSize: '0.8rem',
    backgroundColor: 'rgba(0,0,0,0.2)',
    color: 'white',
    cursor: 'pointer',
    outline: 'none',
    appearance: 'none',
    fontFamily: 'inherit',
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 0.3rem center',
    minWidth: '80px',
    '&:hover': {
      backgroundColor: 'rgba(0,0,0,0.3)',
    },
    '& option': {
      backgroundColor: '#1e293b',
      color: 'white',
    },
  },
  compactRefreshBtn: {
    padding: '0.3rem 0.5rem',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '0.375rem',
    background: 'rgba(0,0,0,0.2)',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#94a3b8',
    transition: 'all 0.15s',
    ':hover': {
      backgroundColor: 'rgba(0,0,0,0.3)',
      color: 'white',
    },
    ':disabled': {
      opacity: 0.5,
      cursor: 'not-allowed',
    },
  },
  minimalContainer: {
    display: 'inline-block',
  },
  minimalSelect: {
    padding: '0.2rem 1.8rem 0.2rem 0.5rem',
    border: '1px solid #e2e8f0',
    borderRadius: '0.375rem',
    fontSize: '0.75rem',
    backgroundColor: 'white',
    cursor: 'pointer',
    outline: 'none',
    appearance: 'none',
    fontFamily: 'inherit',
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 0.3rem center',
  },
  displayContainer: {
    display: 'flex',
    gap: '0.75rem',
    alignItems: 'center',
    padding: '0.25rem 0.75rem',
    background: 'rgba(255,255,255,0.05)',
    borderRadius: '0.5rem',
    fontSize: '0.7rem',
    flexWrap: 'wrap',
  },
  displayItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.25rem',
  },
  displayText: {
    color: '#94a3b8',
    fontWeight: 500,
  },
  rateText: {
    color: '#64748b',
  },
  miniBadge: {
    padding: '1px 4px',
    borderRadius: 999,
    fontSize: '0.6rem',
    fontWeight: 600,
    marginLeft: '0.25rem',
  },
};

// Add global keyframe animation
if (typeof document !== 'undefined') {
  const styleSheet = document.createElement('style');
  styleSheet.textContent = `
    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
  `;
  document.head.appendChild(styleSheet);
}

export default CompanyCurrencySelector;