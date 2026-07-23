import React, { useState, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
import { COUNTRY_CODES } from '../utils/constants';

// ─────────────────────────────────────────────────────────────────────────
// Phone Input Component — country-code-prefix phone entry, shared between
// the customer create/edit form and the quotation create/edit form.
// ─────────────────────────────────────────────────────────────────────────
const PhoneInput = ({ value, onChange, placeholder, isMobile }) => {
  const [selectedCode, setSelectedCode] = useState('+971');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [showCountryDropdown, setShowCountryDropdown] = useState(false);

  useEffect(() => {
    if (value) {
      const countryCodeMatch = COUNTRY_CODES.find(c => value.startsWith(c.code + '-'));
      if (countryCodeMatch) {
        setSelectedCode(countryCodeMatch.code);
        setPhoneNumber(value.substring(countryCodeMatch.code.length + 1));
      } else if (value.startsWith('+')) {
        const matchedCountry = COUNTRY_CODES.find(c => value.startsWith(c.code));
        if (matchedCountry) {
          setSelectedCode(matchedCountry.code);
          setPhoneNumber(value.substring(matchedCountry.code.length));
        } else {
          setPhoneNumber(value);
        }
      } else {
        setPhoneNumber(value);
      }
    }
  }, [value]);

  const handleCodeChange = (code) => {
    setSelectedCode(code);
    setShowCountryDropdown(false);
    if (phoneNumber) {
      onChange(`${code}-${phoneNumber}`);
    } else {
      onChange(code + '-');
    }
  };

  const handleNumberChange = (e) => {
    const newNumber = e.target.value.replace(/[^0-9]/g, '');
    setPhoneNumber(newNumber);
    if (selectedCode && newNumber) {
      onChange(`${selectedCode}-${newNumber}`);
    } else if (selectedCode) {
      onChange(selectedCode + '-');
    } else {
      onChange(newNumber);
    }
  };

  const handleBlur = () => {
    if (!phoneNumber && value === selectedCode + '-') {
      onChange('');
    }
  };

  return (
    <div style={{ display: 'flex', gap: isMobile ? '0.375rem' : '0.5rem', width: '100%' }}>
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <button
          type="button"
          onClick={() => setShowCountryDropdown(!showCountryDropdown)}
          style={{
            padding: isMobile ? '0.6rem 0.75rem' : '0.75rem 1rem',
            border: '1.5px solid #e2e8f0',
            borderRadius: '12px',
            background: 'white',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.375rem',
            fontSize: isMobile ? '0.75rem' : '0.875rem',
            whiteSpace: 'nowrap',
          }}
        >
          <span>{selectedCode}</span>
          <ChevronDown size={isMobile ? 12 : 14} />
        </button>
        {showCountryDropdown && (
          <div style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            background: 'white',
            border: '1px solid #e2e8f0',
            borderRadius: '12px',
            maxHeight: '200px',
            overflowY: 'auto',
            zIndex: 100,
            minWidth: isMobile ? '160px' : '200px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
            marginTop: '0.25rem',
          }}>
            {COUNTRY_CODES.map(country => (
              <button
                key={country.code}
                type="button"
                onClick={() => handleCodeChange(country.code)}
                style={{
                  width: '100%',
                  padding: isMobile ? '0.4rem 0.75rem' : '0.5rem 1rem',
                  textAlign: 'left',
                  background: 'white',
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  fontSize: isMobile ? '0.7rem' : '0.875rem'
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = '#f1f5f9'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'white'}
              >
                <span>{country.flag}</span>
                <span>{country.code}</span>
                {!isMobile && <span style={{ color: '#64748b', fontSize: '0.75rem' }}>{country.name}</span>}
              </button>
            ))}
          </div>
        )}
      </div>
      <input
        type="tel"
        placeholder={placeholder}
        value={phoneNumber}
        onChange={handleNumberChange}
        onBlur={handleBlur}
        style={{
          flex: 1,
          padding: isMobile ? '0.6rem 0.75rem' : '0.75rem 1rem',
          border: '1.5px solid #e2e8f0',
          borderRadius: '12px',
          fontSize: isMobile ? '0.75rem' : '0.875rem',
          outline: 'none',
          boxSizing: 'border-box',
        }}
      />
    </div>
  );
};

export default PhoneInput;
