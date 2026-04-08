// components/CompanyCurrencySelector.jsx (UPDATED FOR MOBILE)
import React, { useState, useEffect, useMemo, useCallback, memo } from 'react';
import { Building2, DollarSign, ChevronDown, RefreshCw } from 'lucide-react';
import { useAppStore } from '../services/store';

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

const CompanyOption = memo(({ company }) => (
  <option key={company._id} value={company._id}>
    {company.name.length > 20 ? company.name.substring(0, 20) + '...' : company.name}
  </option>
));
CompanyOption.displayName = 'CompanyOption';

const CurrencyOption = memo(({ code }) => {
  const currency = CURRENCY_METADATA[code];
  return (
    <option key={code} value={code}>
      {currency?.flag} {code}
    </option>
  );
});
CurrencyOption.displayName = 'CurrencyOption';

export const CompanyCurrencySelector = memo(({ 
  variant = 'full', 
  showLabels = true, 
  disabled = false,
  onCompanyChange, 
  onCurrencyChange, 
  className = '',
  isMobile = false
}) => {
  const {
    companies, selectedCompany, selectedCurrency, setSelectedCompany,
    setSelectedCurrency, fetchExchangeRates, fetchQuotationsForCompany
  } = useAppStore();

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isChanging, setIsChanging] = useState(false);

  const acceptedCurrencies = useMemo(() => {
    const company = companies?.find(c => c._id === selectedCompany || c.code === selectedCompany);
    return company?.acceptedCurrencies || ['AED'];
  }, [companies, selectedCompany]);

  const handleCompanyChange = useCallback(async (e) => {
    const newCompanyId = e.target.value;
    if (!newCompanyId || isChanging) return;
    
    setIsChanging(true);
    try {
      const company = companies?.find(c => c._id === newCompanyId || c.code === newCompanyId);
      if (company) {
        setSelectedCompany(company._id);
        if (company.baseCurrency) {
          setSelectedCurrency(company.baseCurrency);
          onCurrencyChange?.(company.baseCurrency);
        }
        onCompanyChange?.(company._id);
      }
    } finally {
      setIsChanging(false);
    }
  }, [companies, setSelectedCompany, setSelectedCurrency, onCompanyChange, onCurrencyChange, isChanging]);

  const handleCurrencyChange = useCallback((e) => {
    const newCurrency = e.target.value;
    setSelectedCurrency(newCurrency);
    onCurrencyChange?.(newCurrency);
  }, [setSelectedCurrency, onCurrencyChange]);

  const handleRefreshRates = useCallback(async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    await fetchExchangeRates(selectedCurrency);
    setIsRefreshing(false);
  }, [fetchExchangeRates, selectedCurrency, isRefreshing]);

  // Mobile compact variant
  if (isMobile) {
    const currentCompany = companies?.find(c => c._id === selectedCompany || c.code === selectedCompany);
    
    return (
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
        <select 
          value={selectedCompany || ''} 
          onChange={handleCompanyChange} 
          disabled={disabled || !companies?.length || isChanging}
          style={{
            padding: '0.35rem 1.5rem 0.35rem 0.5rem',
            fontSize: '0.7rem',
            borderRadius: '8px',
            border: '1px solid rgba(255,255,255,0.2)',
            backgroundColor: 'rgba(255,255,255,0.1)',
            color: 'white',
            cursor: 'pointer',
            outline: 'none',
            maxWidth: '120px',
            textOverflow: 'ellipsis',
            fontFamily: 'inherit'
          }}
          title={currentCompany?.name}
        >
          {!companies?.length && <option value="">Loading...</option>}
          {companies?.map(company => (
            <option key={company._id} value={company._id} style={{ color: '#0f172a' }}>
              {company.name.length > 15 ? company.name.substring(0, 12) + '...' : company.name}
            </option>
          ))}
        </select>
        
        <select 
          value={selectedCurrency} 
          onChange={handleCurrencyChange} 
          disabled={disabled}
          style={{
            padding: '0.35rem 1.5rem 0.35rem 0.5rem',
            fontSize: '0.7rem',
            borderRadius: '8px',
            border: '1px solid rgba(255,255,255,0.2)',
            backgroundColor: 'rgba(255,255,255,0.1)',
            color: 'white',
            cursor: 'pointer',
            outline: 'none',
            fontFamily: 'inherit'
          }}
        >
          {acceptedCurrencies.map(code => (
            <option key={code} value={code} style={{ color: '#0f172a' }}>{code}</option>
          ))}
        </select>
        
        <button 
          onClick={handleRefreshRates} 
          disabled={isRefreshing}
          style={{
            padding: '0.35rem',
            borderRadius: '8px',
            border: '1px solid rgba(255,255,255,0.2)',
            backgroundColor: 'rgba(255,255,255,0.1)',
            cursor: isRefreshing ? 'not-allowed' : 'pointer',
            color: 'white',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: isRefreshing ? 0.5 : 1
          }}
          title="Refresh rates"
        >
          <RefreshCw size={12} style={isRefreshing ? { animation: 'spin 1s linear infinite' } : {}} />
        </button>
      </div>
    );
  }

  // Desktop full variant
  if (variant === 'full') {
    return (
      <div className={`company-currency-selector ${className}`} style={styles.container}>
        {showLabels && <div style={styles.label}>Company & Currency</div>}
        <div style={styles.row}>
          <div style={styles.selectWrapper}>
            <Building2 size={16} style={styles.icon} />
            <select 
              value={selectedCompany || ''} 
              onChange={handleCompanyChange} 
              disabled={disabled || !companies?.length || isChanging} 
              style={styles.select}
            >
              {!companies?.length && <option value="">Loading companies...</option>}
              {companies?.map(company => (
                <CompanyOption key={company._id} company={company} />
              ))}
            </select>
            <ChevronDown size={14} style={styles.chevron} />
          </div>
          
          <div style={styles.selectWrapper}>
            <DollarSign size={16} style={styles.icon} />
            <select 
              value={selectedCurrency} 
              onChange={handleCurrencyChange} 
              disabled={disabled} 
              style={styles.select}
            >
              {acceptedCurrencies.map(code => (
                <CurrencyOption key={code} code={code} />
              ))}
            </select>
            <ChevronDown size={14} style={styles.chevron} />
          </div>
          
          <div style={styles.actionGroup}>
            <button 
              onClick={handleRefreshRates} 
              disabled={isRefreshing} 
              style={styles.iconButton} 
              title="Refresh exchange rates"
            >
              <RefreshCw size={14} style={isRefreshing ? { animation: 'spin 1s linear infinite' } : {}} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Desktop compact variant
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
          {companies?.map(company => (
            <option key={company._id} value={company._id}>🏢 {company.name.length > 25 ? company.name.substring(0, 22) + '...' : company.name}</option>
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
            <option key={code} value={code}>{CURRENCY_METADATA[code]?.flag} {code}</option>
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

  // Minimal variant
  return (
    <div className={`company-currency-selector ${className}`} style={styles.minimalContainer}>
      <select 
        value={selectedCompany || ''} 
        onChange={handleCompanyChange} 
        disabled={disabled || !companies?.length || isChanging} 
        style={styles.minimalSelect}
      >
        {!companies?.length && <option value="">Loading...</option>}
        {companies?.map(company => (
          <option key={company._id} value={company._id}>🏢 {company.name.length > 20 ? company.name.substring(0, 17) + '...' : company.name}</option>
        ))}
      </select>
    </div>
  );
});
CompanyCurrencySelector.displayName = 'CompanyCurrencySelector';

export const CompanyCurrencyDisplay = memo(({ showRate = true, className = '', isMobile = false }) => {
  const { companies, selectedCompany, selectedCurrency, exchangeRates } = useAppStore();
  
  const company = useMemo(() => 
    companies?.find(c => c._id === selectedCompany || c.code === selectedCompany),
    [companies, selectedCompany]
  );
  
  if (!company) return null;
  
  if (isMobile) {
    return (
      <div style={{ 
        fontSize: '0.65rem', 
        color: '#94a3b8',
        marginTop: '2px'
      }}>
        {company.name.length > 20 ? company.name.substring(0, 18) + '...' : company.name}
      </div>
    );
  }
  
  return (
    <div className={`company-currency-display ${className}`} style={styles.displayContainer}>
      <div style={styles.displayItem}>
        <Building2 size={14} color="#64748b" />
        <span style={styles.displayText}>🏢 {company.name}</span>
      </div>
    </div>
  );
});
CompanyCurrencyDisplay.displayName = 'CompanyCurrencyDisplay';

export const useCompanyCurrency = () => {
  const {
    companies, selectedCompany, selectedCurrency, setSelectedCompany,
    setSelectedCurrency, exchangeRates, convertCurrency, fetchQuotationsForCompany
  } = useAppStore();

  const company = useMemo(() => 
    companies?.find(c => c._id === selectedCompany || c.code === selectedCompany),
    [companies, selectedCompany]
  );
  
  const currency = CURRENCY_METADATA[selectedCurrency] || CURRENCY_METADATA.AED;
  const acceptedCurrencies = useMemo(() => company?.acceptedCurrencies || ['AED'], [company]);

  const formatAmount = useCallback((amount) => 
    `${currency.symbol} ${amount.toFixed(currency.decimalPlaces || 2)}`,
    [currency.symbol, currency.decimalPlaces]
  );
  
  const convertToBase = useCallback(async (amount) => {
    const result = await convertCurrency(amount, selectedCurrency, company?.baseCurrency || 'AED');
    return result.success ? result.data.result : amount;
  }, [convertCurrency, selectedCurrency, company?.baseCurrency]);
  
  const convertFromBase = useCallback(async (amount) => {
    const result = await convertCurrency(amount, company?.baseCurrency || 'AED', selectedCurrency);
    return result.success ? result.data.result : amount;
  }, [convertCurrency, selectedCurrency, company?.baseCurrency]);
  
  const refreshCompanyData = useCallback(() => 
    selectedCompany && fetchQuotationsForCompany(selectedCompany),
    [selectedCompany, fetchQuotationsForCompany]
  );

  return useMemo(() => ({
    selectedCompany, selectedCurrency, company, currency, exchangeRates, acceptedCurrencies, companies,
    setSelectedCompany, setSelectedCurrency, formatAmount, convertToBase, convertFromBase,
    refreshCompanyData, isLoaded: !!companies?.length, currencySymbol: currency.symbol,
    currencyFlag: currency.flag, companyName: company?.name, companyCode: company?.code, companyVat: company?.vatNumber,
  }), [
    selectedCompany, selectedCurrency, company, currency, exchangeRates, acceptedCurrencies, companies,
    setSelectedCompany, setSelectedCurrency, formatAmount, convertToBase, convertFromBase,
    refreshCompanyData, currency.symbol, currency.flag, company?.name, company?.code, company?.vatNumber
  ]);
};

const styles = {
  container: { marginBottom: '1rem' },
  label: { fontSize: '0.8rem', fontWeight: 600, color: '#374151', marginBottom: '0.4rem' },
  row: { display: 'flex', gap: '0.5rem', alignItems: 'center' },
  selectWrapper: { position: 'relative', flex: 1 },
  icon: { position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', pointerEvents: 'none', zIndex: 1 },
  chevron: { position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', pointerEvents: 'none', zIndex: 1 },
  select: { width: '100%', padding: '0.6rem 2rem 0.6rem 2.2rem', border: '1.5px solid #e2e8f0', borderRadius: '0.5rem', fontSize: '0.875rem', backgroundColor: 'white', cursor: 'pointer', outline: 'none', appearance: 'none', fontFamily: 'inherit' },
  actionGroup: { display: 'flex', gap: '0.25rem' },
  iconButton: { padding: '0.5rem', border: '1.5px solid #e2e8f0', borderRadius: '0.5rem', background: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' },
  compactContainer: { display: 'flex', gap: '0.25rem', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.05)', padding: '0.25rem', borderRadius: '0.5rem' },
  compactSelect: { padding: '0.3rem 1.8rem 0.3rem 0.5rem', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '0.375rem', fontSize: '0.8rem', backgroundColor: 'rgba(0,0,0,0.2)', color: 'white', cursor: 'pointer', outline: 'none', appearance: 'none', fontFamily: 'inherit', backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0.3rem center', minWidth: '100px', maxWidth: '150px' },
  compactRefreshBtn: { padding: '0.3rem 0.5rem', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '0.375rem', background: 'rgba(0,0,0,0.2)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' },
  minimalContainer: { display: 'inline-block' },
  minimalSelect: { padding: '0.2rem 1.8rem 0.2rem 0.5rem', border: '1px solid #e2e8f0', borderRadius: '0.375rem', fontSize: '0.75rem', backgroundColor: 'white', cursor: 'pointer', outline: 'none', appearance: 'none', fontFamily: 'inherit', backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0.3rem center' },
  displayContainer: { display: 'flex', gap: '0.75rem', alignItems: 'center', padding: '0.25rem 0.75rem', background: 'rgba(255,255,255,0.05)', borderRadius: '0.5rem', fontSize: '0.7rem', flexWrap: 'wrap' },
  displayItem: { display: 'flex', alignItems: 'center', gap: '0.25rem' },
  displayText: { color: '#94a3b8', fontWeight: 500 },
};

if (typeof document !== 'undefined' && !document.querySelector('#hs-currency-styles')) {
  const styleSheet = document.createElement('style');
  styleSheet.id = 'hs-currency-styles';
  styleSheet.textContent = `@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`;
  document.head.appendChild(styleSheet);
}

export default CompanyCurrencySelector;