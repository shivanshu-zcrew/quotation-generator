// components/LocalCurrencySelector.jsx
import React, { memo, useCallback } from 'react';
import { DollarSign, ChevronDown } from 'lucide-react';

const CURRENCIES = [
  { code: 'AED', symbol: 'د.إ', name: 'UAE Dirham', flag: '🇦🇪' },
  { code: 'SAR', symbol: '﷼', name: 'Saudi Riyal', flag: '🇸🇦' },
  { code: 'QAR', symbol: '﷼', name: 'Qatari Riyal', flag: '🇶🇦' },
  { code: 'KWD', symbol: 'د.ك', name: 'Kuwaiti Dinar', flag: '🇰🇼' },
  { code: 'BHD', symbol: '.د.ب', name: 'Bahraini Dinar', flag: '🇧🇭' },
  { code: 'OMR', symbol: '﷼', name: 'Omani Rial', flag: '🇴🇲' },
  { code: 'USD', symbol: '$', name: 'US Dollar', flag: '🇺🇸' },
  { code: 'EUR', symbol: '€', name: 'Euro', flag: '🇪🇺' },
  { code: 'GBP', symbol: '£', name: 'British Pound', flag: '🇬🇧' }
];

export const LocalCurrencySelector = memo(({ 
  value = 'AED', 
  onChange, 
  disabled = false,
  variant = 'full',
  showLabel = true
}) => {
  
  const handleChange = useCallback((e) => {
    onChange?.(e.target.value);
  }, [onChange]);

  const selectedCurrency = CURRENCIES.find(c => c.code === value);

  if (variant === 'compact') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        {showLabel && <span style={{ fontSize: '0.7rem', color: '#64748b' }}>Currency:</span>}
        <div style={{ position: 'relative' }}>
          <select
            value={value}
            onChange={handleChange}
            disabled={disabled}
            style={{
              padding: '0.3rem 1.8rem 0.3rem 0.5rem',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              fontSize: '0.75rem',
              backgroundColor: 'white',
              cursor: 'pointer',
              outline: 'none',
              appearance: 'none',
              fontFamily: 'inherit'
            }}
          >
            {CURRENCIES.map(currency => (
              <option key={currency.code} value={currency.code}>
                {currency.flag} {currency.code}
              </option>
            ))}
          </select>
          <ChevronDown size={12} style={{
            position: 'absolute',
            right: '8px',
            top: '50%',
            transform: 'translateY(-50%)',
            color: '#94a3b8',
            pointerEvents: 'none'
          }} />
        </div>
      </div>
    );
  }

  return (
    <div style={{ marginBottom: '1rem' }}>
      {showLabel && (
        <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#374151', marginBottom: '0.4rem' }}>
          Currency
        </div>
      )}
      <div style={{ position: 'relative' }}>
        <DollarSign size={16} style={{
          position: 'absolute',
          left: '10px',
          top: '50%',
          transform: 'translateY(-50%)',
          color: '#94a3b8',
          pointerEvents: 'none',
          zIndex: 1
        }} />
        <select
          value={value}
          onChange={handleChange}
          disabled={disabled}
          style={{
            width: '100%',
            padding: '0.6rem 2rem 0.6rem 2.2rem',
            border: '1.5px solid #e2e8f0',
            borderRadius: '0.5rem',
            fontSize: '0.875rem',
            backgroundColor: 'white',
            cursor: 'pointer',
            outline: 'none',
            appearance: 'none',
            fontFamily: 'inherit'
          }}
        >
          {CURRENCIES.map(currency => (
            <option key={currency.code} value={currency.code}>
              {currency.flag} {currency.code} - {currency.name}
            </option>
          ))}
        </select>
        <ChevronDown size={14} style={{
          position: 'absolute',
          right: '10px',
          top: '50%',
          transform: 'translateY(-50%)',
          color: '#94a3b8',
          pointerEvents: 'none',
          zIndex: 1
        }} />
      </div>
      {selectedCurrency && (
        <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: '0.25rem' }}>
          Symbol: {selectedCurrency.symbol}
        </div>
      )}
    </div>
  );
});

LocalCurrencySelector.displayName = 'LocalCurrencySelector';