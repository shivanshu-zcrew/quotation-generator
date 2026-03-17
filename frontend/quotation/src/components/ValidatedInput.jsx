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

  // Update local state when prop changes
  useEffect(() => {
    setInputValue(value?.toString() || '');
  }, [value]);

  const handleChange = (e) => {
    const newValue = e.target.value;
    setInputValue(newValue);
    
    // Validate on change if validator provided
    if (validator) {
      const result = validator(newValue);
      setError(result.error);
      
      // Immediately pass valid values to parent
      if (result.isValid) {
        onChange(newValue);
      }
    } else {
      onChange(newValue);
    }
  };

  const handleBlur = (e) => {
    setTouched(true);
    
    const newValue = e.target.value;
    
    // Validate on blur
    if (validator) {
      const result = validator(newValue);
      setError(result.error);
      
      // Always pass the value to parent on blur (parent should handle validation)
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
        type={type === 'number' ? 'text' : type}
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