// components/ValidatedInput.jsx
import React, { useState, useEffect } from 'react';
import { inputStyle } from './QuotationLayout';

export default function ValidatedInput({
  value,
  onChange,
  onBlur,
  type = 'text',
  validator,
  errorMessage,
  min,
  max,
  step,
  style = {},
  ...props
}) {
  const [inputValue, setInputValue] = useState(value?.toString() || '');
  const [error, setError] = useState(null);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    setInputValue(value?.toString() || '');
  }, [value]);

  const handleChange = (e) => {
    const newValue = e.target.value;
    setInputValue(newValue);
    
    // Allow empty string for better UX
    if (newValue === '') {
      setError(null);
      return;
    }
    
    // Validate on change if validator provided
    if (validator) {
      const result = validator(newValue);
      setError(result.error);
    }
  };

  const handleBlur = (e) => {
    setTouched(true);
    
    const newValue = e.target.value;
    
    // Validate on blur
    if (validator) {
      const result = validator(newValue);
      setError(result.error);
      
      // Only call onChange if valid
      if (result.isValid) {
        onChange(newValue);
      } else if (newValue === '') {
        // Don't pass empty to parent - let parent handle default
        onChange('');
      }
    } else {
      onChange(newValue);
    }
    
    if (onBlur) onBlur(e);
  };

  const inputStyles = {
    ...inputStyle,
    ...style,
    borderColor: error && touched ? '#ef4444' : style.borderColor || '#d1d5db',
    outline: error && touched ? '2px solid #fee2e2' : 'none',
  };

  return (
    <div style={{ width: '100%' }}>
      <input
        type={type === 'number' ? 'text' : type} // Use text for number to avoid browser quirks
        value={inputValue}
        onChange={handleChange}
        onBlur={handleBlur}
        style={inputStyles}
        inputMode={type === 'number' ? 'numeric' : 'text'}
        pattern={type === 'number' ? '[0-9]*' : undefined}
        {...props}
      />
      {error && touched && (
        <div style={{
          color: '#ef4444',
          fontSize: '0.75rem',
          marginTop: '4px',
          paddingLeft: '4px'
        }}>
          {error}
        </div>
      )}
    </div>
  );
}