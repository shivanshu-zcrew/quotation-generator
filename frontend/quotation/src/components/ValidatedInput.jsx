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
      
      // ✅ ONLY pass valid values to parent
      if (result.isValid) {
        onChange(newValue);
      }
      // ✅ If invalid, DO NOT call onChange - prevent parent from updating with invalid value
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
      
      // ✅ On blur, if value is invalid, attempt to sanitize or set to default
      if (!result.isValid) {
        // For percentage fields, clamp between 0-100
        if (props.placeholder === '0' || newValue.includes('%')) {
          let sanitized = parseFloat(newValue);
          if (isNaN(sanitized)) sanitized = 0;
          sanitized = Math.min(Math.max(sanitized, 0), 100);
          setInputValue(sanitized.toString());
          onChange(sanitized);
        } else {
          // For other fields, just pass original (parent should handle)
          onChange(newValue);
        }
      } else {
        onChange(newValue);
      }
    } else {
      onChange(newValue);
    }
    
    if (onBlur) onBlur(e);
  };

  // ✅ Helper to handle step increment/decrement
  const handleStep = (direction) => {
    let currentValue = parseFloat(inputValue);
    if (isNaN(currentValue)) currentValue = 0;
    
    const stepValue = parseFloat(step) || 1;
    let newValue = direction === 'up' ? currentValue + stepValue : currentValue - stepValue;
    
    // Clamp between min and max if provided
    if (min !== undefined && newValue < min) newValue = min;
    if (max !== undefined && newValue > max) newValue = max;
    
    setInputValue(newValue.toString());
    onChange(newValue);
  };

  const inputStyles = {
    ...inputStyle,
    ...style,
    borderColor: error && touched ? '#ef4444' : style.borderColor || '#d1d5db',
    outline: error && touched ? '2px solid #fee2e2' : 'none',
  };

  return (
    <div style={{ width: '100%', position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'center' }}>
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
  
      </div>
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