// components/CommonSelect.jsx
import React from 'react';
import { ChevronDown } from 'lucide-react';

const CommonSelect = ({ 
  value, 
  onChange, 
  options, 
  placeholder,
  icon: Icon,
  size = 'md',
  fullWidth = false,
  disabled = false,
  className = '',
  style = {}
}) => {
  const sizes = {
    sm: { padding: '4px 8px', fontSize: '11px', minWidth: '80px' },
    md: { padding: '6px 10px', fontSize: '12px', minWidth: '100px' },
    lg: { padding: '8px 14px', fontSize: '13px', minWidth: '120px' }
  };

  const currentSize = sizes[size];

  return (
    <div style={{ 
      position: 'relative', 
      display: 'inline-block',
      width: fullWidth ? '100%' : 'auto'
    }}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        style={{
          padding: currentSize.padding,
          paddingRight: '28px',
          borderRadius: '10px',
          border: '1px solid #e5e7eb',
          fontSize: currentSize.fontSize,
          background: '#fff',
          cursor: disabled ? 'not-allowed' : 'pointer',
          color: '#374151',
          minWidth: currentSize.minWidth,
          width: fullWidth ? '100%' : 'auto',
          appearance: 'none',
          transition: 'all 0.2s',
          ...style
        }}
        onFocus={(e) => e.target.style.borderColor = '#0f172a'}
        onBlur={(e) => e.target.style.borderColor = '#e5e7eb'}
      >
        {placeholder && (
          <option value="" disabled>{placeholder}</option>
        )}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.icon && <span style={{ marginRight: '4px' }}>{option.icon}</span>}
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown 
        size={14} 
        style={{
          position: 'absolute',
          right: '10px',
          top: '50%',
          transform: 'translateY(-50%)',
          color: '#9ca3af',
          pointerEvents: 'none'
        }}
      />
    </div>
  );
};

export default CommonSelect;